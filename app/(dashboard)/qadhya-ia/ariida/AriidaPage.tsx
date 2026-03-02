'use client'

import { UnifiedChatPage } from '../UnifiedChatPage'

interface AriidaPageProps {
  userId: string
}

export function AriidaPage({ userId }: AriidaPageProps) {
  return (
    <UnifiedChatPage
      userId={userId}
      initialAction="ariida"
      hideActionButtons={true}
    />
  )
}
