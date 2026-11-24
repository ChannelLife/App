import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AdminChannel,
  AdminOverviewStats,
  Category,
  ChannelRequest,
  PublicChannel,
  RequestStatus,
  RequestType,
} from '../src/types/channellife.ts';
import {
  normalizeChannelImageUrl,
  slugifyCategoryName,
} from '../src/utils/validation.ts';

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'channellife.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_auth (
    id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category_id TEXT NOT NULL,
    description TEXT NOT NULL,
    official_url TEXT NOT NULL,
    image_url TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    owner_phone TEXT,
    click_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('new_channel', 'join_channel')),
    channel_name TEXT NOT NULL,
    description TEXT,
    official_url TEXT,
    motivation TEXT NOT NULL,
    notes TEXT,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Nuova', 'In valutazione', 'Approvata', 'Rifiutata')),
    confirmation_sent INTEGER NOT NULL DEFAULT 0,
    linked_channel_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function nowIso(): string {
  return new Date().toISOString();
}

function seedInitialData(): void {
  const seeded = db.prepare(`SELECT value FROM meta WHERE key = 'initial_seed_v1'`).get() as
    | { value: string }
    | undefined;
  if (seeded) return;

  const ts = nowIso();
  const autoCategoryId = 'cat_auto_motori';
  const driveLifeId = 'ch_drivelife';

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT OR IGNORE INTO categories (id, name, slug, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(autoCategoryId, 'Auto & Motori', 'auto-motori', 1, ts, ts);

    db.prepare(
      `INSERT OR IGNORE INTO channels
       (id, name, category_id, description, official_url, image_url, verified, published, sort_order, owner_phone, click_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      driveLifeId,
      'DriveLife',
      autoCategoryId,
      'Novità, curiosità e passione per il mondo delle auto',
      'https://whatsapp.com/channel/0029Vb94EAb1yT20jWggOg2e',
      null,
      1,
      1,
      1,
      null,
      0,
      ts,
      ts
    );

    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('initial_seed_v1', ?)`).run(ts);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

seedInitialData();

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  channel_count?: number;
  created_at: string;
  updated_at: string;
}

interface ChannelRow {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  description: string;
  official_url: string;
  image_url: string | null;
  verified: number;
  published: number;
  sort_order: number;
  owner_phone: string | null;
  click_count: number;
  created_at: string;
  updated_at: string;
}

interface RequestRow {
  id: string;
  type: RequestType;
  channel_name: string;
  description: string | null;
  official_url: string | null;
  motivation: string;
  notes: string | null;
  email: string;
  phone: string;
  status: RequestStatus;
  confirmation_sent: number;
  linked_channel_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    channelCount: typeof row.channel_count === 'number' ? row.channel_count : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPublicChannel(row: ChannelRow): PublicChannel {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    description: row.description,
    officialUrl: row.official_url,
    imageUrl: normalizeChannelImageUrl(row.image_url),
    verified: Boolean(row.verified),
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function mapAdminChannel(row: ChannelRow): AdminChannel {
  return {
    ...mapPublicChannel(row),
    published: Boolean(row.published),
    ownerPhone: row.owner_phone,
    clickCount: row.click_count,
    createdAt: row.created_at,
  };
}

function mapRequest(row: RequestRow): ChannelRequest {
  return {
    id: row.id,
    type: row.type,
    channelName: row.channel_name,
    description: row.description,
    officialUrl: row.official_url,
    motivation: row.motivation,
    notes: row.notes,
    email: row.email,
    phone: row.phone,
    status: row.status,
    confirmationSent: Boolean(row.confirmation_sent),
    linkedChannelId: row.linked_channel_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAdminPasswordHash(): string | null {
  const row = db
    .prepare(`SELECT password_hash FROM admin_auth WHERE id = 'singleton'`)
    .get() as { password_hash: string } | undefined;
  return row ? row.password_hash : null;
}

export function saveAdminPasswordHashIfUnset(passwordHash: string): boolean {
  const existing = getAdminPasswordHash();
  if (existing) return false;
  const ts = nowIso();
  db.prepare(
    `INSERT INTO admin_auth (id, password_hash, updated_at) VALUES ('singleton', ?, ?)`
  ).run(passwordHash, ts);
  return true;
}

export function getPublicCatalog(): { categories: Category[]; channels: PublicChannel[] } {
  const catRows = db
    .prepare(
      `SELECT c.*, COUNT(CASE WHEN ch.published = 1 THEN 1 END) AS channel_count
       FROM categories c
       LEFT JOIN channels ch ON ch.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC`
    )
    .all() as unknown as CategoryRow[];

  const chRows = db
    .prepare(
      `SELECT ch.*, c.name AS category_name
       FROM channels ch
       INNER JOIN categories c ON c.id = ch.category_id
       WHERE ch.published = 1
       ORDER BY ch.sort_order ASC, ch.name COLLATE NOCASE ASC`
    )
    .all() as unknown as ChannelRow[];

  return {
    categories: catRows.map(mapCategory),
    channels: chRows.map(mapPublicChannel),
  };
}

export function incrementPublicChannelClick(channelId: string): boolean {
  const result = db
    .prepare(`UPDATE channels SET click_count = click_count + 1 WHERE id = ? AND published = 1`)
    .run(channelId);
  return result.changes > 0;
}

export function listAllCategories(): Category[] {
  const rows = db
    .prepare(
      `SELECT c.*, COUNT(ch.id) AS channel_count
       FROM categories c
       LEFT JOIN channels ch ON ch.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC`
    )
    .all() as unknown as CategoryRow[];
  return rows.map(mapCategory);
}

export function createCategory(name: string): Category {
  const trimmed = name.trim();
  const baseSlug = slugifyCategoryName(trimmed) || 'categoria';
  let slug = baseSlug;
  let counter = 2;
  while (db.prepare(`SELECT 1 FROM categories WHERE slug = ?`).get(slug)) {
    slug = `${baseSlug}-${counter++}`;
  }

  const maxRow = db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories`)
    .get() as { max_order: number };
  const id = `cat_${crypto.randomUUID().slice(0, 12)}`;
  const ts = nowIso();

  db.prepare(
    `INSERT INTO categories (id, name, slug, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, trimmed, slug, maxRow.max_order + 1, ts, ts);

  const row = db
    .prepare(
      `SELECT c.*, 0 AS channel_count FROM categories c WHERE c.id = ?`
    )
    .get(id) as unknown as CategoryRow;
  return mapCategory(row);
}

export function renameCategory(id: string, newName: string): Category | null {
  const existing = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id) as
    | CategoryRow
    | undefined;
  if (!existing) return null;

  const trimmed = newName.trim();
  const baseSlug = slugifyCategoryName(trimmed) || 'categoria';
  let slug = baseSlug;
  let counter = 2;
  while (
    db.prepare(`SELECT 1 FROM categories WHERE slug = ? AND id != ?`).get(slug, id)
  ) {
    slug = `${baseSlug}-${counter++}`;
  }

  const ts = nowIso();
  db.prepare(
    `UPDATE categories SET name = ?, slug = ?, updated_at = ? WHERE id = ?`
  ).run(trimmed, slug, ts, id);

  const updated = db
    .prepare(
      `SELECT c.*, COUNT(ch.id) AS channel_count
       FROM categories c
       LEFT JOIN channels ch ON ch.category_id = c.id
       WHERE c.id = ?
       GROUP BY c.id`
    )
    .get(id) as unknown as CategoryRow;
  return mapCategory(updated);
}

export function reorderCategories(orderedIds: string[]): Category[] {
  const ts = nowIso();
  db.exec('BEGIN');
  try {
    const stmt = db.prepare(
      `UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?`
    );
    orderedIds.forEach((catId, index) => {
      stmt.run(index + 1, ts, catId);
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return listAllCategories();
}

export function getCategoryChannelCount(categoryId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS cnt FROM channels WHERE category_id = ?`)
    .get(categoryId) as { cnt: number };
  return row.cnt;
}

export function categoryExists(categoryId: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM categories WHERE id = ?`).get(categoryId));
}

export function deleteCategorySafely(
  categoryId: string,
  reassignToCategoryId?: string
): { deleted: boolean; conflict?: { channelCount: number } } {
  if (!categoryExists(categoryId)) {
    return { deleted: false };
  }

  const count = getCategoryChannelCount(categoryId);
  if (count > 0 && !reassignToCategoryId) {
    return { deleted: false, conflict: { channelCount: count } };
  }

  const ts = nowIso();
  db.exec('BEGIN');
  try {
    if (count > 0 && reassignToCategoryId) {
      db.prepare(
        `UPDATE channels SET category_id = ?, updated_at = ? WHERE category_id = ?`
      ).run(reassignToCategoryId, ts, categoryId);
    }
    const res = db.prepare(`DELETE FROM categories WHERE id = ?`).run(categoryId);
    db.exec('COMMIT');
    return { deleted: res.changes > 0 };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function listAllAdminChannels(): AdminChannel[] {
  const rows = db
    .prepare(
      `SELECT ch.*, c.name AS category_name
       FROM channels ch
       INNER JOIN categories c ON c.id = ch.category_id
       ORDER BY ch.sort_order ASC, ch.updated_at DESC`
    )
    .all() as unknown as ChannelRow[];
  return rows.map(mapAdminChannel);
}

export interface ChannelWriteInput {
  name: string;
  categoryId: string;
  description: string;
  officialUrl: string;
  imageUrl?: string | null;
  verified?: boolean;
  published?: boolean;
  sortOrder?: number;
  ownerPhone?: string | null;
}

export function createAdminChannel(input: ChannelWriteInput): AdminChannel {
  const id = `ch_${crypto.randomUUID().slice(0, 12)}`;
  const ts = nowIso();
  const maxOrder = db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM channels`)
    .get() as { max_order: number };

  const sortOrder =
    typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder)
      ? Math.max(0, Math.round(input.sortOrder))
      : maxOrder.max_order + 1;

  db.prepare(
    `INSERT INTO channels
     (id, name, category_id, description, official_url, image_url, verified, published, sort_order, owner_phone, click_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    input.name.trim(),
    input.categoryId,
    input.description.trim(),
    input.officialUrl.trim(),
    normalizeChannelImageUrl(input.imageUrl),
    input.verified ? 1 : 0,
    input.published === false ? 0 : 1,
    sortOrder,
    input.ownerPhone ? input.ownerPhone.trim() : null,
    ts,
    ts
  );

  const row = db
    .prepare(
      `SELECT ch.*, c.name AS category_name
       FROM channels ch
       INNER JOIN categories c ON c.id = ch.category_id
       WHERE ch.id = ?`
    )
    .get(id) as unknown as ChannelRow;
  return mapAdminChannel(row);
}

export function updateAdminChannel(
  id: string,
  input: Partial<ChannelWriteInput>
): AdminChannel | null {
  const existing = db.prepare(`SELECT * FROM channels WHERE id = ?`).get(id) as
    | ChannelRow
    | undefined;
  if (!existing) return null;

  const ts = nowIso();
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const categoryId = input.categoryId !== undefined ? input.categoryId : existing.category_id;
  const description =
    input.description !== undefined ? input.description.trim() : existing.description;
  const officialUrl =
    input.officialUrl !== undefined ? input.officialUrl.trim() : existing.official_url;
  const imageUrl =
    input.imageUrl !== undefined
      ? normalizeChannelImageUrl(input.imageUrl)
      : existing.image_url;
  const verified = input.verified !== undefined ? (input.verified ? 1 : 0) : existing.verified;
  const published =
    input.published !== undefined ? (input.published ? 1 : 0) : existing.published;
  const sortOrder =
    input.sortOrder !== undefined && Number.isFinite(input.sortOrder)
      ? Math.max(0, Math.round(input.sortOrder))
      : existing.sort_order;
  const ownerPhone =
    input.ownerPhone !== undefined
      ? input.ownerPhone
        ? input.ownerPhone.trim()
        : null
      : existing.owner_phone;

  db.prepare(
    `UPDATE channels
     SET name = ?, category_id = ?, description = ?, official_url = ?, image_url = ?,
         verified = ?, published = ?, sort_order = ?, owner_phone = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    name,
    categoryId,
    description,
    officialUrl,
    imageUrl,
    verified,
    published,
    sortOrder,
    ownerPhone,
    ts,
    id
  );

  const row = db
    .prepare(
      `SELECT ch.*, c.name AS category_name
       FROM channels ch
       INNER JOIN categories c ON c.id = ch.category_id
       WHERE ch.id = ?`
    )
    .get(id) as unknown as ChannelRow;
  return mapAdminChannel(row);
}

export function deleteAdminChannel(id: string): boolean {
  const res = db.prepare(`DELETE FROM channels WHERE id = ?`).run(id);
  return res.changes > 0;
}

export function createNewChannelRequest(input: {
  channelName: string;
  description: string;
  motivation: string;
  notes?: string;
  email: string;
  phone: string;
}): ChannelRequest {
  const id = `req_${crypto.randomUUID().slice(0, 12)}`;
  const ts = nowIso();
  db.prepare(
    `INSERT INTO requests
     (id, type, channel_name, description, official_url, motivation, notes, email, phone, status, confirmation_sent, linked_channel_id, created_at, updated_at)
     VALUES (?, 'new_channel', ?, ?, NULL, ?, ?, ?, ?, 'Nuova', 0, NULL, ?, ?)`
  ).run(
    id,
    input.channelName.trim(),
    input.description.trim(),
    input.motivation.trim(),
    input.notes && input.notes.trim() ? input.notes.trim() : null,
    input.email.trim(),
    input.phone.trim(),
    ts,
    ts
  );

  const row = db.prepare(`SELECT * FROM requests WHERE id = ?`).get(id) as unknown as RequestRow;
  return mapRequest(row);
}

export function createJoinChannelRequest(input: {
  channelName: string;
  officialUrl: string;
  motivation: string;
  email: string;
  phone: string;
}): ChannelRequest {
  const id = `req_${crypto.randomUUID().slice(0, 12)}`;
  const ts = nowIso();
  db.prepare(
    `INSERT INTO requests
     (id, type, channel_name, description, official_url, motivation, notes, email, phone, status, confirmation_sent, linked_channel_id, created_at, updated_at)
     VALUES (?, 'join_channel', ?, NULL, ?, ?, NULL, ?, ?, 'Nuova', 0, NULL, ?, ?)`
  ).run(
    id,
    input.channelName.trim(),
    input.officialUrl.trim(),
    input.motivation.trim(),
    input.email.trim(),
    input.phone.trim(),
    ts,
    ts
  );

  const row = db.prepare(`SELECT * FROM requests WHERE id = ?`).get(id) as unknown as RequestRow;
  return mapRequest(row);
}

export function listAllRequests(): ChannelRequest[] {
  const rows = db
    .prepare(`SELECT * FROM requests ORDER BY created_at DESC`)
    .all() as unknown as RequestRow[];
  return rows.map(mapRequest);
}

export function getRequestById(id: string): ChannelRequest | null {
  const row = db.prepare(`SELECT * FROM requests WHERE id = ?`).get(id) as
    | RequestRow
    | undefined;
  return row ? mapRequest(row) : null;
}

export function updateRequestStatus(
  id: string,
  updates: { status?: RequestStatus; confirmationSent?: boolean }
): ChannelRequest | null {
  const existing = db.prepare(`SELECT * FROM requests WHERE id = ?`).get(id) as
    | RequestRow
    | undefined;
  if (!existing) return null;

  const ts = nowIso();
  const status = updates.status ?? existing.status;
  const confirmationSent =
    updates.confirmationSent !== undefined
      ? updates.confirmationSent
        ? 1
        : 0
      : existing.confirmation_sent;

  db.prepare(
    `UPDATE requests SET status = ?, confirmation_sent = ?, updated_at = ? WHERE id = ?`
  ).run(status, confirmationSent, ts, id);

  const row = db.prepare(`SELECT * FROM requests WHERE id = ?`).get(id) as unknown as RequestRow;
  return mapRequest(row);
}

export function approveRequestAndCreateChannel(input: {
  requestId: string;
  channelName: string;
  categoryId: string;
  description: string;
  officialUrl: string;
  verified: boolean;
  published: boolean;
  confirmationSent: boolean;
}): { request: ChannelRequest; channel: AdminChannel } | null {
  const reqRow = db
    .prepare(`SELECT * FROM requests WHERE id = ?`)
    .get(input.requestId) as unknown as RequestRow | undefined;
  if (!reqRow) return null;

  const ts = nowIso();
  const channelId = `ch_${crypto.randomUUID().slice(0, 12)}`;
  const maxOrder = db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM channels`)
    .get() as { max_order: number };

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO channels
       (id, name, category_id, description, official_url, image_url, verified, published, sort_order, owner_phone, click_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      channelId,
      input.channelName.trim(),
      input.categoryId,
      input.description.trim(),
      input.officialUrl.trim(),
      input.verified ? 1 : 0,
      input.published ? 1 : 0,
      maxOrder.max_order + 1,
      reqRow.phone, // Associate requester's phone privately as channel owner
      ts,
      ts
    );

    db.prepare(
      `UPDATE requests
       SET status = 'Approvata', confirmation_sent = ?, linked_channel_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.confirmationSent ? 1 : 0, channelId, ts, input.requestId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const updatedReq = db
    .prepare(`SELECT * FROM requests WHERE id = ?`)
    .get(input.requestId) as unknown as RequestRow;
  const createdChannel = db
    .prepare(
      `SELECT ch.*, c.name AS category_name
       FROM channels ch
       INNER JOIN categories c ON c.id = ch.category_id
       WHERE ch.id = ?`
    )
    .get(channelId) as unknown as ChannelRow;

  return {
    request: mapRequest(updatedReq),
    channel: mapAdminChannel(createdChannel),
  };
}

export function deleteRequest(id: string): boolean {
  const res = db.prepare(`DELETE FROM requests WHERE id = ?`).run(id);
  return res.changes > 0;
}

export function getAdminOverviewStats(): AdminOverviewStats {
  const row = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM channels WHERE published = 1) AS publishedChannels,
        (SELECT COUNT(*) FROM channels) AS totalChannels,
        (SELECT COUNT(*) FROM categories) AS totalCategories,
        (SELECT COUNT(*) FROM requests WHERE status IN ('Nuova', 'In valutazione')) AS pendingRequests,
        (SELECT COALESCE(SUM(click_count), 0) FROM channels) AS totalClicks`
    )
    .get() as unknown as AdminOverviewStats;
  return row;
}
