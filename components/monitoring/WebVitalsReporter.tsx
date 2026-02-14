/**
 * Web Vitals Reporter
 *
 * Collecte et rapporte les Core Web Vitals en temps réel :
 * - LCP (Largest Contentful Paint) : < 2.5s
 * - CLS (Cumulative Layout Shift) : < 0.1
 * - TTFB (Time to First Byte) : < 600ms
 * - INP (Interaction to Next Paint) : < 200ms (remplace FID depuis v4)
 * - FCP (First Contentful Paint) : < 1.8s
 *
 * En développement : Log console
 * En production : Peut être envoyé à analytics
 */

'use client'

import { useEffect } from 'react'
import { onCLS, onLCP, onTTFB, onINP, onFCP, type Metric } from 'web-vitals'

const THRESHOLDS = {
  LCP: 2500, // 2.5s
  CLS: 0.1,
  TTFB: 600, // 600ms
  INP: 200, // 200ms
  FCP: 1800, // 1.8s
}

function getMetricStatus(metric: Metric): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[metric.name as keyof typeof THRESHOLDS]

  if (!threshold) return 'good'

  const value = metric.value

  // Pour CLS, les seuils sont différents
  if (metric.name === 'CLS') {
    if (value <= 0.1) return 'good'
    if (value <= 0.25) return 'needs-improvement'
    return 'poor'
  }

  // Pour les autres métriques (temps)
  if (value <= threshold) return 'good'
  if (value <= threshold * 1.5) return 'needs-improvement'
  return 'poor'
}

function formatMetricValue(metric: Metric): string {
  // CLS est sans unité
  if (metric.name === 'CLS') {
    return metric.value.toFixed(3)
  }

  // Autres métriques sont en millisecondes
  return `${Math.round(metric.value)}ms`
}

function logMetric(metric: Metric) {
  const status = getMetricStatus(metric)
  const value = formatMetricValue(metric)

  const emoji = {
    good: '✅',
    'needs-improvement': '⚠️',
    poor: '❌',
  }[status]

  const color = {
    good: 'color: green; font-weight: bold',
    'needs-improvement': 'color: orange; font-weight: bold',
    poor: 'color: red; font-weight: bold',
  }[status]

  console.log(
    `%c[Web Vitals] ${emoji} ${metric.name}: ${value}`,
    color,
    {
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType,
    }
  )

  // Alertes pour métriques critiques
  if (status === 'poor') {
    console.warn(
      `[Web Vitals] 🚨 ${metric.name} critique !`,
      `Valeur: ${value} (seuil: ${THRESHOLDS[metric.name as keyof typeof THRESHOLDS]})`
    )
  }
}

function sendToAnalytics(metric: Metric) {
  // TODO: Implémenter envoi vers analytics (Google Analytics, Plausible, etc.)
  /*
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', metric.name, {
      event_category: 'Web Vitals',
      value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      event_label: metric.id,
      non_interaction: true,
    })
  }
  */

  // Exemple avec API personnalisée
  /*
  fetch('/api/analytics/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      navigationType: metric.navigationType,
    }),
    keepalive: true, // Important pour envoyer même si page se ferme
  }).catch(console.error)
  */
}

function reportMetric(metric: Metric) {
  // Log en développement
  if (process.env.NODE_ENV === 'development') {
    logMetric(metric)
  }

  // Envoyer à analytics en production
  if (process.env.NODE_ENV === 'production') {
    sendToAnalytics(metric)
  }
}

export function WebVitalsReporter() {
  useEffect(() => {
    // Enregistrer les callbacks pour chaque métrique
    // Note: web-vitals v4+ ne retourne plus de cleanup functions
    try {
      onLCP(reportMetric)
      onCLS(reportMetric)
      onTTFB(reportMetric)
      onINP(reportMetric)
      onFCP(reportMetric)

      // Log initial en dev
      if (process.env.NODE_ENV === 'development') {
        console.log(
          '%c[Web Vitals] 📊 Monitoring actif',
          'color: blue; font-weight: bold'
        )
        console.log('Seuils :', THRESHOLDS)
      }
    } catch (error) {
      console.error('[Web Vitals] Erreur initialisation:', error)
    }
  }, [])

  // Ce composant ne rend rien
  return null
}
