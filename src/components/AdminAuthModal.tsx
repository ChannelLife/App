import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, X } from 'lucide-react';
import type { AdminAuthStatus } from '../types/channellife';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (token: string) => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setError(null);
    setLoadingStatus(true);

    fetch('/api/admin/auth-status')
      .then((res) => res.json())
      .then((data: AdminAuthStatus) => {
        setAuthStatus(data);
        setTimeout(() => inputRef.current?.focus(), 50);
      })
      .catch(() => {
        setError('Impossibile verificare lo stato di autenticazione.');
      })
      .finally(() => setLoadingStatus(false));

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isSetupMode = Boolean(authStatus?.setupRequired);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSetupMode) {
      if (password.length < 8) {
        setError('Scegli una password di almeno 8 caratteri.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Le due password non coincidono.');
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetch('/api/admin/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!res.ok || !data.token) {
          setError(data.error || 'Impossibile configurare la password.');
          return;
        }
        onAuthenticated(data.token);
      } catch {
        setError('Errore di connessione durante la configurazione.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!password) {
      setError('Inserisci la password amministratore.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        if (data.setupRequired) {
          setAuthStatus({ envConfigured: false, setupRequired: true });
        }
        setError(data.error || 'Accesso non riuscito.');
        return;
      }
      onAuthenticated(data.token);
    } catch {
      setError('Errore di connessione durante la verifica.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-auth-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[#FFFFFF] text-[#1E2025] shadow-2xl border border-[#E2E2DF] overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-5 bg-[#24262B] text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#383B44] p-2.5 text-[#F29243]">
              {isSetupMode ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h2 id="admin-auth-title" className="text-lg font-bold">
                {isSetupMode ? 'Configurazione accesso admin' : 'Accesso riservato admin'}
              </h2>
              <p className="text-xs text-[#D1D5DB]">
                {isSetupMode
                  ? 'Imposta la password condivisa iniziale del pannello.'
                  : 'Area protetta per la gestione del catalogo ChannelLife.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi accesso admin"
            className="rounded-lg p-2 text-[#D1D5DB] hover:bg-[#383B44] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {loadingStatus ? (
            <div className="py-6 text-center text-sm text-[#5A5E66]">
              Verifica configurazione di sicurezza…
            </div>
          ) : (
            <>
              {isSetupMode && (
                <div className="rounded-xl bg-[#FFF1E4] border border-[#F29243]/40 p-3.5 text-xs text-[#6E3200] leading-relaxed">
                  La variabile d’ambiente <code className="font-mono font-semibold">ADMIN_PASSWORD</code> non è ancora impostata. Puoi definire ora la password iniziale (salvata in formato cifrato sul server) oppure configurarla nei Secret del deployment.
                </div>
              )}

              {error && (
                <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="admin-password" className="block text-sm font-semibold text-[#1E2025] mb-1">
                  {isSetupMode ? 'Nuova password amministratore' : 'Password amministratore'}
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSetupMode ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSetupMode ? 'Minimo 8 caratteri' : 'Inserisci la password'}
                    className="w-full rounded-xl border border-[#D4D4D0] bg-white pl-3.5 pr-11 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#5A5E66] hover:text-[#1E2025]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isSetupMode && (
                <div>
                  <label htmlFor="admin-password-confirm" className="block text-sm font-semibold text-[#1E2025] mb-1">
                    Conferma password
                  </label>
                  <input
                    id="admin-password-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ripeti la password"
                    className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
                  />
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[#D4D4D0] bg-white hover:bg-[#F4F4F3] px-4 py-2.5 text-sm font-medium text-[#1E2025] transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-[#1E2025] transition-colors cursor-pointer"
                >
                  {submitting
                    ? 'Verifica…'
                    : isSetupMode
                    ? 'Imposta e accedi'
                    : 'Accedi alla dashboard'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
