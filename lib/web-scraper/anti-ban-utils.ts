/**
 * Détection de bannissement et randomisation
 */

export interface BanDetectionResult {
  isBanned: boolean
  reason?: string
  confidence: 'low' | 'medium' | 'high'
  retryAfterMs?: number
}

export function detectBan(
  html: string,
  statusCode?: number,
  finalUrl?: string
): BanDetectionResult {
  // 1. Status codes évidents
  if (statusCode === 403) {
    return {
      isBanned: true,
      reason: 'HTTP 403 Forbidden',
      confidence: 'high',
      retryAfterMs: 3600000, // 1 heure
    }
  }

  // 2. Détection de captcha (haute confiance)
  // Note: g-recaptcha v3 "invisible" (Elementor forms) est exclu — ce n'est pas un ban
  const captchaPatterns = [
    'cf-captcha-container', // Cloudflare challenge
    'h-captcha',            // hCaptcha challenge
    'captcha-box',
    'challenge-form',
    'class="g-recaptcha"',  // reCAPTCHA v2 visible (challenge interactif uniquement)
  ]

  // Exclure le reCAPTCHA v3 invisible (widget de formulaire, pas un challenge)
  const hasInvisibleRecaptcha = html.includes('data-size="invisible"') || html.includes("data-size='invisible'")
  const hasCaptchaChallenge = captchaPatterns.some(pattern => html.includes(pattern))

  if (hasCaptchaChallenge && !hasInvisibleRecaptcha) {
    return {
      isBanned: true,
      reason: 'Captcha détecté',
      confidence: 'high',
      retryAfterMs: 7200000, // 2 heures
    }
  }

  // 3. Messages de blocage (confiance moyenne)
  const banMessages = [
    /access\s+denied/i,
    /you\s+have\s+been\s+blocked/i,
    /too\s+many\s+requests/i,
    /rate\s+limit\s+exceeded/i,
    /temporarily\s+(blocked|unavailable)/i,
    /suspicious\s+activity/i,
  ]

  if (banMessages.some(pattern => pattern.test(html))) {
    return {
      isBanned: true,
      reason: 'Message de blocage détecté',
      confidence: 'medium',
      retryAfterMs: 3600000,
    }
  }

  // 4. Redirections suspectes
  if (finalUrl && /\/(blocked|captcha|access-denied|error)/i.test(finalUrl)) {
    return {
      isBanned: true,
      reason: 'Redirection vers page de blocage',
      confidence: 'medium',
      retryAfterMs: 3600000,
    }
  }

  // 5. Contenu vide ou quasi-vide (confiance faible - peut être légitime)
  if (html.length < 100 && statusCode === 200) {
    return {
      isBanned: false, // Ne pas conclure au bannissement
      reason: 'Contenu suspect (vide)',
      confidence: 'low',
    }
  }

  return { isBanned: false, confidence: 'low' }
}

export function getRandomDelay(baseDelayMs: number, variance: number = 0.2): number {
  const min = baseDelayMs * (1 - variance)
  const max = baseDelayMs * (1 + variance)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function shouldAddLongPause(probability: number = 0.05): boolean {
  return Math.random() < probability
}

/**
 * Pool de User-Agents pour rotation
 */
export const USER_AGENT_POOL = [
  // Bot déclaré (par défaut)
  'QadhyaBot/1.0 (+https://qadhya.tn/bot)',

  // Browsers réalistes (mode stealth)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
]

export function selectUserAgent(stealthMode: boolean = false, customUserAgent?: string): string {
  if (customUserAgent) {
    return customUserAgent
  }

  if (stealthMode) {
    // Exclure le bot, choisir un browser aléatoire
    const browsers = USER_AGENT_POOL.slice(1)
    return browsers[Math.floor(Math.random() * browsers.length)]
  }

  return USER_AGENT_POOL[0] // Bot par défaut
}

/**
 * Génère des headers HTTP réalistes
 */
export function getBrowserHeaders(url: string, referrer?: string): Record<string, string> {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en-US;q=0.7,en;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referrer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    ...(referrer && { 'Referer': referrer }),
  }
}
