import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getAdminPasswordHash, saveAdminPasswordHashIfUnset } from './db.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

const revokedTokenIds = new Map<string, number>();
const failedLoginTracker = new Map<string, { count: number; resetAt: number }>();

function getConfiguredEnvPassword(): string | null {
  const raw = process.env.ADMIN_PASSWORD;
  if (!raw || raw.trim().length === 0) return null;
  return raw;
}

export function getAuthConfigurationStatus(): {
  envConfigured: boolean;
  setupRequired: boolean;
} {
  const envConfigured = Boolean(getConfiguredEnvPassword());
  if (envConfigured) {
    return { envConfigured: true, setupRequired: false };
  }
  const hasDbHash = Boolean(getAdminPasswordHash());
  return { envConfigured: false, setupRequired: !hasDbHash };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyScryptHash(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function verifyEnvPassword(candidate: string, envPassword: string): boolean {
  const a = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  const b = crypto.createHash('sha256').update(envPassword, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export function verifyAdminPassword(candidate: string): {
  ok: boolean;
  setupRequired: boolean;
} {
  const envPassword = getConfiguredEnvPassword();
  if (envPassword) {
    return { ok: verifyEnvPassword(candidate, envPassword), setupRequired: false };
  }

  const storedHash = getAdminPasswordHash();
  if (!storedHash) {
    return { ok: false, setupRequired: true };
  }

  return { ok: verifyScryptHash(candidate, storedHash), setupRequired: false };
}

export function claimInitialAdminPassword(password: string): {
  ok: boolean;
  reason?: string;
} {
  if (getConfiguredEnvPassword()) {
    return {
      ok: false,
      reason: 'La password amministratore è già configurata tramite variabile d’ambiente.',
    };
  }
  if (password.length < 8 || password.length > 128) {
    return {
      ok: false,
      reason: 'La password deve contenere tra 8 e 128 caratteri.',
    };
  }
  const hashed = hashPassword(password);
  const saved = saveAdminPasswordHashIfUnset(hashed);
  if (!saved) {
    return {
      ok: false,
      reason: 'La password amministratore è già stata configurata.',
    };
  }
  return { ok: true };
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim().length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function checkLoginRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const entry = failedLoginTracker.get(ip);
  if (!entry) return { allowed: true };
  if (now > entry.resetAt) {
    failedLoginTracker.delete(ip);
    return { allowed: true };
  }
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true };
}

export function recordFailedLoginAttempt(ip: string): {
  remaining: number;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const existing = failedLoginTracker.get(ip);
  if (!existing || now > existing.resetAt) {
    failedLoginTracker.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { remaining: MAX_FAILED_ATTEMPTS - 1 };
  }
  existing.count += 1;
  failedLoginTracker.set(ip, existing);
  if (existing.count >= MAX_FAILED_ATTEMPTS) {
    return {
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { remaining: Math.max(0, MAX_FAILED_ATTEMPTS - existing.count) };
}

export function clearFailedLoginAttempts(ip: string): void {
  failedLoginTracker.delete(ip);
}

interface SessionPayload {
  jti: string;
  role: 'admin';
  iat: number;
  exp: number;
}

function signPayload(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
}

export function createAdminSessionToken(): { token: string; expiresAt: string } {
  const now = Date.now();
  const payload: SessionPayload = {
    jti: crypto.randomUUID(),
    role: 'admin',
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encoded);
  return {
    token: `${encoded}.${signature}`,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

function cleanupRevokedTokens(): void {
  const now = Date.now();
  for (const [jti, exp] of revokedTokenIds.entries()) {
    if (exp < now) revokedTokenIds.delete(jti);
  }
}

export function verifyAdminSessionToken(token: string): SessionPayload | null {
  cleanupRevokedTokens();
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = signPayload(encoded);
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (parsed.role !== 'admin' || typeof parsed.exp !== 'number' || !parsed.jti) {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    if (revokedTokenIds.has(parsed.jti)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function revokeAdminSessionToken(token: string): void {
  const payload = verifyAdminSessionToken(token);
  if (payload) {
    revokedTokenIds.set(payload.jti, payload.exp);
  }
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Autenticazione amministratore richiesta.' });
    return;
  }
  const payload = verifyAdminSessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sessione amministratore non valida o scaduta.' });
    return;
  }
  next();
}
