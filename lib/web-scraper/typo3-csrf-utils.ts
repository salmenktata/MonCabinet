/**
 * Utilitaires pour le flow CSRF TYPO3
 * Nécessaire pour les sites TYPO3 comme cassation.tn qui utilisent
 * __trustedProperties et __referrer pour la protection CSRF
 */

import * as cheerio from 'cheerio'
import { fetchHtml } from './scraper-service'

/**
 * Tokens CSRF extraits d'un formulaire TYPO3
 */
export interface Typo3CsrfTokens {
  trustedProperties: string
  referrerAction: string
  referrerController: string
  referrerExtension: string
  referrerVendor: string
  formAction: string
}

/**
 * Paramètres de recherche pour la jurisprudence cassation.tn
 */
export interface CassationSearchParams {
  keyword?: string
  dateFrom?: string
  dateTo?: string
  docNum?: string
  theme?: string
}

/**
 * Les 17 catégories juridiques disponibles sur cassation.tn
 */
export const CASSATION_THEMES: Record<string, { ar: string; fr: string }> = {
  'TA': { ar: 'مدني عام', fr: 'Civil Général' },
  'TB': { ar: 'تجاري', fr: 'Commercial' },
  'TC': { ar: 'شخصي', fr: 'Statut Personnel' },
  'TD': { ar: 'اجتماعي', fr: 'Social' },
  'TF': { ar: 'جزائي', fr: 'Pénal' },
  'TG': { ar: 'اجراءات جزائية', fr: 'Procédures Pénales' },
  'TH': { ar: 'اجراءات مدنية', fr: 'Procédures Civiles' },
  'TI': { ar: 'تحكيم', fr: 'Arbitrage' },
  'VT': { ar: 'بيع', fr: 'Vente' },
  'LC': { ar: 'أكرية', fr: 'Baux' },
  'MR': { ar: 'عيني', fr: 'Droits Réels' },
  'UR': { ar: 'استعجالي', fr: 'Référé' },
  'AS': { ar: 'تأمين وحوادث مرور', fr: 'Assurance & Accidents' },
  'MS': { ar: 'إجراءات جماعية', fr: 'Procédures Collectives' },
  'TJ': { ar: 'قانون دولي خاص', fr: 'DIP' },
  'CR': { ar: 'الدوائر المجتمعة', fr: 'Chambres Réunies' },
  'PC': { ar: 'التناسب - الفصل 49', fr: 'Proportionnalité Art. 49' },
}

const CASSATION_BASE_URL = 'http://www.cassation.tn'
const JURISPRUDENCE_URL = `${CASSATION_BASE_URL}/fr/%D9%81%D9%82%D9%87-%D8%A7%D9%84%D9%82%D8%B6%D8%A7%D8%A1/`

/**
 * Extrait les tokens CSRF d'une page TYPO3 contenant un formulaire
 *
 * Flow en 2 étapes:
 * 1. GET la page → Parse le HTML + capture les cookies de session Set-Cookie
 * 2. Utiliser les tokens ET les cookies dans le POST suivant
 *
 * Fix 403 : TYPO3 valide que le POST porte le même cookie de session que le GET initial.
 * fetch() Node.js n'a pas de cookie jar automatique → on capture manuellement les Set-Cookie
 * et on les retransmet dans le header Cookie du POST.
 */
export async function extractCsrfTokens(
  pageUrl: string = JURISPRUDENCE_URL,
  options: { ignoreSSLErrors?: boolean } = {}
): Promise<{ tokens: Typo3CsrfTokens; html: string; sessionCookies?: string } | null> {
  // Fetch natif pour capturer les Set-Cookie headers (fetchHtml ne les expose pas)
  let sslAgent: import('undici').Agent | undefined
  if (options.ignoreSSLErrors !== false) {
    try {
      const { Agent } = await import('undici')
      sslAgent = new Agent({ connect: { rejectUnauthorized: false } })
    } catch {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }
  }

  const fetchInit: RequestInit & { dispatcher?: import('undici').Agent } = {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'follow',
  }
  if (sslAgent) {
    fetchInit.dispatcher = sslAgent
  }

  let rawResponse: Response
  try {
    rawResponse = await fetch(pageUrl, fetchInit as RequestInit)
  } catch (err) {
    console.error('[TYPO3-CSRF] Erreur fetch GET:', err)
    return null
  }

  if (!rawResponse.ok) {
    console.error('[TYPO3-CSRF] GET échoué:', rawResponse.status)
    return null
  }

  // Capturer les cookies de session (Set-Cookie headers)
  // getSetCookie() disponible Node.js 18+ — retourne chaque cookie séparément
  const setCookieHeaders: string[] = typeof rawResponse.headers.getSetCookie === 'function'
    ? rawResponse.headers.getSetCookie()
    : (rawResponse.headers.get('set-cookie') || '').split(/,(?=[^ ])/).filter(Boolean)

  const sessionCookies = setCookieHeaders
    .map(c => c.split(';')[0].trim()) // garder uniquement name=value
    .filter(Boolean)
    .join('; ')

  if (sessionCookies) {
    console.log(`[TYPO3-CSRF] Cookies session capturés: ${sessionCookies.substring(0, 60)}…`)
  }

  const html = await rawResponse.text()

  const $ = cheerio.load(html)
  const form = $('form[name="search"]')

  if (form.length === 0) {
    console.error('[TYPO3-CSRF] Formulaire de recherche non trouvé')
    return null
  }

  // Extraire le token __trustedProperties
  const trustedProperties = form.find('input[name*="__trustedProperties"]').val() as string || ''

  // Extraire les champs __referrer
  const referrerAction = form.find('input[name*="__referrer"][name*="@action"]').val() as string || ''
  const referrerController = form.find('input[name*="__referrer"][name*="@controller"]').val() as string || ''
  const referrerExtension = form.find('input[name*="__referrer"][name*="@extension"]').val() as string || ''
  const referrerVendor = form.find('input[name*="__referrer"][name*="@vendor"]').val() as string || ''

  // Extraire l'action du formulaire
  const formAction = form.attr('action') || pageUrl

  return {
    tokens: {
      trustedProperties,
      referrerAction,
      referrerController,
      referrerExtension,
      referrerVendor,
      formAction: formAction.startsWith('http')
        ? formAction
        : `${CASSATION_BASE_URL}${formAction.startsWith('/') ? '' : '/'}${formAction}`,
    },
    html,
    sessionCookies: sessionCookies || undefined,
  }
}

