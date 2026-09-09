FROM node:20-bookworm-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Hugging Face Spaces runs as user with UID 1000
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PORT=7860 \
    NODE_ENV=production

# Copy package files first
COPY --chown=user:user package*.json ./
COPY --chown=user:user prisma ./prisma/

# Install dependencies and generate Prisma Client
RUN npm install --legacy-peer-deps
RUN npx prisma generate

# Copy project files
COPY --chown=user:user . .

# Build Next.js
RUN npm run build

# Switch to non-root user
USER user

# Hugging Face exposes port 7860
EXPOSE 7860

# Start Next.js on port 7860 and worker simultaneously
CMD ["npx", "concurrently", "-n", "next,worker", "-c", "blue,green", "npx next start -p 7860", "npm run worker"]
