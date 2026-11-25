import {
  EmailAuthProvider,
  linkWithCredential,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type {
  AdminChannel,
  AdminOverviewStats,
  Category,
  ChannelRequest,
  JoinChannelFormInput,
  NewChannelFormInput,
  PublicChannel,
  RequestStatus,
} from '../types/channellife';
import {
  isValidEmail,
  isValidOptionalImageUrl,
  isValidPhone,
  normalizeChannelImageUrl,
  normalizeWhatsAppChannelUrl,
  slugifyCategoryName,
} from '../utils/validation';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';

export const BOOTSTRAP_ADMIN_EMAIL = 'mtech2415@gmail.com';
const INITIAL_SEED_DOC_ID = 'initial_seed_v1';
const DRIVELIFE_IMAGE_URL =
  'https://lh3.googleusercontent.com/d/1x_v6cjaarrpllL8rDRxHQdKPeQiJ1fdR';

function toIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (
    val &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    return val;
  }
  return new Date().toISOString();
}

function createId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${randomPart}`;
}

const FALLBACK_SEED_CATEGORY: Category = {
  id: 'cat_auto_motori',
  name: 'Auto & Motori',
  slug: 'auto-motori',
  sortOrder: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const FALLBACK_SEED_CHANNEL: PublicChannel = {
  id: 'ch_drivelife',
  name: 'DriveLife',
  categoryId: 'cat_auto_motori',
  categoryName: 'Auto & Motori',
  description: 'Novità, curiosità e passione per il mondo delle auto',
  officialUrl: 'https://whatsapp.com/channel/0029Vb94EAb1yT20jWggOg2e',
  imageUrl: DRIVELIFE_IMAGE_URL,
  verified: true,
  sortOrder: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export async function isAuthorizedAdminUser(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL) return true;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

export async function signInAdminWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  const user = cred.user;
  const authorized = await isAuthorizedAdminUser(user);
  if (!authorized) {
    await signOut(auth);
    throw new Error(
      'Questo account Google non è autorizzato ad accedere all’area amministratore.'
    );
  }
  await ensureInitialSeed();
  return user;
}

export async function signInAdminWithPassword(password: string): Promise<User> {
  if (!password) {
    throw new Error('Inserisci la password amministratore.');
  }
  const cred = await signInWithEmailAndPassword(auth, BOOTSTRAP_ADMIN_EMAIL, password);
  const user = cred.user;
  if (user.email?.toLowerCase() !== BOOTSTRAP_ADMIN_EMAIL) {
    await signOut(auth);
    throw new Error('Account non autorizzato alla dashboard ChannelLife.');
  }
  if (!user.emailVerified) {
    throw new Error('EMAIL_VERIFICATION_REQUIRED');
  }
  await ensureInitialSeed();
  return user;
}

export function isPasswordProviderLinked(user: User | null = auth.currentUser): boolean {
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === 'password');
}

export async function sendAdminVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Nessuna sessione attiva da verificare.');
  }
  await sendEmailVerification(user);
}

export async function reloadAndCheckAdminVerification(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  await user.reload();
  await user.getIdToken(true);
  return isAuthorizedAdminUser(auth.currentUser);
}

export async function setOrUpdateAdminPassword(
  newPassword: string
): Promise<{ verificationRequired: boolean }> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Sessione amministratore non attiva. Effettua nuovamente l’accesso.');
  }
  if (newPassword.length < 8) {
    throw new Error('Scegli una password di almeno 8 caratteri.');
  }

  if (isPasswordProviderLinked(user)) {
    await updatePassword(user, newPassword);
  } else {
    const cred = EmailAuthProvider.credential(user.email, newPassword);
    await linkWithCredential(user, cred);
  }

  await user.reload();
  await user.getIdToken(true);

  if (!auth.currentUser?.emailVerified) {
    try {
      await sendEmailVerification(auth.currentUser || user);
    } catch {
      // User can also resend from the modal
    }
    return { verificationRequired: true };
  }

  return { verificationRequired: false };
}

export async function signOutAdmin(): Promise<void> {
  await signOut(auth);
}

let seedInFlight: Promise<void> | null = null;

export async function ensureInitialSeed(): Promise<void> {
  if (!auth.currentUser?.emailVerified) return;
  if (seedInFlight) return seedInFlight;

  seedInFlight = (async () => {
    const seedRef = doc(db, 'meta', INITIAL_SEED_DOC_ID);
    const catRef = doc(db, 'categories', 'cat_auto_motori');
    const chRef = doc(db, 'channels', 'ch_drivelife');
    try {
      const [seedSnap, catSnap, chSnap] = await Promise.all([
        getDoc(seedRef),
        getDoc(catRef),
        getDoc(chRef),
      ]);
      if (seedSnap.exists()) return;

      const batch = writeBatch(db);
      batch.set(seedRef, {
        initialized: true,
        seededAt: serverTimestamp(),
      });
      if (!catSnap.exists()) {
        batch.set(catRef, {
          id: 'cat_auto_motori',
          name: 'Auto & Motori',
          slug: 'auto-motori',
          sortOrder: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      if (!chSnap.exists()) {
        batch.set(chRef, {
          id: 'ch_drivelife',
          name: 'DriveLife',
          categoryId: 'cat_auto_motori',
          categoryName: 'Auto & Motori',
          description: 'Novità, curiosità e passione per il mondo delle auto',
          officialUrl: 'https://whatsapp.com/channel/0029Vb94EAb1yT20jWggOg2e',
          imageUrl: DRIVELIFE_IMAGE_URL,
          verified: true,
          published: true,
          sortOrder: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'meta/initial_seed_v1');
      } catch {
        // Logged cleanly without crashing UI
      }
    } finally {
      seedInFlight = null;
    }
  })();

  return seedInFlight;
}

export function subscribeToPublicCatalog(
  onUpdate: (data: { categories: Category[]; channels: PublicChannel[] }) => void,
  onError: (message: string) => void
): () => void {
  let categoriesData: Category[] = [];
  let channelsData: PublicChannel[] = [];
  let seedInitialized: boolean | null = null;
  let categoriesReady = false;
  let channelsReady = false;

  const emit = () => {
    if (!categoriesReady || !channelsReady || seedInitialized === null) return;
    if (!seedInitialized && categoriesData.length === 0 && channelsData.length === 0) {
      onUpdate({
        categories: [FALLBACK_SEED_CATEGORY],
        channels: [FALLBACK_SEED_CHANNEL],
      });
      return;
    }

    const catMap = new Map(categoriesData.map((c) => [c.id, c.name]));
    const resolvedChannels = channelsData.map((ch) => ({
      ...ch,
      categoryName: catMap.get(ch.categoryId) || ch.categoryName,
    }));

    onUpdate({
      categories: [...categoriesData].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'it')
      ),
      channels: [...resolvedChannels].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'it')
      ),
    });
  };

  const unsubSeed = onSnapshot(
    doc(db, 'meta', INITIAL_SEED_DOC_ID),
    (snap) => {
      seedInitialized = snap.exists();
      emit();
    },
    () => {
      seedInitialized = false;
      emit();
    }
  );

  const unsubCats = onSnapshot(
    query(collection(db, 'categories'), where('sortOrder', '>=', 0)),
    (snap) => {
      categoriesData = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          name: String(raw.name || ''),
          slug: String(raw.slug || ''),
          sortOrder: Number(raw.sortOrder ?? 0),
          createdAt: toIso(raw.createdAt),
          updatedAt: toIso(raw.updatedAt),
        };
      });
      categoriesReady = true;
      emit();
    },
    (err) => {
      onError('Si è verificato un problema durante il caricamento delle categorie.');
      try {
        handleFirestoreError(err, OperationType.LIST, 'categories');
      } catch {
        // Error surfaced cleanly via onError callback
      }
    }
  );

  const unsubChannels = onSnapshot(
    query(collection(db, 'channels'), where('published', '==', true)),
    (snap) => {
      channelsData = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          name: String(raw.name || ''),
          categoryId: String(raw.categoryId || ''),
          categoryName: String(raw.categoryName || ''),
          description: String(raw.description || ''),
          officialUrl: String(raw.officialUrl || ''),
          imageUrl: normalizeChannelImageUrl(raw.imageUrl ?? null),
          verified: Boolean(raw.verified),
          sortOrder: Number(raw.sortOrder ?? 0),
          updatedAt: toIso(raw.updatedAt),
        };
      });
      channelsReady = true;
      emit();
    },
    (err) => {
      onError('Si è verificato un problema durante il caricamento dei canali.');
      try {
        handleFirestoreError(err, OperationType.LIST, 'channels');
      } catch {
        // Error surfaced cleanly via onError callback
      }
    }
  );

  return () => {
    unsubSeed();
    unsubCats();
    unsubChannels();
  };
}

export async function recordPublicChannelClick(channelId: string): Promise<void> {
  if (!channelId || channelId === 'ch_drivelife') {
    try {
      const chSnap = await getDoc(doc(db, 'channels', channelId));
      if (!chSnap.exists()) return;
    } catch {
      return;
    }
  }
  const clickId = createId('clk');
  try {
    await setDoc(doc(db, 'channel_clicks', clickId), {
      id: clickId,
      channelId,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking analytics failure
  }
}

export async function submitNewChannelRequest(
  input: NewChannelFormInput
): Promise<{ message: string }> {
  const channelName = input.channelName.trim();
  const description = input.description.trim();
  const motivation = input.motivation.trim();
  const notes = input.notes.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();

  if (channelName.length < 2 || channelName.length > 80) {
    throw new Error('Inserisci un nome valido per il canale (2–80 caratteri).');
  }
  if (description.length < 10 || description.length > 280) {
    throw new Error('Inserisci una breve descrizione (10–280 caratteri).');
  }
  if (motivation.length < 10 || motivation.length > 1000) {
    throw new Error('Spiega perché desideri creare il canale con ChannelLife (minimo 10 caratteri).');
  }
  if (notes.length > 1000) {
    throw new Error('Le note aggiuntive non possono superare 1000 caratteri.');
  }
  if (!isValidEmail(email)) {
    throw new Error('Inserisci un indirizzo email valido.');
  }
  if (!isValidPhone(phone)) {
    throw new Error('Inserisci un numero di telefono valido.');
  }

  const requestId = createId('req');
  try {
    await setDoc(doc(db, 'requests', requestId), {
      id: requestId,
      type: 'new_channel',
      channelName,
      description,
      officialUrl: null,
      motivation,
      notes: notes || null,
      email,
      phone,
      status: 'Nuova',
      confirmationSent: false,
      linkedChannelId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      message:
        'Richiesta inviata. Sarà valutata dagli amministratori e l’invio non comporta l’approvazione automatica.',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `requests/${requestId}`);
  }
}

export async function submitJoinChannelRequest(
  input: JoinChannelFormInput
): Promise<{ message: string }> {
  const channelName = input.channelName.trim();
  const officialUrl = normalizeWhatsAppChannelUrl(input.officialUrl);
  const motivation = input.motivation.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();

  if (channelName.length < 2 || channelName.length > 80) {
    throw new Error('Inserisci il nome del canale (2–80 caratteri).');
  }
  if (!officialUrl) {
    throw new Error('Inserisci un link ufficiale WhatsApp valido (https://whatsapp.com/channel/...).');
  }
  if (motivation.length < 10 || motivation.length > 1000) {
    throw new Error('Spiega perché vuoi far entrare il canale in ChannelLife (minimo 10 caratteri).');
  }
  if (!isValidEmail(email)) {
    throw new Error('Inserisci un indirizzo email valido.');
  }
  if (!isValidPhone(phone)) {
    throw new Error('Inserisci un numero di telefono valido.');
  }

  const requestId = createId('req');
  try {
    await setDoc(doc(db, 'requests', requestId), {
      id: requestId,
      type: 'join_channel',
      channelName,
      description: null,
      officialUrl,
      motivation,
      notes: null,
      email,
      phone,
      status: 'Nuova',
      confirmationSent: false,
      linkedChannelId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      message:
        'Richiesta inviata. Il canale sarà esaminato dagli amministratori e non viene pubblicato automaticamente.',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `requests/${requestId}`);
  }
}

export interface AdminDashboardSnapshot {
  stats: AdminOverviewStats;
  channels: AdminChannel[];
  categories: Category[];
  requests: ChannelRequest[];
}

export function subscribeToAdminDashboard(
  onUpdate: (data: AdminDashboardSnapshot) => void,
  onError: (msg: string) => void
): () => void {
  let rawCategories: Category[] = [];
  let rawChannels: Array<Omit<AdminChannel, 'ownerPhone' | 'clickCount'>> = [];
  let privateMap = new Map<string, string | null>();
  let clickCounts = new Map<string, number>();
  let rawRequests: ChannelRequest[] = [];

  let catsLoaded = false;
  let chsLoaded = false;
  let privLoaded = false;
  let clicksLoaded = false;
  let reqsLoaded = false;

  const emit = () => {
    if (!catsLoaded || !chsLoaded || !privLoaded || !clicksLoaded || !reqsLoaded) return;

    const categoryNameMap = new Map(rawCategories.map((c) => [c.id, c.name]));
    const countPerCategory = new Map<string, number>();
    for (const ch of rawChannels) {
      countPerCategory.set(ch.categoryId, (countPerCategory.get(ch.categoryId) || 0) + 1);
    }

    const categories: Category[] = [...rawCategories]
      .map((c) => ({ ...c, channelCount: countPerCategory.get(c.id) || 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'it'));

    const channels: AdminChannel[] = [...rawChannels]
      .map((ch) => ({
        ...ch,
        categoryName: categoryNameMap.get(ch.categoryId) || ch.categoryName,
        ownerPhone: privateMap.get(ch.id) ?? null,
        clickCount: clickCounts.get(ch.id) || 0,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'it'));

    const requests = [...rawRequests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const publishedChannels = channels.filter((c) => c.published).length;
    const pendingRequests = requests.filter(
      (r) => r.status === 'Nuova' || r.status === 'In valutazione'
    ).length;
    let totalClicks = 0;
    for (const ch of channels) totalClicks += ch.clickCount;

    onUpdate({
      stats: {
        publishedChannels,
        totalChannels: channels.length,
        totalCategories: categories.length,
        pendingRequests,
        totalClicks,
      },
      channels,
      categories,
      requests,
    });
  };

  const unsubCats = onSnapshot(
    query(collection(db, 'categories'), where('sortOrder', '>=', 0)),
    (snap) => {
      rawCategories = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          name: String(raw.name || ''),
          slug: String(raw.slug || ''),
          sortOrder: Number(raw.sortOrder ?? 0),
          createdAt: toIso(raw.createdAt),
          updatedAt: toIso(raw.updatedAt),
        };
      });
      catsLoaded = true;
      emit();
    },
    (err) => {
      onError('Errore nel caricamento delle categorie.');
      try {
        handleFirestoreError(err, OperationType.LIST, 'categories');
      } catch {
        // Error surfaced cleanly via onError
      }
    }
  );

  const unsubChannels = onSnapshot(
    collection(db, 'channels'),
    (snap) => {
      rawChannels = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          name: String(raw.name || ''),
          categoryId: String(raw.categoryId || ''),
          categoryName: String(raw.categoryName || ''),
          description: String(raw.description || ''),
          officialUrl: String(raw.officialUrl || ''),
          imageUrl: normalizeChannelImageUrl(raw.imageUrl ?? null),
          verified: Boolean(raw.verified),
          published: Boolean(raw.published),
          sortOrder: Number(raw.sortOrder ?? 0),
          createdAt: toIso(raw.createdAt),
          updatedAt: toIso(raw.updatedAt),
        };
      });
      chsLoaded = true;
      emit();
    },
    (err) => {
      onError('Errore nel caricamento dei canali.');
      try {
        handleFirestoreError(err, OperationType.LIST, 'channels');
      } catch {
        // Error surfaced cleanly via onError
      }
    }
  );

  const unsubPrivate = onSnapshot(
    collection(db, 'channel_private'),
    (snap) => {
      privateMap = new Map();
      for (const d of snap.docs) {
        const raw = d.data();
        privateMap.set(d.id, typeof raw.ownerPhone === 'string' ? raw.ownerPhone : null);
      }
      privLoaded = true;
      emit();
    },
    (err) => {
      onError('Errore nel caricamento dei recapiti privati.');
      try {
        handleFirestoreError(err, OperationType.LIST, 'channel_private');
      } catch {
        // Error surfaced cleanly via onError
      }
    }
  );

  const unsubClicks = onSnapshot(
    collection(db, 'channel_clicks'),
    (snap) => {
      clickCounts = new Map();
      for (const d of snap.docs) {
        const chId = String(d.data().channelId || '');
        if (chId) clickCounts.set(chId, (clickCounts.get(chId) || 0) + 1);
      }
      clicksLoaded = true;
      emit();
    },
    (err) => {
      onError('Errore nel caricamento delle statistiche click.');
      try {
        handleFirestoreError(err, OperationType.LIST, 'channel_clicks');
      } catch {
        // Error surfaced cleanly via onError
      }
    }
  );

  const unsubRequests = onSnapshot(
    collection(db, 'requests'),
    (snap) => {
      rawRequests = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          type: raw.type === 'join_channel' ? 'join_channel' : 'new_channel',
          channelName: String(raw.channelName || ''),
          description: typeof raw.description === 'string' ? raw.description : null,
          officialUrl: typeof raw.officialUrl === 'string' ? raw.officialUrl : null,
          motivation: String(raw.motivation || ''),
          notes: typeof raw.notes === 'string' ? raw.notes : null,
          email: String(raw.email || ''),
          phone: String(raw.phone || ''),
          status: (raw.status as RequestStatus) || 'Nuova',
          confirmationSent: Boolean(raw.confirmationSent),
          linkedChannelId:
            typeof raw.linkedChannelId === 'string' ? raw.linkedChannelId : null,
          createdAt: toIso(raw.createdAt),
          updatedAt: toIso(raw.updatedAt),
        };
      });
      reqsLoaded = true;
      emit();
    },
    (err) => {
      onError('Errore nel caricamento delle richieste.');
      try {
        handleFirestoreError(err, OperationType.LIST, 'requests');
      } catch {
        // Error surfaced cleanly via onError
      }
    }
  );

  return () => {
    unsubCats();
    unsubChannels();
    unsubPrivate();
    unsubClicks();
    unsubRequests();
  };
}

export interface SaveChannelPayload {
  name: string;
  categoryId: string;
  categoryName: string;
  description: string;
  officialUrl: string;
  imageUrl: string | null;
  ownerPhone: string | null;
  sortOrder: number;
  verified: boolean;
  published: boolean;
}

export async function saveAdminChannel(
  editingId: string | null,
  input: SaveChannelPayload
): Promise<string> {
  const normalizedUrl = normalizeWhatsAppChannelUrl(input.officialUrl);
  if (!normalizedUrl) {
    throw new Error('Link WhatsApp non valido.');
  }
  if (!isValidOptionalImageUrl(input.imageUrl)) {
    throw new Error('URL immagine non valido.');
  }
  const normalizedImg = normalizeChannelImageUrl(input.imageUrl);
  const channelId = editingId || createId('ch');

  const batch = writeBatch(db);
  const channelRef = doc(db, 'channels', channelId);
  const privateRef = doc(db, 'channel_private', channelId);

  try {
    if (editingId) {
      batch.update(channelRef, {
        name: input.name.trim(),
        categoryId: input.categoryId,
        categoryName: input.categoryName.trim(),
        description: input.description.trim(),
        officialUrl: normalizedUrl,
        imageUrl: normalizedImg,
        verified: input.verified,
        published: input.published,
        sortOrder: input.sortOrder,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(channelRef, {
        id: channelId,
        name: input.name.trim(),
        categoryId: input.categoryId,
        categoryName: input.categoryName.trim(),
        description: input.description.trim(),
        officialUrl: normalizedUrl,
        imageUrl: normalizedImg,
        verified: input.verified,
        published: input.published,
        sortOrder: input.sortOrder,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(privateRef, {
      channelId,
      ownerPhone: input.ownerPhone?.trim() || null,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return channelId;
  } catch (err) {
    handleFirestoreError(
      err,
      editingId ? OperationType.UPDATE : OperationType.CREATE,
      `channels/${channelId}`
    );
  }
}

export async function toggleAdminChannelPublished(
  channelId: string,
  published: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'channels', channelId), {
      published,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `channels/${channelId}`);
  }
}

export async function deleteAdminChannel(channelId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'channels', channelId));
  batch.delete(doc(db, 'channel_private', channelId));
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `channels/${channelId}`);
  }
}

export async function createAdminCategory(
  name: string,
  nextSortOrder: number
): Promise<string> {
  const trimmed = name.trim();
  const slug = slugifyCategoryName(trimmed);
  if (trimmed.length < 2 || !slug) {
    throw new Error('Nome categoria non valido.');
  }
  const catId = createId('cat');
  try {
    await setDoc(doc(db, 'categories', catId), {
      id: catId,
      name: trimmed,
      slug,
      sortOrder: nextSortOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return catId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `categories/${catId}`);
  }
}

export async function renameAdminCategory(
  categoryId: string,
  newName: string,
  channelsInCategory: AdminChannel[]
): Promise<void> {
  const trimmed = newName.trim();
  const slug = slugifyCategoryName(trimmed);
  if (trimmed.length < 2 || !slug) {
    throw new Error('Nome categoria non valido.');
  }
  const batch = writeBatch(db);
  batch.update(doc(db, 'categories', categoryId), {
    name: trimmed,
    slug,
    updatedAt: serverTimestamp(),
  });
  for (const ch of channelsInCategory) {
    batch.update(doc(db, 'channels', ch.id), {
      categoryName: trimmed,
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `categories/${categoryId}`);
  }
}

export async function reorderAdminCategories(orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, 'categories', id), {
      sortOrder: index + 1,
      updatedAt: serverTimestamp(),
    });
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'categories');
  }
}

export async function deleteAdminCategory(
  categoryId: string,
  channelsToReassign: AdminChannel[],
  targetCategory?: Category
): Promise<void> {
  if (channelsToReassign.length > 0 && !targetCategory) {
    throw new Error('Seleziona una categoria di destinazione per i canali collegati.');
  }
  const batch = writeBatch(db);
  if (targetCategory) {
    for (const ch of channelsToReassign) {
      batch.update(doc(db, 'channels', ch.id), {
        categoryId: targetCategory.id,
        categoryName: targetCategory.name,
        updatedAt: serverTimestamp(),
      });
    }
  }
  batch.delete(doc(db, 'categories', categoryId));
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `categories/${categoryId}`);
  }
}

export async function updateAdminRequest(
  requestId: string,
  updates: { status?: RequestStatus; confirmationSent?: boolean }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'requests', requestId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `requests/${requestId}`);
  }
}

export async function approveAdminRequest(
  reqItem: ChannelRequest,
  input: {
    channelName: string;
    categoryId: string;
    categoryName: string;
    description: string;
    officialUrl: string;
    verified: boolean;
    published: boolean;
    confirmationSent: boolean;
    sortOrder: number;
  }
): Promise<string> {
  const normalizedUrl = normalizeWhatsAppChannelUrl(input.officialUrl);
  if (!normalizedUrl) {
    throw new Error('Inserisci un link ufficiale WhatsApp valido.');
  }
  const channelId = createId('ch');
  const batch = writeBatch(db);

  batch.set(doc(db, 'channels', channelId), {
    id: channelId,
    name: input.channelName.trim(),
    categoryId: input.categoryId,
    categoryName: input.categoryName.trim(),
    description: input.description.trim(),
    officialUrl: normalizedUrl,
    imageUrl: null,
    verified: input.verified,
    published: input.published,
    sortOrder: input.sortOrder,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'channel_private', channelId), {
    channelId,
    ownerPhone: reqItem.phone,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'requests', reqItem.id), {
    status: 'Approvata',
    confirmationSent: input.confirmationSent,
    linkedChannelId: channelId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return channelId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `requests/${reqItem.id}`);
  }
}

export async function deleteAdminRequest(requestId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'requests', requestId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `requests/${requestId}`);
  }
}
