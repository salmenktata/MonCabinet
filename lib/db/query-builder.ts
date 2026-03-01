/**
 * Utilitaire de construction de clauses WHERE dynamiques pour PostgreSQL.
 * Évite la duplication du pattern boilerplate dans les pages super-admin.
 */

type ParamValue = string | number | boolean

interface FilterCondition {
  condition: boolean
  sql: string      // ex: "status = ?" ou "role = ?"
  value: ParamValue
}

interface WhereResult {
  whereClause: string
  params: ParamValue[]
  nextIndex: number
}

/**
 * Construit une clause WHERE PostgreSQL à partir de conditions dynamiques.
 *
 * @param filters - Tableau de conditions { condition, sql, value }
 * @param startIndex - Index de départ pour les paramètres ($1, $2...), défaut: 1
 * @param baseClause - Clause de base, défaut: 'WHERE 1=1'
 *
 * @example
 * const { whereClause, params, nextIndex } = buildDynamicWhere([
 *   { condition: status !== 'all', sql: 'status = ?', value: status },
 *   { condition: role !== 'all', sql: 'role = ?', value: role },
 * ])
 * // whereClause: "WHERE 1=1 AND status = $1 AND role = $2"
 * // params: ['pending', 'admin']
 * // nextIndex: 3
 */
export function buildDynamicWhere(
  filters: FilterCondition[],
  startIndex: number = 1,
  baseClause: string = 'WHERE 1=1'
): WhereResult {
  let whereClause = baseClause
  const params: ParamValue[] = []
  let paramIndex = startIndex

  for (const filter of filters) {
    if (!filter.condition) continue
    const sql = filter.sql.replace('?', `$${paramIndex}`)
    whereClause += ` AND ${sql}`
    params.push(filter.value)
    paramIndex++
  }

  return { whereClause, params, nextIndex: paramIndex }
}
