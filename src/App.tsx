/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { AdminAuthModal } from './components/AdminAuthModal';
import { AdminDashboard } from './components/AdminDashboard';
import { PrivacyPage } from './components/PrivacyPage';
import { ProposeChoiceModal } from './components/ProposeChoiceModal';
import { PublicDirectory } from './components/PublicDirectory';
import { RequestModals, type RequestModalMode } from './components/RequestModals';
import type { Category, PublicChannel } from './types/channellife';

type AppView = 'public' | 'privacy' | 'admin';

export default function App() {
  const [view, setView] = useState<AppView>('public');
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [proposeChoiceOpen, setProposeChoiceOpen] = useState(false);
  const [requestModalMode, setRequestModalMode] = useState<RequestModalMode>(null);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);

  // Held strictly in React memory (never localStorage/sessionStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminRefreshSignal, setAdminRefreshSignal] = useState(0);

  const fetchCatalog = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const res = await fetch('/api/public/catalog', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Risposta non valida dal server.');
      }
      const data = await res.json();
      setCategories(Array.isArray(data.categories) ? data.categories : []);
      setChannels(Array.isArray(data.channels) ? data.channels : []);
    } catch {
      setCatalogError(
        'Si è verificato un problema durante il caricamento dei canali. Riprova tra poco.'
      );
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog(true);
  }, [fetchCatalog]);

  // Real-time multi-device synchronization via Server-Sent Events
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.addEventListener('catalog', () => {
        fetchCatalog(false);
        setAdminRefreshSignal((n) => n + 1);
      });
      eventSource.addEventListener('requests', () => {
        setAdminRefreshSignal((n) => n + 1);
      });
    } catch {
      // Fallback gracefully if SSE is unavailable
    }

    return () => {
      eventSource?.close();
    };
  }, [fetchCatalog]);

  const handleTriggerAdminLogin = () => {
    setProposeChoiceOpen(false);
    setRequestModalMode(null);
    if (adminToken) {
      setView('admin');
      return;
    }
    setAdminAuthOpen(true);
  };

  const handleAuthenticated = (token: string) => {
    setAdminToken(token);
    setAdminAuthOpen(false);
    setView('admin');
  };

  const handleAdminUnauthorized = () => {
    setAdminToken(null);
    setView('public');
    setAdminAuthOpen(true);
  };

  const handleAdminLoggedOut = () => {
    setAdminToken(null);
    setView('public');
  };

  if (view === 'admin' && adminToken) {
    return (
      <AdminDashboard
        token={adminToken}
        onUnauthorized={handleAdminUnauthorized}
        onExitToPublic={() => setView('public')}
        onLoggedOut={handleAdminLoggedOut}
        refreshSignal={adminRefreshSignal}
      />
    );
  }

  if (view === 'privacy') {
    return <PrivacyPage onBack={() => setView('public')} />;
  }

  return (
    <>
      <PublicDirectory
        categories={categories}
        channels={channels}
        loading={loadingCatalog}
        error={catalogError}
        onRetry={() => fetchCatalog(true)}
        onOpenProposeChoice={() => setProposeChoiceOpen(true)}
        onTriggerAdminLogin={handleTriggerAdminLogin}
        onOpenPrivacy={() => setView('privacy')}
      />

      <ProposeChoiceModal
        isOpen={proposeChoiceOpen}
        onClose={() => setProposeChoiceOpen(false)}
        onSelectCreateNew={() => {
          setProposeChoiceOpen(false);
          setRequestModalMode('new_channel');
        }}
        onSelectJoinExisting={() => {
          setProposeChoiceOpen(false);
          setRequestModalMode('join_channel');
        }}
      />

      <RequestModals
        mode={requestModalMode}
        onClose={() => setRequestModalMode(null)}
      />

      <AdminAuthModal
        isOpen={adminAuthOpen}
        onClose={() => setAdminAuthOpen(false)}
        onAuthenticated={handleAuthenticated}
      />
    </>
  );
}
