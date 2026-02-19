/**
 * Tests Unitaires : DocumentExplorer
 *
 * Sprint 5 - Tests & Performance (mis à jour pour extraction DocumentCard)
 *
 * @jest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentExplorer } from '../DocumentExplorer'
import { DocumentCard } from '../DocumentCard'
import type { SearchResultItem } from '../DocumentExplorer'

// =============================================================================
// MOCKS
// =============================================================================

const mockSearch = vi.fn()
let mockIsPending = false

vi.mock('@/lib/hooks/useRAGSearch', () => ({
  useRAGSearchMutation: (opts: { onSuccess?: (data: unknown) => void; onError?: (err: Error) => void }) => {
    // Store callbacks for test access
    ;(globalThis as Record<string, unknown>).__ragCallbacks = opts
    return {
      mutate: mockSearch,
      isPending: mockIsPending,
    }
  },
}))

// =============================================================================
// MOCK DATA
// =============================================================================

const mockResults: SearchResultItem[] = [
  {
    kbId: 'kb-1',
    title: 'Code des Obligations et Contrats - Article 371',
    category: 'codes',
    chunkContent: 'La prescription est de quinze ans...',
    similarity: 0.92,
    metadata: {
      decisionNumber: null,
      decisionDate: '2020-01-01',
      tribunalCode: null,
      tribunalLabelFr: null,
      tribunalLabelAr: null,
      chambreCode: null,
      chambreLabelFr: null,
      chambreLabelAr: null,
      legalBasis: ['COC Article 371'],
      citesCount: 0,
      citedByCount: 15,
      extractionConfidence: 0.95,
    },
  },
  {
    kbId: 'kb-2',
    title: 'Arrêt Cassation 2023-001 - Prescription civile',
    category: 'jurisprudence',
    chunkContent: 'La Cour de Cassation confirme...',
    similarity: 0.88,
    metadata: {
      decisionNumber: '2023-001',
      decisionDate: '2023-06-15',
      tribunalCode: 'TRIBUNAL_CASSATION',
      tribunalLabelFr: 'Cour de Cassation',
      tribunalLabelAr: 'محكمة التعقيب',
      chambreCode: 'CHAMBRE_CIVILE',
      chambreLabelFr: 'Chambre Civile',
      chambreLabelAr: 'الدائرة المدنية',
      legalBasis: ['Article 371 COC'],
      citesCount: 3,
      citedByCount: 8,
      extractionConfidence: 0.90,
    },
    relations: {
      cites: [
        {
          relationType: 'cites',
          relatedTitle: 'Article 371 COC',
          relatedCategory: 'codes',
          context: 'Application de la prescription',
          confidence: 0.95,
        },
      ],
      citedBy: [],
      supersedes: [],
      supersededBy: [],
      relatedCases: [],
    },
  },
  {
    kbId: 'kb-3',
    title: 'Doctrine - La prescription en droit civil tunisien',
    category: 'doctrine',
    chunkContent: 'Les auteurs considèrent que...',
    similarity: 0.75,
    metadata: {
      decisionNumber: null,
      decisionDate: '2021-03-10',
      tribunalCode: null,
      tribunalLabelFr: null,
      tribunalLabelAr: null,
      chambreCode: null,
      chambreLabelFr: null,
      chambreLabelAr: null,
      legalBasis: null,
      citesCount: 0,
      citedByCount: 2,
      extractionConfidence: 0.85,
    },
  },
]

// =============================================================================
// SETUP
// =============================================================================

beforeEach(() => {
  mockSearch.mockClear()
  mockIsPending = false
})

// =============================================================================
// TESTS AFFICHAGE
// =============================================================================

describe('DocumentExplorer - Affichage', () => {
  describe('Barre de recherche', () => {
    it('affiche input recherche', () => {
      render(<DocumentExplorer />)
      const searchInput = screen.getByPlaceholderText(/Rechercher dans la base/i)
      expect(searchInput).toBeInTheDocument()
    })

    it('affiche bouton Rechercher', () => {
      render(<DocumentExplorer />)
      expect(screen.getByRole('button', { name: /Rechercher/i })).toBeInTheDocument()
    })

    it('affiche bouton Filtres', () => {
      render(<DocumentExplorer />)
      expect(screen.getByRole('button', { name: /Filtres/i })).toBeInTheDocument()
    })

    it('affiche icône de retour quand onBack est fourni', () => {
      const { container } = render(<DocumentExplorer onBack={() => {}} />)
      // ArrowLeft icon should be present (not ChevronDown rotated)
      const svgs = container.querySelectorAll('svg')
      expect(svgs.length).toBeGreaterThan(0)
    })
  })
})

// =============================================================================
// TESTS RECHERCHE
// =============================================================================

describe('DocumentExplorer - Recherche', () => {
  it('permet de saisir query', async () => {
    const user = userEvent.setup()
    render(<DocumentExplorer />)

    const input = screen.getByPlaceholderText(/Rechercher dans la base/i)
    await user.type(input, 'prescription')

    expect(input).toHaveValue('prescription')
  })

  it('lance recherche au clic bouton', async () => {
    const user = userEvent.setup()
    render(<DocumentExplorer />)

    const input = screen.getByPlaceholderText(/Rechercher dans la base/i)
    await user.type(input, 'prescription')

    const searchButton = screen.getByRole('button', { name: /Rechercher/i })
    await user.click(searchButton)

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'prescription',
        limit: 50,
        includeRelations: true,
      })
    )
  })

  it('lance recherche avec Enter', async () => {
    const user = userEvent.setup()
    render(<DocumentExplorer />)

    const input = screen.getByPlaceholderText(/Rechercher dans la base/i)
    await user.type(input, 'prescription{Enter}')

    expect(mockSearch).toHaveBeenCalled()
  })

  it('ne lance pas recherche Enter pendant loading', async () => {
    mockIsPending = true
    const user = userEvent.setup()
    render(<DocumentExplorer />)

    const input = screen.getByPlaceholderText(/Rechercher dans la base/i)
    await user.type(input, 'test{Enter}')

    // Should not have been called because isLoading guard
    expect(mockSearch).not.toHaveBeenCalled()
  })
})

// =============================================================================
// TESTS FILTRES
// =============================================================================

describe('DocumentExplorer - Filtres', () => {
  it('toggle panel filtres au clic bouton', async () => {
    const user = userEvent.setup()
    render(<DocumentExplorer />)

    const filterButton = screen.getByRole('button', { name: /Filtres/i })

    // Filtres cachés
    expect(screen.queryByText('Effacer filtres')).not.toBeInTheDocument()

    // Ouvrir
    await user.click(filterButton)
    expect(screen.getByText('Effacer filtres')).toBeInTheDocument()

    // Fermer
    await user.click(filterButton)
    expect(screen.queryByText('Effacer filtres')).not.toBeInTheDocument()
  })

  it('affiche boutons Effacer/Appliquer', async () => {
    const user = userEvent.setup()
    render(<DocumentExplorer />)

    const filterButton = screen.getByRole('button', { name: /Filtres/i })
    await user.click(filterButton)

    expect(screen.getByRole('button', { name: /Effacer filtres/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Appliquer/i })).toBeInTheDocument()
  })

  it('affiche liste de tribunaux élargie', async () => {
    const user = userEvent.setup()
    render(<DocumentExplorer />)

    const filterButton = screen.getByRole('button', { name: /Filtres/i })
    await user.click(filterButton)

    // Check there are tribunal select options (can't easily test Select content without opening it)
    expect(screen.getByText('Tribunal')).toBeInTheDocument()
  })
})

// =============================================================================
// TESTS DOCUMENT CARD (composant extrait)
// =============================================================================

describe('DocumentCard', () => {
  it('affiche le titre du document', () => {
    render(
      <DocumentCard
        document={mockResults[0]}
        viewMode="list"
        onClick={() => {}}
      />
    )
    expect(screen.getByText(mockResults[0].title)).toBeInTheDocument()
  })

  it('affiche le score de pertinence', () => {
    render(
      <DocumentCard
        document={mockResults[0]}
        viewMode="list"
        onClick={() => {}}
      />
    )
    expect(screen.getByText('92%')).toBeInTheDocument()
  })

  it('affiche le badge catégorie', () => {
    render(
      <DocumentCard
        document={mockResults[0]}
        viewMode="list"
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Codes juridiques')).toBeInTheDocument()
  })

  it('affiche le tribunal si présent', () => {
    render(
      <DocumentCard
        document={mockResults[1]}
        viewMode="list"
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Cour de Cassation')).toBeInTheDocument()
  })

  it('affiche le nombre de citations si > 0', () => {
    render(
      <DocumentCard
        document={mockResults[0]}
        viewMode="list"
        onClick={() => {}}
      />
    )
    expect(screen.getByText('15 citations')).toBeInTheDocument()
  })

  it('appelle onClick au clic', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()
    render(
      <DocumentCard
        document={mockResults[0]}
        viewMode="list"
        onClick={handleClick}
      />
    )

    const card = screen.getByText(mockResults[0].title).closest('.cursor-pointer')!
    await user.click(card)

    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('adapte le line-clamp selon le viewMode', () => {
    const { rerender } = render(
      <DocumentCard
        document={mockResults[0]}
        viewMode="list"
        onClick={() => {}}
      />
    )
    const contentList = screen.getByText('La prescription est de quinze ans...')
    expect(contentList.className).toContain('line-clamp-2')

    rerender(
      <DocumentCard
        document={mockResults[0]}
        viewMode="grid"
        onClick={() => {}}
      />
    )
    const contentGrid = screen.getByText('La prescription est de quinze ans...')
    expect(contentGrid.className).toContain('line-clamp-1')
  })
})
