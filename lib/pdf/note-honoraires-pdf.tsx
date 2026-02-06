import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// Styles pour le PDF
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
  },
  logo: {
    width: 120,
    height: 60,
    objectFit: 'contain',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  label: {
    fontSize: 9,
    color: '#6b7280',
  },
  value: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#111827',
  },
  table: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    padding: 8,
    color: '#ffffff',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableCol: {
    flex: 1,
    fontSize: 9,
  },
  totalSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#dbeafe',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1e40af',
  },
  totalValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1e40af',
  },
  grandTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e40af',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  mentionsLegales: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 4,
    fontSize: 8,
    color: '#78350f',
  },
})

interface NoteHonorairesData {
  facture: {
    id: string
    numero: string
    date_emission: string
    date_echeance?: string
    type_honoraires?: string
    base_calcul?: string
    taux_horaire?: number
    heures?: number
    pourcentage_resultat?: number
    montant_ht: number
    montant_debours: number
    taux_tva: number
    montant_tva: number
    montant_ttc: number
    provisions_recues: number
    objet: string
    notes?: string
  }
  client: {
    nom: string
    prenom?: string
    type_client: string
    cin?: string
    adresse?: string
    ville?: string
    code_postal?: string
    telephone?: string
    email?: string
  }
  avocat: {
    nom: string
    prenom?: string
    email?: string
    telephone?: string
    matricule_avocat?: string
    barreau?: string
    adresse?: string
    ville?: string
  }
  cabinet: {
    nom?: string
    logo_url?: string
    rne?: string
  }
  langue: 'fr' | 'ar'
}

const translations = {
  fr: {
    noteHonoraires: 'NOTE D\'HONORAIRES',
    infoClient: 'Informations Client',
    infoAvocat: 'Informations Avocat',
    detailsNote: 'Détails de la Note',
    numero: 'Numéro',
    dateEmission: 'Date d\'émission',
    dateEcheance: 'Date d\'échéance',
    objet: 'Objet',
    detailsHonoraires: 'Détail des Honoraires',
    typeHonoraires: 'Type d\'honoraires',
    forfait: 'Forfait',
    horaire: 'Horaire',
    resultat: 'Au résultat',
    mixte: 'Mixte',
    tauxHoraire: 'Taux horaire',
    nombreHeures: 'Nombre d\'heures',
    pourcentageResultat: 'Pourcentage du résultat',
    baseCalcul: 'Base de calcul',
    montantHonoraires: 'Montant honoraires HT',
    debours: 'Débours et Frais',
    totalDebours: 'Total débours',
    calculTotal: 'Calcul Total',
    totalHT: 'Total HT',
    tva: 'TVA',
    totalTTC: 'Total TTC',
    provisions: 'Provisions Reçues',
    totalProvisions: 'Total provisions reçues',
    soldeAPayer: 'SOLDE À PAYER',
    mentionsLegales: 'Mentions Légales',
    delaiPaiement: 'Délai de paiement : 30 jours à compter de la date d\'émission',
    conformiteONAT: 'Note établie conformément aux exigences de l\'ONAT',
    voiesRecours: 'En cas de litige, médiation possible auprès du Bâtonnier',
    matricule: 'Matricule avocat',
    barreau: 'Barreau',
    rne: 'RNE',
    cin: 'CIN',
    adresse: 'Adresse',
    telephone: 'Téléphone',
    email: 'Email',
  },
  ar: {
    noteHonoraires: 'مذكرة الأتعاب',
    infoClient: 'معلومات العميل',
    infoAvocat: 'معلومات المحامي',
    detailsNote: 'تفاصيل المذكرة',
    numero: 'الرقم',
    dateEmission: 'تاريخ الإصدار',
    dateEcheance: 'تاريخ الاستحقاق',
    objet: 'الموضوع',
    detailsHonoraires: 'تفاصيل الأتعاب',
    typeHonoraires: 'نوع الأتعاب',
    forfait: 'جزافي',
    horaire: 'بالساعة',
    resultat: 'حسب النتيجة',
    mixte: 'مختلط',
    tauxHoraire: 'سعر الساعة',
    nombreHeures: 'عدد الساعات',
    pourcentageResultat: 'نسبة النتيجة',
    baseCalcul: 'أساس الحساب',
    montantHonoraires: 'مبلغ الأتعاب قبل الضريبة',
    debours: 'المصاريف والنفقات',
    totalDebours: 'إجمالي المصاريف',
    calculTotal: 'الحساب الإجمالي',
    totalHT: 'المجموع قبل الضريبة',
    tva: 'الضريبة على القيمة المضافة',
    totalTTC: 'المجموع مع الضريبة',
    provisions: 'السلف المستلمة',
    totalProvisions: 'إجمالي السلف المستلمة',
    soldeAPayer: 'الرصيد المستحق الدفع',
    mentionsLegales: 'البيانات القانونية',
    delaiPaiement: 'مدة الدفع: 30 يومًا من تاريخ الإصدار',
    conformiteONAT: 'مذكرة معدة وفقًا لمتطلبات ONAT',
    voiesRecours: 'في حالة النزاع، الوساطة ممكنة لدى النقيب',
    matricule: 'رقم التسجيل',
    barreau: 'النقابة',
    rne: 'السجل الوطني للمؤسسات',
    cin: 'بطاقة الهوية الوطنية',
    adresse: 'العنوان',
    telephone: 'الهاتف',
    email: 'البريد الإلكتروني',
  },
}

