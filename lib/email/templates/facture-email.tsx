import * as React from 'react'

interface FactureEmailProps {
  factureNumero: string
  clientNom: string
  montantTTC: string
  dateEmission: string
  dateEcheance?: string
  avocatNom: string
  avocatEmail: string
  avocatTelephone?: string
  langue?: 'fr' | 'ar'
}

export const FactureEmailTemplate: React.FC<FactureEmailProps> = ({
  factureNumero,
  clientNom,
  montantTTC,
  dateEmission,
  dateEcheance,
  avocatNom,
  avocatEmail,
  avocatTelephone,
  langue = 'fr',
}) => {
  const content = {
    fr: {
      subject: `Facture ${factureNumero}`,
      greeting: `Cher(e) ${clientNom},`,
      intro: `Veuillez trouver ci-joint la facture ${factureNumero} d'un montant de ${montantTTC}.`,
      details: 'Détails de la facture :',
      numero: 'Numéro',
      montant: 'Montant TTC',
      emission: 'Date d\'émission',
      echeance: 'Date d\'échéance',
      paiement: 'Modalités de paiement',
      paiementText: 'Le paiement peut être effectué par virement bancaire, chèque ou espèces.',
      questions: 'Pour toute question concernant cette facture, n\'hésitez pas à nous contacter.',
      cordialement: 'Cordialement,',
      footer: 'Cet email a été envoyé automatiquement. Merci de ne pas y répondre directement.',
      conformite: 'Facture conforme aux normes ONAT (Ordre National des Avocats de Tunisie)',
    },
    ar: {
      subject: `فاتورة ${factureNumero}`,
      greeting: `عزيزي/عزيزتي ${clientNom}،`,
      intro: `يرجى العثور على الفاتورة المرفقة ${factureNumero} بمبلغ ${montantTTC}.`,
      details: 'تفاصيل الفاتورة:',
      numero: 'الرقم',
      montant: 'المبلغ الإجمالي',
      emission: 'تاريخ الإصدار',
      echeance: 'تاريخ الاستحقاق',
      paiement: 'طرق الدفع',
      paiementText: 'يمكن الدفع عن طريق التحويل البنكي أو الشيك أو النقد.',
      questions: 'لأي استفسار بخصوص هذه الفاتورة، لا تتردد في الاتصال بنا.',
      cordialement: 'مع أطيب التحيات،',
      footer: 'تم إرسال هذا البريد الإلكتروني تلقائيًا. يرجى عدم الرد عليه مباشرة.',
      conformite: 'فاتورة متوافقة مع معايير المنظمة الوطنية للمحامين بتونس',
    },
  }

  const t = content[langue]

  return (
    <html dir={langue === 'ar' ? 'rtl' : 'ltr'}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body
        style={{
          fontFamily: langue === 'ar'
            ? 'Arial, sans-serif'
            : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          lineHeight: '1.6',
          color: '#333333',
          backgroundColor: '#f4f4f4',
          margin: 0,
          padding: 0,
        }}
      >
        <div
          style={{
            maxWidth: '600px',
            margin: '20px auto',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* En-tête bleu */}
          <div
            style={{
              backgroundColor: '#2563eb',
              padding: '30px 20px',
              textAlign: 'center',
            }}
          >
            <h1
              style={{
                color: '#ffffff',
                margin: 0,
                fontSize: '24px',
                fontWeight: 'bold',
              }}
            >
              {t.subject}
            </h1>
          </div>

          {/* Contenu principal */}
          <div style={{ padding: '30px 20px' }}>
            <p style={{ fontSize: '16px', marginBottom: '20px' }}>
              {t.greeting}
            </p>

            <p style={{ fontSize: '14px', marginBottom: '25px', color: '#666666' }}>
              {t.intro}
            </p>

            {/* Carte de détails */}
            <div
              style={{
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                padding: '20px',
                marginBottom: '25px',
                border: '1px solid #e5e7eb',
              }}
            >
              <h2
                style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  marginTop: 0,
                  marginBottom: '15px',
                  color: '#1e40af',
                }}
              >
                {t.details}
              </h2>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        padding: '8px 0',
                        fontSize: '14px',
                        color: '#666666',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {t.numero}:
                    </td>
                    <td
                      style={{
                        padding: '8px 0',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        textAlign: langue === 'ar' ? 'left' : 'right',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {factureNumero}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: '8px 0',
                        fontSize: '14px',
                        color: '#666666',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {t.montant}:
                    </td>
                    <td
                      style={{
                        padding: '8px 0',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        color: '#2563eb',
                        textAlign: langue === 'ar' ? 'left' : 'right',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {montantTTC}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        padding: '8px 0',
                        fontSize: '14px',
                        color: '#666666',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {t.emission}:
                    </td>
                    <td
                      style={{
                        padding: '8px 0',
                        fontSize: '14px',
                        textAlign: langue === 'ar' ? 'left' : 'right',
                        borderBottom: '1px solid #e5e7eb',
                      }}
                    >
                      {dateEmission}
                    </td>
                  </tr>
                  {dateEcheance && (
                    <tr>
                      <td
                        style={{
                          padding: '8px 0',
                          fontSize: '14px',
                          color: '#666666',
                        }}
                      >
                        {t.echeance}:
                      </td>
                      <td
                        style={{
                          padding: '8px 0',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          color: '#dc2626',
                          textAlign: langue === 'ar' ? 'left' : 'right',
                        }}
                      >
                        {dateEcheance}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Modalités de paiement */}
            <div
              style={{
                backgroundColor: '#fef3c7',
                borderRadius: '6px',
                padding: '15px',
                marginBottom: '25px',
                borderLeft: '4px solid #f59e0b',
              }}
            >
              <h3
                style={{
                  fontSize: '14px',
                  fontWeight: 'bold',
                  marginTop: 0,
                  marginBottom: '8px',
                  color: '#92400e',
                }}
              >
                {t.paiement}
              </h3>
              <p style={{ fontSize: '13px', margin: 0, color: '#78350f' }}>
                {t.paiementText}
              </p>
            </div>

            {/* Message de contact */}
            <p style={{ fontSize: '14px', color: '#666666', marginBottom: '20px' }}>
              {t.questions}
            </p>

            {/* Signature */}
            <div style={{ marginTop: '30px' }}>
              <p style={{ fontSize: '14px', marginBottom: '5px' }}>
                {t.cordialement}
              </p>
              <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '5px 0' }}>
                {avocatNom}
              </p>
              <p style={{ fontSize: '13px', color: '#666666', margin: '5px 0' }}>
                ✉️ {avocatEmail}
              </p>
              {avocatTelephone && (
                <p style={{ fontSize: '13px', color: '#666666', margin: '5px 0' }}>
                  📞 {avocatTelephone}
                </p>
              )}
            </div>
          </div>

          {/* Pied de page */}
          <div
            style={{
              backgroundColor: '#f9fafb',
              padding: '20px',
              textAlign: 'center',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <p
              style={{
                fontSize: '12px',
                color: '#9ca3af',
                margin: '0 0 8px 0',
              }}
            >
              {t.footer}
            </p>
            <p
              style={{
                fontSize: '11px',
                color: '#9ca3af',
                margin: 0,
              }}
            >
              {t.conformite}
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}

// Version texte simple pour les clients email qui ne supportent pas HTML
export const FactureEmailText = ({
  factureNumero,
  clientNom,
  montantTTC,
  dateEmission,
  dateEcheance,
  avocatNom,
  avocatEmail,
  avocatTelephone,
  langue = 'fr',
}: FactureEmailProps): string => {
  const content = {
    fr: `
Cher(e) ${clientNom},

Veuillez trouver ci-joint la facture ${factureNumero} d'un montant de ${montantTTC}.

DÉTAILS DE LA FACTURE
----------------------
Numéro: ${factureNumero}
Montant TTC: ${montantTTC}
Date d'émission: ${dateEmission}
${dateEcheance ? `Date d'échéance: ${dateEcheance}` : ''}

MODALITÉS DE PAIEMENT
----------------------
Le paiement peut être effectué par virement bancaire, chèque ou espèces.

Pour toute question concernant cette facture, n'hésitez pas à nous contacter.

Cordialement,
${avocatNom}
${avocatEmail}
${avocatTelephone ? avocatTelephone : ''}

---
Cet email a été envoyé automatiquement. Merci de ne pas y répondre directement.
Facture conforme aux normes ONAT (Ordre National des Avocats de Tunisie)
`,
    ar: `
عزيزي/عزيزتي ${clientNom}،

يرجى العثور على الفاتورة المرفقة ${factureNumero} بمبلغ ${montantTTC}.

تفاصيل الفاتورة
----------------------
الرقم: ${factureNumero}
المبلغ الإجمالي: ${montantTTC}
تاريخ الإصدار: ${dateEmission}
${dateEcheance ? `تاريخ الاستحقاق: ${dateEcheance}` : ''}

طرق الدفع
----------------------
يمكن الدفع عن طريق التحويل البنكي أو الشيك أو النقد.

لأي استفسار بخصوص هذه الفاتورة، لا تتردد في الاتصال بنا.

مع أطيب التحيات،
${avocatNom}
${avocatEmail}
${avocatTelephone ? avocatTelephone : ''}

---
تم إرسال هذا البريد الإلكتروني تلقائيًا. يرجى عدم الرد عليه مباشرة.
فاتورة متوافقة مع معايير المنظمة الوطنية للمحامين بتونس
`,
  }

  return content[langue]
}
