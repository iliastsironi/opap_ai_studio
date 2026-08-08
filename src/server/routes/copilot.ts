import { Router, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { INSTRUCTIONS_SECTIONS, FAQ_ITEMS } from '../../data/instructionsContent.js';
import { query } from '../../db/index.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db as firestoreDb } from '../../services/firebase.js';

const router = Router();

// Initialize GenAI SDK with server-side key
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Helper to assemble real-time store snapshot for AI context
async function getLiveStoreContext() {
  try {
    // Recent shifts
    const recentShifts = await query(
      `SELECT id, store_id, opened_by_user_id, status, opening_cash, counted_cash, expected_cash, discrepancy_amount, created_at, updated_at 
       FROM shifts 
       ORDER BY created_at DESC LIMIT 10`
    );

    // Active users
    const users = await query(
      `SELECT id, email, first_name, last_name, status FROM users LIMIT 15`
    );

    // Active stores
    const stores = await query(
      `SELECT id, name, code, is_active FROM stores LIMIT 10`
    );

    return {
      shifts_count: recentShifts.length,
      recent_shifts: recentShifts.map((s: any) => ({
        id: s.id,
        cashier: s.opened_by_user_id,
        status: s.status,
        opening_cash: s.opening_cash,
        counted_cash: s.counted_cash,
        expected_cash: s.expected_cash,
        discrepancy: s.discrepancy_amount,
        date: s.created_at,
      })),
      users: users.map((u: any) => `${u.first_name} ${u.last_name} (${u.email})`),
      stores: stores.map((st: any) => `${st.name} [Code: ${st.code}]`),
    };
  } catch (err) {
    console.warn('Could not retrieve DB snapshot for Copilot context:', err);
    return { error: 'Database snapshot unavailable' };
  }
}

/**
  POST /api/v1/copilot/chat
  Executes AI completion with current instructions & DB context
 */
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, history = [], userId = 'anonymous', userName = 'Υπάλληλος' } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message field is required' });
      return;
    }

    const liveContext = await getLiveStoreContext();

    const systemInstruction = `
Είσαι ο "ShiftLedger AI Copilot", ένας εξειδικευμένος, ευγενικός και εξαιρετικά ακριβής ψηφιακός βοηθός για την εφαρμογή διαχείρισης ταμείου και βαρδιών πρακτορείων ΟΠΑΠ (ShiftLedger / OPAP AI Studio).

ΣΤΟΧΟΣ ΣΟΥ:
1. Να απαντάς στις ερωτήσεις των υπαλλήλων και διευθυντών σχετικά με τη λειτουργία του site, τους τύπους υπολογισμού, τις βάρδιες, τα έξοδα, τα τμήματα FnB, τα VLTs και τα αριθμοπαιχνίδια (KINO, Joker, Lotto, Στοίχημα).
2. Να απαντάς ΠΑΝΤΑ στα Ελληνικά, με φιλικό, επαγγελματικό και σαφή τρόπο, χρησιμοποιώντας ευανάγνωστη μορφοποίηση (bullet points, bold όρους, πίνακες αν χρειάζεται).
3. Να βασίζεσαι ΑΥΣΤΗΡΑ στις επίσημες Οδηγίες του site και στα πραγματικά δεδομένα του καταστήματος παρακάτω.
4. ΑΥΣΤΗΡΟΣ ΚΑΝΟΝΑΣ (NO HALLUCINATIONS): Εάν η ζητούμενη πληροφορία δεν υπάρχει στις οδηγίες ή στα πραγματικά δεδομένα του καταστήματος, δήλωσέ το ξεκάθαρα (π.χ. "Δεν βρίσκω αυτή την πληροφορία στα τρέχοντα δεδομένα του καταστήματος") - ΜΗΝ μαντεύεις ή επινοείς ανύπαρκτες βάρδιες/δεδομένα.

ΕΠΙΣΗΜΕΣ ΟΔΗΓΙΕΣ & ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ (INSTRUCTIONS KNOWLEDGE BASE):
${JSON.stringify(INSTRUCTIONS_SECTIONS, null, 2)}
${JSON.stringify(FAQ_ITEMS, null, 2)}

ΠΡΑΓΜΑΤΙΚΑ ΤΡΕΧΟΝΤΑ ΔΕΔΟΜΕΝΑ ΚΑΤΑΣΤΗΜΑΤΟΣ (LIVE DB SNAPSHOT):
${JSON.stringify(liveContext, null, 2)}

ΠΛΗΡΟΦΟΡΙΕΣ ΧΡΗΣΤΗ ΠΟΥ ΡΩΤΑΕΙ:
Όνομα Χρήστη: ${userName}
User ID: ${userId}

ΤΥΠΟΙ ΥΠΟΛΟΓΙΣΜΟΥ (ΜΑΘΗΜΑΤΙΚΟΙ ΤΥΠΟΙ):
- Αναμενόμενο Ταμείο (Expected Cash):
  scratch_lotto_sales + card_payments + vlts_cash_in - vlts_cash_out + (opap_gross_sales - opap_payouts) + fnb_cash
- Σύνολο Καταμέτρησης (Total Reconciliation Count):
  opening_cash + (Καταμετρητής Μετρητών) + POS + expenses_paid_cash + bank_deposits + customer_credit_granted - customer_credit_collected
- Απόκλιση (Discrepancy):
  counted_cash - expected_cash (αν > 10.00€ απαιτείται αιτιολογία).
`;

    // Construct conversation messages for Gemini
    const contents: any[] = [];

    // Append past history if provided
    if (Array.isArray(history)) {
      history.forEach((msg: { role: string; content: string }) => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        });
      });
    }

    // Add prompt
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: contents,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    const replyText = response.text || 'Λυπάμαι, δεν μπόρεσα να επεξεργαστώ την απάντηση. Παρακαλώ δοκιμάστε ξανά.';

    res.json({
      reply: replyText,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in Copilot Chat Route:', error);
    res.status(500).json({
      error: 'Αποτυχία επεξεργασίας αιτήματος από τον AI Copilot',
      details: error.message || String(error),
    });
  }
});

/**
  GET /api/v1/copilot/history/:userId
  Fetch stored chat history per user from Firestore
 */
router.get('/history/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }

    const docRef = doc(firestoreDb, 'copilot_threads', userId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      res.json({ messages: snap.data().messages || [] });
    } else {
      res.json({ messages: [] });
    }
  } catch (err) {
    console.warn('Firestore history read error (falling back to empty):', err);
    res.json({ messages: [] });
  }
});

/**
  POST /api/v1/copilot/history/:userId
  Save chat thread per user to Firestore
 */
router.post('/history/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { messages } = req.body;

    if (!userId || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Invalid parameters' });
      return;
    }

    const docRef = doc(firestoreDb, 'copilot_threads', userId);
    await setDoc(docRef, {
      userId,
      messages,
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    console.warn('Firestore history write error:', err);
    res.json({ success: false, warning: 'Failed to persist history to cloud' });
  }
});

/**
  DELETE /api/v1/copilot/history/:userId
  Clear thread per user
 */
router.delete('/history/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }

    const docRef = doc(firestoreDb, 'copilot_threads', userId);
    await setDoc(docRef, {
      userId,
      messages: [],
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    console.warn('Firestore history delete error:', err);
    res.json({ success: true });
  }
});

export default router;
