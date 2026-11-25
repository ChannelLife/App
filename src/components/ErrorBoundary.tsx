import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Errore imprevisto dell’applicazione.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#24262B] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#2B2E35] border border-[#383B44] p-7 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-950/60 text-[#F29243] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="font-display text-xl font-bold">
              Si è verificato un errore imprevisto
            </h1>
            <p className="text-sm text-[#D1D5DB]">
              Ricarica la pagina per ripristinare la connessione ai dati di ChannelLife.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-5 py-2.5 text-sm font-semibold text-[#1E2025] cursor-pointer"
            >
              Ricarica la pagina
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
