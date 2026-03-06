'use client'

import { UnifiedChatPage } from '../UnifiedChatPage'

interface ChatPageProps {
  userId: string
  initialHistoryCollapsed?: boolean
}

export function ChatPage({ userId, initialHistoryCollapsed }: ChatPageProps) {
  return (
    <UnifiedChatPage
      userId={userId}
      initialAction="chat"
      hideActionButtons={true}
      initialHistoryCollapsed={initialHistoryCollapsed}
    />
  )
}
