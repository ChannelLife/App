import React, { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import {
  submitJoinChannelRequest,
  submitNewChannelRequest,
} from '../services/channellifeFirestore';
import {
  isValidEmail,
  isValidPhone,
  normalizeWhatsAppChannelUrl,
} from '../utils/validation';

export type RequestModalMode = 'new_channel' | 'join_channel' | null;

interface RequestModalsProps {
  mode: RequestModalMode;
  onClose: () => void;
}

export const RequestModals: React.FC<RequestModalsProps> = ({ mode, onClose }) => {
  // Modulo 1 state
  const [newChannelName, setNewChannelName] = useState('');
  const [description, setDescription] = useState('');
  const [newMotivation, setNewMotivation] = useState('');
  const [notes, setNotes] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Modulo 2 state
  const [joinChannelName, setJoinChannelName] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [joinMotivation, setJoinMotivation] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [joinPhone, setJoinPhone] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setErrors({});
    setServerError(null);
    setConfirmationMessage(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, onClose]);

  if (!mode) return null;

  const resetFormAndClose = () => {
    setNewChannelName('');
    setDescription('');
    setNewMotivation('');
    setNotes('');
    setNewEmail('');
    setNewPhone('');
    setJoinChannelName('');
    setOfficialUrl('');
    setJoinMotivation('');
    setJoinEmail('');
    setJoinPhone('');
    setErrors({});
    setServerError(null);
    setConfirmationMessage(null);
    onClose();
  };

  const handleNewChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (newChannelName.trim().length < 2 || newChannelName.trim().length > 80) {
      nextErrors.channelName = 'Inserisci un nome valido per il canale (2–80 caratteri).';
    }
    if (description.trim().length < 10 || description.trim().length > 280) {
      nextErrors.description = 'Inserisci una breve descrizione (10–280 caratteri).';
    }
    if (newMotivation.trim().length < 10 || newMotivation.trim().length > 1000) {
      nextErrors.motivation = 'Spiega perché desideri creare il canale con ChannelLife (minimo 10 caratteri).';
    }
    if (notes.trim().length > 1000) {
      nextErrors.notes = 'Le note aggiuntive non possono superare 1000 caratteri.';
    }
    if (!isValidEmail(newEmail)) {
      nextErrors.email = 'Inserisci un indirizzo email valido.';
    }
    if (!isValidPhone(newPhone)) {
      nextErrors.phone = 'Inserisci un numero di telefono valido (es. +39 333 1234567).';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setServerError(null);
      return;
    }

    setErrors({});
    setServerError(null);
    setSubmitting(true);
    try {
      const data = await submitNewChannelRequest({
        channelName: newChannelName.trim(),
        description: description.trim(),
        motivation: newMotivation.trim(),
        notes: notes.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
      });
      setConfirmationMessage(data.message);
    } catch (err) {
      setServerError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Errore durante l’invio della richiesta. Verifica i campi e riprova.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (joinChannelName.trim().length < 2 || joinChannelName.trim().length > 80) {
      nextErrors.channelName = 'Inserisci il nome del canale (2–80 caratteri).';
    }
    if (!normalizeWhatsAppChannelUrl(officialUrl)) {
      nextErrors.officialUrl =
        'Inserisci un link ufficiale WhatsApp valido (es. https://whatsapp.com/channel/...).';
    }
    if (joinMotivation.trim().length < 10 || joinMotivation.trim().length > 1000) {
      nextErrors.motivation = 'Spiega perché vuoi far entrare il canale in ChannelLife (minimo 10 caratteri).';
    }
    if (!isValidEmail(joinEmail)) {
      nextErrors.email = 'Inserisci un indirizzo email valido.';
    }
    if (!isValidPhone(joinPhone)) {
      nextErrors.phone = 'Inserisci un numero di telefono valido (es. +39 333 1234567).';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setServerError(null);
      return;
    }

    setErrors({});
    setServerError(null);
    setSubmitting(true);
    try {
      const data = await submitJoinChannelRequest({
        channelName: joinChannelName.trim(),
        officialUrl: officialUrl.trim(),
        motivation: joinMotivation.trim(),
        email: joinEmail.trim(),
        phone: joinPhone.trim(),
      });
      setConfirmationMessage(data.message);
    } catch (err) {
      setServerError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Errore durante l’invio della richiesta. Verifica i campi e riprova.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === 'new_channel'
      ? 'Crea un nuovo canale con ChannelLife'
      : 'Chiedi di far entrare il tuo canale in ChannelLife';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-xl rounded-2xl bg-[#FFFFFF] text-[#1E2025] shadow-2xl border border-[#E2E2DF] overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-5 bg-[#24262B] text-white">
          <div>
            <h2 id="request-modal-title" className="text-lg sm:text-xl font-bold">
              {title}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[#D1D5DB]">
              {mode === 'new_channel'
                ? 'Compila la proposta: i tuoi recapiti restano privati e visibili solo agli amministratori.'
                : 'Segnala il tuo canale WhatsApp esistente per la valutazione del team.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi modulo"
            className="rounded-lg p-2 text-[#D1D5DB] hover:bg-[#383B44] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmationMessage ? (
          <div className="p-6 sm:p-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#FFF1E4] text-[#A84A00] flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-[#1E2025]">Richiesta inviata</h3>
            <p className="text-sm sm:text-base text-[#333740] max-w-md mx-auto leading-relaxed">
              {confirmationMessage}
            </p>
            <p className="text-xs text-[#5A5E66]">
              Gli amministratori potranno contattarti ai recapiti indicati per confermare gli eventuali passaggi successivi.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={resetFormAndClose}
                className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-6 py-2.5 text-sm font-semibold text-[#1E2025] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24262B] cursor-pointer"
              >
                Torna al catalogo
              </button>
            </div>
          </div>
        ) : mode === 'new_channel' ? (
          <form onSubmit={handleNewChannelSubmit} noValidate className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            {serverError && (
              <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                {serverError}
              </div>
            )}

            <div>
              <label htmlFor="nc-name" className="block text-sm font-semibold text-[#1E2025] mb-1">
                Nome del futuro canale <span className="text-[#C2410C]">*</span>
              </label>
              <input
                id="nc-name"
                type="text"
                required
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder='Consigliamo un nome che includa "Life", es: DriveLife'
                aria-invalid={Boolean(errors.channelName)}
                aria-describedby={errors.channelName ? 'nc-name-err' : undefined}
                className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
              />
              {errors.channelName && (
                <p id="nc-name-err" className="mt-1 text-xs font-medium text-red-700">
                  {errors.channelName}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="nc-desc" className="block text-sm font-semibold text-[#1E2025] mb-1">
                Breve descrizione <span className="text-[#C2410C]">*</span>
              </label>
              <textarea
                id="nc-desc"
                required
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrivi in poche righe di cosa parlerà il canale."
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? 'nc-desc-err' : undefined}
                className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
              />
              {errors.description && (
                <p id="nc-desc-err" className="mt-1 text-xs font-medium text-red-700">
                  {errors.description}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="nc-motivation" className="block text-sm font-semibold text-[#1E2025] mb-1">
                Motivo per cui si desidera creare il canale con ChannelLife{' '}
                <span className="text-[#C2410C]">*</span>
              </label>
              <textarea
                id="nc-motivation"
                required
                rows={3}
                value={newMotivation}
                onChange={(e) => setNewMotivation(e.target.value)}
                placeholder="Spiega l’idea editoriale, la frequenza dei contenuti e il valore per la community."
                aria-invalid={Boolean(errors.motivation)}
                aria-describedby={errors.motivation ? 'nc-motivation-err' : undefined}
                className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
              />
              {errors.motivation && (
                <p id="nc-motivation-err" className="mt-1 text-xs font-medium text-red-700">
                  {errors.motivation}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="nc-notes" className="block text-sm font-semibold text-[#1E2025] mb-1">
                Note aggiuntive <span className="text-xs font-normal text-[#5A5E66]">(facoltative)</span>
              </label>
              <textarea
                id="nc-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Eventuali informazioni extra utili alla valutazione."
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={errors.notes ? 'nc-notes-err' : undefined}
                className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
              />
              {errors.notes && (
                <p id="nc-notes-err" className="mt-1 text-xs font-medium text-red-700">
                  {errors.notes}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="nc-email" className="block text-sm font-semibold text-[#1E2025] mb-1">
                  Email <span className="text-[#C2410C]">*</span>
                </label>
                <input
                  id="nc-email"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nome@esempio.it"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'nc-email-err' : undefined}
                  className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
                />
                {errors.email && (
                  <p id="nc-email-err" className="mt-1 text-xs font-medium text-red-700">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="nc-phone" className="block text-sm font-semibold text-[#1E2025] mb-1">
                  Numero di telefono <span className="text-[#C2410C]">*</span>
                </label>
                <input
                  id="nc-phone"
                  type="tel"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+39 333 1234567"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'nc-phone-err' : undefined}
                  className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
                />
                {errors.phone && (
                  <p id="nc-phone-err" className="mt-1 text-xs font-medium text-red-700">
                    {errors.phone}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 border-t border-[#E2E2DF]">
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
                {submitting ? 'Invio in corso…' : 'Invia richiesta'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoinChannelSubmit} noValidate className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            {serverError && (
              <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                {serverError}
              </div>
            )}

            <div>
              <label htmlFor="jc-name" className="block text-sm font-semibold text-[#1E2025] mb-1">
                Nome del canale <span className="text-[#C2410C]">*</span>
              </label>
              <input
                id="jc-name"
                type="text"
                required
                value={joinChannelName}
                onChange={(e) => setJoinChannelName(e.target.value)}
                placeholder="Nome esatto del canale WhatsApp"
                aria-invalid={Boolean(errors.channelName)}
                aria-describedby={errors.channelName ? 'jc-name-err' : undefined}
                className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
              />
              {errors.channelName && (
                <p id="jc-name-err" className="mt-1 text-xs font-medium text-red-700">
                  {errors.channelName}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="jc-url" className="block text-sm font-semibold text-[#1E2025] mb-1">
                Link ufficiale del canale <span className="text-[#C2410C]">*</span>
              </label>
              <input
                id="jc-url"
                type="url"
                required
                value={officialUrl}
                onChange={(e) => setOfficialUrl(e.target.value)}
                placeholder="https://whatsapp.com/channel/..."
                aria-invalid={Boolean(errors.officialUrl)}
                aria-describedby={errors.officialUrl ? 'jc-url-err' : undefined}
                className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
              />
              {errors.officialUrl && (
                <p id="jc-url-err" className="mt-1 text-xs font-medium text-red-700">
                  {errors.officialUrl}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="jc-motivation" className="block text-sm font-semibold text-[#1E2025] mb-1">
                Motivo per cui si desidera entrare in ChannelLife <span className="text-[#C2410C]">*</span>
              </label>
              <textarea
                id="jc-motivation"
                required
                rows={3}
                value={joinMotivation}
                onChange={(e) => setJoinMotivation(e.target.value)}
                placeholder="Racconta i contenuti del canale, il pubblico e perché è coerente con ChannelLife."
                aria-invalid={Boolean(errors.motivation)}
                aria-describedby={errors.motivation ? 'jc-motivation-err' : undefined}
                className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
              />
              {errors.motivation && (
                <p id="jc-motivation-err" className="mt-1 text-xs font-medium text-red-700">
                  {errors.motivation}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="jc-email" className="block text-sm font-semibold text-[#1E2025] mb-1">
                  Email <span className="text-[#C2410C]">*</span>
                </label>
                <input
                  id="jc-email"
                  type="email"
                  required
                  value={joinEmail}
                  onChange={(e) => setJoinEmail(e.target.value)}
                  placeholder="nome@esempio.it"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'jc-email-err' : undefined}
                  className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
                />
                {errors.email && (
                  <p id="jc-email-err" className="mt-1 text-xs font-medium text-red-700">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="jc-phone" className="block text-sm font-semibold text-[#1E2025] mb-1">
                  Numero di telefono <span className="text-[#C2410C]">*</span>
                </label>
                <input
                  id="jc-phone"
                  type="tel"
                  required
                  value={joinPhone}
                  onChange={(e) => setJoinPhone(e.target.value)}
                  placeholder="+39 333 1234567"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'jc-phone-err' : undefined}
                  className="w-full rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/30"
                />
                {errors.phone && (
                  <p id="jc-phone-err" className="mt-1 text-xs font-medium text-red-700">
                    {errors.phone}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 border-t border-[#E2E2DF]">
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
                {submitting ? 'Invio in corso…' : 'Invia richiesta di adesione'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
