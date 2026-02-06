'use client'

import * as React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

export interface DataTableColumn<T> {
  id: string
  header: string
  accessor: (row: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: DataTableColumn<T>[]
  searchable?: boolean
  searchPlaceholder?: string
  onSearch?: (query: string) => void
  selectable?: boolean
  onSelectionChange?: (selectedRows: T[]) => void
  pageSize?: number
  pageSizeOptions?: number[]
  emptyMessage?: string
  loading?: boolean
  onRowClick?: (row: T) => void
  getRowId?: (row: T) => string
}

export function DataTable<T>({
  data,
  columns,
  searchable = false,
  searchPlaceholder = 'Rechercher...',
  onSearch,
  selectable = false,
  onSelectionChange,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  emptyMessage = 'Aucune donnée',
  loading = false,
  onRowClick,
  getRowId,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [sortColumn, setSortColumn] = React.useState<string | null>(null)
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(initialPageSize)
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set())

  // Filtrage
  const filteredData = React.useMemo(() => {
    if (!searchQuery || !searchable) return data

    return data.filter((row) => {
      return columns.some((col) => {
        const value = col.accessor(row)
        if (typeof value === 'string') {
          return value.toLowerCase().includes(searchQuery.toLowerCase())
        }
        return false
      })
    })
  }, [data, searchQuery, searchable, columns])

  // Tri
  const sortedData = React.useMemo(() => {
    if (!sortColumn) return filteredData

    const column = columns.find((col) => col.id === sortColumn)
    if (!column) return filteredData

    return [...filteredData].sort((a, b) => {
      const aValue = column.accessor(a)
      const bValue = column.accessor(b)

      let comparison = 0
      if (aValue == null && bValue == null) comparison = 0
      else if (aValue == null) comparison = -1
      else if (bValue == null) comparison = 1
      else if (aValue < bValue) comparison = -1
      else if (aValue > bValue) comparison = 1

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredData, sortColumn, sortDirection, columns])

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize)
  const paginatedData = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedData.slice(startIndex, startIndex + pageSize)
  }, [sortedData, currentPage, pageSize])

  // Reset à la page 1 quand les données changent
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, pageSize])

  // Gestion du tri
  const handleSort = (columnId: string) => {
    const column = columns.find((col) => col.id === columnId)
    if (!column?.sortable) return

    if (sortColumn === columnId) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(columnId)
      setSortDirection('asc')
    }
  }

  // Gestion de la recherche
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    onSearch?.(query)
  }

  // Gestion de la sélection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newSelection = new Set(
        paginatedData.map((row, index) =>
          getRowId ? getRowId(row) : String(index)
        )
      )
      setSelectedRows(newSelection)
      onSelectionChange?.(paginatedData)
    } else {
      setSelectedRows(new Set())
      onSelectionChange?.([])
    }
  }

  const handleSelectRow = (row: T, index: number, checked: boolean) => {
    const rowId = getRowId ? getRowId(row) : String(index)
    const newSelection = new Set(selectedRows)

    if (checked) {
      newSelection.add(rowId)
    } else {
      newSelection.delete(rowId)
    }

    setSelectedRows(newSelection)
    const selectedData = data.filter((r, i) =>
      newSelection.has(getRowId ? getRowId(r) : String(i))
    )
    onSelectionChange?.(selectedData)
  }

  const isRowSelected = (row: T, index: number) => {
    const rowId = getRowId ? getRowId(row) : String(index)
    return selectedRows.has(rowId)
  }

  const allSelected = paginatedData.length > 0 &&
    paginatedData.every((row, index) => isRowSelected(row, index))

  return (
    <div className="space-y-4">
      {/* Barre de recherche et actions */}
      {searchable && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Icons.search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {selectedRows.size > 0 && (
            <div className="text-sm text-muted-foreground">
              {selectedRows.size} sélectionné(s)
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Sélectionner tout"
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(column.className, column.sortable && 'cursor-pointer select-none')}
                  onClick={() => column.sortable && handleSort(column.id)}
                >
                  <div className="flex items-center gap-2">
                    <span>{column.header}</span>
                    {column.sortable && (
                      <div className="flex flex-col">
                        {sortColumn === column.id ? (
                          sortDirection === 'asc' ? (
                            <Icons.chevronUp className="h-3 w-3" />
                          ) : (
                            <Icons.chevronDown className="h-3 w-3" />
                          )
                        ) : (
                          <Icons.chevronDown className="h-3 w-3 opacity-30" />
                        )}
                      </div>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="h-24 text-center"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Icons.loader className="h-4 w-4 animate-spin" />
                    <span className="text-muted-foreground">Chargement...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="h-24 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Icons.info className="h-8 w-8 text-muted-foreground" />
                    <span className="text-muted-foreground">{emptyMessage}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row, index) => (
                <TableRow
                  key={getRowId ? getRowId(row) : index}
                  className={cn(
                    onRowClick && 'cursor-pointer',
                    isRowSelected(row, index) && 'bg-muted'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isRowSelected(row, index)}
                        onCheckedChange={(checked) =>
                          handleSelectRow(row, index, checked as boolean)
                        }
                        aria-label="Sélectionner la ligne"
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={column.id} className={column.className}>
                      {column.accessor(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && paginatedData.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Lignes par page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger className="w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {(currentPage - 1) * pageSize + 1} -{' '}
              {Math.min(currentPage * pageSize, sortedData.length)} sur {sortedData.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <Icons.chevronLeft className="h-4 w-4" />
              <Icons.chevronLeft className="h-4 w-4 -ml-2" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <Icons.chevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} sur {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <Icons.chevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <Icons.chevronRight className="h-4 w-4" />
              <Icons.chevronRight className="h-4 w-4 -ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
