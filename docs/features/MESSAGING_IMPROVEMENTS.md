# Messaging - Améliorations Futures

Ce document décrit les améliorations possibles pour le système de messaging WhatsApp, au-delà de l'implémentation actuelle.

## 📊 État Actuel (Phase 1 & 2 Complétées)

### ✅ Fonctionnalités Implémentées

1. **Webhook WhatsApp Business API**
   - Réception messages avec validation signature HMAC SHA256
   - Téléchargement immédiat des médias (avant expiration 30 jours)
   - Identification client via téléphone normalisé

2. **Gestion Documents**
   - Rattachement automatique si 1 seul dossier actif
   - Pending documents si plusieurs dossiers ou numéro inconnu
   - Stockage Google Drive via StorageManager

3. **Historique et Logging**
   - Table `whatsapp_messages` : Tous les messages reçus
   - Table `whatsapp_media_cache` : Cache médias après expiration
   - Statuts détaillés : received → media_downloaded → document_created/error

4. **Notifications**
   - Confirmation WhatsApp client
   - Email avocat (rattachement auto / action requise / numéro inconnu)
   - Widget dashboard temps réel

5. **Maintenance**
   - Cleanup automatique messages > 90 jours
   - Détection médias expirés (> 30 jours)
   - Monitoring via vues SQL (`whatsapp_stats_30d`, `whatsapp_media_expired`)

---

## 🚀 Phase 3 : Améliorations Performance & Scalabilité

### 1. Queue Système (BullMQ)

#### Problème Actuel
- Traitement synchrone dans webhook (peut ralentir réponse Meta)
- Pas de retry automatique en cas d'erreur
- Pas de prioritisation des messages
- Difficile de scaler horizontalement

#### Solution : Queue Redis + BullMQ

**Architecture proposée:**
```
Webhook POST /api/webhooks/whatsapp
       ↓
Validation signature + Parsing message
       ↓
Ajout dans Queue Redis (BullMQ)
       ↓
Return 200 OK immédiatement
       ↓
Worker(s) traite message asynchrone
       ↓
Retry automatique si échec
```

**Avantages:**
- Réponse webhook < 100ms (Meta recommandé)
- Retry automatique (3 tentatives espacées)
- Priorité haute pour clients VIP
- Scalable (plusieurs workers en parallèle)
- Dashboard monitoring jobs (actifs, failed, completed)

**Implémentation:**

```bash
npm install bullmq ioredis
```

```typescript
// lib/queue/whatsapp-queue.ts
import { Queue, Worker } from 'bullmq'
import Redis from 'ioredis'

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
})

export const whatsappQueue = new Queue('whatsapp-messages', { connection })

export async function addMessageToQueue(message: IncomingMessage) {
  await whatsappQueue.add(
    'process-message',
    { message },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s, 4s, 8s
      },
      removeOnComplete: {
        age: 86400, // Garder 1 jour
        count: 1000,
      },
      removeOnFail: {
        age: 604800, // Garder 1 semaine
      },
    }
  )
}

// Worker séparé (peut tourner sur autre instance)
export function startWhatsAppWorker() {
  const worker = new Worker(
    'whatsapp-messages',
    async (job) => {
      const { message } = job.data

      // Logique traitement message (actuelle)
      // - Télécharger média
      // - Identifier client
      // - Rattacher document
      // - Envoyer notifications

      await processWhatsAppMessage(message)
    },
    {
      connection,
      concurrency: 5, // 5 messages en parallèle
    }
  )

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err)
  })

  return worker
}
```

**Modification webhook:**
```typescript
// app/api/webhooks/whatsapp/route.ts (simplifié)
export async function POST(request: NextRequest) {
  // Validation signature + parsing (rapide)
  const incomingMessage = parseIncomingWebhook(payload)

  // Log initial
  await logIncomingMessage(supabase, { ... })

  // ✅ Ajouter dans queue (< 10ms)
  await addMessageToQueue(incomingMessage)

  // ✅ Retourner 200 OK immédiatement
  return NextResponse.json({ success: true, queued: true })
}
```

**Dashboard BullMQ (optionnel):**
```bash
npm install @bull-board/api @bull-board/ui
```

Accès: `/api/admin/queues` (monitoring jobs en temps réel)

---

### 2. Rate Limiting API WhatsApp

#### Problème Actuel
- Pas de limite sur envoi messages WhatsApp
- Risque dépassement quotas Meta (1000 conversations/jour)
- Pas de throttling sur upload Google Drive

#### Solution : Rate Limiting Multi-Niveaux

**Limites Meta WhatsApp Business:**
- **Messages sortants** : 1000 conversations/24h (tier gratuit)
- **Média download** : 100 requêtes/seconde
- **Webhook POST** : Illimité (mais doit répondre < 20s)

**Implémentation:**

