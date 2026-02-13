#!/usr/bin/env tsx
/**
 * Script de test unitaire: Validation Zod et Cleaning JSON
 * Teste les fonctions de parsing sans appeler l'API LLM
 *
 * Utilisation:
 *   npx tsx scripts/test-json-parsing-validation.ts
 */

import { validateStructuredDossier } from '@/lib/validations/structured-dossier'

// =============================================================================
// FIXTURES DE TEST
// =============================================================================

const VALID_JSON = {
  confidence: 85,
  langue: 'ar',
  typeProcedure: 'civil_premiere_instance',
  sousType: 'Dommages et intérêts',
  analyseJuridique: {
    diagnostic: 'Cas de responsabilité civile',
    qualification: 'Faute contractuelle',
    risques: ['Prescription', 'Absence de preuve'],
    opportunites: ['Jurisprudence favorable', 'Témoins crédibles'],
    fondement: 'Faute, dommage, lien de causalité',
    recommandation: 'Poursuivre l\'action en justice',
  },
  client: {
    nom: 'Ben Ahmed',
    prenom: 'Mohamed',
    role: 'demandeur',
    profession: 'Commerçant',
    revenus: 2500,
    adresse: 'Tunis',
  },
  partieAdverse: {
    nom: 'Ben Ali',
    prenom: 'Karim',
    role: 'defendeur',
    profession: 'Employé',
    revenus: 1500,
    adresse: 'Sfax',
  },
  faitsExtraits: [
    {
      fait: 'Signature du contrat',
      label: 'Contrat',
      categorie: 'fait_juridique',
      dateApproximative: '2024-01-15',
      confidence: 90,
      source: 'Document',
      preuve: 'Contrat signé',
      importance: 'decisif',
    },
  ],
  enfants: null,
  calculs: [],
  timeline: [],
  actionsSuggerees: [
    {
      titre: 'Rassembler les preuves',
      description: 'Collecter tous les documents',
      priorite: 'haute',
      delaiJours: 7,
      checked: false,
    },
  ],
  references: [],
  titrePropose: 'Action en responsabilité contractuelle',
  resumeCourt: 'Demande de dommages et intérêts pour rupture de contrat',
  donneesSpecifiques: {},
}

const INVALID_JSON_MISSING_REQUIRED = {
  confidence: 85,
  langue: 'ar',
  // typeProcedure: MANQUANT (requis)
  client: {
    nom: 'Ben Ahmed',
    role: 'demandeur',
  },
  partieAdverse: {
    nom: 'Ben Ali',
    role: 'defendeur',
  },
  titrePropose: 'Test',
}

const INVALID_JSON_WRONG_TYPES = {
  confidence: 'invalide', // Devrait être number
  langue: 'ar',
  typeProcedure: 'civil_premiere_instance',
  client: {
    nom: 'Ben Ahmed',
    role: 'demandeur',
  },
  partieAdverse: {
    nom: 'Ben Ali',
    role: 'defendeur',
  },
  titrePropose: 'Test',
  faitsExtraits: 'pas un array', // Devrait être array
}

const INVALID_JSON_WRONG_ENUM = {
  confidence: 85,
  langue: 'en', // Devrait être 'ar' ou 'fr'
  typeProcedure: 'invalid_type', // Mauvais enum
  client: {
    nom: 'Ben Ahmed',
    role: 'invalid_role', // Mauvais enum
  },
  partieAdverse: {
    nom: 'Ben Ali',
    role: 'defendeur',
  },
  titrePropose: 'Test',
}

// =============================================================================
// TESTS
// =============================================================================

function testValidJSON() {
  console.log('\n🧪 Test 1: JSON Valide')
  console.log('─'.repeat(80))

  const result = validateStructuredDossier(VALID_JSON)

  if (result.success) {
    console.log('✅ SUCCÈS - JSON validé')
    console.log('  Confidence:', result.data.confidence)
    console.log('  Langue:', result.data.langue)
    console.log('  Type procédure:', result.data.typeProcedure)
    console.log('  Client:', result.data.client.nom)
    console.log('  Faits extraits:', result.data.faitsExtraits.length)
  } else {
    console.error('❌ ÉCHEC - Validation devrait réussir')
    console.error('Erreurs:', result.error.flatten())
    return false
  }

  return true
}

