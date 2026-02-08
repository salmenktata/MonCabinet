/**
 * Script de test pour valider l'enrichissement de la taxonomie des tribunaux
 * Vérifie que tous les nouveaux types sont correctement définis et accessibles
 */

import {
  KNOWLEDGE_CATEGORIES,
  JurisprudenceSubcategory,
  getSubcategories,
  getSubcategoryLabel,
  SUBCATEGORY_LABELS,
} from '../lib/knowledge-base/categories';

console.log('🧪 Test Enrichissement Taxonomie Tribunaux\n');
console.log('==========================================\n');

// ============================================================================
// 1. VÉRIFIER TYPES TYPESCRIPT
// ============================================================================

console.log('1. VÉRIFICATION TYPES TYPESCRIPT');
console.log('---------------------------------');

// Ces affectations vérifieront que les nouveaux types sont valides
const nouveauxTribunaux: JurisprudenceSubcategory[] = [
  'appel_nabeul',
  'appel_bizerte',
  'appel_kef',
  'appel_monastir',
  'appel_kairouan',
  'appel_gafsa',
  'appel_gabes',
  'appel_medenine',
  'tribunal_commerce',
  'tribunal_travail',
];

console.log(`✅ ${nouveauxTribunaux.length} nouveaux types validés (TypeScript compile OK)\n`);

// ============================================================================
// 2. VÉRIFIER SUBCATEGORIES ARRAY
// ============================================================================

console.log('2. VÉRIFICATION SUBCATEGORIES ARRAY');
console.log('-----------------------------------');

const jurisprudenceCategory = KNOWLEDGE_CATEGORIES.find(cat => cat.id === 'jurisprudence');
if (!jurisprudenceCategory) {
  console.error('❌ ERREUR: Catégorie jurisprudence non trouvée!');
  process.exit(1);
}

const subcategories = jurisprudenceCategory.subcategories;
console.log(`Total sous-catégories jurisprudence: ${subcategories.length} (attendu: 18)`);

const coursAppel = subcategories.filter(sub => sub.id.startsWith('appel_'));
console.log(`Cours d'appel: ${coursAppel.length} (attendu: 11)\n`);

// ============================================================================
// 3. VÉRIFIER PRÉSENCE NOUVEAUX TRIBUNAUX
// ============================================================================

console.log('3. VÉRIFICATION PRÉSENCE NOUVEAUX TRIBUNAUX');
console.log('-------------------------------------------');

let allPresent = true;
nouveauxTribunaux.forEach(code => {
  const found = subcategories.find(sub => sub.id === code);
  if (found) {
    console.log(`✅ ${code.padEnd(20)} → ${found.labelFr}`);
  } else {
    console.error(`❌ ${code} → NON TROUVÉ!`);
    allPresent = false;
  }
});

if (!allPresent) {
  console.error('\n❌ ERREUR: Certains tribunaux manquent dans l\'array subcategories!');
  process.exit(1);
}

console.log('');

// ============================================================================
// 4. VÉRIFIER LABELS FRANÇAIS/ARABE
// ============================================================================

console.log('4. VÉRIFICATION LABELS FR/AR');
console.log('-----------------------------');

const expectedLabels = {
  appel_nabeul: { fr: "Cour d'Appel de Nabeul", ar: 'محكمة الاستئناف بنابل' },
  appel_bizerte: { fr: "Cour d'Appel de Bizerte", ar: 'محكمة الاستئناف ببنزرت' },
  appel_kef: { fr: "Cour d'Appel du Kef", ar: 'محكمة الاستئناف بالكاف' },
  appel_monastir: { fr: "Cour d'Appel de Monastir", ar: 'محكمة الاستئناف بالمنستير' },
  appel_kairouan: { fr: "Cour d'Appel de Kairouan", ar: 'محكمة الاستئناف بالقيروان' },
  appel_gafsa: { fr: "Cour d'Appel de Gafsa", ar: 'محكمة الاستئناف بقفصة' },
  appel_gabes: { fr: "Cour d'Appel de Gabès", ar: 'محكمة الاستئناف بقابس' },
  appel_medenine: { fr: "Cour d'Appel de Médenine", ar: 'محكمة الاستئناف بمدنين' },
  tribunal_commerce: { fr: 'Tribunal de Commerce', ar: 'المحكمة التجارية' },
  tribunal_travail: { fr: 'Tribunal du Travail', ar: 'محكمة الشغل' },
};

let labelsOk = true;
Object.entries(expectedLabels).forEach(([code, expected]) => {
  const labelFr = getSubcategoryLabel(code, 'fr');
  const labelAr = getSubcategoryLabel(code, 'ar');

  const frOk = labelFr === expected.fr;
  const arOk = labelAr === expected.ar;

  if (frOk && arOk) {
    console.log(`✅ ${code}`);
    console.log(`   FR: ${labelFr}`);
    console.log(`   AR: ${labelAr}`);
  } else {
    console.error(`❌ ${code}`);
    if (!frOk) console.error(`   FR attendu: ${expected.fr}, reçu: ${labelFr}`);
    if (!arOk) console.error(`   AR attendu: ${expected.ar}, reçu: ${labelAr}`);
    labelsOk = false;
  }
});

if (!labelsOk) {
  console.error('\n❌ ERREUR: Certains labels ne correspondent pas!');
  process.exit(1);
}

console.log('');

// ============================================================================
// 5. VÉRIFIER ORDRE ALPHABÉTIQUE COURS D'APPEL
// ============================================================================

console.log('5. VÉRIFICATION ORDRE ALPHABÉTIQUE');
console.log('-----------------------------------');

const coursAppelOrdered = coursAppel.map(ca => ca.labelFr);
const coursAppelSorted = [...coursAppelOrdered].sort((a, b) => a.localeCompare(b, 'fr'));

const isOrdered = JSON.stringify(coursAppelOrdered) === JSON.stringify(coursAppelSorted);

if (isOrdered) {
  console.log('✅ Cours d\'appel bien ordonnées alphabétiquement');
  coursAppelOrdered.forEach((label, idx) => {
    console.log(`   ${idx + 1}. ${label}`);
  });
} else {
  console.error('❌ Cours d\'appel NON ordonnées alphabétiquement!');
  console.error('\nOrdre actuel:');
  coursAppelOrdered.forEach(label => console.error(`   - ${label}`));
  console.error('\nOrdre attendu:');
  coursAppelSorted.forEach(label => console.error(`   - ${label}`));
}

console.log('');

// ============================================================================
// 6. RÉSUMÉ FINAL
// ============================================================================

console.log('==========================================');
console.log('RÉSUMÉ FINAL');
console.log('==========================================');

const stats = {
  'Total sous-catégories jurisprudence': subcategories.length,
  'Cours d\'appel': coursAppel.length,
  'Nouveaux tribunaux ajoutés': nouveauxTribunaux.length,
  'Labels FR/AR corrects': labelsOk ? '✅' : '❌',
  'Ordre alphabétique': isOrdered ? '✅' : '❌',
  'Tests TypeScript': '✅',
};

Object.entries(stats).forEach(([key, value]) => {
  console.log(`${key.padEnd(35)}: ${value}`);
});

console.log('');

if (
  subcategories.length === 18 &&
  coursAppel.length === 11 &&
  allPresent &&
  labelsOk &&
  isOrdered
) {
  console.log('✅ TOUS LES TESTS PASSENT - Implémentation correcte!\n');
  process.exit(0);
} else {
  console.error('❌ ÉCHEC - Certains tests ont échoué!\n');
  process.exit(1);
}
