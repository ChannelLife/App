import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import {
  checkLoginRateLimit,
  claimInitialAdminPassword,
  clearFailedLoginAttempts,
  createAdminSessionToken,
  extractBearerToken,
  getAuthConfigurationStatus,
  getClientIp,
  recordFailedLoginAttempt,
  requireAdmin,
  revokeAdminSessionToken,
  verifyAdminPassword,
} from './server/auth.ts';
import {
  approveRequestAndCreateChannel,
  categoryExists,
  createAdminChannel,
  createCategory,
  createJoinChannelRequest,
  createNewChannelRequest,
  deleteAdminChannel,
  deleteCategorySafely,
  deleteRequest,
  getAdminOverviewStats,
  getPublicCatalog,
  getRequestById,
  incrementPublicChannelClick,
  listAllAdminChannels,
  listAllCategories,
  listAllRequests,
  renameCategory,
  reorderCategories,
  updateAdminChannel,
  updateRequestStatus,
} from './server/db.ts';
import type { RequestStatus } from './src/types/channellife.ts';
import {
  isValidEmail,
  isValidOptionalImageUrl,
  isValidPhone,
  normalizeChannelImageUrl,
  normalizeWhatsAppChannelUrl,
} from './src/utils/validation.ts';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.set('trust proxy', 1);
app.use((req, res, next) => {
  if (req.path === '/api/admin/upload-logo') {
    express.json({ limit: '1mb' })(req, res, next);
    return;
  }
  express.json({ limit: '100kb' })(req, res, next);
});

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/uploads/:filename', (req, res) => {
  const filename = typeof req.params.filename === 'string' ? req.params.filename.trim() : '';
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(filename)) {
    res.status(404).end();
    return;
  }
  const resolved = path.resolve(uploadsDir, filename);
  if (!resolved.startsWith(uploadsDir + path.sep) || !fs.existsSync(resolved)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(resolved);
});

// Real-time SSE subscribers
const sseClients = new Set<Response>();

