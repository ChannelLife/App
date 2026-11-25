import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, MailCheck, X } from 'lucide-react';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  reloadAndCheckAdminVerification,
  sendAdminVerificationEmail,
  signInAdminWithGoogle,
  signInAdminWithPassword,
  signOutAdmin,
} from '../services/channellifeFirestore';
import { auth } from '../services/firebase';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPassword('');
    setShowPassword(false);
    setError(null);
    setInfoMessage(null);

    const current = auth.currentUser;
    const isUnverifiedAdmin =
      Boolean(current) &&
      current?.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL &&
      !current.emailVerified;
    setNeedsVerification(isUnverifiedAdmin);

    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    if (!password) {
      setError('Inserisci la password amministratore.');
      return;
    }

    setSubmitting(true);
    try {
      await signInAdminWithPassword(password);
      onAuthenticated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'EMAIL_VERIFICATION_REQUIRED') {
        setNeedsVerification(true);
        setInfoMessage(
          'Password riconosciuta, ma l’account amministratore va verificato una volta tramite link email per abilitare i permessi.'
        );
      } else if (msg.includes('operation-not-allowed')) {
        setError(
          'Per accedere con password devi prima abilitare il provider "Email/Password" su Firebase Console (Authentication → Sign-in method) oppure entra con Google qui sotto.'
        );
      } else if (
        msg.includes('invalid-credential') ||
        msg.includes('wrong-password') ||
        msg.includes('user-not-found')
      ) {
        setError(
          'Password errata oppure non ancora configurata. Se è il primo accesso, entra con Google qui sotto e imposta la password dal pannello admin.'
        );
      } else if (msg.includes('too-many-requests')) {
        setError('Troppi tentativi falliti. Attendi qualche minuto prima di riprovare.');
      } else {
        setError(msg || 'Impossibile accedere con la password.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendVerification = async () => {
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      await sendAdminVerificationEmail();
      setInfoMessage(
        'Email di verifica inviata all’indirizzo amministratore. Apri il link ricevuto via email e poi premi "Ho cliccato il link — Entra ora".'
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossibile inviare l’email di verifica in questo momento.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerification = async () => {
    setError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const verified = await reloadAndCheckAdminVerification();
      if (verified) {
        setNeedsVerification(false);
        onAuthenticated();
        return;
      }
      setError(
        'Verifica non ancora rilevata. Apri il link ricevuto via email oppure entra subito con Google qui sotto.'
      );
    } catch {
      setError('Impossibile aggiornare lo stato di verifica.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setInfoMessage(null);
    setGoogleSubmitting(true);
    try {
      await signInAdminWithGoogle();
      setNeedsVerification(false);
      onAuthenticated();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('popup-closed-by-user')) {
          setError('Accesso annullato prima del completamento.');
        } else if (err.message.includes('unauthorized-domain')) {
          setError(
            'Dominio non ancora autorizzato in Firebase Authentication (aggiungi il dominio GitHub Pages nelle impostazioni Firebase).'
          );
        } else {
          setError(err.message);
        }
      } else {
        setError('Impossibile completare l’accesso amministratore.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    await signOutAdmin();
    setNeedsVerification(false);
    setInfoMessage(null);
    setError(null);
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
              {needsVerification ? <MailCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h2 id="admin-auth-title" className="text-lg font-bold">
                {needsVerification ? 'Verifica email richiesta' : 'Accesso riservato admin'}
              </h2>
              <p className="text-xs text-[#D1D5DB]">
                Area protetta per la gestione del catalogo ChannelLife.
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

        {needsVerification ? (
          <div className="p-6 space-y-4">
            {infoMessage && (
              <div className="rounded-xl bg-[#FFF1E4] border border-[#F29243]/50 px-3.5 py-2.5 text-xs sm:text-sm text-[#6E3200] leading-relaxed">
                {infoMessage}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs sm:text-sm text-red-800 leading-relaxed"
              >
                {error}
              </div>
            )}

            <p className="text-xs sm:text-sm text-[#333740] leading-relaxed">
              Dopo aver collegato una password all&apos;account amministratore, Firebase richiede una sola conferma dell&apos;indirizzo email prima di sbloccare l&apos;accesso diretto con password.
            </p>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={submitting || googleSubmitting}
                onClick={handleCheckVerification}
                className="w-full rounded-xl bg-[#F29243] hover:bg-[#E07D2B] disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-[#1E2025] cursor-pointer"
              >
                {submitting ? 'Controllo in corso…' : 'Ho cliccato il link — Entra ora'}
              </button>
              <button
                type="button"
                disabled={submitting || googleSubmitting}
                onClick={handleSendVerification}
                className="w-full rounded-xl border border-[#D4D4D0] bg-white hover:bg-[#F4F4F3] disabled:opacity-60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#1E2025] cursor-pointer"
              >
                Invia email di verifica
              </button>
              <button
                type="button"
                disabled={submitting || googleSubmitting}
                onClick={handleGoogleLogin}
                className="w-full rounded-xl border border-[#D4D4D0] bg-[#F8F8F7] hover:bg-[#FFF1E4] disabled:opacity-60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#1E2025] cursor-pointer"
              >
                {googleSubmitting ? 'Accesso Google…' : 'Oppure entra subito con Google'}
              </button>
              <button
                type="button"
                onClick={handleSwitchAccount}
                className="w-full text-xs text-[#5A5E66] hover:text-[#1E2025] underline py-1 cursor-pointer"
              >
                Torna al login con password
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePasswordLogin} className="p-6 space-y-4">
            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs sm:text-sm text-red-800 leading-relaxed"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="admin-password"
                className="block text-sm font-semibold text-[#1E2025] mb-1"
              >
                Password amministratore
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Inserisci la password"
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

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[#D4D4D0] bg-white hover:bg-[#F4F4F3] px-4 py-2.5 text-sm font-medium text-[#1E2025] transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={submitting || googleSubmitting}
                className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-[#1E2025] transition-colors cursor-pointer"
              >
                {submitting ? 'Verifica…' : 'Accedi con password'}
              </button>
            </div>

            <div className="pt-3 border-t border-[#E2E2DF] space-y-2.5">
              <p className="text-xs text-[#5A5E66] text-center">
                Primo accesso o preferisci entrare con il tuo account amministratore?
              </p>
              <button
                type="button"
                disabled={submitting || googleSubmitting}
                onClick={handleGoogleLogin}
                className="w-full rounded-xl border border-[#D4D4D0] bg-[#F8F8F7] hover:bg-[#FFF1E4] disabled:opacity-60 px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#1E2025] transition-colors cursor-pointer"
              >
                {googleSubmitting ? 'Verifica account Google…' : 'Accedi con Google (e configura password)'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
