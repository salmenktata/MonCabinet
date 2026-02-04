import ClientForm from '@/components/clients/ClientForm'

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Nouveau client</h1>
        <p className="mt-2 text-gray-600">
          Ajoutez un nouveau client à votre base
        </p>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <ClientForm />
      </div>
    </div>
  )
}
