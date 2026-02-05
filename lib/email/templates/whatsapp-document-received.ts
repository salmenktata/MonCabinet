/**
 * Templates Email - Documents WhatsApp Reçus
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:7002'
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'MonCabinet'

// Styles CSS inline pour compatibilité email
const styles = {
  container: 'font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;',
  header: 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;',
  headerTitle: 'margin: 0; font-size: 24px; font-weight: bold;',
  content: 'background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;',
  card: 'background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;',
  label: 'color: #6c757d; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;',
  value: 'color: #212529; font-size: 16px; font-weight: 500; margin: 0;',
  badge: 'display: inline-block; background: #28a745; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;',
  badgeWarning: 'display: inline-block; background: #ffc107; color: #212529; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;',
  badgeDanger: 'display: inline-block; background: #dc3545; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;',
  button: 'display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 10px;',
  footer: 'text-align: center; color: #6c757d; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;',
}

/**
 * Template : Document reçu et rattaché automatiquement
 * Cas : Client avec 1 seul dossier actif
 */
export function templateDocumentAutoAttached(params: {
  lawyerName: string
  clientName: string
  clientPhone: string
  documentName: string
  documentSize: string
  dossierNumero: string
  dossierObjet?: string
  receivedAt: string
  dossierUrl: string
}): { subject: string; html: string; text: string } {
  const subject = `✅ Document reçu de ${params.clientName} - Dossier ${params.dossierNumero}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background: #e9ecef;">
  <div style="${styles.container}">
    <!-- Header -->
    <div style="${styles.header}">
      <h1 style="${styles.headerTitle}">📄 Nouveau Document WhatsApp</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Document reçu et rattaché automatiquement</p>
    </div>

    <!-- Content -->
    <div style="${styles.content}">
      <!-- Success Badge -->
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="${styles.badge}">✓ Rattaché automatiquement</span>
      </div>

      <!-- Document Info -->
      <div style="${styles.card}">
        <h2 style="margin-top: 0; color: #667eea; font-size: 18px;">📄 Informations Document</h2>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Nom du fichier</div>
          <p style="${styles.value}">${params.documentName}</p>
        </div>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Taille</div>
          <p style="${styles.value}">${params.documentSize}</p>
        </div>
        <div>
          <div style="${styles.label}">Reçu le</div>
          <p style="${styles.value}">${params.receivedAt}</p>
        </div>
      </div>

      <!-- Client Info -->
      <div style="${styles.card}">
        <h2 style="margin-top: 0; color: #667eea; font-size: 18px;">👤 Client</h2>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Nom</div>
          <p style="${styles.value}">${params.clientName}</p>
        </div>
        <div>
          <div style="${styles.label}">Téléphone</div>
          <p style="${styles.value}">${params.clientPhone}</p>
        </div>
      </div>

      <!-- Dossier Info -->
      <div style="${styles.card}">
        <h2 style="margin-top: 0; color: #667eea; font-size: 18px;">📁 Dossier</h2>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Numéro</div>
          <p style="${styles.value}">Dossier ${params.dossierNumero}</p>
        </div>
        ${params.dossierObjet ? `
        <div>
          <div style="${styles.label}">Objet</div>
          <p style="${styles.value}">${params.dossierObjet}</p>
        </div>
        ` : ''}
      </div>

      <!-- Action Button -->
      <div style="text-align: center; margin-top: 30px;">
        <a href="${params.dossierUrl}" style="${styles.button}">
          Voir le dossier
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="${styles.footer}">
      <p>Cet email a été envoyé automatiquement par ${APP_NAME}</p>
      <p>Vous recevez cet email car un document a été reçu via WhatsApp</p>
    </div>
  </div>
</body>
</html>
  `

  const text = `
Nouveau Document WhatsApp Reçu

Document : ${params.documentName} (${params.documentSize})
Client : ${params.clientName} (${params.clientPhone})
Dossier : ${params.dossierNumero}${params.dossierObjet ? ` - ${params.dossierObjet}` : ''}
Reçu le : ${params.receivedAt}

✓ Le document a été automatiquement rattaché au dossier car le client a un seul dossier actif.

Voir le dossier : ${params.dossierUrl}

---
${APP_NAME}
  `.trim()

  return { subject, html, text }
}

/**
 * Template : Document en attente de rattachement
 * Cas : Client avec plusieurs dossiers actifs
 */
