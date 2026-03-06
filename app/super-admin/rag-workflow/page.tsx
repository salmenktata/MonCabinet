'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  GitBranch,
  Database,
  Search,
  Zap,
  Brain,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

// ─── Badges helpers ──────────────────────────────────────────────────────────

function BadgePrimary({ children }: { children: React.ReactNode }) {
  return (
    <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
      {children}
    </Badge>
  )
}

function BadgeFallback({ children }: { children: React.ReactNode }) {
  return (
    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100">
      {children}
    </Badge>
  )
}

function BadgeInfo({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary">
      {children}
    </Badge>
  )
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function ParamGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
      {items.map(({ label, value }) => (
        <div key={label} className="bg-muted/50 rounded-md px-3 py-2">
          <div className="text-xs text-muted-foreground">{label}</div>
          <code className="text-sm font-mono font-semibold">{value}</code>
        </div>
      ))}
    </div>
  )
}

// ─── Onglet Vue Globale ───────────────────────────────────────────────────────

function TabVueGlobale() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-blue-600" />
            Pipeline complet — de la requête à la réponse
          </CardTitle>
          <CardDescription>
            Chaque étape est exécutée séquentiellement sauf les recherches parallèles (∥)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="font-mono text-xs bg-background text-foreground rounded-lg p-6 overflow-x-auto leading-relaxed">
{`USER QUERY
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  1. PRÉ-TRAITEMENT                                       │
│     ├─ Détection langue      → AR / FR / Bilingue       │
│     ├─ Query Expansion       → Groq (si <50 chars)      │
│     └─ Query Classification  → Groq (keyword|semantic)  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  2. TRIPLE EMBEDDING ∥                                   │
│     ├─ OpenAI  text-embedding-3-small  → 1536 dims      │
│     ├─ Gemini  text-embedding-004      → 768 dims       │
│     └─ Ollama  qwen3-embedding:0.6b    → 1024 dims      │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  3. 5 RECHERCHES ∥ (Hybrid BM25 30% + Vector 70%)       │
│     ├─ Search OpenAI   (toutes catégories)              │
│     ├─ Search Gemini   (toutes catégories)              │
│     ├─ Search Ollama   (toutes catégories)              │
│     ├─ Codes OpenAI    (category='codes', boost 1.45×)  │
│     └─ Codes Gemini    (category='codes', boost 1.45×)  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  4. FUSION & SCORING                                     │
│     ├─ Fusion RRF par chunk_id  (k=60)                  │
│     ├─ Domain Boost MAP         (1.3× – 5.5×)           │
│     └─ Code Boost               (CODE_BOOST 1.3×)       │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  5. RE-RANKING                                           │
│     ├─ TF-IDF    (40% TF-IDF / 60% vectoriel)          │
│     └─ Cross-encoder  ms-marco-MiniLM-L-6-v2            │
│            (70% CE score / 30% score original)          │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  6. VALIDATION QUALITÉ                                   │
│     ├─ Hard Quality Gate  AR: 0.30 / FR: 0.50           │
│     ├─ Citation Validator  (regex + vérif KB sources)   │
│     └─ Abrogation Filter   (déprioritise ×0.5)         │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  7. GÉNÉRATION LLM                                       │
│     ├─ Groq  llama-3.3-70b-versatile  (streaming)      │
│     └─ Timeout wrapper  44s → HTTP 504                  │
└─────────────────────────────────────────────────────────┘
    │
    ▼
SSE RESPONSE (stream token par token)`}
          </pre>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Latence cible</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-2xl font-bold text-green-600">~292ms</code>
            <p className="text-xs text-muted-foreground mt-1">Groq llama-3.3-70b (premier token)</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Timeout global</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-2xl font-bold text-blue-600">44s</code>
            <p className="text-xs text-muted-foreground mt-1">Wrapper chat/consult/structure → HTTP 504</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Benchmark</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-2xl font-bold text-purple-600">100%</code>
            <p className="text-xs text-muted-foreground mt-1">hit@5 (20/20), avg score 4.593 (v11)</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Onglet Indexation ────────────────────────────────────────────────────────