```typescript
// lib/rate-limiting/whatsapp-limiter.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
})

// Limite envoi messages WhatsApp
export const whatsappSendLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1000, '24 h'),
  analytics: true,
  prefix: 'whatsapp:send',
})

// Limite téléchargement médias
export const whatsappDownloadLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(100, '1 s'),
  analytics: true,
  prefix: 'whatsapp:download',
})

// Limite upload Google Drive
export const googleDriveUploadLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, '1 s'),
  analytics: true,
  prefix: 'gdrive:upload',
})
```

**Usage dans WhatsAppMessenger:**
```typescript
async sendTextMessage(params: { to: string; text: string }) {
  // Vérifier rate limit
  const { success, limit, remaining } = await whatsappSendLimiter.limit(
    `user:${this.userId}`
  )

  if (!success) {
    throw new Error(
      `Rate limit dépassé. Limite: ${limit} messages/24h. Réessayer plus tard.`
    )
  }

  console.log(`Messages restants aujourd'hui: ${remaining}`)

  // Envoyer message normalement
  return this.sendMessage(params)
}
```

**Dashboard rate limiting:**
```typescript
// app/api/rate-limits/route.ts
export async function GET() {
  const userId = await getUserId()

  const whatsappSend = await whatsappSendLimiter.getRemaining(`user:${userId}`)
  const whatsappDownload = await whatsappDownloadLimiter.getRemaining(`user:${userId}`)

  return NextResponse.json({
    whatsapp_send: {
      remaining: whatsappSend,
      limit: 1000,
      reset_at: '2026-02-06T00:00:00Z', // Minuit
    },
    whatsapp_download: {
      remaining: whatsappDownload,
      limit: 100,
      reset_at: new Date(Date.now() + 1000).toISOString(), // +1s
    },
  })
}
```

---

### 3. Optimisation Cache Médias

#### Problème Actuel
- Médias téléchargés mais pas réutilisés si re-demandé
- Pas de compression images/vidéos
- Pas de CDN pour accès rapide

#### Solution : Cache Multi-Niveaux

**Architecture:**
```
WhatsApp Media URL (expire 30j)
       ↓
Cache Redis (30 min) ← Accès ultra-rapide
       ↓
Supabase Storage ← Permanent
       ↓
CDN Cloudflare (optionnel) ← Global
```

**Implémentation cache Redis:**
```typescript
// lib/cache/media-cache.ts
import { redis } from '@/lib/redis'

export async function getCachedMedia(mediaId: string): Promise<Buffer | null> {
  const cached = await redis.get(`media:${mediaId}`)
  if (!cached) return null

  return Buffer.from(cached, 'base64')
}

export async function setCachedMedia(
  mediaId: string,
  buffer: Buffer,
  ttl = 1800 // 30 minutes
) {
  await redis.set(
    `media:${mediaId}`,
    buffer.toString('base64'),
    'EX',
    ttl
  )
}
```

**Compression images (optionnel):**
```bash
npm install sharp
```

```typescript
import sharp from 'sharp'

async function compressImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  if (!mimeType.startsWith('image/')) return buffer

  return sharp(buffer)
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
}
```

---

### 4. Monitoring Avancé & Alertes

#### Problème Actuel
- Pas d'alertes automatiques si erreurs
- Dashboard manuel (requêtes SQL)
- Pas de métriques performance

#### Solution : Monitoring avec Sentry & Analytics

**Intégration Sentry (erreurs):**
```bash
npm install @sentry/nextjs
```

```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% traces
  environment: process.env.NODE_ENV,
})

// Dans webhook
try {
  await processWhatsAppMessage(message)
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: 'whatsapp-webhook',
      message_id: message.id,
      from: message.from,
    },
  })
  throw error
}
```

**Alertes Slack/Email (optionnel):**
```typescript
// lib/alerts/webhook-alerts.ts
export async function sendAlert(params: {
  level: 'warning' | 'error' | 'critical'
  title: string
  message: string
  metadata?: Record<string, any>
}) {
  // Email avocat si > 10 messages en erreur/heure
  // Slack admin si webhook rate limit dépassé
  // SMS urgent si service complètement down
}
```

**Métriques Prometheus (optionnel):**
```typescript
// lib/metrics/whatsapp-metrics.ts
import { Counter, Histogram } from 'prom-client'

export const whatsappMessagesTotal = new Counter({
  name: 'whatsapp_messages_total',
  help: 'Total messages WhatsApp reçus',
  labelNames: ['status', 'type'],
})

export const whatsappProcessingDuration = new Histogram({
  name: 'whatsapp_processing_duration_seconds',
  help: 'Durée traitement message WhatsApp',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
})

