/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { AdminAuthModal } from './components/AdminAuthModal';
import { AdminDashboard } from './components/AdminDashboard';
import { PrivacyPage } from './components/PrivacyPage';
import { ProposeChoiceModal } from './components/ProposeChoiceModal';
import { PublicDirectory } from './components/PublicDirectory';
import { RequestModals, type RequestModalMode } from './components/RequestModals';
import { auth } from './services/firebase';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  ensureInitialSeed,
  isAuthorizedAdminUser,
  subscribeToPublicCatalog,
} from './services/channellifeFirestore';
import type { Category, PublicChannel } from './types/channellife';

type AppView = 'public' | 'privacy' | 'admin';

export default function App() {
  const [view, setView] = useState<AppView>('public');
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogRetryKey, setCatalogRetryKey] = useState(0);

  const [proposeChoiceOpen, setProposeChoiceOpen] = useState(false);
  const [requestModalMode, setRequestModalMode] = useState<RequestModalMode>(null);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const [isAdminSignedIn, setIsAdminSignedIn] = useState(false);

  useEffect(() => {
    setLoadingCatalog(true);
    setCatalogError(null);

    const unsubscribe = subscribeToPublicCatalog(
      (data) => {
        setCategories(data.categories);
        setChannels(data.channels);
        setLoadingCatalog(false);
        setCatalogError(null);
      },
      (msg) => {
        setCatalogError(msg);
        setLoadingCatalog(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [catalogRetryKey]);

  useEffect(() => {
    const unsubscribeAuth = onIdTokenChanged(auth, async (user) => {
      if (!user) {
        setIsAdminSignedIn(false);
        return;
      }
      const authorized = await isAuthorizedAdminUser(user);
      setIsAdminSignedIn(authorized);
      if (authorized) {
        void ensureInitialSeed();
      } else if (user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL && !user.emailVerified) {
        setView((curr) => {
          if (curr === 'admin') {
            setAdminAuthOpen(true);
            return 'public';
          }
          return curr;
        });
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const handleRetryCatalog = useCallback(() => {
    setCatalogRetryKey((k) => k + 1);
  }, []);

  const handleTriggerAdminLogin = () => {
    setProposeChoiceOpen(false);
    setRequestModalMode(null);
    if (isAdminSignedIn) {
      setView('admin');
      return;
    }
    setAdminAuthOpen(true);
  };

  const handleAuthenticated = () => {
    setIsAdminSignedIn(true);
    setAdminAuthOpen(false);
    setView('admin');
  };

  const handleAdminUnauthorized = () => {
    setIsAdminSignedIn(false);
    setView('public');
    setAdminAuthOpen(true);
  };

  const handleAdminLoggedOut = () => {
    setIsAdminSignedIn(false);
    setView('public');
  };

  if (view === 'admin' && isAdminSignedIn) {
    return (
      <AdminDashboard
        onUnauthorized={handleAdminUnauthorized}
        onExitToPublic={() => setView('public')}
        onLoggedOut={handleAdminLoggedOut}
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
        onRetry={handleRetryCatalog}
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
