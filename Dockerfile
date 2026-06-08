# =============================================================================
# Dockerfile for Reele Video Engine
# Works with Render Docker deployments, fly.io, Railway, etc.
# =============================================================================

FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock* package-lock.json* ./
COPY prisma ./prisma/

# Install dependencies (use npm since bun may not be available)
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create directories for uploads and database
RUN mkdir -p /app/upload /app/db && \
    chown nextjs:nodejs /app/upload /app/db

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Set environment variables
ENV DATABASE_URL=file:./db/custom.db
ENV UPLOAD_DIR=/app/upload

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
