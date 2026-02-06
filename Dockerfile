# Stage 1: Dependencies
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ pkgconf pixman-dev cairo-dev pango-dev jpeg-dev giflib-dev
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild canvas

# Stage 2: Builder
FROM node:18-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build avec variables d'environnement de build
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_DOMAIN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_APP_DOMAIN=$NEXT_PUBLIC_APP_DOMAIN

# Désactiver telemetry Next.js
ENV NEXT_TELEMETRY_DISABLED=1

# Build sans prebuild (seed) car pas de DB disponible pendant le build
# Augmenter la mémoire Node.js pour le build
# DATABASE_URL factice pour éviter erreurs d'import pendant le build
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build-secret-not-used-in-production"
ENV NEXTAUTH_URL="http://localhost:3000"
RUN npx next build

# Stage 3: Runner
FROM node:18-alpine AS runner
WORKDIR /app

# Dépendances runtime pour canvas
RUN apk add --no-cache pixman cairo pango jpeg giflib

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copier fichiers nécessaires depuis builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copier script entrypoint
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Créer dossier logs
RUN mkdir -p /app/logs
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