function TabIndexation() {
  const chunkingConfig = [
    { category: 'codes', taille: '600', overlap: '100', note: 'Articles courts, densité maximale' },
    { category: 'jurisprudence', taille: '1800', overlap: '200', note: 'Contexte juridictionnel' },
    { category: 'procedures', taille: '800', overlap: '150', note: 'Étapes procédurales' },
    { category: 'doctrine', taille: '1200', overlap: '200', note: 'Analyses longues' },
    { category: 'templates', taille: '1000', overlap: '100', note: 'Modèles de documents' },
    { category: 'default', taille: '1000', overlap: '200', note: 'Catégories non spécifiées' },
  ]

  return (
    <div className="space-y-6">
      {/* Chunking adaptatif */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            Chunking adaptatif par catégorie
          </CardTitle>
          <CardDescription>
            Tailles en tokens • Quality gate : chunks &lt;40 tokens rejetés
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Catégorie</th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Taille</th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Overlap</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {chunkingConfig.map((row) => (
                  <tr key={row.category} className="border-b border-muted/50">
                    <td className="py-2 pr-4">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{row.category}</code>
                    </td>
                    <td className="py-2 pr-4 font-mono">{row.taille}</td>
                    <td className="py-2 pr-4 font-mono">{row.overlap}</td>
                    <td className="py-2 text-muted-foreground text-xs">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Triple embedding */}
      <Card>
        <CardHeader>
          <CardTitle>Triple embedding parallèle à l'indexation</CardTitle>
          <CardDescription>Les 3 embeddings sont générés en parallèle pour chaque chunk</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 border-green-200 bg-green-50/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">OpenAI</span>
                <BadgePrimary>Primaire</BadgePrimary>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Production — haute précision</p>
              <ParamGrid items={[
                { label: 'Modèle', value: 'text-embedding-3-small' },
                { label: 'Dimensions', value: '1536' },
                { label: 'Colonne DB', value: 'embedding_openai' },
              ]} />
            </div>
            <div className="border rounded-lg p-4 border-blue-200 bg-blue-50/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Gemini</span>
                <BadgeInfo>Multilingue</BadgeInfo>
              </div>
              <p className="text-xs text-muted-foreground mb-3">AR/FR — optimisé multilingue</p>
              <ParamGrid items={[
                { label: 'Modèle', value: 'text-embedding-004' },
                { label: 'Dimensions', value: '768' },
                { label: 'Colonne DB', value: 'embedding_gemini' },
              ]} />
            </div>
            <div className="border rounded-lg p-4 border-border bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">Ollama</span>
                <BadgeFallback>Dev/Legacy</BadgeFallback>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Local uniquement en dev</p>
              <ParamGrid items={[
                { label: 'Modèle', value: 'qwen3-embedding:0.6b' },
                { label: 'Dimensions', value: '1024' },
                { label: 'Colonne DB', value: 'embedding' },
              ]} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schema DB */}
      <Card>
        <CardHeader>
          <CardTitle>Schéma DB — knowledge_base_chunks</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="font-mono text-xs bg-background text-foreground rounded-lg p-4 overflow-x-auto">
{`knowledge_base_chunks
├── id                 UUID  PK
├── knowledge_base_id  UUID  FK → knowledge_base.id
├── content            TEXT  (texte du chunk)
├── chunk_index        INT
├── embedding          vector(1024)   -- Ollama
├── embedding_openai   vector(1536)   -- OpenAI ← PRIMAIRE
├── embedding_gemini   vector(768)    -- Gemini
├── token_count        INT
├── metadata           JSONB
└── created_at         TIMESTAMPTZ

knowledge_base
├── is_indexed         BOOLEAN  ← filtre actif (pas is_active)
├── doc_type           ENUM (TEXTES|JURIS|PROC|TEMPLATES|DOCTRINE)
└── chunk_count        INT`}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Onglet Recherche ─────────────────────────────────────────────────────────

function TabRecherche() {
  const searches = [
    { idx: '①', provider: 'OpenAI', categorie: 'Toutes', threshold: '0.35', boost: '—', note: 'Recherche principale' },
    { idx: '②', provider: 'Gemini', categorie: 'Toutes', threshold: '0.30', boost: '—', note: 'Couverture multilingue' },
    { idx: '③', provider: 'Ollama', categorie: 'Toutes', threshold: '0.30', boost: '—', note: 'Couverture locale' },
    { idx: '④', provider: 'OpenAI', categorie: "codes uniquement", threshold: '0.15', boost: '1.45×', note: 'Forced codes search' },
    { idx: '⑤', provider: 'Gemini', categorie: "codes uniquement", threshold: '0.12', boost: '1.45×', note: 'Forced codes (AR)' },
  ]

  const domainBoosts = [
    { terme: 'شيك / صك', boost: '5.0×', domaine: 'Droit cambiaire' },
    { terme: 'الدفاع الشرعي', boost: '5.5×', domaine: 'Droit pénal' },
    { terme: 'تفليس / إفلاس', boost: '4.5×', domaine: 'Droit des faillites' },
    { terme: 'codes / مجلة', boost: '1.3×', domaine: 'CODE_BOOST général' },
    { terme: 'Keywords juridiques', boost: '1.3×–2.5×', domaine: 'DOMAIN_BOOST_MAP' },
  ]

  return (
    <div className="space-y-6">
      {/* Type de query */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-600" />
            Détection type de requête
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 border-blue-200 bg-blue-50/30">
              <div className="font-semibold text-sm mb-1">Keyword (BM25 dominant)</div>
              <p className="text-xs text-muted-foreground mb-2">Requêtes courtes, termes juridiques exacts</p>
              <ParamGrid items={[
                { label: 'Poids BM25', value: '60%' },
                { label: 'Poids Vector', value: '40%' },
              ]} />
            </div>
            <div className="border rounded-lg p-4 border-purple-200 bg-purple-50/30">
              <div className="font-semibold text-sm mb-1">Semantic (Vector dominant)</div>
              <p className="text-xs text-muted-foreground mb-2">Questions longues, sens implicite</p>
              <ParamGrid items={[
                { label: 'Poids BM25', value: '30%' },
                { label: 'Poids Vector', value: '70%' },
              ]} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5 recherches */}
      <Card>
        <CardHeader>
          <CardTitle>5 recherches parallèles (∥)</CardTitle>
          <CardDescription>
            Toutes exécutées simultanément via <code className="text-xs">Promise.allSettled()</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-6">#</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Provider</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Catégorie</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Threshold</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Boost</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody>
                {searches.map((row) => (
                  <tr key={row.idx} className="border-b border-muted/50">
                    <td className="py-2 pr-3 font-mono text-base">{row.idx}</td>
                    <td className="py-2 pr-3">
                      <BadgePrimary>{row.provider}</BadgePrimary>
                    </td>
                    <td className="py-2 pr-3 text-xs">{row.categorie}</td>
                    <td className="py-2 pr-3 font-mono">{row.threshold}</td>
                    <td className="py-2 pr-3">
                      {row.boost !== '—' ? (
                        <span className="font-mono font-bold text-orange-600">{row.boost}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Fusion */}
      <Card>
        <CardHeader>
          <CardTitle>Fusion RRF (Reciprocal Rank Fusion)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Les résultats des 5 recherches sont fusionnés par <code className="text-xs bg-muted px-1 rounded">chunk_id</code> via RRF.
            </p>
            <ParamGrid items={[
              { label: 'Paramètre k', value: '60' },
              { label: 'Formule', value: '1/(k + rank)' },
              { label: 'Scores sommés', value: 'par chunk_id' },
            ]} />
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mt-2">
              <p className="text-xs font-medium text-orange-800">
                Les chunks des recherches codes-forced reçoivent un boost additionnel de <code>1.45×</code> après fusion
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Domain boost */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Boost MAP</CardTitle>
          <CardDescription>
            Appliqué après fusion RRF — règles PRIORITY détectées dans la query
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Terme détecté</th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Boost</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Domaine</th>
                </tr>
              </thead>
              <tbody>
                {domainBoosts.map((row) => (
                  <tr key={row.terme} className="border-b border-muted/50">
                    <td className="py-2 pr-4 font-mono text-sm">{row.terme}</td>
                    <td className="py-2 pr-4">
                      <span className="font-bold text-orange-600">{row.boost}</span>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{row.domaine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Onglet Re-ranking & Validation ──────────────────────────────────────────

function TabReranking() {
  return (
    <div className="space-y-6">
      {/* TF-IDF + Cross-encoder */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">TF-IDF Re-ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Première passe — pondération lexicale des termes de la query dans les chunks
            </p>
            <ParamGrid items={[
              { label: 'Poids TF-IDF', value: '40%' },
              { label: 'Poids Vectoriel', value: '60%' },
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cross-encoder</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Deuxième passe — score de pertinence pair-à-pair (query, chunk)
            </p>
            <ParamGrid items={[
              { label: 'Modèle', value: 'ms-marco-MiniLM-L-6-v2' },
              { label: 'Poids CE', value: '70%' },
              { label: 'Poids Original', value: '30%' },
            ]} />
          </CardContent>
        </Card>
      </div>

      {/* Hard Quality Gate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Hard Quality Gate
          </CardTitle>
          <CardDescription>
            Chunks sous le seuil sont exclus — évite hallucinations sur matériel non pertinent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Langue</th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Seuil Vector primaire</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Seuil Vector secondaire</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-muted/50">
                  <td className="py-2 pr-4">
                    <Badge variant="outline">Arabe (AR)</Badge>
                  </td>
                  <td className="py-2 pr-4 font-mono font-bold text-blue-600">0.30</td>
                  <td className="py-2 font-mono text-muted-foreground">0.20</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">
                    <Badge variant="outline">Français (FR)</Badge>
                  </td>
                  <td className="py-2 pr-4 font-mono font-bold text-blue-600">0.50</td>
                  <td className="py-2 font-mono text-muted-foreground">0.35</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              Le seuil arabe est plus bas (0.30) car les embeddings multilingues sont naturellement moins similaires en arabe qu'en français.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Citation validator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            Citation Validator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Après génération LLM — vérifie que les articles/lois cités existent dans les sources KB
            </p>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs font-mono mb-2 text-muted-foreground">Patterns détectés :</p>
              <div className="space-y-1">
                <code className="text-xs block">الفصل \d+ / Article \d+</code>
                <code className="text-xs block">القانون \d+ / Loi n°\d+</code>
                <code className="text-xs block">المرسوم \d+ / Décret \d+</code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Abrogation filter */}
      <Card>
        <CardHeader>
          <CardTitle>Abrogation Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Déprioritise les documents contenant des marqueurs d'abrogation
            </p>
            <ParamGrid items={[
              { label: 'Facteur déprioritisation', value: '×0.5' },
              { label: 'Action', value: 'Suggère alternatives' },
            ]} />
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mt-2">
              <p className="text-xs text-orange-800">
                Marqueurs : <code>ملغى</code>, <code>abrogé</code>, <code>منسوخ</code>, <code>remplacé</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Onglet Génération LLM ────────────────────────────────────────────────────

function TabGenerationLLM() {
  const operations = [
    {
      name: 'assistant-ia',
      provider: 'Groq',
      model: 'llama-3.3-70b-versatile',
      temp: '0.1',
      maxTokens: '8000',
      timeout: '45s',
      note: 'Chat temps réel utilisateur',
    },
    {
      name: 'dossiers-assistant',
      provider: 'Groq',
      model: 'llama-3.3-70b-versatile',
      temp: '0.2',
      maxTokens: '8000',
      timeout: '45s',
      note: 'Analyse approfondie dossier',
    },
    {
      name: 'dossiers-consultation',
      provider: 'Groq',
      model: 'llama-3.3-70b-versatile',
      temp: '0.1',
      maxTokens: '4000',
      timeout: '60s',
      note: 'Consultation juridique IRAC',
    },
    {
      name: 'kb-quality-analysis',
      provider: 'Groq',
      model: 'llama-3.3-70b-versatile',
      temp: '0.1',
      maxTokens: '8000',
      timeout: '90s',
      note: 'Analyse qualité documents KB',
    },
    {
      name: 'document-consolidation',
      provider: 'Groq',
      model: 'llama-3.3-70b-versatile',
      temp: '0.1',
      maxTokens: '16000',
      timeout: '120s',
      note: 'Multi-pages → 1 document',
    },
    {
      name: 'query-classification',
      provider: 'Groq',
      model: 'llama-3.3-70b-versatile',
      temp: '0.1',
      maxTokens: '500',
      timeout: '10s',
      note: 'Filtrage catégories KB',
    },
    {
      name: 'query-expansion',
      provider: 'Groq',
      model: 'llama-3.3-70b-versatile',
      temp: '0.3',
      maxTokens: '200',
      timeout: '10s',
      note: 'Reformulation queries <50 chars',
    },
    {
      name: 'indexation',
      provider: 'Ollama',
      model: 'qwen3:8b',
      temp: '0.2',
      maxTokens: '2000',
      timeout: '60s',
      note: 'Classification docs KB (gratuit)',
    },
  ]

  const embeddings = [
    { provider: 'OpenAI', model: 'text-embedding-3-small', dims: '1536', usage: 'Production (primaire)' },
    { provider: 'Gemini', model: 'text-embedding-004', dims: '768', usage: 'Multilingue AR/FR' },
    { provider: 'Ollama', model: 'qwen3-embedding:0.6b', dims: '1024', usage: 'Dev local uniquement' },
  ]

  return (
    <div className="space-y-6">
      {/* Tableau opérations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            Configuration par opération (prod)
          </CardTitle>
          <CardDescription>
            Mode No-Fallback : 1 modèle fixe par opération — échec → alerte email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Opération</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Provider</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Modèle</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Temp.</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">MaxTokens</th>
                  <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Timeout</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Usage</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((op) => (
                  <tr key={op.name} className="border-b border-muted/50">
                    <td className="py-2 pr-3">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{op.name}</code>
                    </td>
                    <td className="py-2 pr-3">
                      {op.provider === 'Groq' ? (
                        <BadgePrimary>{op.provider}</BadgePrimary>
                      ) : (
                        <BadgeFallback>{op.provider}</BadgeFallback>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{op.model}</td>
                    <td className="py-2 pr-3 font-mono">{op.temp}</td>
                    <td className="py-2 pr-3 font-mono">{op.maxTokens}</td>
                    <td className="py-2 pr-3 font-mono">{op.timeout}</td>
                    <td className="py-2 text-xs text-muted-foreground">{op.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Fallback cascade */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Fallback cascade LLM
          </CardTitle>
          <CardDescription>
            Activé si <code className="text-xs bg-muted px-1 rounded">LLM_FALLBACK_ENABLED=true</code> — déclenché sur 429 / 5xx / timeout
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Groq', color: 'bg-green-100 text-green-800 border-green-300', note: 'Primaire' },
              { label: '→', color: '', note: '' },
              { label: 'Gemini', color: 'bg-blue-100 text-blue-800 border-blue-300', note: 'Fallback 1' },
              { label: '→', color: '', note: '' },
              { label: 'DeepSeek', color: 'bg-purple-100 text-purple-800 border-purple-300', note: 'Fallback 2' },
              { label: '→', color: '', note: '' },
              { label: 'Ollama', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', note: 'Fallback 3' },
            ].map((item, i) => (
              item.note ? (
                <div key={i} className="flex flex-col items-center gap-1">
                  <Badge className={`${item.color} border`}>{item.label}</Badge>
                  <span className="text-xs text-muted-foreground">{item.note}</span>
                </div>
              ) : (
                <span key={i} className="text-xl text-muted-foreground font-light">{item.label}</span>
              )
            ))}
          </div>
          <div className="mt-4 bg-muted/20 border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">En mode No-Fallback</span> (configuration actuelle) : le fallback cascade est désactivé.
              Chaque opération utilise 1 modèle fixe. En cas d'échec → alerte email critique.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Embeddings par opération */}
      <Card>
        <CardHeader>
          <CardTitle>Embeddings disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Provider</th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Modèle</th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Dimensions</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Usage</th>
                </tr>
              </thead>
              <tbody>
                {embeddings.map((emb) => (
                  <tr key={emb.provider} className="border-b border-muted/50">
                    <td className="py-2 pr-4">
                      {emb.provider === 'OpenAI' ? (
                        <BadgePrimary>{emb.provider}</BadgePrimary>
                      ) : emb.provider === 'Gemini' ? (
                        <BadgeInfo>{emb.provider}</BadgeInfo>
                      ) : (
                        <BadgeFallback>{emb.provider}</BadgeFallback>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{emb.model}</td>
                    <td className="py-2 pr-4 font-mono">{emb.dims}</td>
                    <td className="py-2 text-xs text-muted-foreground">{emb.usage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function RAGWorkflowPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <GitBranch className="h-8 w-8 text-blue-600" />
            Workflow RAG
          </h1>
          <p className="text-muted-foreground mt-1">
            Documentation visuelle du pipeline RAG — triple embedding, 5 recherches parallèles, re-ranking, génération LLM
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-green-700 border-green-300">
            Benchmark hit@5 : 100%
          </Badge>
          <Badge variant="outline" className="text-blue-700 border-blue-300">
            avg score : 4.593
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="overview">Vue globale</TabsTrigger>
          <TabsTrigger value="indexation">Indexation</TabsTrigger>
          <TabsTrigger value="recherche">Recherche</TabsTrigger>
          <TabsTrigger value="reranking">Re-ranking</TabsTrigger>
          <TabsTrigger value="llm">Génération LLM</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <TabVueGlobale />
        </TabsContent>
        <TabsContent value="indexation" className="mt-6">
          <TabIndexation />
        </TabsContent>
        <TabsContent value="recherche" className="mt-6">
          <TabRecherche />
        </TabsContent>
        <TabsContent value="reranking" className="mt-6">
          <TabReranking />
        </TabsContent>
        <TabsContent value="llm" className="mt-6">
          <TabGenerationLLM />
        </TabsContent>
      </Tabs>
    </div>
  )
}
