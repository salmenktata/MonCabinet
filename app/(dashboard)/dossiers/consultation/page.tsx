import { redirect } from 'next/navigation'

export default function DossierConsultationPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') params.set(key, value)
  }
  const qs = params.toString()
  redirect(`/qadhya-ia/consult${qs ? `?${qs}` : ''}`)
}
