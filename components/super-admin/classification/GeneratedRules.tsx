'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle, AlertTriangle, Search, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface GeneratedRule {
  id: string
  name: string
  webSourceId: string
  sourceName: string
  ruleType: string
  pattern: string
  conditions: any
  classification: any
  priority: number
  isActive: boolean
  timesMatched: number
  timesCorrect: number
  accuracy: number
  createdFromCorrections: boolean
  createdAt: string
  lastMatchedAt: string | null
}

export function GeneratedRules() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [accuracyFilter, setAccuracyFilter] = useState<string>('0')

  // Fetch generated rules
  const { data, isLoading } = useQuery({
    queryKey: ['generated-rules', activeFilter, accuracyFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (activeFilter !== 'all') {
        params.set('isActive', activeFilter)
      }
      if (accuracyFilter !== '0') {
        params.set('minAccuracy', accuracyFilter)
      }
      params.set('limit', '50')

      const res = await fetch(`/api/super-admin/classification/generated-rules?${params}`)
      if (!res.ok) throw new Error('Failed to fetch rules')
      return res.json()
    },
  })

  // Toggle rule active status
  const toggleRuleMutation = useMutation({
    mutationFn: async ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) => {
      const res = await fetch('/api/super-admin/classification/generated-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, isActive }),
      })
      if (!res.ok) throw new Error('Failed to update rule')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-rules'] })
    },
  })

  const filteredRules = data?.items?.filter((rule: GeneratedRule) =>
    search
      ? rule.name.toLowerCase().includes(search.toLowerCase()) ||
        rule.sourceName.toLowerCase().includes(search.toLowerCase())
      : true
  )

  const getStatusBadge = (rule: GeneratedRule) => {
    if (!rule.isActive) {
      return <Badge variant="secondary">Désactivé</Badge>
    }

    if (rule.timesMatched === 0) {
      return <Badge variant="outline">Non testé</Badge>
    }

    const accuracy = rule.accuracy

    if (accuracy >= 90) {
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Excellent ({accuracy}%)
        </Badge>
      )
    } else if (accuracy >= 70) {
      return (
        <Badge variant="default" className="bg-blue-600">
          Actif ({accuracy}%)
        </Badge>
      )
    } else if (accuracy >= 50) {
      return (
        <Badge variant="default" className="bg-orange-600">
          <AlertTriangle className="w-3 h-3 mr-1" />
          À réviser ({accuracy}%)
        </Badge>
      )
    } else {
      return (
        <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          À désactiver ({accuracy}%)
        </Badge>
      )
    }
  }

  const stats = {
    total: data?.total || 0,
    active: data?.items?.filter((r: GeneratedRule) => r.isActive).length || 0,
    excellent: data?.items?.filter((r: GeneratedRule) => r.accuracy >= 90).length || 0,
    needsReview: data?.items?.filter((r: GeneratedRule) => r.accuracy < 70 && r.timesMatched > 0).length || 0,
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Règles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Actives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Excellentes (&gt;90%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.excellent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              À réviser (&lt;70%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.needsReview}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Règles Auto-générées</CardTitle>
          <CardDescription>
            Règles créées automatiquement depuis les corrections humaines
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom ou source..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="true">Actives</SelectItem>
                <SelectItem value="false">Désactivées</SelectItem>
              </SelectContent>
            </Select>

            <Select value={accuracyFilter} onValueChange={setAccuracyFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Précision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Toutes précisions</SelectItem>
                <SelectItem value="90">≥ 90%</SelectItem>
                <SelectItem value="70">≥ 70%</SelectItem>
                <SelectItem value="50">≥ 50%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Rules Table */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement...</div>
          ) : filteredRules?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucune règle trouvée
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Utilisée</TableHead>
                    <TableHead className="text-right">Correcte</TableHead>
                    <TableHead className="text-right">Précision</TableHead>
                    <TableHead>Créée le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRules?.map((rule: GeneratedRule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>{rule.sourceName}</TableCell>
                      <TableCell>{getStatusBadge(rule)}</TableCell>
                      <TableCell className="text-right">{rule.timesMatched}</TableCell>
                      <TableCell className="text-right">{rule.timesCorrect}</TableCell>
                      <TableCell className="text-right">
                        {rule.timesMatched > 0 ? (
                          <span className="font-medium">{rule.accuracy}%</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(rule.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant={rule.isActive ? 'outline' : 'default'}
                            size="sm"
                            onClick={() =>
                              toggleRuleMutation.mutate({
                                ruleId: rule.id,
                                isActive: !rule.isActive,
                              })
                            }
                            disabled={toggleRuleMutation.isPending}
                          >
                            {rule.isActive ? 'Désactiver' : 'Activer'}
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              href={`/super-admin/web-sources/${rule.webSourceId}/rules`}
                              target="_blank"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
