# Stage 1: Dependencies (Debian pour compatibilité canvas)
# Force rebuild 2026-02-13T00:48 - Node 20 requis (cheerio, pdf-parse, @react-email/render)
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config \
    libpixman-1-dev libcairo2-dev libpango1.0-dev \
    libjpeg-dev libgif-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Stage 1b: Playwright (PARALLÈLE avec deps via Docker BuildKit - Semaine 3 Optimisations)
FROM node:20-slim AS playwright-installer
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright

# Installer dépendances système Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 \
    libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npx playwright install chromium

# Stage 2: Builder (Debian pour Playwright et canvas)
# Force rebuild 2026-02-13T17:16 - Phase 3.4 Abrogations
FROM node:20-slim AS builder

# Build args pour cache invalidation intelligent (Semaine 2 Optimisations)
ARG BUILD_DATE
ARG GIT_SHA
LABEL build.date=$BUILD_DATE
LABEL build.sha=$GIT_SHA

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Invalider cache si BUILD_DATE change (timestamp commit)
RUN echo "Build: $BUILD_DATE - $GIT_SHA" > /app/.build-info

COPY . .

# Copier Playwright depuis stage parallèle (Semaine 3 Optimisations: Build parallèle)
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright
COPY --from=playwright-installer /app/.playwright ./.playwright

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
ENV NEXT_PUBLIC_BUILD_SHA=$GIT_SHA
RUN npx next build

# Stage 3: Runner (Debian slim pour support Playwright)
FROM node:20-slim AS runner
WORKDIR /app

# Dépendances runtime pour canvas, Playwright Chromium, OCR (Tesseract) et LibreOffice
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpixman-1-0 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
    libjpeg62-turbo libgif7 \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    tesseract-ocr tesseract-ocr-ara tesseract-ocr-fra \
    libreoffice-writer --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Playwright : pointer vers les browsers installés dans le builder
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

# Créer home directory pour nextjs (requis par LibreOffice pour dconf cache)
RUN mkdir -p /home/nextjs/.cache && chown -R nextjs:nodejs /home/nextjs

# Copier fichiers nécessaires depuis builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copier les browsers Playwright depuis le builder
COPY --from=builder /app/.playwright ./.playwright

# Copier modules natifs et externes depuis builder
# Next.js standalone ne bundle pas les modules natifs utilisés uniquement dans scripts
COPY --from=builder /app/node_modules/canvas ./node_modules/canvas
COPY --from=builder /app/node_modules/@napi-rs ./node_modules/@napi-rs
COPY --from=builder /app/node_modules/pg ./node_modules/pg
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Copier dépendances PDF (pdf-parse + pdf-to-img + pdfjs-dist)
COPY --from=builder /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist
COPY --from=builder /app/node_modules/pdf-parse ./node_modules/pdf-parse
COPY --from=builder /app/node_modules/pdf-to-img ./node_modules/pdf-to-img

# Copier dépendances parsing documents (mammoth pour DOCX, tesseract.js pour OCR, sharp pour images)
COPY --from=builder /app/node_modules/mammoth ./node_modules/mammoth
COPY --from=builder /app/node_modules/tesseract.js ./node_modules/tesseract.js
COPY --from=builder /app/node_modules/tesseract.js-core ./node_modules/tesseract.js-core
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp

# Créer le polyfill File API + DOMMatrix inline pour le runtime
RUN mkdir -p scripts && cat > scripts/polyfill-file.js << 'POLYFILL'
// Polyfill File API
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

// Polyfill DOMMatrix from canvas (pour pdf-to-img / pdf-parse)
if (typeof globalThis.DOMMatrix === 'undefined') {
  try {
    const canvas = require('canvas');
    if (canvas.DOMMatrix) {
      globalThis.DOMMatrix = canvas.DOMMatrix;
    }
  } catch (err) {
    // Canvas not available, skip DOMMatrix polyfill
  }
}

// Polyfill process.getBuiltinModule pour Node.js 18 (requis par tesseract.js)
// Cette API n'existe que dans Node.js 22+
if (typeof process.getBuiltinModule === 'undefined') {
  process.getBuiltinModule = function(moduleName) {
    try {
      return require(moduleName);
    } catch (err) {
      return null;
    }
  };
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

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { \
    let body = ''; \
    r.on('data', chunk => body += chunk); \
    r.on('end', () => { \
      try { \
        const json = JSON.parse(body); \
        process.exit(json.status === 'healthy' ? 0 : 1); \
      } catch { process.exit(1); } \
    }); \
  }).on('error', () => process.exit(1));"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]

# Force Tier 2 rebuild for API monitoring - ven. 13 févr. 2026 16:21:19 CET
