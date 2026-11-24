import React, { useEffect, useRef } from 'react';
import { ArrowRight, PlusCircle, Share2, X } from 'lucide-react';

interface ProposeChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCreateNew: () => void;
  onSelectJoinExisting: () => void;
}

export const ProposeChoiceModal: React.FC<ProposeChoiceModalProps> = ({
  isOpen,
  onClose,
  onSelectCreateNew,
  onSelectJoinExisting,
}) => {
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    firstOptionRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="propose-choice-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] text-[#1E2025] shadow-2xl border border-[#E2E2DF] overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[#E2E2DF]">
          <div>
            <h2 id="propose-choice-title" className="text-xl font-bold text-[#1E2025]">
              Proponi un canale
            </h2>
            <p className="mt-1 text-sm text-[#5A5E66]">
              Scegli come desideri collaborare con il gruppo ChannelLife. Tutte le richieste vengono valutate manualmente dagli amministratori.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi finestra"
            className="rounded-lg p-2 text-[#5A5E66] hover:bg-[#F4F4F3] hover:text-[#1E2025] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          <button
            ref={firstOptionRef}
            type="button"
            onClick={onSelectCreateNew}
            className="w-full text-left group rounded-xl border border-[#E2E2DF] bg-[#F8F8F7] hover:bg-[#FFF1E4] hover:border-[#F29243] p-4 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243] cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 rounded-lg bg-[#24262B] text-[#F29243] p-2.5 shrink-0">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-base font-semibold text-[#1E2025]">
                    Crea un nuovo canale con ChannelLife
                  </span>
                  <span className="mt-1 block text-sm text-[#5A5E66]">
                    Hai un’idea per un nuovo tema? Invia la tua proposta: se approvata, il team creerà il canale nel catalogo ufficiale.
                  </span>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-[#5A5E66] group-hover:text-[#A84A00] group-hover:translate-x-0.5 transition-transform shrink-0 mt-1" />
            </div>
          </button>

          <button
            type="button"
            onClick={onSelectJoinExisting}
            className="w-full text-left group rounded-xl border border-[#E2E2DF] bg-[#F8F8F7] hover:bg-[#FFF1E4] hover:border-[#F29243] p-4 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243] cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 rounded-lg bg-[#24262B] text-[#F29243] p-2.5 shrink-0">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="block text-base font-semibold text-[#1E2025]">
                    Chiedi di far entrare il tuo canale in ChannelLife
                  </span>
                  <span className="mt-1 block text-sm text-[#5A5E66]">
                    Gestisci già un canale WhatsApp attivo? Invia il link ufficiale per sottoporlo alla valutazione editoriale.
                  </span>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-[#5A5E66] group-hover:text-[#A84A00] group-hover:translate-x-0.5 transition-transform shrink-0 mt-1" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
