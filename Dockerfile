# Stage 1: Dependencies (Debian pour compatibilité canvas)
FROM node:18-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config \
    libpixman-1-dev libcairo2-dev libpango1.0-dev \
    libjpeg-dev libgif-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Builder (Debian pour Playwright et canvas)
FROM node:18-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Installer dépendances Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Installer Playwright Chromium (utilisé pour les sources nécessitant JavaScript)
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright
RUN npx playwright install chromium

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
# Charger polyfill File API pour éviter "File is not defined" pendant le build
ENV NODE_OPTIONS="--max-old-space-size=4096 --require ./scripts/polyfill-file.js"
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build-secret-not-used-in-production"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV RESEND_API_KEY="re_build_placeholder"
ENV OPENAI_API_KEY="sk-build-placeholder"
RUN npx next build

# Stage 3: Runner (Debian slim pour support Playwright)
FROM node:18-slim AS runner
WORKDIR /app

# Dépendances runtime pour canvas et Playwright Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpixman-1-0 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
    libjpeg62-turbo libgif7 \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Playwright : pointer vers les browsers installés dans le builder
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

# Copier fichiers nécessaires depuis builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copier les browsers Playwright depuis le builder
COPY --from=builder /app/.playwright ./.playwright

# Copier modules natifs depuis builder (canvas, pg, bcryptjs)
# Next.js standalone ne bundle pas les modules natifs utilisés uniquement dans scripts
COPY --from=builder /app/node_modules/canvas ./node_modules/canvas
COPY --from=builder /app/node_modules/pg ./node_modules/pg
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Créer le polyfill File API inline pour le runtime
RUN mkdir -p scripts && cat > scripts/polyfill-file.js << 'POLYFILL'
if (typeof globalThis.File === 'undefined') {
  class File extends Blob {
    constructor(fileParts, fileName, options = {}) {
      super(fileParts, options);
      this.name = fileName;
      this.lastModified = options.lastModified || Date.now();
    }
  }
  globalThis.File = File;
}
POLYFILL

# Charger le polyfill au runtime pour éviter "File is not defined"
ENV NODE_OPTIONS="--require ./scripts/polyfill-file.js"

# Note: pg et bcryptjs sont copiés depuis builder, pas besoin de les installer ici

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
