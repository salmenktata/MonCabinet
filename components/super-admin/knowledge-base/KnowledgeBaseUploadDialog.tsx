'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { KnowledgeBaseUpload } from './KnowledgeBaseUpload'

export function KnowledgeBaseUploadDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Icons.plus className="h-4 w-4 mr-2" />
          Ajouter document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">Ajouter un document</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Uploadez des fichiers PDF, DOCX ou TXT pour enrichir la base de connaissances
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <KnowledgeBaseUpload />
        </div>
      </DialogContent>
    </Dialog>
  )
}
