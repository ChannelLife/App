import React from 'react';
import { ArrowLeft, Mail, Shield, ShieldAlert } from 'lucide-react';

interface PrivacyPageProps {
  onBack: () => void;
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-[#24262B] text-[#F8FAFC]">
      <header className="border-b border-[#383B44]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#D1D5DB] hover:text-white transition-colors rounded-lg px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Torna a ChannelLife</span>
          </button>
          <img
            src="./assets/channellife-logo-original.png"
            alt="ChannelLife"
            className="w-9 h-9 rounded-full object-cover"
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="rounded-2xl bg-[#FFFFFF] text-[#1E2025] p-6 sm:p-10 shadow-xl">
          <div className="flex items-center gap-3 pb-6 border-b border-[#E2E2DF]">
            <div className="rounded-xl bg-[#FFF1E4] text-[#A84A00] p-2.5 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1E2025]">
                Informativa Privacy e Regolamento
              </h1>
              <p className="text-sm text-[#5A5E66] mt-0.5">
                Trasparenza sul trattamento dei dati personali e sulle linee guida della community ChannelLife.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-6 text-sm sm:text-base leading-relaxed text-[#333740]">
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-[#1E2025]">
                1. Titolare del trattamento e contatti
              </h2>
              <p>
                Il Titolare del trattamento dei dati è <strong>Montatech Corporation</strong>. Siamo sempre a tua completa disposizione: per qualsiasi problema, dubbio, segnalazione o esigenza di supporto puoi scriverci con la massima tranquillità all&apos;indirizzo email{' '}
                <a
                  href="mailto:Montatech@ik.me"
                  className="inline-flex items-center gap-1 font-semibold text-[#A84A00] hover:underline"
                >
                  <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Montatech@ik.me</span>
                </a>
                .
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-[#1E2025]">
                2. Dati raccolti e finalità
              </h2>
              <p>
                La consultazione pubblica della directory ChannelLife non richiede registrazione né creazione di account utente. Quando un visitatore apre un collegamento «Apri su WhatsApp», l&apos;iscrizione al canale avviene esclusivamente all&apos;interno dell&apos;applicazione WhatsApp: ChannelLife non legge né gestisce i messaggi o i profili WhatsApp degli utenti.
              </p>
              <p>
                Attraverso i moduli «Crea un nuovo canale con ChannelLife» e «Chiedi di far entrare il tuo canale in ChannelLife», vengono raccolti esclusivamente i dati forniti volontariamente dal richiedente (nome canale, descrizione, link ufficiale, motivazione, note facoltative, indirizzo email e numero di telefono) al solo scopo di valutare la richiesta e offrire assistenza diretta.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-[#1E2025]">
                3. Riservatezza e separazione dal catalogo pubblico
              </h2>
              <p>
                Gli indirizzi email, i numeri di telefono, le motivazioni e le note inviati tramite i moduli non vengono pubblicati nel catalogo pubblico né esposti negli endpoint di ricerca. Tali informazioni sono accessibili unicamente agli amministratori autenticati. Il numero di telefono associato al proprietario di un canale approvato resta un dato interno riservato agli amministratori.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-bold text-[#1E2025]">
                4. Conservazione e diritti dell&apos;interessato
              </h2>
              <p>
                Una volta inviata una proposta o richiesta di adesione, riceverai una risposta via email <strong>entro 30 giorni lavorativi</strong> per confermarti con chiarezza se la tua richiesta è stata approvata oppure no.
              </p>
              <p>
                I dati personali forniti vengono custoditi al sicuro esclusivamente dal Titolare del trattamento (<strong>Montatech Corporation</strong>), senza essere ceduti a terzi, al solo scopo di fornire assistenza a chi ne avesse bisogno e/o per poterti contattare tempestivamente in caso di eventuali problemi tecnici o editoriali legati al canale. In ogni momento puoi scriverci a{' '}
                <a
                  href="mailto:Montatech@ik.me"
                  className="font-semibold text-[#A84A00] hover:underline"
                >
                  Montatech@ik.me
                </a>{' '}
                per chiedere informazioni, modificare o richiedere la cancellazione dei tuoi dati.
              </p>
            </section>

            <section className="rounded-xl border border-red-200 bg-red-50/70 p-5 space-y-2">
              <div className="flex items-center gap-2 text-red-900">
                <ShieldAlert className="w-5 h-5 text-red-700 shrink-0" aria-hidden="true" />
                <h2 className="text-lg font-bold">
                  5. Codice di condotta e contenuti severamente vietati
                </h2>
              </div>
              <p className="text-[#333740]">
                ChannelLife promuove uno spazio sicuro, rispettoso e adatto a tutta la community. Per entrare a far parte del gruppo ChannelLife e mantenerne l&apos;adesione è{' '}
                <strong className="text-red-900">severamente vietato</strong>{' '}
                pubblicare o diffondere sui propri canali materiali <strong>NSFW</strong>, contenuti espliciti o per soli adulti (<strong>+18</strong>), contenuti discriminatori o incitanti all&apos;odio, nonché qualsiasi contenuto di matrice <strong>nazista, fascista</strong> o estremista, violenta o contraria alla legge.
              </p>
              <p className="text-xs sm:text-sm text-red-900 font-medium">
                La violazione di queste regole comporta il rifiuto della richiesta o l&apos;immediata esclusione del canale dalla directory ChannelLife.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
