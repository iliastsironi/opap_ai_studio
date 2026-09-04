import { GoogleGenAI } from '@google/genai';
import { getSupabaseAdmin } from './supabaseAdmin.ts';
import { HttpError, verifyAuthHeader } from './verifyRequestAuth.ts';
import { INSTRUCTIONS_SECTIONS, FAQ_ITEMS } from '../../src/data/instructionsContent.ts';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
});

interface LiveStoreContext {
  recent_shifts: Array<{
    id: string;
    status: unknown;
    opening_cash: unknown;
    counted_cash: unknown;
    expected_cash: unknown;
    discrepancy: unknown;
    date: unknown;
  }>;
  users: string[];
  stores: string[];
}

// Rewrite of the original PGlite-backed version (src/server/routes/copilot.ts):
// fixes two bugs found there - it queried `discrepancy_amount`, a column
// that doesn't exist (the real field is `discrepancy`), and it had no
// organization scoping at all, so any org's Copilot could see every other
// org's live shift data in its AI context. This Supabase version also
// demonstrates the whole migration's own motivation directly: real
// server-side ORDER BY + LIMIT instead of fetching 50 docs and sorting in
// JS, which is what the Firestore version had to do.
async function getLiveStoreContext(orgId: string): Promise<LiveStoreContext> {
  const admin = getSupabaseAdmin();
  const [shiftsRes, usersRes, storesRes] = await Promise.all([
    admin
      .from('shifts')
      .select('id, status, opening_cash, counted_cash, expected_cash, discrepancy, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('users').select('first_name, last_name, email').eq('organization_id', orgId).limit(15),
    admin.from('stores').select('name, code').eq('organization_id', orgId).limit(10),
  ]);

  if (shiftsRes.error) throw shiftsRes.error;
  if (usersRes.error) throw usersRes.error;
  if (storesRes.error) throw storesRes.error;

  return {
    recent_shifts: (shiftsRes.data ?? []).map((s) => ({
      id: s.id,
      status: s.status,
      opening_cash: s.opening_cash,
      counted_cash: s.counted_cash,
      expected_cash: s.expected_cash,
      discrepancy: s.discrepancy,
      date: s.created_at,
    })),
    users: (usersRes.data ?? []).map((u) => `${u.first_name} ${u.last_name} (${u.email})`),
    stores: (storesRes.data ?? []).map((st) => `${st.name} [Code: ${st.code}]`),
  };
}

function buildSystemInstruction(liveContext: LiveStoreContext, userName: string, uid: string): string {
  return `
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
User ID: ${uid}

ΤΥΠΟΙ ΥΠΟΛΟΓΙΣΜΟΥ (ΜΑΘΗΜΑΤΙΚΟΙ ΤΥΠΟΙ):
- Αναμενόμενο Ταμείο (Expected Cash):
  scratch_lotto_sales + card_payments + vlts_cash_in - vlts_cash_out + (opap_gross_sales - opap_payouts) + fnb_cash
- Σύνολο Καταμέτρησης (Total Reconciliation Count):
  opening_cash + (Καταμετρητής Μετρητών) + POS + expenses_paid_cash + bank_deposits + customer_credit_granted - customer_credit_collected
- Απόκλιση (Discrepancy):
  counted_cash - expected_cash (αν > 10.00€ απαιτείται αιτιολογία).
`;
}

export async function handleCopilotChat(params: {
  authHeader: string | string[] | undefined;
  body: { message?: unknown; history?: unknown };
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { uid } = await verifyAuthHeader(params.authHeader);

  const { data: userData, error: userError } = await getSupabaseAdmin()
    .from('users')
    .select('organization_id, first_name, last_name')
    .eq('id', uid)
    .maybeSingle();
  if (userError) throw userError;
  const orgId = userData?.organization_id;
  if (!orgId) {
    return { status: 400, body: { error: 'Το προφίλ σας δεν έχει συνδεδεμένο οργανισμό' } };
  }

  const { message, history } = params.body;
  if (!message || typeof message !== 'string') {
    return { status: 400, body: { error: 'Message field is required' } };
  }

  const liveContext = await getLiveStoreContext(orgId);
  const userName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : 'Υπάλληλος';
  const systemInstruction = buildSystemInstruction(liveContext, userName || 'Υπάλληλος', uid);

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (Array.isArray(history)) {
    for (const msg of history) {
      if (msg && typeof msg.content === 'string') {
        contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] });
      }
    }
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents,
      config: { systemInstruction, temperature: 0.2 },
    });
    const replyText = response.text || 'Λυπάμαι, δεν μπόρεσα να επεξεργαστώ την απάντηση. Παρακαλώ δοκιμάστε ξανά.';
    return { status: 200, body: { reply: replyText, timestamp: new Date().toISOString() } };
  } catch (error: any) {
    console.error('Error in Copilot Chat handler:', error);
    return {
      status: 500,
      body: { error: 'Αποτυχία επεξεργασίας αιτήματος από τον AI Copilot', details: error.message || String(error) },
    };
  }
}

export { HttpError };
