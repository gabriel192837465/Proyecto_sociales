# ── Stage 1: Install dependencies ──────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# ── Stage 2: Runtime ──────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN chown -R app:app /app

USER app

EXPOSE 3000

ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info \
    INTERFACE=eth0

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/server/index.js"]