export function templateDocumentPendingClassification(params: {
  lawyerName: string
  clientName: string
  clientPhone: string
  documentName: string
  documentSize: string
  nombreDossiers: number
  receivedAt: string
  dashboardUrl: string
}): { subject: string; html: string; text: string } {
  const subject = `⏳ Action requise : Document de ${params.clientName} en attente`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background: #e9ecef;">
  <div style="${styles.container}">
    <!-- Header -->
    <div style="${styles.header}">
      <h1 style="${styles.headerTitle}">⏳ Document en Attente</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Rattachement manuel requis</p>
    </div>

    <!-- Content -->
    <div style="${styles.content}">
      <!-- Warning Badge -->
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="${styles.badgeWarning}">⚠ Action requise</span>
      </div>

      <!-- Alert Box -->
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
        <p style="margin: 0; color: #856404; font-weight: 500;">
          Ce client a ${params.nombreDossiers} dossiers actifs. Veuillez sélectionner manuellement le dossier approprié.
        </p>
      </div>

      <!-- Document Info -->
      <div style="${styles.card}">
        <h2 style="margin-top: 0; color: #667eea; font-size: 18px;">📄 Informations Document</h2>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Nom du fichier</div>
          <p style="${styles.value}">${params.documentName}</p>
        </div>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Taille</div>
          <p style="${styles.value}">${params.documentSize}</p>
        </div>
        <div>
          <div style="${styles.label}">Reçu le</div>
          <p style="${styles.value}">${params.receivedAt}</p>
        </div>
      </div>

      <!-- Client Info -->
      <div style="${styles.card}">
        <h2 style="margin-top: 0; color: #667eea; font-size: 18px;">👤 Client</h2>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Nom</div>
          <p style="${styles.value}">${params.clientName}</p>
        </div>
        <div>
          <div style="${styles.label}">Téléphone</div>
          <p style="${styles.value}">${params.clientPhone}</p>
        </div>
      </div>

      <!-- Action Button -->
      <div style="text-align: center; margin-top: 30px;">
        <a href="${params.dashboardUrl}" style="${styles.button}">
          Classer le document
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="${styles.footer}">
      <p>Cet email a été envoyé automatiquement par ${APP_NAME}</p>
      <p>Le document sera visible dans le widget "Documents en Attente" du dashboard</p>
    </div>
  </div>
</body>
</html>
  `

  const text = `
Document WhatsApp en Attente de Rattachement

Document : ${params.documentName} (${params.documentSize})
Client : ${params.clientName} (${params.clientPhone})
Reçu le : ${params.receivedAt}

⚠ ACTION REQUISE
Ce client a ${params.nombreDossiers} dossiers actifs. Veuillez sélectionner manuellement le dossier approprié depuis le dashboard.

Classer le document : ${params.dashboardUrl}

---
${APP_NAME}
  `.trim()

  return { subject, html, text }
}

/**
 * Template : Document de numéro inconnu
 * Cas : Numéro non identifié dans la base
 */
export function templateDocumentUnknownNumber(params: {
  lawyerName: string
  senderPhone: string
  senderName?: string
  documentName: string
  documentSize: string
  receivedAt: string
  clientsUrl: string
}): { subject: string; html: string; text: string } {
  const subject = `⚠️ Document de numéro inconnu : ${params.senderPhone}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background: #e9ecef;">
  <div style="${styles.container}">
    <!-- Header -->
    <div style="${styles.header}">
      <h1 style="${styles.headerTitle}">⚠️ Numéro Inconnu</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Document de contact non identifié</p>
    </div>

    <!-- Content -->
    <div style="${styles.content}">
      <!-- Danger Badge -->
      <div style="text-align: center; margin-bottom: 20px;">
        <span style="${styles.badgeDanger}">⚠ Numéro inconnu</span>
      </div>

      <!-- Alert Box -->
      <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
        <p style="margin: 0; color: #721c24; font-weight: 500;">
          Ce numéro n'est associé à aucun client dans votre base. Veuillez créer une fiche client ou mettre à jour un client existant.
        </p>
      </div>

      <!-- Document Info -->
      <div style="${styles.card}">
        <h2 style="margin-top: 0; color: #667eea; font-size: 18px;">📄 Informations Document</h2>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Nom du fichier</div>
          <p style="${styles.value}">${params.documentName}</p>
        </div>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Taille</div>
          <p style="${styles.value}">${params.documentSize}</p>
        </div>
        <div>
          <div style="${styles.label}">Reçu le</div>
          <p style="${styles.value}">${params.receivedAt}</p>
        </div>
      </div>

      <!-- Sender Info -->
      <div style="${styles.card}">
        <h2 style="margin-top: 0; color: #667eea; font-size: 18px;">📞 Expéditeur</h2>
        <div style="margin-bottom: 15px;">
          <div style="${styles.label}">Numéro de téléphone</div>
          <p style="${styles.value}">${params.senderPhone}</p>
        </div>
        ${params.senderName ? `
        <div>
          <div style="${styles.label}">Nom WhatsApp</div>
          <p style="${styles.value}">${params.senderName}</p>
        </div>
        ` : ''}
      </div>

      <!-- Action Button -->
      <div style="text-align: center; margin-top: 30px;">
        <a href="${params.clientsUrl}" style="${styles.button}">
          Créer une fiche client
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="${styles.footer}">
      <p>Cet email a été envoyé automatiquement par ${APP_NAME}</p>
      <p>Le document sera conservé et pourra être rattaché après création du client</p>
    </div>
  </div>
</body>
</html>
  `

  const text = `
Document WhatsApp de Numéro Inconnu

Document : ${params.documentName} (${params.documentSize})
Expéditeur : ${params.senderPhone}${params.senderName ? ` (${params.senderName})` : ''}
Reçu le : ${params.receivedAt}

⚠ NUMÉRO INCONNU
Ce numéro n'est associé à aucun client dans votre base. Veuillez créer une fiche client ou mettre à jour un client existant avec ce numéro.

Créer un client : ${params.clientsUrl}

---
${APP_NAME}
  `.trim()

  return { subject, html, text }
}
