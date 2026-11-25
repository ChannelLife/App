export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 160) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (trimmed.length < 6 || trimmed.length > 32) return false;
  if (!/^[+\d\s().-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function normalizeWhatsAppChannelUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 300) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isWhatsAppHost = host === 'whatsapp.com' || host === 'www.whatsapp.com';
  if (!isWhatsAppHost) {
    return null;
  }

  const match = parsed.pathname.match(/^\/channel\/([A-Za-z0-9_-]{8,64})\/?$/);
  if (!match) {
    return null;
  }

  return `https://whatsapp.com/channel/${match[1]}`;
}

export function normalizeChannelImageUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/assets/')) {
    return `.${trimmed}`;
  }
  if (trimmed.startsWith('./assets/')) {
    return trimmed;
  }
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed.length <= 250000 ? trimmed : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  // Automatically convert Google Drive share links into direct image URLs
  if (host === 'drive.google.com') {
    const fileMatch = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    const idParam = parsed.searchParams.get('id');
    const fileId = fileMatch?.[1] || (idParam && /^[A-Za-z0-9_-]+$/.test(idParam) ? idParam : null);
    if (fileId) {
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
  }

  // Convert Dropbox share URLs to raw image delivery
  if (host === 'www.dropbox.com' || host === 'dropbox.com') {
    parsed.searchParams.delete('dl');
    parsed.searchParams.set('raw', '1');
    return parsed.toString();
  }

  return trimmed;
}

export function isValidOptionalImageUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || rawUrl.trim() === '') return true;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('./assets/')) {
    return trimmed.length <= 500;
  }
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed.length <= 250000;
  }
  if (trimmed.length > 500) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function slugifyCategoryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
