import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Compass,
  ExternalLink,
  FolderOpen,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { Category, PublicChannel } from '../types/channellife';
import { recordPublicChannelClick } from '../services/channellifeFirestore';
import { normalizeSearchText } from '../utils/validation';
import { FourDotsIcon } from './FourDotsIcon';
import { ProposeButton } from './ProposeButton';

type SortOption = 'recommended' | 'name_asc';

interface PublicDirectoryProps {
  categories: Category[];
  channels: PublicChannel[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenProposeChoice: () => void;
  onTriggerAdminLogin: () => void;
  onOpenPrivacy: () => void;
}

export const PublicDirectory: React.FC<PublicDirectoryProps> = ({
  categories,
  channels,
  loading,
  error,
  onRetry,
  onOpenProposeChoice,
  onTriggerAdminLogin,
  onOpenPrivacy,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recommended');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const normalizedQuery = normalizeSearchText(searchQuery);

  const filteredChannels = useMemo(() => {
    const matches = channels.filter((ch) => {
      if (selectedCategoryId !== 'all' && ch.categoryId !== selectedCategoryId) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack = normalizeSearchText(
        `${ch.name} ${ch.description} ${ch.categoryName}`
      );
      return haystack.includes(normalizedQuery);
    });

    if (sortBy === 'name_asc') {
      return [...matches].sort((a, b) => a.name.localeCompare(b.name, 'it'));
    }
    return [...matches].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name, 'it');
    });
  }, [channels, selectedCategoryId, normalizedQuery, sortBy]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = document.getElementById('catalogo-canali');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSelectCategoryAndScroll = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    const target = document.getElementById('catalogo-canali');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleChannelClick = (channelId: string) => {
    void recordPublicChannelClick(channelId);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategoryId('all');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#24262B] text-[#F8FAFC] overflow-x-clip">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#24262B]/95 backdrop-blur-sm border-b border-[#383B44]">
        <div className="max-w-5xl mx-auto px-3.5 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-8">
          <a
            href="#esplora"
            className="flex items-center gap-2.5 sm:gap-3 whitespace-nowrap shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243]"
          >
            <img
              src="./assets/channellife-logo-original.png"
              alt="ChannelLife"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shrink-0"
            />
            <span className="font-display text-base sm:text-xl font-bold tracking-tight text-white">
              ChannelLife
            </span>
          </a>

          <nav
            aria-label="Navigazione principale"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#D1D5DB]"
          >
            <a
              href="#esplora"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 hover:underline underline-offset-4"
            >
              Esplora
            </a>
            <a
              href="#categorie"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 hover:underline underline-offset-4"
            >
              Categorie
            </a>
            <a
              href="#come-funziona"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 hover:underline underline-offset-4"
            >
              Come funziona
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <ProposeButton
              onNormalClick={onOpenProposeChoice}
              onLongPress={onTriggerAdminLogin}
            />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-public-menu"
              aria-label={mobileMenuOpen ? 'Chiudi menu di navigazione' : 'Apri menu di navigazione'}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#383B44] bg-[#2B2E35] text-[#F8FAFC] hover:border-[#F29243] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243] cursor-pointer shrink-0"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <FourDotsIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            id="mobile-public-menu"
            aria-label="Navigazione mobile"
            className="md:hidden border-t border-[#383B44] bg-[#24262B] px-4 py-3 space-y-1 text-center"
          >
            <a
              href="#esplora"
              onClick={() => setMobileMenuOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-[#F8FAFC] hover:bg-[#2B2E35]"
            >
              Esplora
            </a>
            <a
              href="#categorie"
              onClick={() => setMobileMenuOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-[#F8FAFC] hover:bg-[#2B2E35]"
            >
              Categorie
            </a>
            <a
              href="#come-funziona"
              onClick={() => setMobileMenuOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm font-medium text-[#F8FAFC] hover:bg-[#2B2E35]"
            >
              Come funziona
            </a>
          </nav>
        )}
      </header>

      <main className="flex-1">
        {/* Hero & Search */}
        <section id="esplora" className="pt-8 pb-8 sm:pt-14 sm:pb-12 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center flex flex-col items-center">
            <h1
              className="font-display font-bold tracking-tight text-white mx-auto"
              style={{
                fontSize: 'clamp(1.85rem, 4.4vw, 3.25rem)',
                lineHeight: 1.14,
                textWrap: 'balance',
              }}
            >
              I tuoi interessi. I canali giusti.
            </h1>
            <p className="mt-3 text-sm sm:text-lg text-[#D1D5DB] max-w-xl mx-auto leading-relaxed">
              Scopri canali WhatsApp selezionati, raccolti nell&apos;universo ChannelLife.
            </p>

            {/* Search Bar */}
            <form
              onSubmit={handleSearchSubmit}
              role="search"
              aria-label="Cerca canali WhatsApp"
              className="mt-6 sm:mt-7 w-full max-w-xl mx-auto"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 rounded-2xl bg-[#FFFFFF] p-1.5 shadow-lg border border-white/10 focus-within:ring-2 focus-within:ring-[#F29243]">
                <label htmlFor="directory-search" className="sr-only">
                  Cerca un argomento o un canale
                </label>
                <div className="pl-2.5 sm:pl-3 text-[#5A5E66] shrink-0" aria-hidden="true">
                  <Search className="w-5 h-5" />
                </div>
                <input
                  id="directory-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cerca un argomento o un canale…"
                  className="w-full min-w-0 bg-transparent py-2.5 px-1 text-base text-[#1E2025] placeholder:text-[#7A7E87] focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Cancella ricerca"
                    className="rounded-lg p-2 text-[#5A5E66] hover:bg-[#F4F4F3] hover:text-[#1E2025] cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-3.5 sm:px-5 py-2.5 text-sm font-semibold text-[#1E2025] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24262B]"
                >
                  Cerca
                </button>
              </div>
            </form>

            {/* Category Filter Buttons */}
            <div
              role="group"
              aria-label="Filtra per categoria"
              className="mt-5 w-full flex flex-wrap items-center justify-center gap-2"
            >
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                aria-pressed={selectedCategoryId === 'all'}
                className={`min-h-[42px] rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243] ${
                  selectedCategoryId === 'all'
                    ? 'bg-[#FFF1E4] text-[#A84A00] ring-2 ring-[#F29243]'
                    : 'bg-[#F4F4F3] text-[#1E2025] hover:bg-white'
                }`}
              >
                Tutti
              </button>
              {categories.map((cat) => {
                const active = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    aria-pressed={active}
                    className={`min-h-[42px] rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243] ${
                      active
                        ? 'bg-[#FFF1E4] text-[#A84A00] ring-2 ring-[#F29243]'
                        : 'bg-[#F4F4F3] text-[#1E2025] hover:bg-white'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Featured Channels Grid */}
        <section id="catalogo-canali" className="px-4 sm:px-6 pb-12 sm:pb-16">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col items-center text-center gap-3 mb-7">
              <div className="flex items-baseline justify-center gap-3">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                  Canali in evidenza
                </h2>
                {!loading && !error && (
                  <span className="text-xs font-mono tabular-nums text-[#D1D5DB]">
                    {filteredChannels.length}{' '}
                    {filteredChannels.length === 1 ? 'canale' : 'canali'}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-center gap-2">
                <label htmlFor="sort-channels" className="text-xs text-[#D1D5DB]">
                  Ordina:
                </label>
                <select
                  id="sort-channels"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="rounded-xl border border-[#383B44] bg-[#2B2E35] px-3 py-2 text-xs sm:text-sm font-medium text-white focus:border-[#F29243] focus:outline-none focus:ring-2 focus:ring-[#F29243]/40 cursor-pointer"
                >
                  <option value="recommended">Ordine consigliato</option>
                  <option value="name_asc">Nome (A–Z)</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-wrap justify-center gap-5" aria-busy="true">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="w-full sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.85rem)] max-w-md rounded-2xl bg-[#F4F4F3] p-6 animate-pulse h-60 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-full bg-[#E2E2DF]" />
                        <div className="w-24 h-3 rounded bg-[#E2E2DF]" />
                      </div>
                      <div className="w-36 h-6 rounded bg-[#E2E2DF]" />
                      <div className="w-full h-4 rounded bg-[#E2E2DF]" />
                      <div className="w-4/5 h-4 rounded bg-[#E2E2DF]" />
                    </div>
                    <div className="w-full h-11 rounded-xl bg-[#E2E2DF]" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div
                role="alert"
                className="rounded-2xl border border-[#383B44] bg-[#2B2E35] p-8 text-center max-w-md mx-auto"
              >
                <p className="text-base font-semibold text-white">
                  Impossibile caricare il catalogo
                </p>
                <p className="mt-1.5 text-sm text-[#D1D5DB]">{error}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-4 rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-5 py-2.5 text-sm font-semibold text-[#1E2025] transition-colors cursor-pointer"
                >
                  Riprova
                </button>
              </div>
            ) : channels.length === 0 ? (
              <div className="rounded-2xl border border-[#383B44] bg-[#2B2E35] p-8 sm:p-10 text-center max-w-md mx-auto">
                <FolderOpen className="w-10 h-10 text-[#F29243] mx-auto" />
                <h3 className="mt-3 text-lg font-bold text-white">
                  Nessun canale pubblicato al momento
                </h3>
                <p className="mt-1.5 text-sm text-[#D1D5DB]">
                  Il catalogo è attualmente in aggiornamento. Puoi proporre un nuovo canale o richiedere l&apos;adesione di un canale esistente.
                </p>
                <button
                  type="button"
                  onClick={onOpenProposeChoice}
                  className="mt-5 rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-5 py-2.5 text-sm font-semibold text-[#1E2025] transition-colors cursor-pointer"
                >
                  Proponi un canale
                </button>
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="rounded-2xl border border-[#383B44] bg-[#2B2E35] p-8 sm:p-10 text-center max-w-md mx-auto">
                <Search className="w-9 h-9 text-[#F29243] mx-auto" />
                <h3 className="mt-3 text-lg font-bold text-white">
                  Nessun canale trovato
                </h3>
                <p className="mt-1.5 text-sm text-[#D1D5DB]">
                  Non ci sono canali pubblicati corrispondenti ai criteri selezionati.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-5 rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-5 py-2.5 text-sm font-semibold text-[#1E2025] transition-colors cursor-pointer"
                >
                  Mostra tutti i canali
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-5">
                {filteredChannels.map((channel) => (
                  <article
                    key={channel.id}
                    className="w-full sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.85rem)] max-w-md rounded-2xl bg-[#F4F4F3] text-[#1E2025] p-6 flex flex-col justify-between shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#24262B] flex items-center justify-center overflow-hidden shrink-0">
                          <img
                            src={channel.imageUrl || './assets/channellife-emblem.png'}
                            alt={`Logo ${channel.name}`}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.src = './assets/channellife-emblem.png';
                            }}
                            className={
                              channel.imageUrl
                                ? 'w-full h-full object-cover'
                                : 'w-6 h-6 object-contain'
                            }
                          />
                        </div>
                        <span className="text-xs font-semibold tracking-wide text-[#5A5E66] text-right">
                          {channel.categoryName}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <h3 className="font-display text-xl font-bold text-[#1E2025]">
                          {channel.name}
                        </h3>
                        {channel.verified && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#5A5E66]">
                            <CheckCircle2
                              className="w-3.5 h-3.5 text-[#D97706] shrink-0"
                              aria-hidden="true"
                            />
                            <span>Canale verificato</span>
                          </span>
                        )}
                      </div>

                      <p className="mt-2.5 text-sm sm:text-[15px] leading-relaxed text-[#333740]">
                        {channel.description}
                      </p>
                    </div>

                    <div className="mt-6">
                      <a
                        href={channel.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleChannelClick(channel.id)}
                        className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-4 py-3 text-sm font-semibold text-[#1E2025] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24262B]"
                      >
                        <span>Apri su WhatsApp</span>
                        <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Categories Section */}
        <section
          id="categorie"
          className="border-t border-[#383B44] bg-[#202227] px-4 sm:px-6 py-12 sm:py-16"
        >
          <div className="max-w-5xl mx-auto">
            <div className="max-w-xl mx-auto text-center">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Esplora per categoria
              </h2>
              <p className="mt-2 text-sm sm:text-base text-[#D1D5DB]">
                Seleziona un tema per filtrare rapidamente i canali WhatsApp ufficiali attivi in ChannelLife.
              </p>
            </div>

            {categories.length === 0 ? (
              <p className="mt-6 text-center text-sm text-[#D1D5DB]">
                Nessuna categoria configurata al momento.
              </p>
            ) : (
              <div className="mt-7 flex flex-wrap justify-center gap-4">
                {categories.map((cat) => {
                  const count = channels.filter((c) => c.categoryId === cat.id).length;
                  const isActive = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategoryAndScroll(cat.id)}
                      className={`w-full sm:w-[290px] text-left rounded-2xl border p-5 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243] ${
                        isActive
                          ? 'border-[#F29243] bg-[#2B2E35]'
                          : 'border-[#383B44] bg-[#26282E] hover:border-[#F29243]/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-display text-lg font-bold text-white">
                          {cat.name}
                        </span>
                        <ArrowUpRight className="w-5 h-5 text-[#F29243] shrink-0" />
                      </div>
                      <p className="mt-1.5 text-xs font-mono tabular-nums text-[#D1D5DB]">
                        {count} {count === 1 ? 'canale pubblicato' : 'canali pubblicati'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* How It Works Section */}
        <section
          id="come-funziona"
          className="border-t border-[#383B44] px-4 sm:px-6 py-12 sm:py-16"
        >
          <div className="max-w-5xl mx-auto">
            <div className="max-w-xl mx-auto text-center">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                Come funziona ChannelLife
              </h2>
              <p className="mt-2 text-sm sm:text-base text-[#D1D5DB]">
                Una directory curata manualmente per scoprire i canali ufficiali del gruppo in modo diretto, senza account intermedi.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="rounded-2xl border border-[#383B44] bg-[#2B2E35] p-6 text-center md:text-left">
                <div className="w-10 h-10 rounded-xl bg-[#24262B] text-[#F29243] flex items-center justify-center mx-auto md:mx-0">
                  <Compass className="w-5 h-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-white">
                  01. Scegli l&apos;argomento
                </h3>
                <p className="mt-2 text-sm text-[#D1D5DB] leading-relaxed">
                  Cerca per parola chiave o filtra per categoria per trovare subito i canali in linea con i tuoi interessi.
                </p>
              </div>

              <div className="rounded-2xl border border-[#383B44] bg-[#2B2E35] p-6 text-center md:text-left">
                <div className="w-10 h-10 rounded-xl bg-[#24262B] text-[#F29243] flex items-center justify-center mx-auto md:mx-0">
                  <ExternalLink className="w-5 h-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-white">
                  02. Iscriviti su WhatsApp
                </h3>
                <p className="mt-2 text-sm text-[#D1D5DB] leading-relaxed">
                  Il pulsante «Apri su WhatsApp» ti porta al collegamento ufficiale del canale. L&apos;iscrizione avviene direttamente nell&apos;app WhatsApp.
                </p>
              </div>

              <div className="rounded-2xl border border-[#383B44] bg-[#2B2E35] p-6 text-center md:text-left">
                <div className="w-10 h-10 rounded-xl bg-[#24262B] text-[#F29243] flex items-center justify-center mx-auto md:mx-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-white">
                  03. Proponi un canale
                </h3>
                <p className="mt-2 text-sm text-[#D1D5DB] leading-relaxed">
                  Puoi proporre un nuovo canale da far nascere in ChannelLife o candidare il tuo canale esistente alla revisione degli amministratori.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#383B44] bg-[#202227] px-4 sm:px-6 py-7">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center">
          <p className="text-xs sm:text-sm text-[#D1D5DB]">
            L&apos;iscrizione si completa su WhatsApp. ChannelLife non gestisce i messaggi degli utenti.
          </p>
          <div className="flex items-center gap-5 text-xs sm:text-sm">
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="text-[#D1D5DB] hover:text-white underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F29243] rounded py-1 px-2"
            >
              Informativa Privacy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