/**
 * Construit le body URLSearchParams complet pour un POST de recherche TYPO3
 */
export function buildSearchPostBody(
  tokens: Typo3CsrfTokens,
  params: CassationSearchParams = {}
): URLSearchParams {
  const body = new URLSearchParams()

  // Champs de recherche
  body.append('tx_uploadexample_piexample[search][shkeyword]', params.keyword || '')
  body.append('tx_uploadexample_piexample[search][shdocdate1]', params.dateFrom || '')
  body.append('tx_uploadexample_piexample[search][shdocdate2]', params.dateTo || '')
  body.append('tx_uploadexample_piexample[search][shdocnum]', params.docNum || '')
  body.append('tx_uploadexample_piexample[search][shtheme]', params.theme || '')

  // Tokens CSRF TYPO3
  if (tokens.trustedProperties) {
    body.append('tx_uploadexample_piexample[__trustedProperties]', tokens.trustedProperties)
  }
  if (tokens.referrerAction) {
    body.append('tx_uploadexample_piexample[__referrer][@action]', tokens.referrerAction)
  }
  if (tokens.referrerController) {
    body.append('tx_uploadexample_piexample[__referrer][@controller]', tokens.referrerController)
  }
  if (tokens.referrerExtension) {
    body.append('tx_uploadexample_piexample[__referrer][@extension]', tokens.referrerExtension)
  }
  if (tokens.referrerVendor) {
    body.append('tx_uploadexample_piexample[__referrer][@vendor]', tokens.referrerVendor)
  }

  return body
}

/**
 * Recherche de jurisprudence sur cassation.tn
 * Flow complet: GET → Parse tokens → POST → Retourne le HTML des résultats
 */
export async function searchCassationJurisprudence(
  params: CassationSearchParams = {},
  options: { ignoreSSLErrors?: boolean } = {}
): Promise<{
  success: boolean
  html?: string
  resultsCount?: number
  error?: string
}> {
  // Étape 1: GET pour récupérer les tokens CSRF
  const csrfResult = await extractCsrfTokens(JURISPRUDENCE_URL, options)
  if (!csrfResult) {
    return { success: false, error: 'Impossible d\'extraire les tokens CSRF' }
  }

  // Étape 2: Construire le body POST
  const body = buildSearchPostBody(csrfResult.tokens, params)

  // Étape 3: POST de recherche — inclure les cookies de session capturés lors du GET
  const postHeaders: Record<string, string> = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
    'Referer': JURISPRUDENCE_URL,
    'Origin': CASSATION_BASE_URL,
  }
  if (csrfResult.sessionCookies) {
    postHeaders['Cookie'] = csrfResult.sessionCookies
  }

  const result = await fetchHtml(csrfResult.tokens.formAction, {
    method: 'POST',
    body,
    ignoreSSLErrors: options.ignoreSSLErrors ?? true,
    stealthMode: true,
    headers: postHeaders,
  })

  if (!result.success || !result.html) {
    return { success: false, error: result.error || 'Échec du POST' }
  }

  // Vérifier les résultats
  const $ = cheerio.load(result.html)
  const hasError = result.html.includes('Oops, an error occurred')
  if (hasError) {
    return { success: false, error: 'Erreur TYPO3 dans la réponse', html: result.html }
  }

  // Compter les résultats
  const contentArea = $('#wd-content .tx-upload-example')
  const links = contentArea.find('a').length
  const contentLength = contentArea.text().trim().length

  return {
    success: contentLength > 100,
    html: result.html,
    resultsCount: links,
  }
}
