// Load environment from .env.local before any Prisma/Redis client is instantiated.
// tsx does not load .env.local automatically (unlike Next.js), so the worker needs this.
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.local') });
