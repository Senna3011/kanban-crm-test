import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { checkRateLimit, LOGIN_RATE_LIMIT } from '@/lib/rate-limit';
import { headers } from 'next/headers';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Rate limiting: get client IP from headers
        const headersList = headers();
        const forwardedFor = headersList.get('x-forwarded-for');
        const realIp = headersList.get('x-real-ip');
        const clientIp = forwardedFor
          ? forwardedFor.split(',')[0].trim()
          : realIp || '127.0.0.1';

        // Check rate limit (5 attempts per 15 minutes)
        const rateLimitResult = checkRateLimit(clientIp, LOGIN_RATE_LIMIT);
        if (!rateLimitResult.success) {
          throw new Error('RATE_LIMITED');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { tenant: true },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.tenantName = (user as any).tenantName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).tenantName = token.tenantName;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
