/**
 * Image data URL & URL validation utility
 */

const MAX_IMAGE_BASE64_LENGTH = 3.5 * 1024 * 1024; // ~2.5MB binary payload
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

export function validateImageInput(dataUrlOrUrl?: string | null, fieldName = 'Gambar'): string | null {
  if (!dataUrlOrUrl || !dataUrlOrUrl.trim()) return null;

  const trimmed = dataUrlOrUrl.trim();

  // Allow standard HTTP/HTTPS links
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      throw new Error(`Format URL ${fieldName} tidak valid.`);
    }
  }

  // Validate Data URL format: data:<mime>;base64,<data>
  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([a-zA-Z0-9\/+.-]+);base64,(.+)$/);
    if (!match) {
      throw new Error(`Format data URL ${fieldName} tidak valid.`);
    }

    const mimeType = match[1].toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`Tipe file ${fieldName} tidak didukung. Gunakan PNG, JPEG, WEBP, GIF, atau SVG.`);
    }

    if (trimmed.length > MAX_IMAGE_BASE64_LENGTH) {
      throw new Error(`Ukuran file ${fieldName} melebihi batas maksimal (maksimal 2MB).`);
    }

    return trimmed;
  }

  throw new Error(`Format ${fieldName} harus berupa file gambar valid atau link URL web.`);
}
