/**
 * Service d'alertes email pour monitoring KB
 *
 * Envoie des alertes email via Brevo pour :
 * - Budget OpenAI critique (>80% ou <$2 restant)
 * - Échecs importants (>50 docs avec score=50)
 * - Taux d'erreur batch élevé
 *
 * Prévention spam : Max 1 email par alerte par 6h (cache Redis)
 */

import { db } from '@/lib/db/postgres'
import { getRedisClient } from '@/lib/cache/redis'

const BREVO_API_KEY = process.env.BREVO_API_KEY
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'admin@qadhya.tn'
const MONTHLY_BUDGET_USD = 10.0

interface AlertLevel {
  level: 'warning' | 'critical'
  title: string
  message: string
  metrics: {
    budgetUsed?: number
    budgetRemaining?: number
    failures?: number
    errorRate?: number
    analyzed24h?: number
    analyzed7d?: number
  }
  recommendations: string[]
}

interface MonitoringMetrics {
  budget: {
    estimatedCostUsd: number
    remainingUsd: number
    percentUsed: number
    openaiDocuments: number
  }
  failures: {
    total: number
    shortDocs: number
    longDocs: number
  }
  global: {
    totalActive: number
    totalAnalyzed: number
    coverage: number
  }
  progress: {
    analyzed24h: number
    analyzed7d: number
  }
}

/**
 * Récupérer les métriques de monitoring
 */
