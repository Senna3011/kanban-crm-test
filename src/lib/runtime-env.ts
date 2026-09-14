const requiredProductionEnv = ['DATABASE_URL', 'REDIS_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'ENCRYPTION_KEY'];

export function validateRuntimeEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = requiredProductionEnv.filter((name) => !process.env[name]?.trim());
  if (!process.env.AI_API_KEY && !process.env.DEEPSEEK_API_KEY) {
    missing.push('AI_API_KEY / DEEPSEEK_API_KEY');
  }
  if (missing.length) {
    console.warn(`[RuntimeEnv] Missing production env vars: ${missing.join(', ')}`);
  }
  if ((process.env.ENCRYPTION_KEY || '').length < 32) {
    console.warn('[RuntimeEnv] ENCRYPTION_KEY should be at least 32 characters in production.');
  }
}