function broadcastEvent(eventName: 'catalog' | 'requests'): void {
  const payload = JSON.stringify({ updatedAt: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      client.write(`event: ${eventName}\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// --- PUBLIC CATALOG ENDPOINTS (No PII exposed) ---

app.get('/api/public/catalog', (_req, res) => {
  try {
    const catalog = getPublicCatalog();
    res.json(catalog);
  } catch (err) {
    console.error('Error loading public catalog:', err);
    res.status(500).json({ error: 'Impossibile caricare il catalogo al momento.' });
  }
});

app.post('/api/public/channels/:id/click', (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'ID canale mancante.' });
    return;
  }
  const updated = incrementPublicChannelClick(id);
  if (!updated) {
    res.status(404).json({ error: 'Canale non trovato.' });
    return;
  }
  res.json({ ok: true });
});

// --- PUBLIC REQUEST SUBMISSION ENDPOINTS ---

app.post('/api/requests/new-channel', (req: Request, res: Response) => {
  const body = req.body ?? {};
  const channelName = typeof body.channelName === 'string' ? body.channelName.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const motivation = typeof body.motivation === 'string' ? body.motivation.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  const fieldErrors: Record<string, string> = {};
  if (!channelName || channelName.length < 2 || channelName.length > 80) {
    fieldErrors.channelName = 'Inserisci un nome valido per il canale (2–80 caratteri).';
  }
  if (!description || description.length < 10 || description.length > 280) {
    fieldErrors.description = 'Inserisci una breve descrizione (10–280 caratteri).';
  }
  if (!motivation || motivation.length < 10 || motivation.length > 1000) {
    fieldErrors.motivation = 'Spiega il motivo della richiesta (10–1000 caratteri).';
  }
  if (notes.length > 1000) {
    fieldErrors.notes = 'Le note aggiuntive non possono superare 1000 caratteri.';
  }
  if (!isValidEmail(email)) {
    fieldErrors.email = 'Inserisci un indirizzo email valido.';
  }
  if (!isValidPhone(phone)) {
    fieldErrors.phone = 'Inserisci un numero di telefono valido (es. +39 333 1234567).';
  }

  if (Object.keys(fieldErrors).length > 0) {
    res.status(400).json({ error: 'Controlla i campi evidenziati.', fieldErrors });
    return;
  }

  const created = createNewChannelRequest({
    channelName,
    description,
    motivation,
    notes,
    email,
    phone,
  });

  broadcastEvent('requests');
  res.status(201).json({
    id: created.id,
    message:
      'Richiesta inviata correttamente. Sarà valutata dagli amministratori: l’invio non comporta l’approvazione automatica.',
  });
});

app.post('/api/requests/join-channel', (req: Request, res: Response) => {
  const body = req.body ?? {};
  const channelName = typeof body.channelName === 'string' ? body.channelName.trim() : '';
  const rawUrl = typeof body.officialUrl === 'string' ? body.officialUrl.trim() : '';
  const motivation = typeof body.motivation === 'string' ? body.motivation.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  const fieldErrors: Record<string, string> = {};
  if (!channelName || channelName.length < 2 || channelName.length > 80) {
    fieldErrors.channelName = 'Inserisci il nome del canale (2–80 caratteri).';
  }
  const normalizedUrl = normalizeWhatsAppChannelUrl(rawUrl);
  if (!normalizedUrl) {
    fieldErrors.officialUrl =
      'Inserisci un link ufficiale WhatsApp valido (es. https://whatsapp.com/channel/...).';
  }
  if (!motivation || motivation.length < 10 || motivation.length > 1000) {
    fieldErrors.motivation = 'Spiega perché vuoi far entrare il canale in ChannelLife (10–1000 caratteri).';
  }
  if (!isValidEmail(email)) {
    fieldErrors.email = 'Inserisci un indirizzo email valido.';
  }
  if (!isValidPhone(phone)) {
    fieldErrors.phone = 'Inserisci un numero di telefono valido (es. +39 333 1234567).';
  }

  if (Object.keys(fieldErrors).length > 0 || !normalizedUrl) {
    res.status(400).json({ error: 'Controlla i campi evidenziati.', fieldErrors });
    return;
  }

  const created = createJoinChannelRequest({
    channelName,
    officialUrl: normalizedUrl,
    motivation,
    email,
    phone,
  });

  broadcastEvent('requests');
  res.status(201).json({
    id: created.id,
    message:
      'Richiesta ricevuta. Il canale sarà esaminato dagli amministratori e non viene pubblicato automaticamente prima dell’approvazione.',
  });
});

// --- ADMIN AUTH ENDPOINTS ---

app.get('/api/admin/auth-status', (_req, res) => {
  res.json(getAuthConfigurationStatus());
});

app.post('/api/admin/setup', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkLoginRateLimit(ip);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds ?? 60));
    res.status(429).json({
      error: `Troppi tentativi. Riprova tra ${limit.retryAfterSeconds} secondi.`,
    });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const result = claimInitialAdminPassword(password);
  if (!result.ok) {
    res.status(403).json({ error: result.reason || 'Impossibile configurare la password.' });
    return;
  }

  clearFailedLoginAttempts(ip);
  const session = createAdminSessionToken();
  res.status(201).json(session);
});

app.post('/api/admin/login', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkLoginRateLimit(ip);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds ?? 60));
    res.status(429).json({
      error: `Troppi tentativi falliti. Riprova tra ${limit.retryAfterSeconds} secondi.`,
    });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) {
    res.status(400).json({ error: 'Inserisci la password amministratore.' });
    return;
  }

  const verified = verifyAdminPassword(password);
  if (verified.setupRequired) {
    res.status(412).json({
      error: 'Nessuna password amministratore configurata. Completa prima la configurazione iniziale.',
      setupRequired: true,
    });
    return;
  }

  if (!verified.ok) {
    const fail = recordFailedLoginAttempt(ip);
    if (fail.retryAfterSeconds) {
      res.setHeader('Retry-After', String(fail.retryAfterSeconds));
      res.status(429).json({
        error: `Troppi tentativi falliti. Accesso temporaneamente bloccato per ${fail.retryAfterSeconds} secondi.`,
      });
      return;
    }
    res.status(401).json({
      error: `Password non corretta. Tentativi rimasti prima del blocco: ${fail.remaining}.`,
    });
    return;
  }

  clearFailedLoginAttempts(ip);
  const session = createAdminSessionToken();
  res.json(session);
});

app.post('/api/admin/logout', (req, res) => {
  const token = extractBearerToken(req);
  if (token) {
    revokeAdminSessionToken(token);
  }
  res.json({ ok: true });
});

app.get('/api/admin/session', requireAdmin, (_req, res) => {
  res.json({ authenticated: true });
});

// --- PROTECTED ADMIN API ENDPOINTS ---

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const stats = getAdminOverviewStats();
  const channels = listAllAdminChannels();
  const requests = listAllRequests();
  res.json({
    stats,
    recentChannels: channels.slice(0, 6),
    recentRequests: requests.slice(0, 6),
  });
});

app.get('/api/admin/channels', requireAdmin, (_req, res) => {
  res.json({ channels: listAllAdminChannels() });
});

app.post('/api/admin/channels', requireAdmin, (req, res) => {
  const body = req.body ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const rawUrl = typeof body.officialUrl === 'string' ? body.officialUrl.trim() : '';
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : null;
  const ownerPhone = typeof body.ownerPhone === 'string' ? body.ownerPhone.trim() : null;
  const verified = Boolean(body.verified);
  const published = body.published !== false;
  const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : undefined;

  if (!name || name.length < 2 || name.length > 80) {
    res.status(400).json({ error: 'Il nome del canale deve avere tra 2 e 80 caratteri.' });
    return;
  }
  if (!categoryId || !categoryExists(categoryId)) {
    res.status(400).json({ error: 'Seleziona una categoria valida.' });
    return;
  }
  if (!description || description.length < 6 || description.length > 280) {
    res.status(400).json({ error: 'La descrizione deve avere tra 6 e 280 caratteri.' });
    return;
  }
  const normalizedUrl = normalizeWhatsAppChannelUrl(rawUrl);
  if (!normalizedUrl) {
    res.status(400).json({
      error: 'Il link ufficiale deve essere un URL WhatsApp valido (https://whatsapp.com/channel/...).',
    });
    return;
  }
  if (!isValidOptionalImageUrl(imageUrl)) {
    res.status(400).json({
      error: 'L’URL immagine opzionale deve iniziare con https:// oppure /assets/.',
    });
    return;
  }
  const normalizedImageUrl = normalizeChannelImageUrl(imageUrl);
  if (ownerPhone && !isValidPhone(ownerPhone)) {
    res.status(400).json({ error: 'Il numero di telefono del proprietario non è valido.' });
    return;
  }

  const created = createAdminChannel({
    name,
    categoryId,
    description,
    officialUrl: normalizedUrl,
    imageUrl: normalizedImageUrl,
    verified,
    published,
    sortOrder,
    ownerPhone: ownerPhone || null,
  });

  broadcastEvent('catalog');
  res.status(201).json({ channel: created });
});

app.post('/api/admin/upload-logo', requireAdmin, (req, res) => {
  const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl.trim() : '';
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    res.status(400).json({ error: 'Formato immagine non supportato. Usa PNG, JPG o WebP.' });
    return;
  }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > 600 * 1024) {
    res.status(400).json({ error: 'L’immagine non può superare 600 KB.' });
    return;
  }

  const filename = `logo_${crypto.randomUUID().slice(0, 12)}.${ext}`;
  const targetPath = path.resolve(uploadsDir, filename);
  if (!targetPath.startsWith(uploadsDir + path.sep)) {
    res.status(400).json({ error: 'Percorso file non valido.' });
    return;
  }

  fs.writeFileSync(targetPath, buffer);
  res.status(201).json({ url: `/uploads/${filename}` });
});

app.patch('/api/admin/channels/:id', requireAdmin, (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'ID canale mancante.' });
    return;
  }

  const body = req.body ?? {};
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Il nome del canale deve avere tra 2 e 80 caratteri.' });
      return;
    }
    updates.name = name;
  }

  if (body.categoryId !== undefined) {
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    if (!categoryId || !categoryExists(categoryId)) {
      res.status(400).json({ error: 'Categoria selezionata non valida.' });
      return;
    }
    updates.categoryId = categoryId;
  }

  if (body.description !== undefined) {
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!description || description.length < 6 || description.length > 280) {
      res.status(400).json({ error: 'La descrizione deve avere tra 6 e 280 caratteri.' });
      return;
    }
    updates.description = description;
  }

  if (body.officialUrl !== undefined) {
    const rawUrl = typeof body.officialUrl === 'string' ? body.officialUrl.trim() : '';
    const normalizedUrl = normalizeWhatsAppChannelUrl(rawUrl);
    if (!normalizedUrl) {
      res.status(400).json({
        error: 'Il link ufficiale deve essere un URL WhatsApp valido (https://whatsapp.com/channel/...).',
      });
      return;
    }
    updates.officialUrl = normalizedUrl;
  }

  if (body.imageUrl !== undefined) {
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : null;
    if (!isValidOptionalImageUrl(imageUrl)) {
      res.status(400).json({
        error: 'L’URL immagine opzionale deve iniziare con https:// oppure /assets/.',
      });
      return;
    }
    updates.imageUrl = normalizeChannelImageUrl(imageUrl);
  }

  if (body.ownerPhone !== undefined) {
    const ownerPhone = typeof body.ownerPhone === 'string' ? body.ownerPhone.trim() : null;
    if (ownerPhone && !isValidPhone(ownerPhone)) {
      res.status(400).json({ error: 'Il numero di telefono del proprietario non è valido.' });
      return;
    }
    updates.ownerPhone = ownerPhone || null;
  }

  if (body.verified !== undefined) updates.verified = Boolean(body.verified);
  if (body.published !== undefined) updates.published = Boolean(body.published);
  if (typeof body.sortOrder === 'number') updates.sortOrder = body.sortOrder;

  const updated = updateAdminChannel(id, updates);
  if (!updated) {
    res.status(404).json({ error: 'Canale non trovato.' });
    return;
  }

  broadcastEvent('catalog');
  res.json({ channel: updated });
});

app.delete('/api/admin/channels/:id', requireAdmin, (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'ID canale mancante.' });
    return;
  }
  const deleted = deleteAdminChannel(id);
  if (!deleted) {
    res.status(404).json({ error: 'Canale non trovato.' });
    return;
  }
  broadcastEvent('catalog');
  res.json({ ok: true });
});

// --- ADMIN CATEGORIES ENDPOINTS ---

app.get('/api/admin/categories', requireAdmin, (_req, res) => {
  res.json({ categories: listAllCategories() });
});

app.post('/api/admin/categories', requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length < 2 || name.length > 48) {
    res.status(400).json({ error: 'Il nome della categoria deve avere tra 2 e 48 caratteri.' });
    return;
  }

  try {
    const created = createCategory(name);
    broadcastEvent('catalog');
    res.status(201).json({ category: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Esiste già una categoria con questo nome.' });
      return;
    }
    res.status(500).json({ error: 'Errore nella creazione della categoria.' });
  }
});

app.patch('/api/admin/categories/reorder', requireAdmin, (req, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds)
    ? req.body.orderedIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];
  if (orderedIds.length === 0) {
    res.status(400).json({ error: 'Elenco ordine categorie non valido.' });
    return;
  }
  const categories = reorderCategories(orderedIds);
  broadcastEvent('catalog');
  res.json({ categories });
});

app.patch('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!id || !name || name.length < 2 || name.length > 48) {
    res.status(400).json({ error: 'Inserisci un nome valido (2–48 caratteri).' });
    return;
  }
  try {
    const updated = renameCategory(id, name);
    if (!updated) {
      res.status(404).json({ error: 'Categoria non trovata.' });
      return;
    }
    broadcastEvent('catalog');
    res.json({ category: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Esiste già una categoria con questo nome.' });
      return;
    }
    res.status(500).json({ error: 'Errore durante la modifica della categoria.' });
  }
});

app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const reassignToCategoryId =
    typeof req.body?.reassignToCategoryId === 'string'
      ? req.body.reassignToCategoryId.trim()
      : undefined;

  if (!id) {
    res.status(400).json({ error: 'ID categoria mancante.' });
    return;
  }

  if (reassignToCategoryId) {
    if (reassignToCategoryId === id) {
      res.status(400).json({ error: 'Scegli una categoria diversa per la riassegnazione.' });
      return;
    }
    if (!categoryExists(reassignToCategoryId)) {
      res.status(400).json({ error: 'Categoria di destinazione non valida.' });
      return;
    }
  }

  const outcome = deleteCategorySafely(id, reassignToCategoryId);
  if (outcome.conflict) {
    res.status(409).json({
      code: 'CATEGORY_IN_USE',
      channelCount: outcome.conflict.channelCount,
      error: `Questa categoria contiene ${outcome.conflict.channelCount} canali. Riassegnali a un’altra categoria prima di eliminarla.`,
    });
    return;
  }
  if (!outcome.deleted) {
    res.status(404).json({ error: 'Categoria non trovata.' });
    return;
  }

  broadcastEvent('catalog');
  res.json({ ok: true });
});

// --- ADMIN REQUESTS ENDPOINTS ---

app.get('/api/admin/requests', requireAdmin, (_req, res) => {
  res.json({ requests: listAllRequests() });
});

const ALLOWED_STATUSES: RequestStatus[] = ['Nuova', 'In valutazione', 'Approvata', 'Rifiutata'];

app.patch('/api/admin/requests/:id', requireAdmin, (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const body = req.body ?? {};
  const updates: { status?: RequestStatus; confirmationSent?: boolean } = {};

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      res.status(400).json({ error: 'Stato richiesta non valido.' });
      return;
    }
    updates.status = body.status;
  }

  if (body.confirmationSent !== undefined) {
    updates.confirmationSent = Boolean(body.confirmationSent);
  }

  const updated = updateRequestStatus(id, updates);
  if (!updated) {
    res.status(404).json({ error: 'Richiesta non trovata.' });
    return;
  }
  broadcastEvent('requests');
  res.json({ request: updated });
});

app.post('/api/admin/requests/:id/approve', requireAdmin, (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const existingReq = getRequestById(id);
  if (!existingReq) {
    res.status(404).json({ error: 'Richiesta non trovata.' });
    return;
  }
  if (existingReq.status === 'Approvata' && existingReq.linkedChannelId) {
    res.status(409).json({ error: 'Questa richiesta è già stata approvata e collegata a un canale.' });
    return;
  }

  const body = req.body ?? {};
  const channelName =
    typeof body.channelName === 'string' && body.channelName.trim()
      ? body.channelName.trim()
      : existingReq.channelName;
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : existingReq.description || '';
  const rawUrl =
    typeof body.officialUrl === 'string' && body.officialUrl.trim()
      ? body.officialUrl.trim()
      : existingReq.officialUrl || '';
  const verified = Boolean(body.verified);
  const published = body.published !== false;
  const confirmationSent = Boolean(body.confirmationSent);

  if (!channelName || channelName.length < 2 || channelName.length > 80) {
    res.status(400).json({ error: 'Inserisci un nome valido per il canale (2–80 caratteri).' });
    return;
  }
  if (!categoryId || !categoryExists(categoryId)) {
    res.status(400).json({ error: 'Seleziona una categoria valida.' });
    return;
  }
  if (!description || description.length < 6 || description.length > 280) {
    res.status(400).json({ error: 'Inserisci la descrizione pubblica del canale (6–280 caratteri).' });
    return;
  }
  const normalizedUrl = normalizeWhatsAppChannelUrl(rawUrl);
  if (!normalizedUrl) {
    res.status(400).json({
      error: 'Inserisci un link ufficiale WhatsApp valido (https://whatsapp.com/channel/...).',
    });
    return;
  }

  const result = approveRequestAndCreateChannel({
    requestId: id,
    channelName,
    categoryId,
    description,
    officialUrl: normalizedUrl,
    verified,
    published,
    confirmationSent,
  });

  if (!result) {
    res.status(404).json({ error: 'Richiesta non trovata.' });
    return;
  }

  broadcastEvent('catalog');
  broadcastEvent('requests');
  res.json(result);
});

app.delete('/api/admin/requests/:id', requireAdmin, (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  const deleted = deleteRequest(id);
  if (!deleted) {
    res.status(404).json({ error: 'Richiesta non trovata.' });
    return;
  }
  broadcastEvent('requests');
  res.json({ ok: true });
});

// --- FRONTEND SERVING ---

async function startServer(): Promise<void> {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ChannelLife server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ChannelLife server:', err);
  process.exit(1);
});
