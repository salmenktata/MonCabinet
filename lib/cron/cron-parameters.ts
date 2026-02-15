/**
 * Configuration des paramètres disponibles pour chaque cron
 * Utilisé pour générer les formulaires dynamiques et valider les entrées
 */

export type ParameterType = 'number' | 'select' | 'text' | 'boolean' | 'multiselect'

export interface ParameterOption {
  value: string
  label: string
  description?: string
}

export interface CronParameter {
  name: string // Nom technique (ex: 'batchSize')
  label: string // Label affiché à l'utilisateur
  description: string // Aide contextuelle
  type: ParameterType
  required: boolean
  defaultValue?: string | number | boolean | string[]

  // Pour type 'number'
  min?: number
  max?: number
  step?: number

  // Pour type 'select' ou 'multiselect'
  options?: ParameterOption[]

  // Pour type 'text'
  placeholder?: string
  maxLength?: number
  pattern?: string // Regex validation

  // Nom de la variable d'environnement passée au script
  envVar: string
}

export interface CronParametersConfig {
  cronName: string
  parameters: CronParameter[]
}

/**
 * Configuration complète des paramètres par cron
 */
export const CRON_PARAMETERS: Record<string, CronParametersConfig> = {
  'index-kb-progressive': {
    cronName: 'index-kb-progressive',
    parameters: [
      {
        name: 'batchSize',
        label: 'Taille du batch',
        description: 'Nombre de documents à indexer par exécution (recommandé: 2-5)',
        type: 'number',
        required: false,
        defaultValue: 2,
        min: 1,
        max: 20,
        step: 1,
        envVar: 'BATCH_SIZE',
      },
      {
        name: 'categories',
        label: 'Catégories à indexer',
        description: 'Restreindre l\'indexation à certaines catégories juridiques',
        type: 'multiselect',
        required: false,
        defaultValue: [],
        options: [
          { value: 'jurisprudence', label: 'Jurisprudence' },
          { value: 'codes', label: 'Codes' },
          { value: 'legislation', label: 'Législation' },
          { value: 'doctrine', label: 'Doctrine' },
          { value: 'procedures', label: 'Procédures' },
          { value: 'contrats', label: 'Contrats' },
          { value: 'autre', label: 'Autre' },
        ],
        envVar: 'CATEGORIES',
      },
      {
        name: 'skipEmbeddings',
        label: 'Sauter les embeddings',
        description: 'Indexer sans générer les vecteurs (pour tests rapides)',
        type: 'boolean',
        required: false,
        defaultValue: false,
        envVar: 'SKIP_EMBEDDINGS',
      },
    ],
  },

  'reanalyze-kb-failures': {
    cronName: 'reanalyze-kb-failures',
    parameters: [
      {
        name: 'maxDocs',
        label: 'Nombre maximum de docs',
        description: 'Limite de documents à réanalyser (0 = tous)',
        type: 'number',
        required: false,
        defaultValue: 50,
        min: 0,
        max: 500,
        step: 10,
        envVar: 'MAX_DOCS',
      },
      {
        name: 'scoreThreshold',
        label: 'Seuil de score',
        description: 'Réanalyser uniquement les docs avec score ≤ seuil',
        type: 'select',
        required: false,
        defaultValue: '50',
        options: [
          { value: '0', label: 'Tous (score 0)', description: 'Documents complètement échoués' },
          { value: '50', label: 'Faible qualité (≤50)', description: 'Échecs + basse qualité' },
          { value: '60', label: 'Sous moyenne (≤60)', description: 'Qualité sous-optimale' },
          { value: '70', label: 'Moyens (≤70)', description: 'Qualité moyenne' },
        ],
        envVar: 'SCORE_THRESHOLD',
      },
      {
        name: 'forceProvider',
        label: 'Forcer un provider',
        description: 'Utiliser un provider spécifique au lieu du fallback auto',
        type: 'select',
        required: false,
        defaultValue: 'auto',
        options: [
          { value: 'auto', label: 'Auto (fallback cascade)', description: 'Ollama → OpenAI → Gemini' },
          { value: 'openai', label: 'OpenAI uniquement', description: 'Textes courts' },
          { value: 'gemini', label: 'Gemini uniquement', description: 'Textes longs' },
          { value: 'ollama', label: 'Ollama uniquement', description: 'Gratuit, local' },
        ],
        envVar: 'FORCE_PROVIDER',
      },
    ],
  },

  'refresh-mv-metadata': {
    cronName: 'refresh-mv-metadata',
    parameters: [
      {
        name: 'views',
        label: 'Vues à rafraîchir',
        description: 'Sélectionner les vues matérialisées à actualiser',
        type: 'multiselect',
        required: false,
        defaultValue: [],
        options: [
          { value: 'all', label: 'Toutes les vues', description: 'Rafraîchir toutes les vues' },
          { value: 'kb_stats', label: 'Stats KB', description: 'vw_kb_metadata_summary' },
          { value: 'web_sources', label: 'Web Sources', description: 'vw_web_sources_summary' },
          { value: 'embeddings', label: 'Embeddings', description: 'vw_kb_embedding_migration_stats' },
        ],
        envVar: 'VIEWS',
      },
      {
        name: 'concurrently',
        label: 'Rafraîchissement concurrent',
        description: 'Rafraîchir les vues en parallèle (plus rapide mais + charge)',
        type: 'boolean',
        required: false,
        defaultValue: false,
        envVar: 'CONCURRENTLY',
      },
    ],
  },

  'acquisition-weekly': {
    cronName: 'acquisition-weekly',
    parameters: [
      {
        name: 'sources',
        label: 'Sources à crawler',
        description: 'Sélectionner les sources web à explorer',
        type: 'multiselect',
        required: false,
        defaultValue: [],
        options: [
          { value: 'all', label: 'Toutes les sources actives' },
          { value: '9anoun', label: '9anoun.tn (Jurisprudence)' },
          { value: 'cassation', label: 'cassation.tn (Cour de cassation)' },
          { value: 'legislation', label: 'legislation.tn (Codes et lois)' },
          { value: 'da5ira', label: 'da5ira.com (Blog juridique)' },
        ],
        envVar: 'SOURCES',
      },
      {
        name: 'maxPages',
        label: 'Pages max par source',
        description: 'Limite de pages à crawler par source (0 = illimité)',
        type: 'number',
        required: false,
        defaultValue: 0,
        min: 0,
        max: 1000,
        step: 10,
        envVar: 'MAX_PAGES',
      },
    ],
  },

  'analyze-kb-weekend': {
    cronName: 'analyze-kb-weekend',
    parameters: [
      {
        name: 'batchSize',
        label: 'Taille du batch',
        description: 'Nombre de documents à analyser par batch (recommandé: 10-30)',
        type: 'number',
        required: false,
        defaultValue: 20,
        min: 5,
        max: 50,
        step: 5,
        envVar: 'BATCH_SIZE',
      },
      {
        name: 'maxBatches',
        label: 'Batches maximum',
        description: 'Nombre maximum de batches par exécution',
        type: 'number',
        required: false,
        defaultValue: 10,
        min: 1,
        max: 50,
        step: 1,
        envVar: 'MAX_BATCHES',
      },
      {
        name: 'category',
        label: 'Catégorie à analyser',
        description: 'Restreindre l\'analyse à une catégorie spécifique',
        type: 'select',
        required: false,
        defaultValue: '',
        options: [
          { value: '', label: 'Toutes les catégories' },
          { value: 'jurisprudence', label: 'Jurisprudence' },
          { value: 'codes', label: 'Codes' },
          { value: 'legislation', label: 'Législation' },
          { value: 'doctrine', label: 'Doctrine' },
        ],
        envVar: 'CATEGORY',
      },
    ],
  },

  'reindex-kb-openai': {
    cronName: 'reindex-kb-openai',
    parameters: [
      {
        name: 'dailyLimit',
        label: 'Limite quotidienne',
        description: 'Nombre max de chunks à réindexer par exécution (recommandé: 50)',
        type: 'number',
        required: false,
        defaultValue: 50,
        min: 10,
        max: 500,
        step: 10,
        envVar: 'DAILY_LIMIT',
      },
      {
        name: 'minPriority',
        label: 'Priorité minimum',
        description: 'Score de priorité minimum des documents à traiter (0-100)',
        type: 'number',
        required: false,
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 5,
        envVar: 'MIN_PRIORITY',
      },
    ],
  },

  'cleanup-executions': {
    cronName: 'cleanup-executions',
    parameters: [
      {
        name: 'retentionDays',
        label: 'Jours de rétention',
        description: 'Supprimer les exécutions plus anciennes que X jours',
        type: 'number',
        required: false,
        defaultValue: 7,
        min: 1,
        max: 90,
        step: 1,
        envVar: 'RETENTION_DAYS',
      },
      {
        name: 'keepFailed',
        label: 'Conserver les échecs',
        description: 'Garder les exécutions échouées même si anciennes',
        type: 'boolean',
        required: false,
        defaultValue: true,
        envVar: 'KEEP_FAILED',
      },
    ],
  },
}

