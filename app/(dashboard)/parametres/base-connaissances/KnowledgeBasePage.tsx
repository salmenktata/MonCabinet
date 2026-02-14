'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, BookOpen, X } from 'lucide-react'
import KnowledgeBaseStats, {
  type KnowledgeBaseStatsData,
} from '@/components/knowledge-base/KnowledgeBaseStats'
import KnowledgeBaseList, {
  type KnowledgeBaseDocumentData,
} from '@/components/knowledge-base/KnowledgeBaseList'
import KnowledgeBaseUploadForm from '@/components/knowledge-base/KnowledgeBaseUploadForm'
import {
  listKnowledgeDocumentsAction,
  getKnowledgeBaseStatsAction,
} from '@/app/actions/knowledge-base'

interface KnowledgeBasePageProps {
  initialDocuments: KnowledgeBaseDocumentData[]
  initialTotal: number
  initialStats: KnowledgeBaseStatsData
}

export default function KnowledgeBasePage({
  initialDocuments,
  initialTotal,
  initialStats,
}: KnowledgeBasePageProps) {
  const router = useRouter()
  const [documents, setDocuments] = useState(initialDocuments)
  const [total, setTotal] = useState(initialTotal)
  const [stats, setStats] = useState(initialStats)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refreshData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [docsResult, statsResult] = await Promise.all([
        listKnowledgeDocumentsAction({ limit: 50, offset: 0 }),
        getKnowledgeBaseStatsAction(),
      ])

      if (docsResult.success && docsResult.documents) {
        setDocuments(docsResult.documents)
        setTotal(docsResult.total || 0)
      }

      if (statsResult.success && statsResult.stats) {
        setStats(statsResult.stats)
      }
    } catch (error) {
      console.error('Erreur refresh:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  const handleUploadSuccess = () => {
    setShowUploadModal(false)
    refreshData()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            قاعدة المعرفة القانونية
          </h1>
          <p className="mt-2 text-muted-foreground">
            إدارة الوثائق المرجعية (القوانين، الاجتهادات القضائية، الفقه) لإثراء استجابات المساعد القانوني
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          إضافة وثيقة
        </button>
      </div>

      {/* Statistiques */}
      <KnowledgeBaseStats stats={stats} />

      {/* Liste des documents */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">الوثائق المرجعية</h2>
        <KnowledgeBaseList
          documents={documents}
          total={total}
          onRefresh={refreshData}
        />
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">ℹ️ معلومات مهمة</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800" dir="rtl">
          <li>• الوثائق المضافة هنا متاحة لجميع المستخدمين عبر المساعد القانوني قاضية</li>
          <li>• تتم الفهرسة تلقائياً لتمكين البحث الدلالي في المحتوى</li>
          <li>• الصيغ المدعومة: PDF، DOCX، DOC، TXT</li>
          <li>• يُفضل إضافة النصوص العربية للاستفادة من البحث باللغة العربية</li>
        </ul>
      </div>

      {/* Modal Upload */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowUploadModal(false)}
          />

          {/* Modal */}
          <div className="relative bg-card rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                إضافة وثيقة إلى قاعدة المعرفة
              </h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <KnowledgeBaseUploadForm
                onSuccess={handleUploadSuccess}
                onCancel={() => setShowUploadModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
