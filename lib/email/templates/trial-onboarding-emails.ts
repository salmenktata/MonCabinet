/**
 * Templates emails séquence onboarding trial
 *
 * J0  : Bienvenue + guide 3 étapes
 * J3  : Nudge IA (si 0 utilisation)
 * J7  : Récap utilisations + conseil
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://qadhya.tn'

function wrap(content: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;">
<div style="background:white;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
${content}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
<p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
  Qadhya — <a href="mailto:contact@qadhya.tn" style="color:#2563eb;">contact@qadhya.tn</a>
  &nbsp;•&nbsp; <a href="${APP_URL}/dashboard" style="color:#2563eb;">Accéder à votre espace</a>
</p>
</div>
</body></html>`.trim()
}

const btn = (url: string, label: string, color = '#2563eb') =>
  `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="background:${color};color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">${label}</a>
  </div>`

// ─── J0 : Bienvenue ────────────────────────────────────────────────────────

export function getJ0WelcomeEmailHtml(userName: string, referralCode: string): string {
  const safeName = userName.replace(/[<>&"']/g, '')
  return wrap(`
    <h2 style="color:#1e293b;margin-bottom:4px;">Bienvenue sur Qadhya, ${safeName} 👋</h2>
    <p style="color:#475569;font-size:14px;margin-top:0;">Votre accès gratuit vient de commencer.</p>

    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:20px;margin:20px 0;">
      <p style="color:#0369a1;font-weight:700;margin:0 0 12px;font-size:16px;">3 étapes pour démarrer</p>
      <ol style="color:#0c4a6e;margin:0;padding-left:20px;line-height:2;">
        <li><strong>Créez votre premier dossier</strong> — Importez un acte ou contrat</li>
        <li><strong>Posez une question juridique</strong> — Testez le Chat IA</li>
        <li><strong>Explorez la base de droit tunisien</strong> — +6 800 documents</li>
      </ol>
    </div>

    <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="color:#64748b;font-size:13px;margin:0 0 8px;"><strong>Votre code de parrainage :</strong></p>
      <p style="font-size:24px;font-weight:bold;color:#1e293b;letter-spacing:4px;margin:0;text-align:center;">${referralCode}</p>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:8px 0 0;">Partagez-le avec vos confrères — chaque filleul qui souscrit vous offre 1 mois gratuit</p>
    </div>

    ${btn(`${APP_URL}/dashboard`, 'Commencer maintenant')}

    <p style="color:#64748b;font-size:13px;text-align:center;">
      Vous avez <strong>30 requêtes IA</strong> pour découvrir Qadhya à votre rythme.
    </p>
  `)
}

export function getJ0WelcomeEmailText(userName: string): string {
  return `Bonjour ${userName},

Bienvenue sur Qadhya ! Votre accès gratuit avec 30 requêtes IA vient de commencer.

3 étapes pour démarrer :
1. Créez votre premier dossier
2. Posez une question juridique au Chat IA
3. Explorez la base de +6 800 documents de droit tunisien

Accédez à votre espace : ${APP_URL}/dashboard

L'équipe Qadhya`
}

// ─── J3 : Nudge IA ────────────────────────────────────────────────────────

export function getJ3NudgeEmailHtml(userName: string, usesRemaining: number): string {
  const safeName = userName.replace(/[<>&"']/g, '')
  return wrap(`
    <h2 style="color:#1e293b;">Avez-vous essayé le Chat IA, ${safeName} ?</h2>
    <p style="color:#475569;line-height:1.6;">
      Vous avez accès à Qadhya depuis quelques jours — mais nous n'avons pas encore vu de question juridique de votre part.
    </p>

    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin:20px 0;">
      <p style="color:#c2410c;font-weight:700;margin:0 0 8px;">Ce que vous pourriez demander :</p>
      <ul style="color:#9a3412;margin:0;padding-left:20px;line-height:1.8;">
        <li>« Quelles sont les conditions de résiliation d'un contrat de bail ? »</li>
        <li>« Procédure d'injonction de payer en droit tunisien »</li>
        <li>« Délai de prescription civile selon le COC »</li>
      </ul>
    </div>

    <p style="color:#475569;">
      Il vous reste <strong>${usesRemaining} requêtes IA</strong> incluses dans votre accès gratuit.
    </p>

    ${btn(`${APP_URL}/assistant-juridique`, 'Poser ma première question', '#0369a1')}
  `)
}

export function getJ3NudgeEmailText(userName: string, usesRemaining: number): string {
  return `Bonjour ${userName},

Vous avez accès à Qadhya depuis quelques jours. Il vous reste ${usesRemaining} requêtes IA.

Essayez de poser une question juridique :
- Conditions de résiliation d'un bail
- Procédure d'injonction de payer
- Délai de prescription civile

Accédez au Chat IA : ${APP_URL}/assistant-juridique

L'équipe Qadhya`
}

// ─── J7 : Point d'étape ───────────────────────────────────────────────────

export function getJ7MidwayEmailHtml(userName: string, usesRemaining: number, usesUsed: number): string {
  const safeName = userName.replace(/[<>&"']/g, '')
  const progressPct = Math.round((usesUsed / 30) * 100)

  return wrap(`
    <h2 style="color:#1e293b;">Votre utilisation Qadhya, ${safeName}</h2>
    <p style="color:#475569;line-height:1.6;">
      Voici un récap de votre utilisation depuis le début de votre accès gratuit :
    </p>

    <div style="background:#f8fafc;border-radius:10px;padding:20px;margin:20px 0;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span style="color:#475569;font-size:14px;">Requêtes IA utilisées</span>
        <strong style="color:#1e293b;">${usesUsed} / 30</strong>
      </div>
      <div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden;">
        <div style="background:#2563eb;height:8px;width:${progressPct}%;border-radius:4px;"></div>
      </div>
      <p style="color:#64748b;font-size:12px;margin:8px 0 0;">Il vous reste <strong>${usesRemaining} requêtes IA</strong> incluses</p>
    </div>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:16px 0;">
      <p style="color:#166534;font-size:14px;margin:0;">
        💡 <strong>Conseil :</strong> Testez la structuration automatique d'un document — importez un contrat et demandez à Qadhya de l'analyser.
      </p>
    </div>

    ${btn(`${APP_URL}/dashboard`, 'Continuer sur Qadhya')}

    <p style="color:#94a3b8;font-size:12px;text-align:center;">
      Passez au plan Pro à tout moment pour un accès IA illimité.
      <a href="${APP_URL}/upgrade" style="color:#2563eb;">Voir les plans →</a>
    </p>
  `)
}

export function getJ7MidwayEmailText(userName: string, usesRemaining: number): string {
  return `Bonjour ${userName},

Voici un récap de votre utilisation Qadhya. Il vous reste ${usesRemaining} requêtes IA incluses dans votre accès gratuit.

Conseil : Testez la structuration automatique d'un document — importez un contrat et demandez à Qadhya de l'analyser.

Continuer : ${APP_URL}/dashboard

L'équipe Qadhya`
}

