const TREG_BASE_URL = 'https://treg.to';
export const MICRO_USD_PER_USD = 1_000_000;
export const TREG_PEOPLE_SEARCH_COST_MICRO = 500; // $0.0005 flat per non-empty call (up to 100 leads)
export const TREG_LOW_BALANCE_THRESHOLD_USD = 0.5;

export interface TregBalanceSnapshot {
  configured: boolean;
  orgId?: number;
  balanceMicro: number;
  balanceUsd: number;
  spendMicro?: number;
  spendUsd?: number;
  billedCalls?: number;
  totalCalls?: number;
  lowBalanceWarning: boolean;
  criticalBalanceWarning: boolean;
  fetchedAt: string;
  error?: string;
}

let cachedBalance: { data: TregBalanceSnapshot; expiresAt: number } | null = null;
const BALANCE_CACHE_TTL_MS = 15_000;

export function microToUsd(micro: number | null | undefined): number {
  if (typeof micro !== 'number' || !Number.isFinite(micro)) return 0;
  return Number((micro / MICRO_USD_PER_USD).toFixed(6));
}

export function formatUsdCost(usd: number | null | undefined): string {
  const val = typeof usd === 'number' && Number.isFinite(usd) ? usd : 0;
  if (val <= 0) return '$0.00';
  if (val < 1) return `$${val.toFixed(4)}`;
  if (val < 10 && Math.round(val * 10000) % 100 !== 0) return `$${val.toFixed(4)}`;
  return `$${val.toFixed(2)}`;
}

export function estimateLeadSearchCost(provider: string | undefined, count: number): number {
  const n = Math.max(0, count || 0);
  if (n === 0) return 0;
  const p = (provider || 'treg').toLowerCase();
  if (p === 'treg') {
    const pages = Math.ceil(n / 100);
    return Number((pages * microToUsd(TREG_PEOPLE_SEARCH_COST_MICRO)).toFixed(6));
  }
  if (p === 'outscraper') return Number((n * 0.002).toFixed(6));
  if (p === 'apify') return Number((n * 0.003).toFixed(6));
  return 0;
}

/**
 * Fetches live team balance & usage directly from Treg.to Billing API.
 */
export async function getTregBalance(options?: {
  apiKey?: string;
  forceRefresh?: boolean;
  includeUsage?: boolean;
}): Promise<TregBalanceSnapshot> {
  const apiKey = options?.apiKey || process.env.TREG_API_KEY;
  const now = Date.now();

  if (!apiKey) {
    return {
      configured: false,
      balanceMicro: 0,
      balanceUsd: 0,
      lowBalanceWarning: false,
      criticalBalanceWarning: false,
      fetchedAt: new Date().toISOString(),
      error: 'Engine API key is not configured.',
    };
  }

  if (!options?.forceRefresh && !options?.includeUsage && cachedBalance && cachedBalance.expiresAt > now) {
    return cachedBalance.data;
  }

  const headers = {
    'X-Treg-Token': apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const billingRes = await fetch(`${TREG_BASE_URL}/billing`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!billingRes.ok) {
      throw new Error(`Billing endpoint returned HTTP ${billingRes.status}`);
    }

    const billing = await billingRes.json();
    const balanceMicro = typeof billing.balance_micro === 'number' ? billing.balance_micro : 0;
    const balanceUsd = microToUsd(balanceMicro);
    const orgId = typeof billing.org_id === 'number' ? billing.org_id : undefined;

    let spendMicro: number | undefined;
    let spendUsd: number | undefined;
    let billedCalls: number | undefined;
    let totalCalls: number | undefined;

    if (options?.includeUsage && orgId) {
      try {
        const usageController = new AbortController();
        const usageTimeout = setTimeout(() => usageController.abort(), 4000);
        const usageRes = await fetch(`${TREG_BASE_URL}/orgs/${orgId}/usage`, {
          method: 'GET',
          headers,
          signal: usageController.signal,
        });
        clearTimeout(usageTimeout);

        if (usageRes.ok) {
          const usage = await usageRes.json();
          if (typeof usage.spend?.spend_micro === 'number') {
            spendMicro = usage.spend.spend_micro;
            spendUsd = microToUsd(spendMicro);
          }
          if (typeof usage.spend?.billed_calls === 'number') {
            billedCalls = usage.spend.billed_calls;
          }
          if (typeof usage.totals?.total === 'number') {
            totalCalls = usage.totals.total;
          }
        }
      } catch {
        // Usage details are supplementary
      }
    }

    const snapshot: TregBalanceSnapshot = {
      configured: Boolean(billing.configured ?? true),
      orgId,
      balanceMicro,
      balanceUsd,
      spendMicro,
      spendUsd,
      billedCalls,
      totalCalls,
      lowBalanceWarning: balanceUsd < TREG_LOW_BALANCE_THRESHOLD_USD,
      criticalBalanceWarning: balanceUsd < 0.05,
      fetchedAt: new Date().toISOString(),
    };

    cachedBalance = {
      data: snapshot,
      expiresAt: Date.now() + BALANCE_CACHE_TTL_MS,
    };

    return snapshot;
  } catch (err: any) {
    clearTimeout(timeout);
    return {
      configured: true,
      balanceMicro: cachedBalance?.data.balanceMicro ?? 0,
      balanceUsd: cachedBalance?.data.balanceUsd ?? 0,
      lowBalanceWarning: cachedBalance?.data.lowBalanceWarning ?? false,
      criticalBalanceWarning: cachedBalance?.data.criticalBalanceWarning ?? false,
      fetchedAt: new Date().toISOString(),
      error: err?.message || 'Unable to reach billing service',
    };
  }
}

/**
 * Verifies exact settled charge (in micro-USD) for a single Treg.to call ID via GET /calls/{call_ref}.
 */
export async function getTregCallChargeMicro(callId: string, apiKey?: string): Promise<number | null> {
  const token = apiKey || process.env.TREG_API_KEY;
  if (!token || !callId) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(`${TREG_BASE_URL}/calls/${encodeURIComponent(callId)}`, {
      method: 'GET',
      headers: {
        'X-Treg-Token': token,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.charged_micro === 'number') return data.charged_micro;
    if (typeof data.call?.cost_charged_micro === 'number') return data.call.cost_charged_micro;
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}
