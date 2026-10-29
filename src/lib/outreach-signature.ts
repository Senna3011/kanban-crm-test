import crypto from 'crypto';

export function getUnsubscribeSecret(): string {
  return process.env.NEXTAUTH_SECRET || process.env.ENCRYPTION_KEY || 'kanban-crm-unsubscribe-salt-key';
}

export function generateUnsubscribeSignature(email: string, tenantId: string): string {
  const secret = getUnsubscribeSecret();
  const normalized = `${email.trim().toLowerCase()}:${tenantId.trim()}`;
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
}

export function verifyUnsubscribeSignature(email: string, tenantId: string, signature: string): boolean {
  if (!email || !tenantId || !signature) return false;
  try {
    const expected = generateUnsubscribeSignature(email, tenantId);
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}