function testInvalidMissingRequired() {
  console.log('\n🧪 Test 2: JSON Invalide - Champ requis manquant')
  console.log('─'.repeat(80))

  const result = validateStructuredDossier(INVALID_JSON_MISSING_REQUIRED)

  if (!result.success) {
    console.log('✅ SUCCÈS - Erreur détectée comme attendu')
    const errors = result.error.flatten().fieldErrors
    console.log('  Champs manquants:', Object.keys(errors).join(', '))
    console.log('  Exemple erreur:', errors.typeProcedure?.[0] || 'N/A')
  } else {
    console.error('❌ ÉCHEC - Validation devrait échouer')
    return false
  }

  return true
}

function testInvalidWrongTypes() {
  console.log('\n🧪 Test 3: JSON Invalide - Mauvais types')
  console.log('─'.repeat(80))

  const result = validateStructuredDossier(INVALID_JSON_WRONG_TYPES)

  if (!result.success) {
    console.log('✅ SUCCÈS - Erreurs de type détectées')
    const errors = result.error.flatten().fieldErrors
    console.log('  Champs invalides:', Object.keys(errors).join(', '))
    console.log('  confidence:', errors.confidence?.[0] || 'N/A')
    console.log('  faitsExtraits:', errors.faitsExtraits?.[0] || 'N/A')
  } else {
    console.error('❌ ÉCHEC - Validation devrait échouer')
    return false
  }

  return true
}

function testInvalidWrongEnum() {
  console.log('\n🧪 Test 4: JSON Invalide - Mauvaises valeurs enum')
  console.log('─'.repeat(80))

  const result = validateStructuredDossier(INVALID_JSON_WRONG_ENUM)

  if (!result.success) {
    console.log('✅ SUCCÈS - Erreurs enum détectées')
    const errors = result.error.flatten().fieldErrors
    console.log('  Champs invalides:', Object.keys(errors).join(', '))
    console.log('  langue:', errors.langue?.[0] || 'N/A')
    console.log('  typeProcedure:', errors.typeProcedure?.[0] || 'N/A')
  } else {
    console.error('❌ ÉCHEC - Validation devrait échouer')
    return false
  }

  return true
}

function testDefaults() {
  console.log('\n🧪 Test 5: Valeurs par défaut')
  console.log('─'.repeat(80))

  const minimalJSON = {
    langue: 'ar',
    typeProcedure: 'autre',
    client: {
      nom: 'Test Client',
      role: 'demandeur',
    },
    partieAdverse: {
      nom: 'Test Adverse',
      role: 'defendeur',
    },
    titrePropose: 'Test',
  }

  const result = validateStructuredDossier(minimalJSON)

  if (result.success) {
    console.log('✅ SUCCÈS - Valeurs par défaut appliquées')
    console.log('  confidence:', result.data.confidence, '(défaut: 50)')
    console.log('  faitsExtraits:', result.data.faitsExtraits, '(défaut: [])')
    console.log('  calculs:', result.data.calculs, '(défaut: [])')
    console.log('  resumeCourt:', result.data.resumeCourt, '(défaut: "")')
  } else {
    console.error('❌ ÉCHEC - Validation avec defaults devrait réussir')
    console.error('Erreurs:', result.error.flatten())
    return false
  }

  return true
}

// =============================================================================
// EXÉCUTION
// =============================================================================

async function runTests() {
  console.log('═'.repeat(80))
  console.log('🧪 Tests Unitaires - Validation Zod Dossiers Structurés')
  console.log('═'.repeat(80))

  const tests = [
    testValidJSON,
    testInvalidMissingRequired,
    testInvalidWrongTypes,
    testInvalidWrongEnum,
    testDefaults,
  ]

  let passed = 0
  let failed = 0

  for (const test of tests) {
    try {
      const result = test()
      if (result) {
        passed++
      } else {
        failed++
      }
    } catch (error) {
      console.error('\n❌ Exception dans le test:', error)
      failed++
    }
  }

  console.log('\n═'.repeat(80))
  console.log('📊 Résumé des Tests')
  console.log('═'.repeat(80))
  console.log(`✅ Réussis: ${passed}`)
  console.log(`❌ Échoués: ${failed}`)
  console.log(`📈 Total: ${tests.length}`)
  console.log(`🎯 Taux de réussite: ${Math.round((passed / tests.length) * 100)}%`)
  console.log('═'.repeat(80))

  if (failed === 0) {
    console.log('\n🎉 Tous les tests sont passés!')
    process.exit(0)
  } else {
    console.error(`\n⚠️ ${failed} test(s) ont échoué`)
    process.exit(1)
  }
}

runTests()
