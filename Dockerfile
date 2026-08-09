FROM node:22-alpine AS base
RUN apk add --no-cache sqlite
WORKDIR /app
EXPOSE 4217

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run test:ci

FROM base AS runner
RUN addgroup --system --gid 1001 nokta && \
    adduser --system --uid 1001 nokta
RUN mkdir -p /data && chown nokta:nokta /data

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY daemon/ ./daemon/
COPY compiler/ ./compiler/
COPY packs/ ./packs/
COPY adapters/ ./adapters/
COPY upstream/ ./upstream/

ENV NODE_ENV=production
ENV NOKTA_DATA_DIR=/data
ENV PORT=4217
ENV HOST=0.0.0.0

USER nokta
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4217/health || exit 1

ENTRYPOINT ["node", "daemon/index.mjs", "daemon"]
