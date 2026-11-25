import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Eye,
  EyeOff,
  Folder,
  KeyRound,
  LogOut,
  Mail,
  MousePointerClick,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Tv,
  Upload,
  X,
} from 'lucide-react';
import type {
  AdminChannel,
  AdminOverviewStats,
  Category,
  ChannelRequest,
  RequestStatus,
} from '../types/channellife';
import {
  approveAdminRequest,
  createAdminCategory,
  deleteAdminCategory,
  deleteAdminChannel,
  deleteAdminRequest,
  isPasswordProviderLinked,
  renameAdminCategory,
  reorderAdminCategories,
  saveAdminChannel,
  setOrUpdateAdminPassword,
  signOutAdmin,
  subscribeToAdminDashboard,
  toggleAdminChannelPublished,
  updateAdminRequest,
} from '../services/channellifeFirestore';
import {
  isValidOptionalImageUrl,
  isValidPhone,
  normalizeChannelImageUrl,
  normalizeSearchText,
  normalizeWhatsAppChannelUrl,
} from '../utils/validation';
import { FourDotsIcon } from './FourDotsIcon';

type AdminTab = 'overview' | 'channels' | 'categories' | 'requests';

interface AdminDashboardProps {
  onUnauthorized: () => void;
  onExitToPublic: () => void;
  onLoggedOut: () => void;
}