async function getMetrics(): Promise<MonitoringMetrics> {
  // Stats globales KB
  const globalStatsResult = await db.query<{
    total_active: number
    total_analyzed: number
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE is_active = true) as total_active,
      COUNT(*) FILTER (WHERE is_active = true AND quality_score IS NOT NULL) as total_analyzed
    FROM knowledge_base
  `)

  const globalStats = globalStatsResult.rows[0]

  // Usage OpenAI
  const openaiUsageResult = await db.query<{
    openai_count: number
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE quality_llm_provider = 'openai') as openai_count
    FROM knowledge_base
    WHERE is_active = true
      AND quality_score IS NOT NULL
      AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
  `)

  const openaiUsage = openaiUsageResult.rows[0]

  // Calcul coût OpenAI (gpt-4o-mini)
  const avgInputTokens = 500
  const avgOutputTokens = 200
  const costPerDoc = (avgInputTokens * 0.00015 + avgOutputTokens * 0.0006) / 1000
  const estimatedCostUsd = (openaiUsage.openai_count || 0) * costPerDoc
  const budgetRemaining = MONTHLY_BUDGET_USD - estimatedCostUsd
  const percentUsed = (estimatedCostUsd / MONTHLY_BUDGET_USD) * 100

  // Échecs
  const failuresResult = await db.query<{
    total_failures: number
    short_failures: number
    long_failures: number
  }>(`
    SELECT
      COUNT(*) as total_failures,
      COUNT(*) FILTER (WHERE LENGTH(COALESCE(full_text, '')) < 500) as short_failures,
      COUNT(*) FILTER (WHERE LENGTH(COALESCE(full_text, '')) >= 500) as long_failures
    FROM knowledge_base
    WHERE is_active = true
      AND quality_score = 50
  `)

  const failures = failuresResult.rows[0]

  // Progression batch (24h et 7j)
  const progressResult = await db.query<{
    analyzed_24h: number
    analyzed_7d: number
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE quality_analyzed_at >= NOW() - INTERVAL '24 hours') as analyzed_24h,
      COUNT(*) FILTER (WHERE quality_analyzed_at >= NOW() - INTERVAL '7 days') as analyzed_7d
    FROM knowledge_base
    WHERE is_active = true
      AND quality_score IS NOT NULL
  `)

  const progress = progressResult.rows[0]

  return {
    budget: {
      estimatedCostUsd,
      remainingUsd: budgetRemaining,
      percentUsed,
      openaiDocuments: openaiUsage.openai_count || 0,
    },
    failures: {
      total: failures.total_failures || 0,
      shortDocs: failures.short_failures || 0,
      longDocs: failures.long_failures || 0,
    },
    global: {
      totalActive: globalStats.total_active || 0,
      totalAnalyzed: globalStats.total_analyzed || 0,
      coverage: globalStats.total_active > 0
        ? (globalStats.total_analyzed / globalStats.total_active) * 100
        : 0,
    },
    progress: {
      analyzed24h: progress.analyzed_24h || 0,
      analyzed7d: progress.analyzed_7d || 0,
    },
  }
}

/**
 * Détecter les alertes nécessitant notification
 */
function detectAlerts(metrics: MonitoringMetrics): AlertLevel[] {
  const alerts: AlertLevel[] = []

  // Alerte 1 : Budget OpenAI critique
  if (metrics.budget.percentUsed >= 90) {
    alerts.push({
      level: 'critical',
      title: 'Budget OpenAI CRITIQUE',
      message: `Budget OpenAI à ${metrics.budget.percentUsed.toFixed(1)}% (${metrics.budget.remainingUsd.toFixed(2)}$ restant)`,
      metrics: {
        budgetUsed: metrics.budget.percentUsed,
        budgetRemaining: metrics.budget.remainingUsd,
      },
      recommendations: [
        'Basculer immédiatement sur Ollama pour l\'analyse KB',
        'Vérifier la consommation OpenAI avec npm run monitor:openai',
        'Réduire le batch size dans le script overnight',
      ],
    })
  } else if (metrics.budget.percentUsed >= 80 || metrics.budget.remainingUsd < 2) {
    alerts.push({
      level: 'warning',
      title: 'Budget OpenAI Élevé',
      message: `Budget OpenAI à ${metrics.budget.percentUsed.toFixed(1)}% (${metrics.budget.remainingUsd.toFixed(2)}$ restant)`,
      metrics: {
        budgetUsed: metrics.budget.percentUsed,
        budgetRemaining: metrics.budget.remainingUsd,
      },
      recommendations: [
        'Surveiller la consommation quotidienne',
        'Envisager Ollama pour documents non critiques',
        'Vérifier le script cron-monitor-openai.sh',
      ],
    })
  }

  // Alerte 2 : Échecs importants
  if (metrics.failures.total >= 100) {
    alerts.push({
      level: 'critical',
      title: 'Échecs Analyse KB Importants',
      message: `${metrics.failures.total} documents avec score=50 (${metrics.failures.shortDocs} courts, ${metrics.failures.longDocs} longs)`,
      metrics: {
        failures: metrics.failures.total,
      },
      recommendations: [
        'Investiguer les échecs avec npm run audit:rag',
        'Vérifier les logs des providers (Gemini, Ollama)',
        'Réinitialiser les échecs courts si Gemini problématique',
      ],
    })
  } else if (metrics.failures.total >= 50) {
    alerts.push({
      level: 'warning',
      title: 'Échecs Analyse KB',
      message: `${metrics.failures.total} documents avec score=50 nécessitent investigation`,
      metrics: {
        failures: metrics.failures.total,
      },
      recommendations: [
        'Analyser les échecs avec le dashboard /super-admin/monitoring?tab=kb-quality',
        'Vérifier si les échecs sont concentrés sur un provider',
      ],
    })
  }

  // Alerte 3 : Batch stagnant (<100 docs analysés en 24h)
  const BATCH_MIN_DAILY = 100 // Objectif minimum : 100 docs/jour
  const BATCH_WARNING_DAILY = 50 // Warning si < 50 docs/jour

  if (metrics.progress.analyzed24h === 0) {
    // Critical : Aucun document analysé en 24h = batch probablement arrêté
    alerts.push({
      level: 'critical',
      title: 'Batch Overnight ARRÊTÉ',
      message: `Aucun document analysé depuis 24h - Batch probablement arrêté`,
      metrics: {
        analyzed24h: metrics.progress.analyzed24h,
        analyzed7d: metrics.progress.analyzed7d,
      },
      recommendations: [
        'Vérifier si le batch overnight tourne : ssh root@qadhya.tn "ps aux | grep batch"',
        'Consulter les logs batch : tail -f /tmp/batch-overnight-live.log',
        'Redémarrer le batch si nécessaire',
        'Vérifier quotas providers (Ollama, Gemini, OpenAI)',
      ],
    })
  } else if (metrics.progress.analyzed24h < BATCH_WARNING_DAILY) {
    // Critical : Très faible activité (<50 docs/jour)
    alerts.push({
      level: 'critical',
      title: 'Batch Overnight Quasi-Stagnant',
      message: `Seulement ${metrics.progress.analyzed24h} docs analysés en 24h (objectif: >${BATCH_MIN_DAILY}/jour)`,
      metrics: {
        analyzed24h: metrics.progress.analyzed24h,
        analyzed7d: metrics.progress.analyzed7d,
      },
      recommendations: [
        'Vérifier erreurs batch : tail -f /tmp/batch-overnight-live.log',
        'Consulter dashboard KB : /super-admin/monitoring?tab=kb-quality',
        'Vérifier si providers disponibles (Gemini timeout? Ollama down?)',
        `Augmenter batch size si performance OK`,
      ],
    })
  } else if (metrics.progress.analyzed24h < BATCH_MIN_DAILY) {
    // Warning : Activité faible mais acceptable (50-100 docs/jour)
    alerts.push({
      level: 'warning',
      title: 'Batch Overnight Ralenti',
      message: `${metrics.progress.analyzed24h} docs analysés en 24h (objectif: >${BATCH_MIN_DAILY}/jour)`,
      metrics: {
        analyzed24h: metrics.progress.analyzed24h,
        analyzed7d: metrics.progress.analyzed7d,
      },
      recommendations: [
        'Surveiller progression sur 48h',
        'Vérifier logs batch pour détecter ralentissements',
        `Moyenne 7j : ${(metrics.progress.analyzed7d / 7).toFixed(0)} docs/jour`,
        'Envisager optimisation si tendance persiste',
      ],
    })
  }

  return alerts
}

/**
 * Vérifier si une alerte a déjà été envoyée récemment
 * @param alertKey - Clé unique de l'alerte
 * @returns true si l'alerte peut être envoyée
 */
async function canSendAlert(alertKey: string): Promise<boolean> {
  const cacheKey = `alert:sent:${alertKey}`

  try {
    const redis = await getRedisClient()
    if (!redis) {
      console.warn('[Alert] Redis non disponible, skip cache anti-spam')
      return true
    }

    const lastSent = await redis.get(cacheKey)

    if (lastSent) {
      // Alerte déjà envoyée dans les 6 dernières heures
      return false
    }

    return true
  } catch (error) {
    // Si Redis indisponible, permettre l'envoi d'alerte
    console.warn('[Alert] Redis indisponible, skip cache anti-spam')
    return true
  }
}

/**
 * Marquer une alerte comme envoyée (cache 6h)
 */
async function markAlertSent(alertKey: string): Promise<void> {
  try {
    const redis = await getRedisClient()
    if (!redis) {
      console.warn('[Alert] Redis non disponible, impossible de marquer alerte comme envoyée')
      return
    }

    const cacheKey = `alert:sent:${alertKey}`
    await redis.set(cacheKey, new Date().toISOString(), { EX: 6 * 60 * 60 }) // 6h
  } catch (error) {
    console.warn('[Alert] Redis indisponible, impossible de marquer alerte comme envoyée')
  }
}

/**
 * Envoyer un email d'alerte via Brevo
 */
async function sendAlertEmail(alert: AlertLevel): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.warn('[Alert] BREVO_API_KEY non configuré, email non envoyé')
    return false
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: 'Qadhya Monitoring',
          email: 'noreply@qadhya.tn',
        },
        to: [
          {
            email: ALERT_EMAIL,
            name: 'Admin',
          },
        ],
        subject: `[${alert.level.toUpperCase()}] ${alert.title}`,
        htmlContent: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header {
                background: ${alert.level === 'critical' ? '#dc2626' : '#f59e0b'};
                color: white;
                padding: 20px;
                border-radius: 8px 8px 0 0;
              }
              .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
              .metric {
                background: white;
                padding: 15px;
                margin: 10px 0;
                border-radius: 6px;
                border-left: 4px solid ${alert.level === 'critical' ? '#dc2626' : '#f59e0b'};
              }
              .recommendations { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; }
              .recommendations li { margin: 8px 0; }
              .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">${alert.level === 'critical' ? '🚨' : '⚠️'} ${alert.title}</h1>
              </div>
              <div class="content">
                <p style="font-size: 16px; margin-bottom: 20px;">${alert.message}</p>

                ${Object.keys(alert.metrics).length > 0 ? `
                  <div class="metric">
                    <h3 style="margin-top: 0;">📊 Métriques</h3>
                    <ul style="margin: 0; padding-left: 20px;">
                      ${alert.metrics.budgetUsed ? `<li><strong>Budget utilisé :</strong> ${alert.metrics.budgetUsed.toFixed(1)}%</li>` : ''}
                      ${alert.metrics.budgetRemaining !== undefined ? `<li><strong>Budget restant :</strong> $${alert.metrics.budgetRemaining.toFixed(2)}</li>` : ''}
                      ${alert.metrics.failures ? `<li><strong>Échecs :</strong> ${alert.metrics.failures} documents</li>` : ''}
                      ${alert.metrics.errorRate ? `<li><strong>Taux d'erreur :</strong> ${alert.metrics.errorRate.toFixed(1)}%</li>` : ''}
                      ${alert.metrics.analyzed24h !== undefined ? `<li><strong>Analysés 24h :</strong> ${alert.metrics.analyzed24h} documents</li>` : ''}
                      ${alert.metrics.analyzed7d !== undefined ? `<li><strong>Analysés 7j :</strong> ${alert.metrics.analyzed7d} documents (${(alert.metrics.analyzed7d / 7).toFixed(0)}/jour)</li>` : ''}
                    </ul>
                  </div>
                ` : ''}

                ${alert.recommendations.length > 0 ? `
                  <div class="recommendations">
                    <h3 style="margin-top: 0;">💡 Actions Recommandées</h3>
                    <ul style="margin: 0; padding-left: 20px;">
                      ${alert.recommendations.map(r => `<li>${r}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}

                <div style="margin-top: 20px; text-align: center;">
                  <a href="https://qadhya.tn/super-admin/monitoring?tab=kb-quality"
                     style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    📈 Voir Dashboard Monitoring
                  </a>
                </div>

                <div class="footer">
                  <p>Email envoyé automatiquement par Qadhya Monitoring System</p>
                  <p>Timestamp : ${new Date().toLocaleString('fr-FR')}</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[Alert] Erreur envoi email Brevo:', error)
      return false
    }

    console.log(`[Alert] Email envoyé avec succès : ${alert.title}`)
    return true

  } catch (error: any) {
    console.error('[Alert] Erreur envoi email:', error.message)
    return false
  }
}

/**
 * Vérifier et envoyer les alertes nécessaires
 */
export async function checkAndSendAlerts(): Promise<{
  success: boolean
  alertsDetected: number
  alertsSent: number
  alerts: AlertLevel[]
}> {
  try {
    console.log('[Alert] Démarrage vérification alertes...')

    // Récupérer métriques
    const metrics = await getMetrics()

    // Détecter alertes
    const alerts = detectAlerts(metrics)

    console.log(`[Alert] ${alerts.length} alerte(s) détectée(s)`)

    let alertsSent = 0

    // Envoyer chaque alerte (si pas déjà envoyée récemment)
    for (const alert of alerts) {
      const alertKey = `${alert.level}:${alert.title}`

      if (await canSendAlert(alertKey)) {
        const sent = await sendAlertEmail(alert)
        if (sent) {
          await markAlertSent(alertKey)
          alertsSent++
        }
      } else {
        console.log(`[Alert] Alerte "${alert.title}" déjà envoyée récemment, skip`)
      }
    }

    return {
      success: true,
      alertsDetected: alerts.length,
      alertsSent,
      alerts,
    }

  } catch (error: any) {
    console.error('[Alert] Erreur vérification alertes:', error)
    return {
      success: false,
      alertsDetected: 0,
      alertsSent: 0,
      alerts: [],
    }
  }
}