/**
 * Récupérer la configuration des paramètres pour un cron
 */
export function getCronParameters(cronName: string): CronParameter[] {
  const config = CRON_PARAMETERS[cronName]
  return config?.parameters || []
}

/**
 * Vérifier si un cron supporte des paramètres
 */
export function cronHasParameters(cronName: string): boolean {
  const params = getCronParameters(cronName)
  return params.length > 0
}

/**
 * Valider les paramètres fournis pour un cron
 */
export function validateCronParameters(
  cronName: string,
  parameters: Record<string, any>
): { valid: boolean; errors: string[] } {
  const config = CRON_PARAMETERS[cronName]
  if (!config) {
    return { valid: true, errors: [] } // Cron sans paramètres = valid
  }

  const errors: string[] = []

  for (const param of config.parameters) {
    const value = parameters[param.name]

    // Required check
    if (param.required && (value === undefined || value === null || value === '')) {
      errors.push(`Le paramètre "${param.label}" est requis`)
      continue
    }

    // Skip validation si optionnel et absent
    if (!param.required && (value === undefined || value === null || value === '')) {
      continue
    }

    // Type-specific validation
    switch (param.type) {
      case 'number':
        const num = Number(value)
        if (isNaN(num)) {
          errors.push(`"${param.label}" doit être un nombre`)
        } else {
          if (param.min !== undefined && num < param.min) {
            errors.push(`"${param.label}" doit être ≥ ${param.min}`)
          }
          if (param.max !== undefined && num > param.max) {
            errors.push(`"${param.label}" doit être ≤ ${param.max}`)
          }
        }
        break

      case 'select':
        if (param.options) {
          const validValues = param.options.map((o) => o.value)
          if (!validValues.includes(String(value))) {
            errors.push(`"${param.label}" a une valeur invalide`)
          }
        }
        break

      case 'multiselect':
        if (!Array.isArray(value)) {
          errors.push(`"${param.label}" doit être une liste`)
        } else if (param.options) {
          const validValues = param.options.map((o) => o.value)
          const invalidValues = value.filter((v) => !validValues.includes(v))
          if (invalidValues.length > 0) {
            errors.push(`"${param.label}" contient des valeurs invalides: ${invalidValues.join(', ')}`)
          }
        }
        break

      case 'text':
        if (typeof value !== 'string') {
          errors.push(`"${param.label}" doit être du texte`)
        } else {
          if (param.maxLength && value.length > param.maxLength) {
            errors.push(`"${param.label}" doit faire max ${param.maxLength} caractères`)
          }
          if (param.pattern && !new RegExp(param.pattern).test(value)) {
            errors.push(`"${param.label}" a un format invalide`)
          }
        }
        break

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`"${param.label}" doit être true/false`)
        }
        break
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Convertir les paramètres en variables d'environnement
 * Format: { BATCH_SIZE: "5", CATEGORIES: "jurisprudence,codes" }
 */
export function parametersToEnvVars(
  cronName: string,
  parameters: Record<string, any>
): Record<string, string> {
  const config = CRON_PARAMETERS[cronName]
  if (!config) return {}

  const envVars: Record<string, string> = {}

  for (const param of config.parameters) {
    const value = parameters[param.name]

    // Skip si absent et optionnel
    if (!param.required && (value === undefined || value === null)) {
      continue
    }

    // Conversion selon type
    let envValue: string

    switch (param.type) {
      case 'number':
        envValue = String(value)
        break

      case 'boolean':
        envValue = value ? '1' : '0' // Bash-friendly
        break

      case 'multiselect':
        envValue = Array.isArray(value) ? value.join(',') : ''
        break

      default:
        envValue = String(value)
    }

    envVars[param.envVar] = envValue
  }

  return envVars
}
