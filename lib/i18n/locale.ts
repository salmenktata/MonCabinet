'use server'

import { cookies } from 'next/headers'
import type { Locale } from '@/i18n.config'

const COOKIE_NAME = 'NEXT_LOCALE'

export async function getUserLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  return (cookieStore.get(COOKIE_NAME)?.value as Locale) || 'fr'
}

export async function setUserLocale(locale: Locale) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, locale, {
    path: '/',
    maxAge: 365 * 24 * 60 * 60, // 1 an
    sameSite: 'lax',
  })
}
