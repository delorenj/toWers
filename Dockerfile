FROM node:20-alpine AS base

# Install pnpm and curl for health checks
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache curl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Files needed for pnpm install
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry and Sentry warnings
ENV NEXT_TELEMETRY_DISABLED=1
ENV SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING=1

RUN pnpm build

# Production image with migration capability
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy database migration files and dependencies for migrations
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=deps /app/node_modules ./node_modules

# Create entrypoint script
COPY --chown=nextjs:nodejs <<EOF /app/entrypoint.sh
#!/bin/sh
set -e

# Run migrations if DATABASE_URL is set
if [ -n "\$DATABASE_URL" ]; then
  echo "Running database migrations..."
  npx drizzle-kit migrate || echo "Migration failed, continuing..."
fi

# Start the application
exec node server.js
EOF

RUN chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Labels for better container management
LABEL org.opencontainers.image.title="MCP Admin"
LABEL org.opencontainers.image.description="Self-hosted MCP administration interface"
LABEL org.opencontainers.image.source="https://github.com/delorenj/mcp-admin"
LABEL org.opencontainers.image.vendor="DeLoContainer"

CMD ["/app/entrypoint.sh"]
