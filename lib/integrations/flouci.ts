/**
 * Client API Flouci Business - Paiements mobiles Tunisie
 *
 * Documentation: https://dev.flouci.com/
 *
 * Flux paiement:
 * 1. Créer paiement → Générer QR code
 * 2. Client scanne QR avec app Flouci
 * 3. Client confirme paiement dans app
 * 4. Webhook notifie plateforme → Marquer facture PAYÉE
 *
 * Commission: 1.5% du montant
 */

const FLOUCI_API_URL = process.env.FLOUCI_API_URL || 'https://developers.flouci.com'
const FLOUCI_APP_TOKEN = process.env.FLOUCI_APP_TOKEN
const FLOUCI_APP_SECRET = process.env.FLOUCI_APP_SECRET

if (!FLOUCI_APP_TOKEN || !FLOUCI_APP_SECRET) {
  console.warn('⚠️ Variables Flouci non configurées (FLOUCI_APP_TOKEN, FLOUCI_APP_SECRET)')
}

export interface FlouciPaymentRequest {
  amount: number // Montant en millimes (1 TND = 1000 millimes)
  success_link?: string
  fail_link?: string
  session_timeout_secs?: number // Défaut: 900 (15 min)
  developer_tracking_id?: string // ID interne (facture_id)
}

export interface FlouciPaymentResponse {
  result: {
    success: boolean
    status?: number
    message?: string
    errors?: string[]
    _link?: string // URL de paiement
    payment_id?: string // ID unique paiement
    qr_code_url?: string // URL image QR code
    deep_link?: string // Deep link app Flouci
  }
}

export interface FlouciPaymentStatus {
  result: {
    success: boolean
    status?: number
    transaction_id?: string
    payment_id?: string
    amount?: number
    amount_in_tnd?: number
    status_code?: string // 'SUCCESS' | 'PENDING' | 'FAILED' | 'EXPIRED'
    developer_tracking_id?: string
    created_at?: string
  }
}

export interface FlouciWebhookPayload {
  payment_id: string
  transaction_id?: string
  amount: number
  status: 'SUCCESS' | 'FAILED' | 'EXPIRED'
  developer_tracking_id?: string
  created_at: string
}

/**
 * Client API Flouci Business
 */
export class FlouciClient {
  private baseURL: string
  private appToken: string
  private appSecret: string

  constructor(
    appToken: string = FLOUCI_APP_TOKEN!,
    appSecret: string = FLOUCI_APP_SECRET!,
    baseURL: string = FLOUCI_API_URL
  ) {
    this.baseURL = baseURL
    this.appToken = appToken
    this.appSecret = appSecret
  }

  /**
   * Headers API Flouci
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'apppublic': this.appToken,
      'appsecret': this.appSecret,
    }
  }

  /**
   * Créer un paiement et générer QR code
   *
   * @param request Détails du paiement
   * @returns Réponse Flouci avec payment_id et QR code URL
   */
  async createPayment(request: FlouciPaymentRequest): Promise<FlouciPaymentResponse> {
    try {
      const response = await fetch(`${this.baseURL}/api/generate_payment`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          app_token: this.appToken,
          app_secret: this.appSecret,
          amount: request.amount,
          accept_card: 'true',
          session_timeout_secs: request.session_timeout_secs || 900, // 15 min défaut
          success_link: request.success_link || `${process.env.NEXT_PUBLIC_APP_URL}/factures?payment=success`,
          fail_link: request.fail_link || `${process.env.NEXT_PUBLIC_APP_URL}/factures?payment=failed`,
          developer_tracking_id: request.developer_tracking_id,
        }),
      })

      if (!response.ok) {
        throw new Error(`Flouci API error: ${response.status} ${response.statusText}`)
      }

      const data: FlouciPaymentResponse = await response.json()

      if (!data.result?.success) {
        throw new Error(`Flouci payment creation failed: ${data.result?.message || 'Unknown error'}`)
      }

      return data
    } catch (error) {
      console.error('Erreur création paiement Flouci:', error)
      throw error
    }
  }

  /**
   * Vérifier le statut d'un paiement
   *
   * @param paymentId ID du paiement Flouci
   * @returns Statut du paiement
   */
  async getPaymentStatus(paymentId: string): Promise<FlouciPaymentStatus> {
    try {
      const response = await fetch(`${this.baseURL}/api/verify_payment/${paymentId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      })

      if (!response.ok) {
        throw new Error(`Flouci API error: ${response.status} ${response.statusText}`)
      }

      const data: FlouciPaymentStatus = await response.json()
      return data
    } catch (error) {
      console.error('Erreur vérification statut Flouci:', error)
      throw error
    }
  }

  /**
   * Générer URL de QR code Flouci pour affichage
   *
   * @param paymentId ID du paiement
   * @returns URL de l'image QR code
   */
  getQRCodeURL(paymentId: string): string {
    return `${this.baseURL}/qr_code/${paymentId}`
  }

  /**
   * Générer deep link pour ouvrir app Flouci directement
   *
   * @param paymentId ID du paiement
   * @returns Deep link Flouci
   */
  getDeepLink(paymentId: string): string {
    return `flouci://pay/${paymentId}`
  }

  /**
   * Valider signature webhook Flouci (si configuré)
   *
   * @param payload Payload webhook
   * @param signature Signature reçue dans header
   * @returns true si signature valide
   */
  validateWebhookSignature(payload: string, signature: string): boolean {
    // TODO: Implémenter validation HMAC si Flouci supporte
    // Pour l'instant, vérifier que le payload contient les champs requis
    try {
      const data = JSON.parse(payload)
      return !!(data.payment_id && data.status)
    } catch {
      return false
    }
  }
}

/**
 * Instance singleton client Flouci
 */
export const flouciClient = new FlouciClient()

/**
 * Utilitaires conversions montants
 */
export const FlouciUtils = {
  /**
   * Convertir TND en millimes (1 TND = 1000 millimes)
   */
  tndToMillimes(tnd: number): number {
    return Math.round(tnd * 1000)
  },

  /**
   * Convertir millimes en TND
   */
  millimesToTND(millimes: number): number {
    return millimes / 1000
  },

  /**
   * Calculer commission Flouci (1.5%)
   */
  calculerCommission(montantTND: number): number {
    return Math.round(montantTND * 0.015 * 1000) / 1000 // 1.5% arrondi à 3 décimales
  },

  /**
   * Calculer montant net après commission
   */
  calculerMontantNet(montantTND: number): number {
    const commission = this.calculerCommission(montantTND)
    return Math.round((montantTND - commission) * 1000) / 1000
  },

  /**
   * Formater montant Flouci pour affichage
   */
  formaterMontant(montantTND: number): string {
    return `${montantTND.toFixed(3)} TND`
  },
}

/**
 * Mapper statut Flouci vers statut base de données
 */
export function mapperStatutFlouci(statusCode: string): string {
  const mapping: Record<string, string> = {
    SUCCESS: 'completed',
    PENDING: 'initiated',
    FAILED: 'failed',
    EXPIRED: 'expired',
  }
  return mapping[statusCode] || 'pending'
}
