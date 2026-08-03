/**
 * Simple in-memory rate limiter
 * Tracks requests by IP address with configurable window and max attempts
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  /** Unique key to identify this rate limit (e.g., 'login', 'api') */
  identifier: string;
  /** Maximum number of attempts allowed in the window */
  maxAttempts: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * Check if a request should be rate limited
 * @param ip - The IP address of the requester
 * @param options - Rate limit configuration
 * @returns Object with success status and remaining attempts
 */
export function checkRateLimit(
  ip: string,
  options: RateLimitOptions
): { success: boolean; remaining: number; resetIn: number } {
  const { identifier, maxAttempts, windowMs } = options;
  const key = `${identifier}:${ip}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  // If no entry exists or the window has expired, create a new one
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: maxAttempts - 1,
      resetIn: windowMs,
    };
  }

  // Increment the counter
  entry.count++;

  // Check if the limit has been exceeded
  if (entry.count > maxAttempts) {
    const resetIn = entry.resetTime - now;
    return {
      success: false,
      remaining: 0,
      resetIn,
    };
  }

  return {
    success: true,
    remaining: maxAttempts - entry.count,
    resetIn: entry.resetTime - now,
  };
}

/**
 * Rate limit configuration for login endpoint
 * 5 attempts per 15 minutes
 */
export const LOGIN_RATE_LIMIT: RateLimitOptions = {
  identifier: 'login',
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
};

/**
 * Get client IP from request headers
 * Handles proxied requests (nginx, Cloudflare, etc.)
 */
export function getClientIp(request: Request): string {
  // Check various headers for the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs; take the first one
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback (may not be available in all environments)
  return '127.0.0.1';
}
