import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  Bot,
  Send,
  Trash2,
  Sparkles,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Lightbulb,
  MessageSquare
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { db } from '../../services/firebase.ts';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const PROMPT_SUGGESTIONS = [
  'Πώς υπολογίζεται το Αναμενόμενο Ταμείο;',
  'Τι περιλαμβάνει η καταμέτρηση του Καταμετρητή;',
  'Πώς καταχωρώ ένα νέο έξοδο μετρητών;',
  'Ποιος είναι ο τύπος για το Σύνολο Καταμέτρησης;',
  'Δείξε μου τη σύνοψη της τελευταίας βάρδιας',
  'Τι κάνω αν υπάρχει απόκλιση ταμείου > 10.00€;'
];

export const CopilotPage: React.FC = () => {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userId = user?.id;
  const userName = user ? `${user.first_name} ${user.last_name}` : 'Υπάλληλος';

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Load chat history straight from Firestore (copilot_threads/{uid}, matching
  // the rules' strict request.auth.uid == threadId check) once we actually
  // have a signed-in uid - firing before that would just be a denied read.
  useEffect(() => {
    if (!userId) return;

    const fetchHistory = async () => {
      try {
        const snap = await getDoc(doc(db, 'copilot_threads', userId));
        const storedMessages = snap.exists() ? snap.data().messages : null;
        if (Array.isArray(storedMessages) && storedMessages.length > 0) {
          setMessages(storedMessages);
          return;
        }
      } catch (err) {
        console.warn('Failed to load chat history:', err);
      }

      // Initial welcome message if history is empty
      setMessages([
        {
          id: 'welcome-1',
          role: 'assistant',
          content: `Γειά σου **${user?.first_name || 'Συνάδελφε'}**! 🖐️\n\nΕίμαι ο **ShiftLedger AI Copilot**. Μπορώ να σε βοηθήσω με:\n- **Τύπους υπολογισμού ταμείου** & καταμέτρηση (KINO, VLTs, POS, Scratch)\n- **Διαδικασίες βάρδιας** (άνοιγμα, κλείσιμο, αιτιολογήσεις αποκλίσεων)\n- **Καταχώρηση εξόδων**, προμηθευτών & συμβάντων\n- **Αναλύσεις & πληροφορίες** από τα τρέχοντα δεδομένα του καταστήματος\n\nΠώς μπορώ να σε βοηθήσω σήμερα;`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    };

    fetchHistory();
  }, [userId]);

  // Persist history straight to Firestore, same doc the history load above reads.
  const saveHistoryToBackend = async (updatedMessages: ChatMessage[]) => {
    if (!userId) return;
    try {
      await setDoc(doc(db, 'copilot_threads', userId), {
        userId,
        messages: updatedMessages,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Could not persist conversation history:', err);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputText).trim();
    if (!prompt || isLoading) return;

    setErrorText(null);
    setInputText('');

    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Prepare history payload for API
      const historyPayload = newMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/copilot-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: prompt,
          history: historyPayload,
        })
      });

      if (!res.ok) {
        throw new Error(`Σφάλμα απόκρισης διακομιστή (${res.status})`);
      }

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'Δεν λήφθηκε απάντηση.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);
      saveHistoryToBackend(finalMessages);
    } catch (err: any) {
      console.error('Copilot send error:', err);
      setErrorText('Αποτυχία επικοινωνίας με τον AI Copilot. Παρακαλώ ελέγξτε τη σύνδεσή σας.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Είστε βέβαιοι ότι θέλετε να καθαρίσετε το ιστορικό της συνομιλίας;')) {
      return;
    }

    const resetMessages: ChatMessage[] = [
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `Η συνομιλία επαναφέρθηκε! 🔄\n\nΠώς μπορώ να σε βοηθήσω;`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];

    setMessages(resetMessages);
    if (!userId) return;
    try {
      await setDoc(doc(db, 'copilot_threads', userId), {
        userId,
        messages: [],
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Error deleting history:', e);
    }
  };

  // Basic formatting helper for bold, bullet points, line breaks
  const formatMarkdownContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, lIdx) => {
      // Bold replace: **text**
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formattedParts = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={pIdx} className="font-bold text-slate-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      // Bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <div key={lIdx} className="flex items-start space-x-2 my-1 pl-2">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0 mt-1.5" />
            <span className="text-xs leading-relaxed">{formattedParts}</span>
          </div>
        );
      }

      return (
        <p key={lIdx} className="text-xs leading-relaxed min-h-[1.25rem]">
          {formattedParts}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-5xl mx-auto space-y-4">
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center font-bold shadow-xs">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-black text-slate-900">AI Copilot ShiftLedger</h1>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Live Assistant
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Έξυπνος βοηθός με πλήρη γνώση των οδηγιών και των δεδομένων του πρακτορείου
            </p>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-rose-600 border border-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5"
          title="Καθαρισμός Ιστορικού"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Νέα Συνομιλία</span>
        </button>
      </div>

      {/* Main Chat Stream Container */}
      <div className="flex-1 bg-slate-50/60 rounded-2xl border border-slate-200/80 p-4 overflow-y-auto space-y-4 shadow-inner">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 max-w-3xl ${
                isUser ? 'ml-auto flex-row-reverse space-x-reverse' : 'mr-auto'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs shadow-xs ${
                  isUser
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-slate-200 text-indigo-600'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Box */}
              <div
                className={`p-4 rounded-2xl space-y-2 border shadow-2xs ${
                  isUser
                    ? 'bg-indigo-600 text-white border-indigo-700 rounded-tr-xs'
                    : 'bg-white text-slate-800 border-slate-200/80 rounded-tl-xs'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] opacity-75 pb-1 border-b border-current/10 gap-4">
                  <span className="font-bold">{isUser ? userName : 'AI Copilot'}</span>
                  <span>{msg.timestamp}</span>
                </div>

                <div className="text-xs space-y-1">
                  {formatMarkdownContent(msg.content)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start space-x-3 mr-auto max-w-xl">
            <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 text-indigo-600 flex items-center justify-center font-bold shrink-0 shadow-xs">
              <Bot className="w-4 h-4 animate-spin text-indigo-600" />
            </div>
            <div className="p-4 rounded-2xl rounded-tl-xs bg-white border border-slate-200 shadow-2xs text-xs text-slate-500 flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
              </div>
              <span className="font-medium text-slate-600">Ο Copilot αναλύει τα δεδομένα...</span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorText && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorText}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Prompt Chips */}
      {messages.length <= 2 && (
        <div className="space-y-1.5 shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Lightbulb className="w-3 h-3 text-amber-500" />
            <span>Προτεινόμενες Ερωτήσεις:</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PROMPT_SUGGESTIONS.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(sug)}
                className="px-3 py-1.5 bg-white hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 hover:border-indigo-200 rounded-xl text-[11px] font-semibold transition-all cursor-pointer shadow-2xs"
              >
                {sug}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2.5 shadow-sm shrink-0 flex items-center space-x-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder="Ρωτήστε τον AI Copilot (π.χ. Πώς υπολογίζεται το αναμενόμενο ταμείο;)..."
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-xs md:text-sm text-slate-900 placeholder-slate-400 focus:outline-none bg-transparent"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isLoading}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center space-x-1.5"
        >
          <span>Αποστολή</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
