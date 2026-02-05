import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer'

// Types
interface FacturePDFProps {
  facture: {
    id: string
    numero_facture: string
    date_emission: string
    date_echeance?: string
    date_paiement?: string
    montant_ht: number
    taux_tva: number
    montant_tva: number
    montant_ttc: number
    statut: string
    objet: string
    notes?: string
  }
  client: {
    nom: string
    prenom?: string
    denomination?: string
    type: 'PERSONNE_PHYSIQUE' | 'PERSONNE_MORALE'
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
    email: string
    telephone?: string
    matricule_avocat?: string
    barreau?: string
    adresse?: string
    ville?: string
  }
  cabinet?: {
    logo_url?: string
    nom?: string
    rne?: string // Numéro RNE (Registre National des Entreprises)
  }
  langue?: 'fr' | 'ar'
}

// Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  // En-tête
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    paddingBottom: 20,
    borderBottom: '2 solid #2563eb',
  },
  logoSection: {
    width: '40%',
  },
  logo: {
    width: 120,
    height: 60,
    objectFit: 'contain',
  },
  cabinetInfo: {
    marginTop: 10,
  },
  avocatInfo: {
    width: '55%',
    textAlign: 'right',
  },

  // Titres
  title: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
    marginBottom: 8,
    marginTop: 15,
  },

  // Informations
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  infoBox: {
    width: '48%',
    padding: 15,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
  },
  infoLabel: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },

  // Détails facture
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 10,
    color: '#374151',
  },
  detailValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },

  // Tableau montants
  table: {
    marginTop: 20,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1e40af',
    padding: 10,
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 10,
    borderBottom: '1 solid #e5e7eb',
  },
  tableRowAlt: {
    backgroundColor: '#f9fafb',
  },
  colDescription: {
    width: '60%',
  },
  colMontant: {
    width: '40%',
    textAlign: 'right',
  },

  // Totaux
  totalsSection: {
    marginTop: 20,
    marginLeft: 'auto',
    width: '50%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderBottom: '1 solid #e5e7eb',
  },
  totalLabel: {
    fontSize: 10,
    color: '#374151',
  },
  totalValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#1e40af',
    marginTop: 5,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
  },
  grandTotalValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
  },

  // Mentions légales
  legalSection: {
    marginTop: 30,
    padding: 15,
    backgroundColor: '#fef3c7',
    borderRadius: 4,
  },
  legalTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#92400e',
    marginBottom: 8,
  },
  legalText: {
    fontSize: 8,
    color: '#78350f',
    lineHeight: 1.4,
    marginBottom: 3,
  },

  // Notes
  notesSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
  },
  notesTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 5,
  },
  notesText: {
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.4,
  },

  // Pied de page
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 8,
    borderTop: '1 solid #e5e7eb',
    paddingTop: 10,
  },

  // Watermark PAYÉE
  watermark: {
    position: 'absolute',
    top: '40%',
    left: '25%',
    fontSize: 80,
    color: '#22c55e',
    opacity: 0.1,
    transform: 'rotate(-45deg)',
    fontFamily: 'Helvetica-Bold',
  },

  // Texte gras
  bold: {
    fontFamily: 'Helvetica-Bold',
  },

  // Petite taille
  small: {
    fontSize: 8,
    color: '#6b7280',
  },
})

// Formater montant en TND avec 3 décimales
const formatMontant = (montant: number): string => {
  return `${montant.toFixed(3)} TND`
}

