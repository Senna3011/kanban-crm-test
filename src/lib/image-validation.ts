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
      throw new Error(`Invalid ${fieldName} URL format.`);
    }
  }

  // Validate Data URL format: data:<mime>;base64,<data>
  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([a-zA-Z0-9\/+.-]+);base64,(.+)$/);
    if (!match) {
      throw new Error(`Invalid ${fieldName} data URL format.`);
    }

    const mimeType = match[1].toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`Unsupported ${fieldName} file type. Use PNG, JPEG, WEBP, GIF, or SVG.`);
    }

    if (trimmed.length > MAX_IMAGE_BASE64_LENGTH) {
      throw new Error(`${fieldName} file size exceeds the maximum limit (max 2MB).`);
    }

    return trimmed;
  }

  throw new Error(`${fieldName} format must be a valid image file or a web URL link.`);
}