function formatDateIt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusPillClasses(status: RequestStatus): string {
  switch (status) {
    case 'Nuova':
      return 'bg-[#FFF1E4] text-[#A84A00] border border-[#F29243]/50';
    case 'In valutazione':
      return 'bg-amber-50 text-amber-800 border border-amber-200';
    case 'Approvata':
      return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
    case 'Rifiutata':
      return 'bg-red-50 text-red-800 border border-red-200';
  }
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onUnauthorized,
  onExitToPublic,
  onLoggedOut,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [stats, setStats] = useState<AdminOverviewStats>({
    publishedChannels: 0,
    totalChannels: 0,
    totalCategories: 0,
    pendingRequests: 0,
    totalClicks: 0,
  });
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [requests, setRequests] = useState<ChannelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters
  const [channelSearch, setChannelSearch] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'all' | RequestStatus>('all');
  const [requestTypeFilter, setRequestTypeFilter] = useState<'all' | 'new_channel' | 'join_channel'>('all');

  // Channel Add/Edit Modal
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<AdminChannel | null>(null);
  const [chName, setChName] = useState('');
  const [chCategoryId, setChCategoryId] = useState('');
  const [chDescription, setChDescription] = useState('');
  const [chOfficialUrl, setChOfficialUrl] = useState('');
  const [chImageUrl, setChImageUrl] = useState('');
  const [chOwnerPhone, setChOwnerPhone] = useState('');
  const [chSortOrder, setChSortOrder] = useState('1');
  const [chVerified, setChVerified] = useState(false);
  const [chPublished, setChPublished] = useState(true);
  const [chError, setChError] = useState<string | null>(null);
  const [chSaving, setChSaving] = useState(false);
  const [chUploadingLogo, setChUploadingLogo] = useState(false);

  const handleLogoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setChError('Seleziona un’immagine PNG, JPG o WebP.');
      return;
    }

    setChError(null);
    setChUploadingLogo(true);
    try {
      const bitmap = await createImageBitmap(file);
      const maxDim = 256;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas non disponibile.');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      let dataUrl =
        file.type === 'image/png'
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', 0.88);

      if (dataUrl.length > 220000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.78);
      }
      if (dataUrl.length > 240000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.62);
      }
      if (dataUrl.length > 245000) {
        setChError('Immagine troppo pesante: scegli un file più leggero o usa un link diretto.');
        return;
      }

      setChImageUrl(dataUrl);
    } catch {
      setChError('Impossibile elaborare l’immagine selezionata.');
    } finally {
      setChUploadingLogo(false);
    }
  };

  // Quick menu open per channel row (using FourDotsIcon)
  const [openMenuChannelId, setOpenMenuChannelId] = useState<string | null>(null);

  // Delete Channel Confirmation
  const [deletingChannel, setDeletingChannel] = useState<AdminChannel | null>(null);
  const [deletingChannelBusy, setDeletingChannelBusy] = useState(false);

  // Categories State
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [renamingCategory, setRenamingCategory] = useState<Category | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);

  // Request Detail & Approval Modals
  const [selectedRequest, setSelectedRequest] = useState<ChannelRequest | null>(null);
  const [approvingRequest, setApprovingRequest] = useState<ChannelRequest | null>(null);
  const [appChannelName, setAppChannelName] = useState('');
  const [appCategoryId, setAppCategoryId] = useState('');
  const [appDescription, setAppDescription] = useState('');
  const [appOfficialUrl, setAppOfficialUrl] = useState('');
  const [appVerified, setAppVerified] = useState(false);
  const [appPublished, setAppPublished] = useState(true);
  const [appConfirmationSent, setAppConfirmationSent] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);
  const [appBusy, setAppBusy] = useState(false);

  const [deletingRequest, setDeletingRequest] = useState<ChannelRequest | null>(null);
  const [deletingRequestBusy, setDeletingRequestBusy] = useState(false);

  // Admin Password Modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false);
  const [adminPasswordError, setAdminPasswordError] = useState<string | null>(null);
  const [adminPasswordBusy, setAdminPasswordBusy] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  useEffect(() => {
    setLoading(true);
    setErrorBanner(null);

    const unsubscribe = subscribeToAdminDashboard(
      (snapshot) => {
        setStats(snapshot.stats);
        setChannels(snapshot.channels);
        setCategories(snapshot.categories);
        setRequests(snapshot.requests);
        setLoading(false);
        setErrorBanner(null);
      },
      (msg) => {
        setLoading(false);
        if (msg.toLowerCase().includes('permission')) {
          onUnauthorized();
          return;
        }
        setErrorBanner(msg);
      }
    );

    return () => unsubscribe();
  }, [onUnauthorized]);

  const handleLogout = async () => {
    try {
      await signOutAdmin();
    } catch {
      // Ignore signout error
    }
    onLoggedOut();
  };

  const openPasswordModal = () => {
    setAdminNewPassword('');
    setAdminConfirmPassword('');
    setShowAdminNewPassword(false);
    setAdminPasswordError(null);
    setPasswordModalOpen(true);
  };

  const handleSaveAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPasswordError(null);
    if (adminNewPassword.length < 8) {
      setAdminPasswordError('Scegli una password di almeno 8 caratteri.');
      return;
    }
    if (adminNewPassword !== adminConfirmPassword) {
      setAdminPasswordError('Le due password non coincidono.');
      return;
    }

    setAdminPasswordBusy(true);
    try {
      const result = await setOrUpdateAdminPassword(adminNewPassword);
      setPasswordModalOpen(false);
      if (result.verificationRequired) {
        showToast(
          'Password collegata! Conferma l’email di verifica inviata all’indirizzo amministratore per completare.'
        );
      } else {
        showToast('Password amministratore salvata. Ora puoi usarla per accedere direttamente.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('operation-not-allowed')) {
        setAdminPasswordError(
          'Abilita prima "Email/Password" nella Firebase Console (Authentication → Sign-in method → Email/Password) per attivare l’accesso con password.'
        );
      } else if (msg.includes('requires-recent-login')) {
        setAdminPasswordError(
          'Per motivi di sicurezza, esci e rientra un attimo con Google prima di modificare la password.'
        );
      } else {
        setAdminPasswordError(msg || 'Impossibile salvare la password amministratore.');
      }
    } finally {
      setAdminPasswordBusy(false);
    }
  };

  // --- Channel CRUD ---
  const openCreateChannelModal = () => {
    setEditingChannel(null);
    setChName('');
    setChCategoryId(categories[0]?.id || '');
    setChDescription('');
    setChOfficialUrl('');
    setChImageUrl('');
    setChOwnerPhone('');
    setChSortOrder(String(channels.length + 1));
    setChVerified(false);
    setChPublished(true);
    setChError(null);
    setChannelModalOpen(true);
  };

  const openEditChannelModal = (channel: AdminChannel) => {
    setOpenMenuChannelId(null);
    setEditingChannel(channel);
    setChName(channel.name);
    setChCategoryId(channel.categoryId);
    setChDescription(channel.description);
    setChOfficialUrl(channel.officialUrl);
    setChImageUrl(channel.imageUrl || '');
    setChOwnerPhone(channel.ownerPhone || '');
    setChSortOrder(String(channel.sortOrder));
    setChVerified(channel.verified);
    setChPublished(channel.published);
    setChError(null);
    setChannelModalOpen(true);
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setChError(null);

    if (chName.trim().length < 2 || chName.trim().length > 80) {
      setChError('Il nome del canale deve avere tra 2 e 80 caratteri.');
      return;
    }
    if (!chCategoryId) {
      setChError('Seleziona una categoria.');
      return;
    }
    if (chDescription.trim().length < 6 || chDescription.trim().length > 280) {
      setChError('La descrizione deve avere tra 6 e 280 caratteri.');
      return;
    }
    const normalizedUrl = normalizeWhatsAppChannelUrl(chOfficialUrl);
    if (!normalizedUrl) {
      setChError('Inserisci un link WhatsApp valido (https://whatsapp.com/channel/...).');
      return;
    }
    if (!isValidOptionalImageUrl(chImageUrl)) {
      setChError('L’URL immagine deve iniziare con https:// oppure ./assets/ (o essere caricato dal dispositivo).');
      return;
    }
    if (chOwnerPhone.trim() && !isValidPhone(chOwnerPhone)) {
      setChError('Il numero di telefono del proprietario non è valido.');
      return;
    }

    const selectedCategory = categories.find((c) => c.id === chCategoryId);
    if (!selectedCategory) {
      setChError('Categoria selezionata non valida.');
      return;
    }

    setChSaving(true);
    try {
      await saveAdminChannel(editingChannel ? editingChannel.id : null, {
        name: chName.trim(),
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        description: chDescription.trim(),
        officialUrl: normalizedUrl,
        imageUrl: chImageUrl.trim() || null,
        ownerPhone: chOwnerPhone.trim() || null,
        sortOrder: Number.parseInt(chSortOrder, 10) || 1,
        verified: chVerified,
        published: chPublished,
      });

      setChannelModalOpen(false);
      showToast(editingChannel ? 'Canale aggiornato.' : 'Canale aggiunto al catalogo.');
    } catch (err) {
      setChError(err instanceof Error && !err.message.startsWith('{') ? err.message : 'Errore di salvataggio.');
    } finally {
      setChSaving(false);
    }
  };

  const handleTogglePublish = async (channel: AdminChannel) => {
    setOpenMenuChannelId(null);
    try {
      await toggleAdminChannelPublished(channel.id, !channel.published);
      showToast(channel.published ? 'Canale nascosto dal catalogo.' : 'Canale pubblicato nel catalogo.');
    } catch (err) {
      setErrorBanner(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Impossibile aggiornare lo stato del canale.'
      );
    }
  };

  const handleConfirmDeleteChannel = async () => {
    if (!deletingChannel) return;
    setDeletingChannelBusy(true);
    try {
      await deleteAdminChannel(deletingChannel.id);
      setDeletingChannel(null);
      showToast('Canale rimosso dalla directory ChannelLife.');
    } catch (err) {
      setErrorBanner(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Impossibile eliminare il canale.'
      );
    } finally {
      setDeletingChannelBusy(false);
    }
  };

  // --- Categories CRUD ---
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryError(null);
    if (newCategoryName.trim().length < 2) {
      setCategoryError('Inserisci un nome categoria di almeno 2 caratteri.');
      return;
    }
    setCategoryBusy(true);
    try {
      await createAdminCategory(newCategoryName.trim(), categories.length + 1);
      setNewCategoryName('');
      showToast('Categoria creata.');
    } catch (err) {
      setCategoryError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Impossibile creare la categoria.'
      );
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleRenameCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingCategory) return;
    if (renameValue.trim().length < 2) {
      setCategoryError('Inserisci un nome valido.');
      return;
    }
    setCategoryBusy(true);
    try {
      const channelsInCat = channels.filter((c) => c.categoryId === renamingCategory.id);
      await renameAdminCategory(renamingCategory.id, renameValue.trim(), channelsInCat);
      setRenamingCategory(null);
      setRenameValue('');
      showToast('Categoria rinominata.');
    } catch (err) {
      setCategoryError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Impossibile rinominare la categoria.'
      );
    } finally {
      setCategoryBusy(false);
    }
  };

  const handleMoveCategory = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    const orderedIds = reordered.map((c) => c.id);

    setCategories(reordered);
    try {
      await reorderAdminCategories(orderedIds);
      showToast('Ordine categorie aggiornato.');
    } catch {
      setErrorBanner('Impossibile aggiornare l’ordine delle categorie.');
    }
  };

  const openDeleteCategoryModal = (cat: Category) => {
    setCategoryError(null);
    const otherCats = categories.filter((c) => c.id !== cat.id);
    setReassignTargetId(otherCats[0]?.id || '');
    setDeletingCategory(cat);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    const channelsToReassign = channels.filter((c) => c.categoryId === deletingCategory.id);
    const targetCategory = categories.find((c) => c.id === reassignTargetId);
    if (channelsToReassign.length > 0 && !targetCategory) {
      setCategoryError('Crea prima un’altra categoria in cui riassegnare i canali.');
      return;
    }
    setCategoryBusy(true);
    setCategoryError(null);
    try {
      await deleteAdminCategory(deletingCategory.id, channelsToReassign, targetCategory);
      setDeletingCategory(null);
      showToast('Categoria eliminata.');
    } catch (err) {
      setCategoryError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Impossibile eliminare la categoria.'
      );
    } finally {
      setCategoryBusy(false);
    }
  };

  // --- Requests Workflows ---
  const handleUpdateRequestStatus = async (
    reqItem: ChannelRequest,
    updates: { status?: RequestStatus; confirmationSent?: boolean }
  ) => {
    try {
      await updateAdminRequest(reqItem.id, updates);
      if (selectedRequest?.id === reqItem.id) {
        setSelectedRequest({ ...reqItem, ...updates });
      }
      showToast('Richiesta aggiornata.');
    } catch (err) {
      setErrorBanner(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Impossibile aggiornare la richiesta.'
      );
    }
  };

  const openApprovalModal = (reqItem: ChannelRequest) => {
    setApprovingRequest(reqItem);
    setAppChannelName(reqItem.channelName);
    setAppCategoryId(categories[0]?.id || '');
    setAppDescription(reqItem.description || '');
    setAppOfficialUrl(reqItem.officialUrl || '');
    setAppVerified(false);
    setAppPublished(true);
    setAppConfirmationSent(true);
    setAppError(null);
  };

  const handleConfirmApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingRequest) return;
    setAppError(null);

    if (appChannelName.trim().length < 2) {
      setAppError('Inserisci un nome valido per il canale.');
      return;
    }
    const targetCat = categories.find((c) => c.id === appCategoryId);
    if (!targetCat) {
      setAppError('Seleziona la categoria di destinazione.');
      return;
    }
    if (appDescription.trim().length < 6) {
      setAppError('Inserisci la descrizione pubblica del canale (minimo 6 caratteri).');
      return;
    }
    const normalizedUrl = normalizeWhatsAppChannelUrl(appOfficialUrl);
    if (!normalizedUrl) {
      setAppError('Inserisci un link ufficiale WhatsApp valido (https://whatsapp.com/channel/...).');
      return;
    }

    setAppBusy(true);
    try {
      await approveAdminRequest(approvingRequest, {
        channelName: appChannelName.trim(),
        categoryId: targetCat.id,
        categoryName: targetCat.name,
        description: appDescription.trim(),
        officialUrl: normalizedUrl,
        verified: appVerified,
        published: appPublished,
        confirmationSent: appConfirmationSent,
        sortOrder: channels.length + 1,
      });

      setApprovingRequest(null);
      setSelectedRequest(null);
      showToast('Richiesta approvata e canale aggiunto al catalogo ChannelLife.');
    } catch (err) {
      setAppError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Impossibile completare l’approvazione.'
      );
    } finally {
      setAppBusy(false);
    }
  };

  const handleConfirmDeleteRequest = async () => {
    if (!deletingRequest) return;
    setDeletingRequestBusy(true);
    try {
      await deleteAdminRequest(deletingRequest.id);
      if (selectedRequest?.id === deletingRequest.id) {
        setSelectedRequest(null);
      }
      setDeletingRequest(null);
      showToast('Richiesta eliminata.');
    } catch (err) {
      setErrorBanner(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Impossibile eliminare la richiesta.'
      );
    } finally {
      setDeletingRequestBusy(false);
    }
  };

  const filteredChannels = useMemo(() => {
    const q = normalizeSearchText(channelSearch);
    if (!q) return channels;
    return channels.filter((ch) =>
      normalizeSearchText(`${ch.name} ${ch.categoryName} ${ch.description}`).includes(q)
    );
  }, [channels, channelSearch]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (requestStatusFilter !== 'all' && r.status !== requestStatusFilter) return false;
      if (requestTypeFilter !== 'all' && r.type !== requestTypeFilter) return false;
      return true;
    });
  }, [requests, requestStatusFilter, requestTypeFilter]);

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'Panoramica', icon: <Tv className="w-4 h-4" /> },
    { id: 'channels', label: 'Canali', icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'categories', label: 'Categorie', icon: <Folder className="w-4 h-4" /> },
    {
      id: 'requests',
      label: 'Richieste',
      icon: <ClipboardList className="w-4 h-4" />,
      badge: stats.pendingRequests,
    },
  ];

  return (
    <div className="min-h-screen flex bg-[#F4F4F3] text-[#1E2025]">
      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-[#24262B] text-white flex flex-col justify-between transition-transform duration-200 shrink-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5">
          <div className="flex items-center justify-between lg:justify-center pb-5 border-b border-[#383B44]">
            <img
              src="./assets/channellife-logo-original.png"
              alt="ChannelLife Admin"
              className="w-24 h-24 rounded-full object-cover"
            />
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Chiudi barra laterale"
              className="lg:hidden rounded-lg p-2 text-[#D1D5DB] hover:bg-[#383B44]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav aria-label="Menu amministratore" className="mt-6 space-y-1.5">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#F29243] text-[#1E2025]'
                      : 'text-[#D1D5DB] hover:bg-[#2F3239] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`font-mono tabular-nums text-xs px-2 py-0.5 rounded-md ${
                        active
                          ? 'bg-[#1E2025]/15 text-[#1E2025]'
                          : 'bg-[#383B44] text-[#F29243]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#383B44] space-y-2">
          <button
            type="button"
            onClick={openPasswordModal}
            className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-[#D1D5DB] hover:bg-[#2F3239] hover:text-white transition-colors cursor-pointer"
          >
            <KeyRound className="w-4 h-4 shrink-0 text-[#F29243]" />
            <span>
              {isPasswordProviderLinked() ? 'Cambia password admin' : 'Imposta password admin'}
            </span>
          </button>
          <button
            type="button"
            onClick={onExitToPublic}
            className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-[#D1D5DB] hover:bg-[#2F3239] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Torna al sito pubblico</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-red-300 hover:bg-red-950/50 hover:text-red-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Esci dalla sessione</span>
          </button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Admin Header */}
        <header className="bg-[#24262B] text-white border-b border-[#383B44] px-4 sm:px-8 py-4 sm:py-5">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Apri menu amministratore"
                className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#383B44] bg-[#2B2E35] text-white"
              >
                <FourDotsIcon className="w-5 h-5" />
              </button>
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
                  Dashboard admin
                </h1>
                <p className="text-xs sm:text-sm text-[#D1D5DB]">
                  Gestisci i canali, le categorie e le richieste della community.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateChannelModal}
              className="inline-flex items-center gap-2 rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-4 py-2.5 text-sm font-semibold text-[#1E2025] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Aggiungi canale</span>
            </button>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
          {toastMessage && (
            <div
              role="status"
              className="rounded-xl bg-[#24262B] text-white px-4 py-3 text-sm font-medium flex items-center justify-between gap-3 shadow-lg"
            >
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#F29243]" />
                {toastMessage}
              </span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                aria-label="Chiudi notifica"
                className="text-[#D1D5DB] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {errorBanner && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3"
            >
              <span>{errorBanner}</span>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-red-700 hover:text-red-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-sm text-[#5A5E66]">
              Caricamento dati amministrativi…
            </div>
          ) : activeTab === 'overview' ? (
            <>
              {/* KPI Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-white border border-[#E2E2DF] p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#24262B] flex items-center justify-center p-2 shrink-0">
                    <img
                      src="./assets/channellife-emblem.png"
                      alt=""
                      className="w-8 h-8 object-contain"
                    />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold tabular-nums text-[#1E2025]">
                      {stats.publishedChannels}
                    </p>
                    <p className="text-xs text-[#5A5E66]">Canali pubblicati</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-[#E2E2DF] p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#24262B] text-[#F29243] flex items-center justify-center shrink-0">
                    <Folder className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold tabular-nums text-[#1E2025]">
                      {stats.totalCategories}
                    </p>
                    <p className="text-xs text-[#5A5E66]">Categorie</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-[#E2E2DF] p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#24262B] text-[#F29243] flex items-center justify-center shrink-0">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold tabular-nums text-[#1E2025]">
                      {stats.pendingRequests}
                    </p>
                    <p className="text-xs text-[#5A5E66]">Richieste da esaminare</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-white border border-[#E2E2DF] p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#24262B] text-[#F29243] flex items-center justify-center shrink-0">
                    <MousePointerClick className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold tabular-nums text-[#1E2025]">
                      {stats.totalClicks}
                    </p>
                    <p className="text-xs text-[#5A5E66]">Click ai canali</p>
                  </div>
                </div>
              </div>

              {/* Recent Channels Table */}
              <section className="rounded-2xl bg-white border border-[#E2E2DF] overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-[#E2E2DF]">
                  <h2 className="font-display text-lg font-bold text-[#1E2025]">
                    Canali recenti
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('channels')}
                    className="text-xs font-semibold text-[#A84A00] hover:underline cursor-pointer"
                  >
                    Visualizza tutti
                  </button>
                </div>

                {channels.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#5A5E66]">
                    Nessun canale presente nel catalogo.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-[#24262B] text-white text-xs uppercase tracking-wider">
                          <th className="py-3 px-5 font-semibold">Canale</th>
                          <th className="py-3 px-4 font-semibold">Categoria</th>
                          <th className="py-3 px-4 font-semibold">Stato</th>
                          <th className="py-3 px-4 font-semibold">Aggiornato</th>
                          <th className="py-3 px-5 font-semibold text-right">Azioni</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E2DF]">
                        {channels.slice(0, 6).map((ch) => (
                          <tr key={ch.id} className="hover:bg-[#F8F8F7]">
                            <td className="py-3.5 px-5 font-semibold text-[#1E2025]">
                              {ch.name}
                            </td>
                            <td className="py-3.5 px-4 text-[#5A5E66]">{ch.categoryName}</td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-block rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                  ch.published
                                    ? 'bg-[#FFF1E4] text-[#A84A00]'
                                    : 'bg-[#E2E2DF] text-[#333740]'
                                }`}
                              >
                                {ch.published ? 'Pubblicato' : 'Nascosto'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-[#5A5E66]">
                              {formatDateIt(ch.updatedAt)}
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditChannelModal(ch)}
                                  aria-label={`Modifica ${ch.name}`}
                                  className="p-2 rounded-lg text-[#5A5E66] hover:bg-[#F4F4F3] hover:text-[#1E2025] cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingChannel(ch)}
                                  aria-label={`Elimina ${ch.name}`}
                                  className="p-2 rounded-lg text-[#5A5E66] hover:bg-red-50 hover:text-red-700 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Recent Requests Preview */}
              <section className="rounded-2xl bg-white border border-[#E2E2DF] overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-[#E2E2DF]">
                  <h2 className="font-display text-lg font-bold text-[#1E2025]">
                    Ultime richieste ricevute
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('requests')}
                    className="text-xs font-semibold text-[#A84A00] hover:underline cursor-pointer"
                  >
                    Apri coda richieste
                  </button>
                </div>

                {requests.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#5A5E66]">
                    Nessuna richiesta ricevuta finora.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E2E2DF]">
                    {requests.slice(0, 5).map((r) => (
                      <div
                        key={r.id}
                        className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F8F8F7]"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#1E2025]">
                              {r.channelName}
                            </span>
                            <span className="text-xs text-[#5A5E66]">
                              {r.type === 'new_channel'
                                ? 'Nuovo canale'
                                : 'Adesione di canale esistente'}
                            </span>
                          </div>
                          <p className="text-xs text-[#5A5E66] mt-0.5">
                            {r.email} · {r.phone} · {formatDateIt(r.createdAt)}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${statusPillClasses(
                              r.status
                            )}`}
                          >
                            {r.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRequest(r);
                              setActiveTab('requests');
                            }}
                            className="rounded-lg border border-[#D4D4D0] bg-white hover:bg-[#F4F4F3] px-3 py-1.5 text-xs font-semibold text-[#1E2025] cursor-pointer"
                          >
                            Esamina
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : activeTab === 'channels' ? (
            <section className="rounded-2xl bg-white border border-[#E2E2DF] overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-[#E2E2DF] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#1E2025]">
                    Gestione canali ({channels.length})
                  </h2>
                  <p className="text-xs text-[#5A5E66] mt-0.5">
                    Le modifiche salvate si sincronizzano subito nel catalogo pubblico.
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-[#5A5E66] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                    placeholder="Cerca canale o categoria…"
                    className="w-full rounded-xl border border-[#D4D4D0] bg-[#F8F8F7] pl-9 pr-3 py-2 text-sm text-[#1E2025] focus:bg-white focus:border-[#F29243] focus:outline-none"
                  />
                </div>
              </div>

              {filteredChannels.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#5A5E66]">
                  Nessun canale trovato.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-[#24262B] text-white text-xs uppercase tracking-wider">
                        <th className="py-3 px-5 font-semibold">Canale</th>
                        <th className="py-3 px-4 font-semibold">Categoria</th>
                        <th className="py-3 px-4 font-semibold">Stato</th>
                        <th className="py-3 px-4 font-semibold">Proprietario (privato)</th>
                        <th className="py-3 px-4 font-semibold text-right">Click</th>
                        <th className="py-3 px-5 font-semibold text-right">Azioni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E2DF]">
                      {filteredChannels.map((ch) => (
                        <tr key={ch.id} className="hover:bg-[#F8F8F7]">
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-[#24262B] flex items-center justify-center overflow-hidden shrink-0">
                                <img
                                  src={ch.imageUrl || './assets/channellife-emblem.png'}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    e.currentTarget.src = './assets/channellife-emblem.png';
                                  }}
                                  className={
                                    ch.imageUrl
                                      ? 'w-full h-full object-cover'
                                      : 'w-5 h-5 object-contain'
                                  }
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-[#1E2025] flex items-center gap-2">
                                  <span>{ch.name}</span>
                                  {ch.verified && (
                                    <CheckCircle2
                                      className="w-3.5 h-3.5 text-[#D97706]"
                                      aria-label="Verificato"
                                    />
                                  )}
                                </div>
                                <a
                                  href={ch.officialUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-[#5A5E66] hover:text-[#A84A00] mt-0.5"
                                >
                                  <span className="truncate max-w-[220px]">{ch.officialUrl}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-[#333740]">{ch.categoryName}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                ch.published
                                  ? 'bg-[#FFF1E4] text-[#A84A00]'
                                  : 'bg-[#E2E2DF] text-[#333740]'
                              }`}
                            >
                              {ch.published ? 'Pubblicato' : 'Nascosto'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-[#5A5E66]">
                            {ch.ownerPhone || '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-[#333740]">
                            {ch.clickCount}
                          </td>
                          <td className="py-3.5 px-5 text-right relative">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditChannelModal(ch)}
                                aria-label={`Modifica ${ch.name}`}
                                className="p-2 rounded-lg text-[#5A5E66] hover:bg-[#F4F4F3] hover:text-[#1E2025] cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenMenuChannelId((curr) => (curr === ch.id ? null : ch.id))
                                }
                                aria-label={`Altre azioni per ${ch.name}`}
                                aria-expanded={openMenuChannelId === ch.id}
                                className="p-2 rounded-lg text-[#5A5E66] hover:bg-[#F4F4F3] hover:text-[#1E2025] cursor-pointer"
                              >
                                <FourDotsIcon className="w-4 h-4" />
                              </button>
                            </div>

                            {openMenuChannelId === ch.id && (
                              <div className="absolute right-5 top-12 z-20 w-48 rounded-xl bg-white border border-[#E2E2DF] shadow-xl py-1.5 text-left">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePublish(ch)}
                                  className="w-full px-3.5 py-2 text-xs font-medium text-[#1E2025] hover:bg-[#F4F4F3] flex items-center gap-2 cursor-pointer"
                                >
                                  {ch.published ? (
                                    <>
                                      <EyeOff className="w-3.5 h-3.5" />
                                      <span>Nascondi dal catalogo</span>
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>Pubblica nel catalogo</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuChannelId(null);
                                    setDeletingChannel(ch);
                                  }}
                                  className="w-full px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Elimina da ChannelLife</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : activeTab === 'categories' ? (
            <div className="space-y-5">
              <section className="rounded-2xl bg-white border border-[#E2E2DF] p-5 sm:p-6">
                <h2 className="font-display text-lg font-bold text-[#1E2025]">
                  Crea nuova categoria
                </h2>
                <p className="text-xs text-[#5A5E66] mt-0.5">
                  Le categorie sono dinamiche e modificabili in qualsiasi momento.
                </p>

                {categoryError && (
                  <div
                    role="alert"
                    className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-800"
                  >
                    {categoryError}
                  </div>
                )}

                <form
                  onSubmit={handleCreateCategory}
                  className="mt-4 flex flex-col sm:flex-row gap-3"
                >
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Es. Tecnologia, Viaggi, Sport…"
                    className="flex-1 rounded-xl border border-[#D4D4D0] bg-white px-3.5 py-2.5 text-sm text-[#1E2025] focus:border-[#F29243] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={categoryBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F29243] hover:bg-[#E07D2B] disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-[#1E2025] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Aggiungi categoria</span>
                  </button>
                </form>
              </section>

              <section className="rounded-2xl bg-white border border-[#E2E2DF] overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E2E2DF]">
                  <h2 className="font-display text-lg font-bold text-[#1E2025]">
                    Ordine e gestione categorie ({categories.length})
                  </h2>
                </div>

                {categories.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#5A5E66]">
                    Nessuna categoria presente.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E2E2DF]">
                    {categories.map((cat, idx) => (
                      <div
                        key={cat.id}
                        className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F8F8F7]"
                      >
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono tabular-nums text-xs text-[#5A5E66]">
                              #{idx + 1}
                            </span>
                            <span className="font-semibold text-[#1E2025]">
                              {cat.name}
                            </span>
                          </div>
                          <p className="text-xs text-[#5A5E66] mt-0.5 font-mono tabular-nums">
                            {cat.channelCount ?? 0}{' '}
                            {(cat.channelCount ?? 0) === 1
                              ? 'canale collegato'
                              : 'canali collegati'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveCategory(idx, -1)}
                            aria-label={`Sposta su ${cat.name}`}
                            className="p-2 rounded-lg border border-[#E2E2DF] bg-white hover:bg-[#F4F4F3] disabled:opacity-35 cursor-pointer"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === categories.length - 1}
                            onClick={() => handleMoveCategory(idx, 1)}
                            aria-label={`Sposta giù ${cat.name}`}
                            className="p-2 rounded-lg border border-[#E2E2DF] bg-white hover:bg-[#F4F4F3] disabled:opacity-35 cursor-pointer"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryError(null);
                              setRenamingCategory(cat);
                              setRenameValue(cat.name);
                            }}
                            aria-label={`Rinomina ${cat.name}`}
                            className="p-2 rounded-lg border border-[#E2E2DF] bg-white hover:bg-[#F4F4F3] cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteCategoryModal(cat)}
                            aria-label={`Elimina ${cat.name}`}
                            className="p-2 rounded-lg border border-[#E2E2DF] bg-white hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            /* Richieste Tab */
            <section className="space-y-4">
              <div className="rounded-2xl bg-white border border-[#E2E2DF] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#1E2025]">
                    Coda richieste ({filteredRequests.length})
                  </h2>
                  <p className="text-xs text-[#5A5E66] mt-0.5">
                    Esamina le proposte di nuovi canali e le richieste di adesione esistenti. I recapiti restano visibili solo qui.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Filtra per stato"
                    value={requestStatusFilter}
                    onChange={(e) =>
                      setRequestStatusFilter(e.target.value as 'all' | RequestStatus)
                    }
                    className="rounded-xl border border-[#D4D4D0] bg-[#F8F8F7] px-3 py-2 text-xs font-semibold text-[#1E2025]"
                  >
                    <option value="all">Tutti gli stati</option>
                    <option value="Nuova">Nuova</option>
                    <option value="In valutazione">In valutazione</option>
                    <option value="Approvata">Approvata</option>
                    <option value="Rifiutata">Rifiutata</option>
                  </select>

                  <select
                    aria-label="Filtra per tipologia"
                    value={requestTypeFilter}
                    onChange={(e) =>
                      setRequestTypeFilter(
                        e.target.value as 'all' | 'new_channel' | 'join_channel'
                      )
                    }
                    className="rounded-xl border border-[#D4D4D0] bg-[#F8F8F7] px-3 py-2 text-xs font-semibold text-[#1E2025]"
                  >
                    <option value="all">Tutte le tipologie</option>
                    <option value="new_channel">Nuovo canale</option>
                    <option value="join_channel">Adesione di canale esistente</option>
                  </select>
                </div>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="rounded-2xl bg-white border border-[#E2E2DF] p-10 text-center text-sm text-[#5A5E66]">
                  Nessuna richiesta corrisponde ai filtri selezionati.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequests.map((reqItem) => (
                    <article
                      key={reqItem.id}
                      className="rounded-2xl bg-white border border-[#E2E2DF] p-5 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-lg px-2.5 py-0.5 text-xs font-semibold ${statusPillClasses(
                                reqItem.status
                              )}`}
                            >
                              {reqItem.status}
                            </span>
                            <span className="text-xs font-semibold text-[#5A5E66]">
                              {reqItem.type === 'new_channel'
                                ? 'Nuovo canale'
                                : 'Adesione di canale esistente'}
                            </span>
                            <span className="text-xs font-mono tabular-nums text-[#5A5E66]">
                              · {formatDateIt(reqItem.createdAt)}
                            </span>
                          </div>
                          <h3 className="mt-2 font-display text-lg font-bold text-[#1E2025]">
                            {reqItem.channelName}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`mailto:${encodeURIComponent(reqItem.email)}?subject=${encodeURIComponent(
                              `ChannelLife — Risposta per "${reqItem.channelName}"`
                            )}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D4D4D0] bg-[#F8F8F7] hover:bg-[#FFF1E4] px-3 py-1.5 text-xs font-semibold text-[#1E2025]"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Email</span>
                          </a>
                          <a
                            href={`tel:${reqItem.phone.replace(/\s+/g, '')}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D4D4D0] bg-[#F8F8F7] hover:bg-[#FFF1E4] px-3 py-1.5 text-xs font-semibold text-[#1E2025]"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Chiama</span>
                          </a>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-[#F8F8F7] rounded-xl p-4 border border-[#E2E2DF]">
                        <div className="space-y-2">
                          {reqItem.description && (
                            <div>
                              <span className="block text-xs font-semibold text-[#5A5E66]">
                                Descrizione proposta
                              </span>
                              <p className="text-[#1E2025] mt-0.5">{reqItem.description}</p>
                            </div>
                          )}
                          {reqItem.officialUrl && (
                            <div>
                              <span className="block text-xs font-semibold text-[#5A5E66]">
                                Link ufficiale WhatsApp
                              </span>
                              <a
                                href={reqItem.officialUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[#A84A00] hover:underline break-all mt-0.5"
                              >
                                <span>{reqItem.officialUrl}</span>
                                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              </a>
                            </div>
                          )}
                          <div>
                            <span className="block text-xs font-semibold text-[#5A5E66]">
                              Motivazione
                            </span>
                            <p className="text-[#1E2025] mt-0.5">{reqItem.motivation}</p>
                          </div>
                          {reqItem.notes && (
                            <div>
                              <span className="block text-xs font-semibold text-[#5A5E66]">
                                Note aggiuntive
                              </span>
                              <p className="text-[#333740] mt-0.5">{reqItem.notes}</p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="block text-xs font-semibold text-[#5A5E66]">
                              Email richiedente (privata)
                            </span>
                            <p className="font-mono text-xs text-[#1E2025] mt-0.5">
                              {reqItem.email}
                            </p>
                          </div>
                          <div>
                            <span className="block text-xs font-semibold text-[#5A5E66]">
                              Telefono richiedente (privato)
                            </span>
                            <p className="font-mono text-xs text-[#1E2025] mt-0.5">
                              {reqItem.phone}
                            </p>
                          </div>
                          <div>
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#1E2025] cursor-pointer mt-1">
                              <input
                                type="checkbox"
                                checked={reqItem.confirmationSent}
                                onChange={(e) =>
                                  handleUpdateRequestStatus(reqItem, {
                                    confirmationSent: e.target.checked,
                                  })
                                }
                                className="rounded border-[#D4D4D0] text-[#F29243] focus:ring-[#F29243]"
                              />
                              <span>Conferma manuale inviata</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {reqItem.status !== 'In valutazione' && reqItem.status !== 'Approvata' && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateRequestStatus(reqItem, { status: 'In valutazione' })
                              }
                              className="rounded-xl border border-[#D4D4D0] bg-white hover:bg-[#F4F4F3] px-3.5 py-2 text-xs font-semibold text-[#1E2025] cursor-pointer"
                            >
                              Segna «In valutazione»
                            </button>
                          )}
                          {reqItem.status !== 'Rifiutata' && reqItem.status !== 'Approvata' && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateRequestStatus(reqItem, { status: 'Rifiutata' })
                              }
                              className="rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 px-3.5 py-2 text-xs font-semibold text-red-800 cursor-pointer"
                            >
                              Rifiuta
                            </button>
                          )}
                          {reqItem.status !== 'Approvata' && (
                            <button
                              type="button"
                              onClick={() => openApprovalModal(reqItem)}
                              className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-4 py-2 text-xs font-semibold text-[#1E2025] cursor-pointer"
                            >
                              {reqItem.type === 'new_channel'
                                ? 'Approva e crea canale'
                                : 'Approva e pubblica canale'}
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setDeletingRequest(reqItem)}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Elimina</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Add / Edit Channel Modal */}
      {channelModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-modal-title"
        >
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white text-[#1E2025] shadow-2xl border border-[#E2E2DF] overflow-hidden">
            <div className="px-6 py-4 bg-[#24262B] text-white flex items-center justify-between">
              <h2 id="channel-modal-title" className="font-display text-lg font-bold">
                {editingChannel ? `Modifica ${editingChannel.name}` : 'Aggiungi canale'}
              </h2>
              <button
                type="button"
                onClick={() => setChannelModalOpen(false)}
                aria-label="Chiudi"
                className="p-1.5 rounded-lg text-[#D1D5DB] hover:bg-[#383B44]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveChannel} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {chError && (
                <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-800">
                  {chError}
                </div>
              )}

              <div>
                <label htmlFor="adm-ch-name" className="block text-xs font-semibold mb-1">
                  Nome canale *
                </label>
                <input
                  id="adm-ch-name"
                  type="text"
                  required
                  value={chName}
                  onChange={(e) => setChName(e.target.value)}
                  className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm focus:border-[#F29243] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adm-ch-cat" className="block text-xs font-semibold mb-1">
                    Categoria *
                  </label>
                  <select
                    id="adm-ch-cat"
                    required
                    value={chCategoryId}
                    onChange={(e) => setChCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-[#D4D4D0] px-3 py-2 text-sm bg-white focus:border-[#F29243] focus:outline-none"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="adm-ch-order" className="block text-xs font-semibold mb-1">
                    Ordine consigliato
                  </label>
                  <input
                    id="adm-ch-order"
                    type="number"
                    min={0}
                    value={chSortOrder}
                    onChange={(e) => setChSortOrder(e.target.value)}
                    className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm font-mono focus:border-[#F29243] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="adm-ch-desc" className="block text-xs font-semibold mb-1">
                  Descrizione pubblica *
                </label>
                <textarea
                  id="adm-ch-desc"
                  required
                  rows={2}
                  value={chDescription}
                  onChange={(e) => setChDescription(e.target.value)}
                  className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm focus:border-[#F29243] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="adm-ch-url" className="block text-xs font-semibold mb-1">
                  Link ufficiale WhatsApp *
                </label>
                <input
                  id="adm-ch-url"
                  type="url"
                  required
                  value={chOfficialUrl}
                  onChange={(e) => setChOfficialUrl(e.target.value)}
                  placeholder="https://whatsapp.com/channel/..."
                  className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm focus:border-[#F29243] focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="adm-ch-img" className="block text-xs font-semibold">
                  Logo / icona del canale (facoltativo)
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-[#24262B] flex items-center justify-center overflow-hidden shrink-0 border border-[#D4D4D0]">
                    <img
                      src={normalizeChannelImageUrl(chImageUrl) || './assets/channellife-emblem.png'}
                      alt="Anteprima logo"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = './assets/channellife-emblem.png';
                      }}
                      className={
                        normalizeChannelImageUrl(chImageUrl)
                          ? 'w-full h-full object-cover'
                          : 'w-6 h-6 object-contain'
                      }
                    />
                  </div>
                  <input
                    id="adm-ch-img"
                    type="text"
                    value={chImageUrl}
                    onChange={(e) => setChImageUrl(e.target.value)}
                    placeholder="https://... oppure link condiviso Google Drive"
                    className="flex-1 min-w-0 rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm focus:border-[#F29243] focus:outline-none"
                  />
                  <label className="inline-flex items-center gap-1.5 rounded-xl border border-[#D4D4D0] bg-[#F8F8F7] hover:bg-[#FFF1E4] px-3 py-2 text-xs font-semibold text-[#1E2025] cursor-pointer whitespace-nowrap shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{chUploadingLogo ? 'Caricamento…' : 'Carica'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={chUploadingLogo}
                      onChange={handleLogoFileSelect}
                      className="sr-only"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-[#5A5E66]">
                  Puoi caricare un file dal dispositivo oppure incollare un URL immagine / link condiviso Google Drive.
                </p>
              </div>

              <div>
                <label htmlFor="adm-ch-owner" className="block text-xs font-semibold mb-1">
                  Telefono proprietario (privato)
                </label>
                <input
                  id="adm-ch-owner"
                  type="tel"
                  value={chOwnerPhone}
                  onChange={(e) => setChOwnerPhone(e.target.value)}
                  placeholder="+39 ..."
                  className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm focus:border-[#F29243] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-5 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chPublished}
                    onChange={(e) => setChPublished(e.target.checked)}
                    className="rounded border-[#D4D4D0]"
                  />
                  <span>Pubblicato nel catalogo pubblico</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chVerified}
                    onChange={(e) => setChVerified(e.target.checked)}
                    className="rounded border-[#D4D4D0]"
                  />
                  <span>Canale verificato</span>
                </label>
              </div>

              <div className="pt-3 border-t border-[#E2E2DF] flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setChannelModalOpen(false)}
                  className="rounded-xl border border-[#D4D4D0] bg-white px-4 py-2 text-xs font-semibold cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={chSaving}
                  className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] disabled:opacity-60 px-5 py-2 text-xs font-semibold text-[#1E2025] cursor-pointer"
                >
                  {chSaving ? 'Salvataggio…' : 'Salva canale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Channel Confirmation Modal */}
      {deletingChannel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#E2E2DF] space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-red-50 text-red-700 p-2.5 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-[#1E2025]">
                  Rimuovere «{deletingChannel.name}»?
                </h3>
                <p className="mt-1.5 text-sm text-[#5A5E66]">
                  Questa operazione elimina il canale esclusivamente dalla directory ChannelLife: non cancella né modifica il canale reale su WhatsApp.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingChannel(null)}
                className="rounded-xl border border-[#D4D4D0] px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={deletingChannelBusy}
                onClick={handleConfirmDeleteChannel}
                className="rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                {deletingChannelBusy ? 'Rimozione…' : 'Conferma eliminazione'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Category Modal */}
      {renamingCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleRenameCategory}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#E2E2DF] space-y-4"
          >
            <h3 className="font-display text-lg font-bold text-[#1E2025]">
              Rinomina categoria
            </h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2.5 text-sm focus:border-[#F29243] focus:outline-none"
            />
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRenamingCategory(null)}
                className="rounded-xl border border-[#D4D4D0] px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={categoryBusy}
                className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] px-4 py-2 text-xs font-semibold text-[#1E2025] cursor-pointer"
              >
                Salva nome
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Safe Delete Category Modal */}
      {deletingCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#E2E2DF] space-y-4">
            <h3 className="font-display text-lg font-bold text-[#1E2025]">
              Eliminare categoria «{deletingCategory.name}»?
            </h3>

            {(deletingCategory.channelCount ?? 0) > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-[#333740]">
                  Questa categoria è attualmente collegata a{' '}
                  <strong className="font-mono tabular-nums">
                    {deletingCategory.channelCount}
                  </strong>{' '}
                  {(deletingCategory.channelCount ?? 0) === 1 ? 'canale' : 'canali'}. Per eliminarla in sicurezza, seleziona la categoria in cui riassegnarli:
                </p>

                {categories.filter((c) => c.id !== deletingCategory.id).length === 0 ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                    Non esiste un&apos;altra categoria disponibile per la riassegnazione. Crea prima una nuova categoria.
                  </div>
                ) : (
                  <select
                    value={reassignTargetId}
                    onChange={(e) => setReassignTargetId(e.target.value)}
                    className="w-full rounded-xl border border-[#D4D4D0] px-3 py-2 text-sm bg-white"
                  >
                    {categories
                      .filter((c) => c.id !== deletingCategory.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            ) : (
              <p className="text-sm text-[#5A5E66]">
                Nessun canale è collegato a questa categoria. Confermi la rimozione definitiva?
              </p>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="rounded-xl border border-[#D4D4D0] px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={
                  categoryBusy ||
                  ((deletingCategory.channelCount ?? 0) > 0 &&
                    categories.filter((c) => c.id !== deletingCategory.id).length === 0)
                }
                onClick={handleConfirmDeleteCategory}
                className="rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-45 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                {(deletingCategory.channelCount ?? 0) > 0
                  ? 'Riassegna ed elimina'
                  : 'Conferma eliminazione'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Approval Summary & Confirmation Modal */}
      {approvingRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approve-req-title"
        >
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white text-[#1E2025] shadow-2xl border border-[#E2E2DF] overflow-hidden">
            <div className="px-6 py-4 bg-[#24262B] text-white flex items-center justify-between">
              <div>
                <h2 id="approve-req-title" className="font-display text-lg font-bold">
                  Riepilogo e conferma approvazione
                </h2>
                <p className="text-xs text-[#D1D5DB]">
                  {approvingRequest.type === 'new_channel'
                    ? 'Creazione nuovo canale nel catalogo'
                    : 'Adesione canale esistente al catalogo'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setApprovingRequest(null)}
                aria-label="Chiudi"
                className="p-1.5 rounded-lg text-[#D1D5DB] hover:bg-[#383B44]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmApproval} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {appError && (
                <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-800">
                  {appError}
                </div>
              )}

              <div className="rounded-xl bg-[#FFF1E4] border border-[#F29243]/40 p-3.5 text-xs text-[#6E3200]">
                Il numero <strong>{approvingRequest.phone}</strong> verrà associato automaticamente come proprietario privato del canale (visibile solo agli amministratori).
              </div>

              <div>
                <label htmlFor="app-ch-name" className="block text-xs font-semibold mb-1">
                  Nome pubblico del canale *
                </label>
                <input
                  id="app-ch-name"
                  type="text"
                  required
                  value={appChannelName}
                  onChange={(e) => setAppChannelName(e.target.value)}
                  className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="app-ch-cat" className="block text-xs font-semibold mb-1">
                  Categoria *
                </label>
                <select
                  id="app-ch-cat"
                  required
                  value={appCategoryId}
                  onChange={(e) => setAppCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-[#D4D4D0] px-3 py-2 text-sm bg-white"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="app-ch-desc" className="block text-xs font-semibold mb-1">
                  Descrizione pubblica *
                </label>
                <textarea
                  id="app-ch-desc"
                  required
                  rows={2}
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  placeholder="Completa o perfeziona la descrizione che apparirà nella scheda pubblica."
                  className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="app-ch-url" className="block text-xs font-semibold mb-1">
                  Link ufficiale WhatsApp *
                </label>
                <input
                  id="app-ch-url"
                  type="url"
                  required
                  value={appOfficialUrl}
                  onChange={(e) => setAppOfficialUrl(e.target.value)}
                  placeholder="https://whatsapp.com/channel/..."
                  className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appPublished}
                    onChange={(e) => setAppPublished(e.target.checked)}
                    className="rounded border-[#D4D4D0]"
                  />
                  <span>Pubblica subito nel catalogo pubblico</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appVerified}
                    onChange={(e) => setAppVerified(e.target.checked)}
                    className="rounded border-[#D4D4D0]"
                  />
                  <span>Contrassegna come canale verificato</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appConfirmationSent}
                    onChange={(e) => setAppConfirmationSent(e.target.checked)}
                    className="rounded border-[#D4D4D0]"
                  />
                  <span>Registra conferma manuale inviata al richiedente</span>
                </label>
              </div>

              <div className="pt-3 border-t border-[#E2E2DF] flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setApprovingRequest(null)}
                  className="rounded-xl border border-[#D4D4D0] px-4 py-2 text-xs font-semibold cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={appBusy}
                  className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] disabled:opacity-60 px-5 py-2 text-xs font-semibold text-[#1E2025] cursor-pointer"
                >
                  {appBusy ? 'Salvataggio…' : 'Conferma approvazione e salva'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Request Confirmation Modal */}
      {deletingRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#E2E2DF] space-y-4">
            <h3 className="font-display text-lg font-bold text-[#1E2025]">
              Eliminare richiesta «{deletingRequest.channelName}»?
            </h3>
            <p className="text-sm text-[#5A5E66]">
              La richiesta verrà rimossa definitivamente dall&apos;archivio amministrativo.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRequest(null)}
                className="rounded-xl border border-[#D4D4D0] px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={deletingRequestBusy}
                onClick={handleConfirmDeleteRequest}
                className="rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                {deletingRequestBusy ? 'Eliminazione…' : 'Conferma eliminazione'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Password Configuration Modal */}
      {passwordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-pw-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white text-[#1E2025] shadow-2xl border border-[#E2E2DF] overflow-hidden">
            <div className="px-6 py-4 bg-[#24262B] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-5 h-5 text-[#F29243]" />
                <h2 id="admin-pw-modal-title" className="font-display text-lg font-bold">
                  {isPasswordProviderLinked() ? 'Aggiorna password admin' : 'Imposta password admin'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalOpen(false)}
                aria-label="Chiudi"
                className="p-1.5 rounded-lg text-[#D1D5DB] hover:bg-[#383B44]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdminPassword} className="p-6 space-y-4">
              <p className="text-xs text-[#5A5E66] leading-relaxed">
                Imposta una password personale (minimo 8 caratteri) per accedere in seguito al pannello admin direttamente con la password, senza popup Google.
              </p>

              {adminPasswordError && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-800 leading-relaxed"
                >
                  {adminPasswordError}
                </div>
              )}

              <div>
                <label htmlFor="adm-pw-new" className="block text-xs font-semibold mb-1">
                  Nuova password amministratore *
                </label>
                <div className="relative">
                  <input
                    id="adm-pw-new"
                    type={showAdminNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.target.value)}
                    placeholder="Minimo 8 caratteri"
                    className="w-full rounded-xl border border-[#D4D4D0] pl-3.5 pr-10 py-2 text-sm focus:border-[#F29243] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminNewPassword((v) => !v)}
                    aria-label={showAdminNewPassword ? 'Nascondi password' : 'Mostra password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#5A5E66]"
                  >
                    {showAdminNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="adm-pw-confirm" className="block text-xs font-semibold mb-1">
                  Conferma password *
                </label>
                <input
                  id="adm-pw-confirm"
                  type={showAdminNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={adminConfirmPassword}
                  onChange={(e) => setAdminConfirmPassword(e.target.value)}
                  placeholder="Ripeti la password"
                  className="w-full rounded-xl border border-[#D4D4D0] px-3.5 py-2 text-sm focus:border-[#F29243] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5 border-t border-[#E2E2DF]">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="rounded-xl border border-[#D4D4D0] px-4 py-2 text-xs font-semibold cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={adminPasswordBusy}
                  className="rounded-xl bg-[#F29243] hover:bg-[#E07D2B] disabled:opacity-60 px-5 py-2 text-xs font-semibold text-[#1E2025] cursor-pointer"
                >
                  {adminPasswordBusy ? 'Salvataggio…' : 'Salva password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
