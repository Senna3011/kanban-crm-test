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
      clientMessage: 'B2B gateway search quota or credit balance has been exhausted. Please recharge credits or switch to an alternative provider.',
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
      clientMessage: 'Prospect search criteria are incompatible with this gateway format. Please refine role keywords or target location.',
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
      clientMessage: 'Connection to data provider gateway could not be authenticated. Please contact system administrator to refresh gateway tokens.',
      statusCode: 502,
      errorCode: 'GATEWAY_AUTH_FAILURE',
    };
  }

  // 4. Timeout / Batas Waktu Terlampaui (15s)
  if (/timeout|abort|etimedout|15 seconds/i.test(rawMessage)) {
    return {
      clientMessage: 'Prospect search timed out. The upstream provider queue is currently congested; please retry in a few moments.',
      statusCode: 504,
      errorCode: 'GATEWAY_TIMEOUT',
    };
  }

  // 5. Gangguan Server Gateway / Upstream Maintenance (HTTP 500, 502, 503)
  if (rawMessage.includes('500') || rawMessage.includes('502') || rawMessage.includes('503')) {
    return {
      clientMessage: 'Prospect gateway provider is currently undergoing maintenance. Please retry in a few moments or switch to Live Search mode.',
      statusCode: 502,
      errorCode: 'GATEWAY_UNAVAILABLE',
    };
  }

  // 6. Default Safe Fallback
  return {
    clientMessage: 'Prospect sourcing could not be completed. Please adjust your search criteria or select an alternative provider.',
    statusCode: 500,
    errorCode: 'DISCOVERY_FAILED',
  };
}
