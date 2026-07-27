import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in application component:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 my-6 max-w-3xl mx-auto">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl flex-shrink-0">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                  Σφάλμα Εφαρμογής / Firestore
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mt-2">
                Προέκυψε ανεπαρκές σφάλμα κατά τη φόρτωση δεδομένων
              </h3>
              <p className="text-slate-600 mt-1 text-sm leading-relaxed">
                Παρουσιάστηκε ένα πρόβλημα κατά την επικοινωνία με τη βάση δεδομένων ή την επεξεργασία του υποσυστήματος.
              </p>

              {this.state.error && (
                <div className="mt-4 p-3 bg-slate-900 text-slate-200 rounded-lg text-xs font-mono overflow-x-auto max-h-36">
                  {this.state.error.toString()}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-all shadow-sm active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Επανεκκίνηση & Δοκιμή Ξανά</span>
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-xl transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Aνανέωση Σελίδας</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