export const NoteHonorairesPDF: React.FC<NoteHonorairesData> = ({
  facture,
  client,
  avocat,
  cabinet,
  langue = 'fr',
}) => {
  const t = translations[langue]
  const isRTL = langue === 'ar'

  const clientNom = `${client.nom} ${client.prenom || ''}`.trim()

  const avocatNom = `${avocat.prenom || ''} ${avocat.nom}`.trim()

  const montantHonorairesHT = facture.montant_ht - (facture.montant_debours || 0)
  const soldeAPayer = facture.montant_ttc - (facture.provisions_recues || 0)

  const getTypeHonorairesLabel = () => {
    switch (facture.type_honoraires) {
      case 'forfait':
        return t.forfait
      case 'horaire':
        return t.horaire
      case 'resultat':
        return t.resultat
      case 'mixte':
        return t.mixte
      default:
        return t.forfait
    }
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {cabinet.logo_url && (
              <Image src={cabinet.logo_url} style={styles.logo} />
            )}
            <Text style={{ fontSize: 12, fontWeight: 'bold', marginTop: 5 }}>
              {cabinet.nom || avocatNom}
            </Text>
            {cabinet.rne && (
              <Text style={{ fontSize: 8, color: '#6b7280' }}>
                {t.rne}: {cabinet.rne}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
            <Text style={{ fontSize: 11, fontWeight: 'bold' }}>{avocatNom}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>
              {t.matricule}: {avocat.matricule_avocat}
            </Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>
              {t.barreau}: {avocat.barreau}
            </Text>
            {avocat.adresse && (
              <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 3 }}>
                {avocat.adresse}, {avocat.ville}
              </Text>
            )}
            {avocat.telephone && (
              <Text style={{ fontSize: 8, color: '#6b7280' }}>
                {t.telephone}: {avocat.telephone}
              </Text>
            )}
          </View>
        </View>

        {/* Titre */}
        <Text style={styles.title}>{t.noteHonoraires}</Text>

        {/* Informations Client */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.infoClient}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Nom:</Text>
            <Text style={styles.value}>{clientNom}</Text>
          </View>
          {client.cin && (
            <View style={styles.row}>
              <Text style={styles.label}>{t.cin}:</Text>
              <Text style={styles.value}>{client.cin}</Text>
            </View>
          )}
          {client.adresse && (
            <View style={styles.row}>
              <Text style={styles.label}>{t.adresse}:</Text>
              <Text style={styles.value}>
                {client.adresse}, {client.code_postal} {client.ville}
              </Text>
            </View>
          )}
          {client.telephone && (
            <View style={styles.row}>
              <Text style={styles.label}>{t.telephone}:</Text>
              <Text style={styles.value}>{client.telephone}</Text>
            </View>
          )}
        </View>

        {/* Détails Note */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.detailsNote}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t.numero}:</Text>
            <Text style={styles.value}>{facture.numero}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t.dateEmission}:</Text>
            <Text style={styles.value}>{facture.date_emission}</Text>
          </View>
          {facture.date_echeance && (
            <View style={styles.row}>
              <Text style={styles.label}>{t.dateEcheance}:</Text>
              <Text style={styles.value}>{facture.date_echeance}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>{t.objet}:</Text>
            <Text style={styles.value}>{facture.objet}</Text>
          </View>
        </View>

        {/* Détails Honoraires */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.detailsHonoraires}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t.typeHonoraires}:</Text>
            <Text style={styles.value}>{getTypeHonorairesLabel()}</Text>
          </View>

          {/* Détails selon type */}
          {(facture.type_honoraires === 'horaire' ||
            facture.type_honoraires === 'mixte') &&
            facture.taux_horaire &&
            facture.heures && (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>{t.tauxHoraire}:</Text>
                  <Text style={styles.value}>
                    {facture.taux_horaire.toFixed(3)} TND/h
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>{t.nombreHeures}:</Text>
                  <Text style={styles.value}>{facture.heures.toFixed(2)} h</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Calcul:</Text>
                  <Text style={styles.value}>
                    {facture.taux_horaire.toFixed(3)} × {facture.heures.toFixed(2)} ={' '}
                    {(facture.taux_horaire * facture.heures).toFixed(3)} TND
                  </Text>
                </View>
              </>
            )}

          {(facture.type_honoraires === 'resultat' ||
            facture.type_honoraires === 'mixte') &&
            facture.pourcentage_resultat && (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>{t.pourcentageResultat}:</Text>
                  <Text style={styles.value}>{facture.pourcentage_resultat}%</Text>
                </View>
                {facture.base_calcul && (
                  <View style={{ marginTop: 5 }}>
                    <Text style={styles.label}>{t.baseCalcul}:</Text>
                    <Text
                      style={{
                        fontSize: 9,
                        color: '#374151',
                        marginTop: 3,
                        lineHeight: 1.4,
                      }}
                    >
                      {facture.base_calcul}
                    </Text>
                  </View>
                )}
              </>
            )}

          <View style={{ ...styles.row, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
            <Text style={{ ...styles.label, fontWeight: 'bold', fontSize: 10 }}>
              {t.montantHonoraires}:
            </Text>
            <Text style={{ ...styles.value, fontSize: 11, color: '#2563eb' }}>
              {montantHonorairesHT.toFixed(3)} TND
            </Text>
          </View>
        </View>

        {/* Débours */}
        {facture.montant_debours > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.debours}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>{t.totalDebours}:</Text>
              <Text style={styles.value}>{facture.montant_debours.toFixed(3)} TND</Text>
            </View>
            <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 5 }}>
              Frais engagés pour le compte du client (greffe, huissier, expertise, etc.)
            </Text>
          </View>
        )}

        {/* Calcul Total */}
        <View style={styles.totalSection}>
          <Text style={{ ...styles.sectionTitle, color: '#1e40af', marginBottom: 10 }}>
            {t.calculTotal}
          </Text>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Honoraires HT:</Text>
            <Text style={styles.totalValue}>{montantHonorairesHT.toFixed(3)} TND</Text>
          </View>

          {facture.montant_debours > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Débours:</Text>
              <Text style={styles.totalValue}>
                {facture.montant_debours.toFixed(3)} TND
              </Text>
            </View>
          )}

          <View
            style={{
              ...styles.totalRow,
              borderTopWidth: 1,
              borderTopColor: '#2563eb',
              paddingTop: 8,
            }}
          >
            <Text style={styles.totalLabel}>{t.totalHT}:</Text>
            <Text style={styles.totalValue}>{facture.montant_ht.toFixed(3)} TND</Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {t.tva} ({facture.taux_tva}%):
            </Text>
            <Text style={styles.totalValue}>{facture.montant_tva.toFixed(3)} TND</Text>
          </View>

          <View
            style={{
              ...styles.totalRow,
              borderTopWidth: 2,
              borderTopColor: '#1e40af',
              paddingTop: 8,
              marginTop: 5,
            }}
          >
            <Text style={{ ...styles.totalLabel, fontSize: 12 }}>{t.totalTTC}:</Text>
            <Text style={{ ...styles.grandTotal, fontSize: 13 }}>
              {facture.montant_ttc.toFixed(3)} TND
            </Text>
          </View>

          {/* Provisions */}
          {facture.provisions_recues > 0 && (
            <>
              <View style={{ ...styles.totalRow, marginTop: 10 }}>
                <Text style={styles.totalLabel}>{t.totalProvisions}:</Text>
                <Text style={{ ...styles.totalValue, color: '#059669' }}>
                  - {facture.provisions_recues.toFixed(3)} TND
                </Text>
              </View>

              <View
                style={{
                  ...styles.totalRow,
                  borderTopWidth: 2,
                  borderTopColor: '#dc2626',
                  paddingTop: 8,
                  marginTop: 5,
                  backgroundColor: '#fef2f2',
                  padding: 8,
                  borderRadius: 4,
                }}
              >
                <Text style={{ ...styles.totalLabel, fontSize: 13, color: '#991b1b' }}>
                  {t.soldeAPayer}:
                </Text>
                <Text style={{ ...styles.grandTotal, fontSize: 14, color: '#dc2626' }}>
                  {soldeAPayer.toFixed(3)} TND
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Mentions Légales */}
        <View style={styles.mentionsLegales}>
          <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>{t.mentionsLegales}</Text>
          <Text style={{ marginBottom: 3 }}>• {t.delaiPaiement}</Text>
          <Text style={{ marginBottom: 3 }}>• {t.conformiteONAT}</Text>
          <Text>• {t.voiesRecours}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            Note d&apos;honoraires générée par MonCabinet - Cabinet {cabinet.nom || avocatNom}
          </Text>
          <Text style={{ marginTop: 3 }}>
            Matricule avocat ONAT: {avocat.matricule_avocat} - Barreau: {avocat.barreau}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
