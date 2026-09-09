FROM node:20-bookworm-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Copy package files and prisma schema first
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma Client
RUN npm install --legacy-peer-deps
RUN npx prisma generate

# Copy all project files
COPY . .

# Build Next.js
RUN npm run build

# Expose port
EXPOSE 3000

# Start Next.js + Background Worker simultaneously
CMD ["npx", "concurrently", "-n", "next,worker", "-c", "blue,green", "npx next start -p 3000", "npm run worker"]
