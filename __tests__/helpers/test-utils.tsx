/**
 * Helpers pour les tests
 * Utilities réutilisables pour simplifier l'écriture des tests
 */

import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'

/**
 * Render personnalisé avec providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { ...options })
}

/**
 * Mock d'une session utilisateur
 */
export const mockSession = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
}

/**
 * Mock d'une requête query PostgreSQL
 */
export const mockQueryResult = (rows: any[] = []) => ({
  rows,
  rowCount: rows.length,
  command: 'SELECT',
  oid: 0,
  fields: [],
})

/**
 * Helper pour attendre une promise
 */
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Helper pour créer un FormData de test
 */
export function createMockFormData(data: Record<string, any>): FormData {
  const formData = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, value.toString())
    }
  })
  return formData
}

/**
 * Helper pour créer un mock File
 */
export function createMockFile(
  name: string = 'test.pdf',
  type: string = 'application/pdf',
  size: number = 1024
): File {
  const blob = new Blob(['test content'], { type })
  return new File([blob], name, { type, lastModified: Date.now() })
}

export * from '@testing-library/react'
