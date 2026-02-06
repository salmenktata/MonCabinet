/**
 * Client PostgreSQL direct pour remplacer Supabase
 *
 * Utilise pg.Pool pour gérer les connexions de manière efficace.
 * Compatible avec le déploiement VPS Docker.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'

// Pool de connexions singleton
let pool: Pool | null = null

/**
 * Obtenir ou créer le pool de connexions PostgreSQL
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20, // Maximum 20 connexions
      idleTimeoutMillis: 30000, // Fermer connexions inactives après 30s
      connectionTimeoutMillis: 5000, // Timeout connexion 5s (fail fast)
      statement_timeout: 10000, // Timeout requêtes 10s
      query_timeout: 10000, // Timeout queries 10s
      ssl: process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
    })

    // Gestion des erreurs du pool
    pool.on('error', (err) => {
      console.error('Erreur inattendue du pool PostgreSQL:', err)
    })

    // Log pour debug (désactiver en production)
    if (process.env.NODE_ENV !== 'production') {
      pool.on('connect', () => {
        console.log('✅ Nouvelle connexion PostgreSQL établie')
      })
    }
  }

  return pool
}

/**
 * Exécuter une requête SQL simple
 *
 * @example
 * const result = await query('SELECT * FROM clients WHERE id = $1', [clientId])
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool()
  const start = Date.now()

  try {
    const result = await pool.query<T>(text, params)

    // Log performance (désactiver en production)
    if (process.env.NODE_ENV !== 'production') {
      const duration = Date.now() - start
      console.log('⚡ Requête exécutée en', duration, 'ms:', text.substring(0, 100))
    }

    return result
  } catch (error) {
    console.error('❌ Erreur requête PostgreSQL:', error)
    console.error('Requête:', text)
    console.error('Params:', params)
    throw error
  }
}

/**
 * Obtenir un client pour une transaction
 *
 * @example
 * const client = await getClient()
 * try {
 *   await client.query('BEGIN')
 *   await client.query('INSERT INTO ...')
 *   await client.query('UPDATE ...')
 *   await client.query('COMMIT')
 * } catch (e) {
 *   await client.query('ROLLBACK')
 *   throw e
 * } finally {
 *   client.release()
 * }
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool()
  return await pool.connect()
}

/**
 * Exécuter une transaction
 *
 * @example
 * await transaction(async (client) => {
 *   await client.query('INSERT INTO clients ...')
 *   await client.query('INSERT INTO dossiers ...')
 * })
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Fermer le pool (pour cleanup graceful)
 * À appeler lors du shutdown de l'application
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.log('✅ Pool PostgreSQL fermé')
  }
}

/**
 * Vérifier la santé de la connexion PostgreSQL
 * Utilisé par le health check endpoint
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as health')
    return result.rows[0]?.health === 1
  } catch (error) {
    console.error('❌ Health check PostgreSQL échoué:', error)
    return false
  }
}

/**
 * Obtenir l'ID utilisateur depuis le contexte de session
 * Remplace auth.uid() de Supabase pour les RLS policies
 *
 * Note: Cette fonction doit être appelée avec le contexte NextAuth
 * Elle retourne l'ID de l'utilisateur connecté ou null
 */
export function getCurrentUserId(session: any): string | null {
  return session?.user?.id || null
}

/**
 * Helpers pour requêtes courantes
 */
export const db = {
  query,
  getClient,
  transaction,
  healthCheck,
  closePool,

  /**
   * SELECT avec Row Level Security simulée
   * Filtre automatiquement par user_id si la colonne existe
   */
  async selectWithRLS<T extends QueryResultRow = any>(
    table: string,
    userId: string | null,
    whereClause?: string,
    params?: any[]
  ): Promise<T[]> {
    if (!userId) {
      throw new Error('User ID requis pour RLS')
    }

    const where = whereClause
      ? `WHERE user_id = $1 AND (${whereClause})`
      : `WHERE user_id = $1`

    const allParams = whereClause ? [userId, ...(params || [])] : [userId]

    const result = await query<T>(
      `SELECT * FROM ${table} ${where}`,
      allParams
    )

    return result.rows
  },

  /**
   * INSERT avec retour des données insérées
   */
  async insert<T extends QueryResultRow = any>(
    table: string,
    data: Record<string, any>
  ): Promise<T> {
    const keys = Object.keys(data)
    const values = Object.values(data)
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')

    const result = await query<T>(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    )

    return result.rows[0]
  },

  /**
   * UPDATE avec retour des données mises à jour
   */
  async update<T extends QueryResultRow = any>(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<T> {
    const keys = Object.keys(data)
    const values = Object.values(data)
    const setClause = keys.map((key, i) => `${key} = $${i + 2}`).join(', ')

    const result = await query<T>(
      `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    )

    return result.rows[0]
  },

  /**
   * DELETE avec vérification RLS
   */
  async delete(table: string, id: string, userId: string | null): Promise<boolean> {
    if (!userId) {
      throw new Error('User ID requis pour RLS')
    }

    const result = await query(
      `DELETE FROM ${table} WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )

    return (result.rowCount || 0) > 0
  },
}

export default db
