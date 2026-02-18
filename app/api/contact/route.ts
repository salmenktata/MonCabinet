import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/brevo-client'

export async function POST(request: NextRequest) {
  try {
    const { name, email, subject, message } = await request.json()

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const adminEmail = process.env.CONTACT_EMAIL || process.env.BREVO_SENDER_EMAIL || 'contact@qadhya.tn'

    await sendEmail({
      to: adminEmail,
      subject: `[Contact Qadhya] ${subject}`,
      htmlContent: `
        <h2>Nouveau message de contact</h2>
        <p><strong>Nom :</strong> ${name}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Sujet :</strong> ${subject}</p>
        <hr />
        <p>${message.replace(/\n/g, '<br />')}</p>
      `,
      textContent: `Nom: ${name}\nEmail: ${email}\nSujet: ${subject}\n\n${message}`,
      replyTo: email,
      tags: ['contact-form'],
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Contact API] Error:', error)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
