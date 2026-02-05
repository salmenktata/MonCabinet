import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

// Styles PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    textDecoration: 'underline',
    marginBottom: 20,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    textDecoration: 'underline',
  },
  paragraph: {
    marginBottom: 8,
    textAlign: 'justify',
  },
  bold: {
    fontWeight: 'bold',
  },
  separator: {
    borderBottom: '1px solid #000',
    marginVertical: 10,
  },
  signatures: {
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
  },
})

interface ConventionPDFData {
  // Client
  client: {
    nom_complet: string
    adresse: string
    cin?: string
    type_client: 'PERSONNE_PHYSIQUE' | 'PERSONNE_MORALE'
    denomination?: string
    registre_commerce?: string
  }

  // Avocat
  avocat: {
    nom: string
    prenom: string
    matricule: string
    barreau: string
  }

  // Cabinet
  cabinet: {
    nom: string
    adresse: string
  }

  // Dossier
  dossier: {
    numero_dossier: string
    objet: string
    type_procedure: string
    tribunal?: string
  }

  // Honoraires
  type_honoraires: 'forfait' | 'horaire' | 'resultat' | 'mixte'
  montant_forfait?: number
  taux_horaire?: number
  honoraires_succes?: number
  provision_initiale: number
  modalites_paiement?: string

  // Dates
  date_signature: string
  ville: string
}

export const ConventionPDF: React.FC<ConventionPDFData> = ({
  client,
  avocat,
  cabinet,
  dossier,
  type_honoraires,
  montant_forfait,
  taux_horaire,
  honoraires_succes,
  provision_initiale,
  modalites_paiement,
  date_signature,
  ville,
}) => {
  const getTypeHonorairesText = () => {
    switch (type_honoraires) {
      case 'forfait':
        return `Honoraires forfaitaires d'un montant de ${montant_forfait?.toFixed(3)} TND.`
      case 'horaire':
        return `Honoraires au taux horaire de ${taux_horaire?.toFixed(3)} TND/heure.`
      case 'resultat':
        return `Honoraires de résultat correspondant à ${honoraires_succes}% du montant obtenu ou de la valeur du litige.`
      case 'mixte':
        return `Honoraires mixtes : partie forfaitaire de ${montant_forfait?.toFixed(3)} TND et partie au résultat de ${honoraires_succes}% du montant obtenu.`
      default:
        return 'À définir selon les prestations effectuées.'
    }
  }

  const clientNom =
    client.type_client === 'PERSONNE_MORALE' ? client.denomination : client.nom_complet

  const clientIdentification =
    client.type_client === 'PERSONNE_MORALE'
      ? `Registre de Commerce n° ${client.registre_commerce}`
      : `CIN n° ${client.cin}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.title}>CONVENTION D'HONORAIRES</Text>
        </View>

        {/* Parties */}
        <View style={styles.section}>
          <Text style={styles.bold}>ENTRE LES SOUSSIGNÉS :</Text>
          <Text style={styles.paragraph}>
            Maître {avocat.nom} {avocat.prenom}, Avocat inscrit au Barreau de {avocat.barreau}, sous le
            matricule ONAT n° {avocat.matricule}, exerçant au cabinet {cabinet.nom}, sis {cabinet.adresse}.
          </Text>
          <Text style={styles.bold}>D'UNE PART,</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.bold}>ET :</Text>
          <Text style={styles.paragraph}>
            {clientNom}
          </Text>
          <Text style={styles.paragraph}>
            Demeurant à {client.adresse}
          </Text>
          <Text style={styles.paragraph}>{clientIdentification}</Text>
          <Text style={styles.bold}>D'AUTRE PART,</Text>
        </View>

        <View style={styles.separator} />

        <View style={styles.section}>
          <Text style={styles.bold}>IL A ÉTÉ CONVENU CE QUI SUIT :</Text>
        </View>

        {/* Article 1 - Objet */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ARTICLE 1 - OBJET</Text>
          <Text style={styles.paragraph}>
            La présente convention a pour objet de fixer les conditions dans lesquelles Maître {avocat.nom}{' '}
            assistera et représentera {clientNom} dans l'affaire suivante :
          </Text>
          <Text style={styles.paragraph}>- Nature : {dossier.type_procedure}</Text>
          <Text style={styles.paragraph}>- Objet : {dossier.objet}</Text>
          <Text style={styles.paragraph}>- Référence : {dossier.numero_dossier}</Text>
          {dossier.tribunal && <Text style={styles.paragraph}>- Tribunal : {dossier.tribunal}</Text>}
        </View>

        {/* Article 2 - Honoraires */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ARTICLE 2 - HONORAIRES</Text>
          <Text style={styles.paragraph}>Type d'honoraires : {type_honoraires}</Text>
          <Text style={styles.paragraph}>{getTypeHonorairesText()}</Text>
        </View>

        {/* Article 3 - Débours */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ARTICLE 3 - DÉBOURS ET FRAIS</Text>
          <Text style={styles.paragraph}>
            Les débours (frais de greffe, huissier, expertise, déplacements, etc.) restent à la charge du client
            et seront facturés au coût réel justifié par pièces comptables.
          </Text>
        </View>

        {/* Article 4 - Modalités de paiement */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ARTICLE 4 - MODALITÉS DE PAIEMENT</Text>
          <Text style={styles.paragraph}>
            Provision initiale : {provision_initiale.toFixed(3)} TND
          </Text>
          {modalites_paiement && <Text style={styles.paragraph}>Modalités : {modalites_paiement}</Text>}
        </View>

        {/* Article 5 - Rupture */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ARTICLE 5 - RUPTURE DE LA CONVENTION</Text>
          <Text style={styles.paragraph}>
            Chaque partie peut mettre fin à la présente convention, sous réserve du respect des règles
            déontologiques et du paiement des honoraires dus pour les diligences accomplies.
          </Text>
        </View>

        {/* Article 6 - Résultat négatif */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ARTICLE 6 - CLAUSE EN CAS DE RÉSULTAT NÉGATIF</Text>
          <Text style={styles.paragraph}>
            En cas d'issue défavorable, l'avocat percevra les honoraires convenus pour les diligences accomplies,
            conformément à la présente convention.
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.signatures}>
          <View style={styles.signatureBlock}>
            <Text>Fait à {ville},</Text>
            <Text>le {date_signature}</Text>
            <Text style={{ marginTop: 20 }}>Le Client</Text>
            <Text style={{ fontSize: 9, marginTop: 5 }}>(Signature précédée de "Lu et approuvé")</Text>
            <Text style={{ marginTop: 40 }}>{clientNom}</Text>
          </View>

          <View style={styles.signatureBlock}>
            <Text>En deux exemplaires originaux</Text>
            <Text style={{ marginTop: 40 }}>L'Avocat</Text>
            <Text style={{ marginTop: 5 }}>
              Maître {avocat.nom} {avocat.prenom}
            </Text>
            <Text style={{ fontSize: 9, marginTop: 5 }}>(Signature et cachet)</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            {cabinet.nom} - {cabinet.adresse}
          </Text>
          <Text>Matricule ONAT : {avocat.matricule} - Barreau de {avocat.barreau}</Text>
        </View>
      </Page>
    </Document>
  )
}
