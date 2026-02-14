'use client'

/**
 * Lazy-loaded Chart Components
 *
 * Recharts fait 8 MB - trop lourd pour être dans le bundle initial.
 * Ces wrappers lazy-load Recharts uniquement quand nécessaire.
 */

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import type { ComponentProps } from 'react'

// Lazy load des composants Recharts
const RechartsBarChart = dynamic(
  () => import('recharts').then((mod) => mod.BarChart),
  {
    loading: () => <Skeleton className="h-64 w-full" />,
    ssr: false,
  }
)

const RechartsBar = dynamic(
  () => import('recharts').then((mod) => mod.Bar),
  { ssr: false }
)

const RechartsPieChart = dynamic(
  () => import('recharts').then((mod) => mod.PieChart),
  {
    loading: () => <Skeleton className="h-64 w-full" />,
    ssr: false,
  }
)

const RechartsPie = dynamic(
  () => import('recharts').then((mod) => mod.Pie),
  { ssr: false }
)

const RechartsCell = dynamic(
  () => import('recharts').then((mod) => mod.Cell),
  { ssr: false }
)

const RechartsXAxis = dynamic(
  () => import('recharts').then((mod) => mod.XAxis),
  { ssr: false }
)

const RechartsYAxis = dynamic(
  () => import('recharts').then((mod) => mod.YAxis),
  { ssr: false }
)

const RechartsCartesianGrid = dynamic(
  () => import('recharts').then((mod) => mod.CartesianGrid),
  { ssr: false }
)

const RechartsTooltip = dynamic(
  () => import('recharts').then((mod) => mod.Tooltip),
  { ssr: false }
)

const RechartsLegend = dynamic(
  () => import('recharts').then((mod) => mod.Legend),
  { ssr: false }
)

const RechartsResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  { ssr: false }
)

const RechartsLineChart = dynamic(
  () => import('recharts').then((mod) => mod.LineChart),
  {
    loading: () => <Skeleton className="h-64 w-full" />,
    ssr: false,
  }
)

const RechartsLine = dynamic(
  () => import('recharts').then((mod) => mod.Line),
  { ssr: false }
)

const RechartsAreaChart = dynamic(
  () => import('recharts').then((mod) => mod.AreaChart),
  {
    loading: () => <Skeleton className="h-64 w-full" />,
    ssr: false,
  }
)

const RechartsArea = dynamic(
  () => import('recharts').then((mod) => mod.Area),
  { ssr: false }
)

// Export avec les bons types
export const BarChart = RechartsBarChart as typeof import('recharts').BarChart
export const Bar = RechartsBar as typeof import('recharts').Bar
export const PieChart = RechartsPieChart as typeof import('recharts').PieChart
export const Pie = RechartsPie as typeof import('recharts').Pie
export const Cell = RechartsCell as typeof import('recharts').Cell
export const XAxis = RechartsXAxis as typeof import('recharts').XAxis
export const YAxis = RechartsYAxis as typeof import('recharts').YAxis
export const CartesianGrid = RechartsCartesianGrid as typeof import('recharts').CartesianGrid
export const Tooltip = RechartsTooltip as typeof import('recharts').Tooltip
export const Legend = RechartsLegend as typeof import('recharts').Legend
export const ResponsiveContainer = RechartsResponsiveContainer as typeof import('recharts').ResponsiveContainer
export const LineChart = RechartsLineChart as typeof import('recharts').LineChart
export const Line = RechartsLine as typeof import('recharts').Line
export const AreaChart = RechartsAreaChart as typeof import('recharts').AreaChart
export const Area = RechartsArea as typeof import('recharts').Area