// Usage
whatsappMessagesTotal.inc({ status: 'success', type: 'document' })
whatsappProcessingDuration.observe(2.5) // 2.5 secondes
```

---

### 5. Features Utilisateur Avancées

#### Templates Réponses Automatiques

Permettre à l'avocat de configurer des réponses automatiques personnalisées.

**Exemples:**
- "Document reçu" → Message custom avocat
- "Numéro inconnu" → Formulaire inscription client
- "En dehors heures ouverture" → Message horaires cabinet

**Implémentation:**
```sql
CREATE TABLE whatsapp_auto_replies (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  trigger TEXT CHECK (trigger IN ('document_received', 'unknown_number', 'outside_hours')),
  message_template TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Chatbot Simple (FAQ)

Répondre automatiquement aux questions fréquentes.

**Exemples:**
- "Horaires ?" → "Nous sommes ouverts de 9h à 18h du lundi au vendredi."
- "Tarifs ?" → "Nos tarifs débutent à X TND. Contactez-nous pour un devis personnalisé."
- "Rendez-vous ?" → "Pour prendre rendez-vous : [LIEN]"

**Implémentation:**
```typescript
const faqKeywords = [
  { keywords: ['horaires', 'heures', 'ouverture'], response: '...' },
  { keywords: ['tarifs', 'prix', 'honoraires'], response: '...' },
  { keywords: ['rendez-vous', 'rdv', 'consultation'], response: '...' },
]

function getFAQResponse(message: string): string | null {
  const messageLower = message.toLowerCase()

  for (const faq of faqKeywords) {
    if (faq.keywords.some(kw => messageLower.includes(kw))) {
      return faq.response
    }
  }

  return null
}
```

#### Multi-utilisateurs (Cabinets)

Permettre à plusieurs avocats du même cabinet de partager la messagerie WhatsApp.

**Fonctionnalités:**
- Numéro WhatsApp partagé entre avocats
- Assignation automatique client → avocat responsable
- Tableau répartition messages
- Permissions (admin, avocat, assistant)

---

## 📦 Coûts Infrastructure

### Services Additionnels

| Service | Usage | Coût mensuel estimé |
|---------|-------|---------------------|
| **Redis** (Upstash) | Queue + Cache + Rate limiting | 10-20 TND (tier gratuit: 10k commandes/jour) |
| **BullMQ Dashboard** | Monitoring jobs | Gratuit (self-hosted) |
| **Sentry** | Error tracking | 0-30 TND (tier gratuit: 5k events/mois) |
| **Cloudflare CDN** | Cache médias global | 0 TND (tier gratuit largement suffisant) |

**Total estimé : 10-50 TND/mois** (selon volume)

---

## 🎯 Priorisation Roadmap

### Phase 3A : Performance (Critique si > 100 messages/jour)
1. **Queue BullMQ** ✅ (3-4 jours)
   - Décharge webhook
   - Retry automatique
   - Scalabilité

2. **Rate Limiting** ✅ (1-2 jours)
   - Évite dépassement quotas Meta
   - Dashboard limites restantes

### Phase 3B : Monitoring (Recommandé)
3. **Sentry Integration** ⚠️ (1 jour)
   - Alertes automatiques erreurs
   - Traçabilité bugs

4. **Métriques Prometheus** ⏸️ (2 jours)
   - Dashboard Grafana
   - Alertes performance

### Phase 3C : UX Avancée (Optionnel)
5. **Cache Redis Médias** ⏸️ (1 jour)
   - Accès plus rapide
   - Réduction coûts Supabase Storage

6. **Templates Réponses** ⏸️ (2-3 jours)
   - Personnalisation messages
   - Configuration UI

7. **Chatbot FAQ** ⏸️ (3-4 jours)
   - Réponses automatiques simples
   - Réduction charge avocat

8. **Multi-utilisateurs Cabinet** ⏸️ (5-7 jours)
   - Partage numéro WhatsApp
   - Permissions complexes

---

## 📊 Métriques Succès Phase 3

### Performance
- Temps réponse webhook : < 100ms (actuellement ~2-5s)
- Taux retry réussi : > 95%
- Latence traitement message : < 10s (de bout en bout)

### Fiabilité
- Uptime webhook : > 99.9%
- Taux erreurs : < 1%
- Messages perdus : 0

### Scalabilité
- Capacité : > 1000 messages/heure (actuellement ~100/heure max)
- Temps queue : < 30s en charge normale

---

## 🚀 Commencer Phase 3

### Prérequis
- Phase 1 & 2 terminées ✅
- Volume > 50 messages/jour ⏸️ (sinon pas urgent)
- Budget infra : 10-50 TND/mois ⏸️

### Ordre recommandé
1. Queue BullMQ (si volume augmente)
2. Rate Limiting (avant dépassement quotas)
3. Sentry (monitoring erreurs)
4. Cache Redis (optimisation coûts)
5. Features UX (selon demande utilisateurs)

---

**Contact Support** : Si besoin d'aide implémentation Phase 3, documenter cas d'usage et volume actuel.
