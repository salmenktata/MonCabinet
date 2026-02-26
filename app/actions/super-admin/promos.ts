'use server'

import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'

async function checkSuperAdminAccess(): Promise<string | null> {
  const session = await getSession()
  if (!session?.user?.id) return null

  const result = await query('SELECT role FROM users WHERE id = $1', [session.user.id])
  if (result.rows[0]?.role !== 'super_admin') return null

  return session.user.id
}

export async function createPromoAction(formData: FormData) {
  const adminId = await checkSuperAdminAccess()
  if (!adminId) return { error: 'Accès refusé' }

  const code = (formData.get('code') as string)?.toUpperCase().trim()
  const discount_type = formData.get('discount_type') as string
  const discount_value = parseInt(formData.get('discount_value') as string)
  const applies_to = (formData.get('applies_to') as string) || 'all'
  const max_uses_raw = formData.get('max_uses') as string
  const max_uses = max_uses_raw && max_uses_raw !== '' ? parseInt(max_uses_raw) : null
  const expires_at_raw = formData.get('expires_at') as string
  const expires_at = expires_at_raw && expires_at_raw !== '' ? new Date(expires_at_raw).toISOString() : null

  if (!code || code.length < 3 || code.length > 30) {
    return { error: 'Code invalide (3-30 caractères)' }
  }
  if (!['percent', 'fixed'].includes(discount_type)) {
    return { error: 'Type de remise invalide' }
  }
  if (isNaN(discount_value) || discount_value <= 0) {
    return { error: 'Valeur de remise invalide' }
  }
  if (discount_type === 'percent' && discount_value > 100) {
    return { error: 'Remise en % ne peut dépasser 100' }
  }

  try {
    await query(
      `INSERT INTO promo_codes (code, discount_type, discount_value, applies_to, max_uses, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [code, discount_type, discount_value, applies_to, max_uses, expires_at, adminId]
    )
    revalidatePath('/super-admin/promos')
    return { success: true }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      return { error: 'Ce code existe déjà' }
    }
    return { error: 'Erreur lors de la création' }
  }
}

export async function togglePromoAction(promoId: string, isActive: boolean) {
  const adminId = await checkSuperAdminAccess()
  if (!adminId) return { error: 'Accès refusé' }

  await query(
    'UPDATE promo_codes SET is_active = $1 WHERE id = $2',
    [isActive, promoId]
  )

  revalidatePath('/super-admin/promos')
  return { success: true }
}

export async function deletePromoAction(promoId: string) {
  const adminId = await checkSuperAdminAccess()
  if (!adminId) return { error: 'Accès refusé' }

  // Sécurité : ne supprimer que si jamais utilisé
  const result = await query(
    'SELECT used_count FROM promo_codes WHERE id = $1',
    [promoId]
  )

  if (result.rows[0]?.used_count > 0) {
    // Désactiver plutôt que supprimer si déjà utilisé
    await query('UPDATE promo_codes SET is_active = false WHERE id = $1', [promoId])
  } else {
    await query('DELETE FROM promo_codes WHERE id = $1', [promoId])
  }

  revalidatePath('/super-admin/promos')
  return { success: true }
}
