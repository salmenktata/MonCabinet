import { Suspense } from 'react'
import ServerStatusClient from './ServerStatusClient'

export default function ServerStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Chargement...
        </div>
      }
    >
      <ServerStatusClient />
    </Suspense>
  )
}
