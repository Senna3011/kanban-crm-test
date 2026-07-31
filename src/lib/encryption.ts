import CryptoJS from 'crypto-js';

function encryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be configured with at least 32 characters.');
  }
  return key;
}

export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, encryptionKey()).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, encryptionKey());
  const value = bytes.toString(CryptoJS.enc.Utf8);
  if (!value) throw new Error('Unable to decrypt stored email credentials.');
  return value;
}
