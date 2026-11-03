export interface SanitizedErrorResult {
  clientMessage: string;
  statusCode: number;
  errorCode: string;
}

/**
 * Masks sensitive information such as Bearer tokens, JWTs, API keys, and connection strings
 * to ensure that server console logs remain safe from credential leakage (CWE-209 / CWE-532).
 */
export function maskSensitiveInfo(str: string): string {
  if (!str) return '';
  return str
    .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]+/gi, '$1[MASKED_TOKEN]')
    .replace(/(eyJ[A-Za-z0-9_\-\.]+\.[A-Za-z0-9_\-\.]+\.[A-Za-z0-9_\-\.]+)/gi, '[MASKED_JWT]')
    .replace(/lo_live_[A-Za-z0-9_\-]+/gi, 'lo_live_[MASKED_KEY]')
    .replace(/apify_api_[A-Za-z0-9_\-]+/gi, 'apify_api_[MASKED_KEY]')
    .replace(/postgresql:\/\/[^@]+@/gi, 'postgresql://[USER_PASS_MASKED]@');
}

/**
 * Enterprise Outreach Error Sanitizer
 * - Logs raw technical details and stack traces strictly to server console with security masking.
 * - Formulates clean, friendly, professional Indonesian error alerts for the frontend client.
 * - NEVER leaks raw JSON dumps, database queries, API schemas, or internal tokens to the browser.
 */
export function sanitizeOutreachError(
  rawError: any,
  context: { provider?: string; action?: string; campaignId?: string } = {}
): SanitizedErrorResult {
  const provider = (context.provider || 'B2B GATEWAY').toUpperCase();
  const rawMessage = String(rawError?.message || rawError || '');

  // Log full audit information on server only (with token & credential masking)
  console.error(
    `[OUTREACH_AUDIT_ERROR] Provider: ${provider} | Action: ${context.action || 'scrape'} | Campaign: ${context.campaignId || 'N/A'}\n` +
    `  Details: ${maskSensitiveInfo(rawMessage)}\n` +
    `  Stack: ${maskSensitiveInfo(rawError?.stack || 'No stack trace')}`
  );

  // 1. Quota / Saldo Kredit / Limit Habis (HTTP 402, 429)
  if (
    rawMessage.includes('402') ||
    rawMessage.includes('429') ||
    /quota|credit|insufficient|limit reached|rate limit/i.test(rawMessage)
  ) {
    return {
      clientMessage: 'Kuota pencarian atau saldo kredit gateway B2B saat ini telah habis. Silakan isi ulang kuota atau gunakan provider alternatif.',
      statusCode: 429,
      errorCode: 'GATEWAY_QUOTA_EXCEEDED',
    };
  }

  // 2. Kriteria Input / Parameter Tidak Valid (HTTP 400, 422, Schema Validation)
  if (
    rawMessage.includes('400') ||
    rawMessage.includes('422') ||
    /validation|where|expected|invalid parameter|identity_incomplete/i.test(rawMessage)
  ) {
    return {
      clientMessage: 'Kriteria pencarian prospek tidak sesuai dengan format gateway ini. Silakan coba sesuaikan kata kunci jabatan (role) atau target lokasi.',
      statusCode: 400,
      errorCode: 'INVALID_SEARCH_CRITERIA',
    };
  }

  // 3. Masalah Autentikasi / Token Kedaluwarsa (HTTP 401, 403)
  if (
    rawMessage.includes('401') ||
    rawMessage.includes('403') ||
    /unauthorized|forbidden|api key|token|invalid token/i.test(rawMessage)
  ) {
    return {
      clientMessage: 'Koneksi ke gateway penyedia data gagal diverifikasi. Silakan hubungi administrator sistem untuk memperbarui token gateway.',
      statusCode: 502,
      errorCode: 'GATEWAY_AUTH_FAILURE',
    };
  }

  // 4. Timeout / Batas Waktu Terlampaui (15s)
  if (/timeout|abort|etimedout|15 seconds/i.test(rawMessage)) {
    return {
      clientMessage: 'Pencarian prospek melebihi batas waktu (timeout). Server provider sedang mengalami antrean sibuk, silakan coba beberapa saat lagi.',
      statusCode: 504,
      errorCode: 'GATEWAY_TIMEOUT',
    };
  }

  // 5. Gangguan Server Gateway / Upstream Maintenance (HTTP 500, 502, 503)
  if (rawMessage.includes('500') || rawMessage.includes('502') || rawMessage.includes('503')) {
    return {
      clientMessage: 'Penyedia gateway prospek sedang dalam pemeliharaan sistem. Silakan coba kembali sesaat lagi atau gunakan mode Live Search.',
      statusCode: 502,
      errorCode: 'GATEWAY_UNAVAILABLE',
    };
  }

  // 6. Default Safe Fallback
  return {
    clientMessage: 'Pencarian prospek belum berhasil diproses. Silakan coba sesuaikan kriteria pencarian atau pilih provider alternatif.',
    statusCode: 500,
    errorCode: 'DISCOVERY_FAILED',
  };
}
