import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

const COOKIE_NAME = 'auth_session'

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL('/login', request.url)
    const response = NextResponse.redirect(url)
    clearSessionCookie(response)
    return response
  } catch (error) {
    console.error('[API Signout] Erreur GET:', error)
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL('/login', request.url)
    const response = NextResponse.redirect(url, { status: 303 }) // 303 = follow with GET
    clearSessionCookie(response)
    return response
  } catch (error) {
    console.error('[API Signout] Erreur:', error)
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
  }
}
