const requiredProductionEnv = ['DATABASE_URL', 'REDIS_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'ENCRYPTION_KEY', 'DEEPSEEK_API_KEY'];

export function validateRuntimeEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = requiredProductionEnv.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  if ((process.env.ENCRYPTION_KEY || '').length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 characters in production.');
}