// Formater date
const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// Composant PDF
export const FacturePDF: React.FC<FacturePDFProps> = ({
  facture,
  client,
  avocat,
  cabinet,
  langue = 'fr',
}) => {
  const clientNom =
    client.type === 'PERSONNE_PHYSIQUE'
      ? `${client.nom} ${client.prenom || ''}`.trim()
      : client.denomination || client.nom

  const avocatNom = `${avocat.prenom || ''} ${avocat.nom}`.trim()

  const labels = {
    fr: {
      facture: 'FACTURE',
      factureNumero: 'Facture N°',
      dateEmission: 'Date d\'émission',
      dateEcheance: 'Date d\'échéance',
      datePaiement: 'Date de paiement',
      infoAvocat: 'Informations Avocat',
      infoClient: 'Informations Client',
      objet: 'Objet',
      designation: 'Désignation',
      montant: 'Montant',
      montantHT: 'Montant HT',
      tva: 'TVA',
      montantTTC: 'Montant TTC',
      total: 'TOTAL À PAYER',
      mentionsLegales: 'Mentions Légales Obligatoires (ONAT)',
      notes: 'Notes',
      payee: 'PAYÉE',
      telephone: 'Tél',
      email: 'Email',
      adresse: 'Adresse',
      matricule: 'Matricule Avocat',
      barreau: 'Barreau',
      cin: 'CIN',
      rne: 'RNE',
    },
    ar: {
      facture: 'فاتورة',
      factureNumero: 'فاتورة رقم',
      dateEmission: 'تاريخ الإصدار',
      dateEcheance: 'تاريخ الاستحقاق',
      datePaiement: 'تاريخ الدفع',
      infoAvocat: 'معلومات المحامي',
      infoClient: 'معلومات العميل',
      objet: 'الموضوع',
      designation: 'الوصف',
      montant: 'المبلغ',
      montantHT: 'المبلغ قبل الضريبة',
      tva: 'الضريبة على القيمة المضافة',
      montantTTC: 'المبلغ الإجمالي',
      total: 'المجموع المستحق',
      mentionsLegales: 'البيانات القانونية الإلزامية',
      notes: 'ملاحظات',
      payee: 'مدفوعة',
      telephone: 'الهاتف',
      email: 'البريد الإلكتروني',
      adresse: 'العنوان',
      matricule: 'رقم التسجيل',
      barreau: 'هيئة المحامين',
      cin: 'بطاقة التعريف',
      rne: 'السجل الوطني للمؤسسات',
    },
  }

  const t = labels[langue]

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Watermark si payée */}
        {facture.statut === 'PAYEE' && (
          <Text style={styles.watermark}>{t.payee}</Text>
        )}

        {/* En-tête */}
        <View style={styles.header}>
          {/* Logo et info cabinet */}
          <View style={styles.logoSection}>
            {cabinet?.logo_url && (
              <Image src={cabinet.logo_url} style={styles.logo} alt="Logo cabinet" />
            )}
            <View style={styles.cabinetInfo}>
              {cabinet?.nom && (
                <Text style={[styles.bold, { fontSize: 12 }]}>{cabinet.nom}</Text>
              )}
              {avocat.adresse && (
                <Text style={styles.small}>{avocat.adresse}</Text>
              )}
              {avocat.ville && (
                <Text style={styles.small}>{avocat.ville}</Text>
              )}
            </View>
          </View>

          {/* Info avocat */}
          <View style={styles.avocatInfo}>
            <Text style={[styles.bold, { fontSize: 12, marginBottom: 5 }]}>
              {avocatNom}
            </Text>
            {avocat.matricule_avocat && (
              <Text style={styles.small}>
                {t.matricule}: {avocat.matricule_avocat}
              </Text>
            )}
            {avocat.barreau && (
              <Text style={styles.small}>
                {t.barreau}: {avocat.barreau}
              </Text>
            )}
            {avocat.telephone && (
              <Text style={styles.small}>
                {t.telephone}: {avocat.telephone}
              </Text>
            )}
            {avocat.email && (
              <Text style={styles.small}>
                {t.email}: {avocat.email}
              </Text>
            )}
          </View>
        </View>

        {/* Titre */}
        <Text style={styles.title}>{t.facture}</Text>

        {/* Informations facture et client */}
        <View style={styles.infoSection}>
          {/* Info facture */}
          <View style={styles.infoBox}>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.infoLabel}>{t.factureNumero}</Text>
              <Text style={[styles.infoValue, { fontSize: 14, color: '#2563eb' }]}>
                {facture.numero_facture}
              </Text>
            </View>
            <View style={{ marginBottom: 5 }}>
              <Text style={styles.infoLabel}>{t.dateEmission}</Text>
              <Text style={styles.infoValue}>{formatDate(facture.date_emission)}</Text>
            </View>
            {facture.date_echeance && (
              <View style={{ marginBottom: 5 }}>
                <Text style={styles.infoLabel}>{t.dateEcheance}</Text>
                <Text style={styles.infoValue}>{formatDate(facture.date_echeance)}</Text>
              </View>
            )}
            {facture.date_paiement && facture.statut === 'PAYEE' && (
              <View>
                <Text style={styles.infoLabel}>{t.datePaiement}</Text>
                <Text style={[styles.infoValue, { color: '#16a34a' }]}>
                  {formatDate(facture.date_paiement)}
                </Text>
              </View>
            )}
          </View>

          {/* Info client */}
          <View style={styles.infoBox}>
            <Text style={[styles.sectionTitle, { marginTop: 0 }]}>{t.infoClient}</Text>
            <Text style={[styles.bold, { marginBottom: 5 }]}>{clientNom}</Text>
            {client.cin && (
              <Text style={styles.small}>
                {t.cin}: {client.cin}
              </Text>
            )}
            {client.adresse && <Text style={styles.small}>{client.adresse}</Text>}
            {client.ville && (
              <Text style={styles.small}>
                {client.code_postal} {client.ville}
              </Text>
            )}
            {client.telephone && (
              <Text style={styles.small}>
                {t.telephone}: {client.telephone}
              </Text>
            )}
            {client.email && (
              <Text style={styles.small}>
                {t.email}: {client.email}
              </Text>
            )}
          </View>
        </View>

        {/* Objet */}
        <View style={{ marginBottom: 15 }}>
          <Text style={styles.sectionTitle}>{t.objet}</Text>
          <Text style={{ fontSize: 10, color: '#374151' }}>{facture.objet}</Text>
        </View>

        {/* Tableau */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>{t.designation}</Text>
            <Text style={styles.colMontant}>{t.montant}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.colDescription}>{facture.objet}</Text>
            <Text style={[styles.colMontant, styles.bold]}>
              {formatMontant(facture.montant_ht)}
            </Text>
          </View>
        </View>

        {/* Totaux */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t.montantHT}</Text>
            <Text style={styles.totalValue}>{formatMontant(facture.montant_ht)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {t.tva} ({facture.taux_tva}%)
            </Text>
            <Text style={styles.totalValue}>{formatMontant(facture.montant_tva)}</Text>
          </View>
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>{t.total}</Text>
            <Text style={styles.grandTotalValue}>{formatMontant(facture.montant_ttc)}</Text>
          </View>
        </View>

        {/* Mentions légales ONAT */}
        <View style={styles.legalSection}>
          <Text style={styles.legalTitle}>{t.mentionsLegales}</Text>
          {avocat.matricule_avocat && (
            <Text style={styles.legalText}>
              • Matricule Avocat ONAT: {avocat.matricule_avocat}
            </Text>
          )}
          {avocat.barreau && (
            <Text style={styles.legalText}>
              • Barreau d&apos;inscription: {avocat.barreau}
            </Text>
          )}
          <Text style={styles.legalText}>
            • TVA (Taxe sur la Valeur Ajoutée): {facture.taux_tva}% (Tunisie)
          </Text>
          {cabinet?.rne && (
            <Text style={styles.legalText}>
              • Numéro RNE (Registre National des Entreprises): {cabinet.rne}
            </Text>
          )}
          <Text style={styles.legalText}>
            • Conformément aux dispositions de l&apos;Ordre National des Avocats de Tunisie (ONAT)
          </Text>
        </View>

        {/* Notes */}
        {facture.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesTitle}>{t.notes}</Text>
            <Text style={styles.notesText}>{facture.notes}</Text>
          </View>
        )}

        {/* Pied de page */}
        <View style={styles.footer}>
          <Text>
            Facture générée le {formatDate(new Date().toISOString())} • {avocatNom}
          </Text>
          <Text style={{ marginTop: 3 }}>
            Cette facture est conforme aux normes ONAT (Ordre National des Avocats de Tunisie)
          </Text>
        </View>
      </Page>
    </Document>
  )
}

export default FacturePDF
