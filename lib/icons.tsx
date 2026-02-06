import {
  LayoutDashboard,
  Users,
  FolderOpen,
  FileText,
  Calendar,
  Clock,
  Files,
  FileStack,
  Settings,
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  Download,
  Upload,
  Mail,
  Phone,
  MapPin,
  Eye,
  EyeOff,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  MoreVertical,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Home,
  User,
  Building,
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Loader2,
  Sun,
  Moon,
  Menu,
  Bell,
  LogOut,
  Copy,
  ExternalLink,
  Save,
  RefreshCw,
  Archive,
  Bookmark,
  Star,
  Printer,
  Share2,
  Paperclip,
  Image,
  Lock,
  Unlock,
  Shield,
  Key,
  Globe,
  Zap,
  Activity,
  BarChart,
  PieChart,
  Package,
  Layers,
  List,
  Grid,
  Columns,
  SlidersHorizontal,
  Command,
  Gavel,
  Banknote,
  Hash,
  ListTodo,
  Briefcase,
  Cloud,
  MessageSquare,
  BookOpen,
  Database,
  Folder,
  Code,
  HardDrive,
  History,
  Undo2,
  Play,
  type LucideIcon,
} from 'lucide-react'

export const Icons = {
  // Navigation
  dashboard: LayoutDashboard,
  clients: Users,
  users: Users,
  dossiers: FolderOpen,
  invoices: FileText,
  fileText: FileText,
  deadlines: Calendar,
  calendar: Calendar,
  timeTracking: Clock,
  clock: Clock,
  documents: Files,
  templates: FileStack,
  settings: Settings,
  home: Home,

  // Actions
  add: Plus,
  edit: Edit,
  delete: Trash2,
  search: Search,
  filter: Filter,
  download: Download,
  upload: Upload,
  copy: Copy,
  save: Save,
  refresh: RefreshCw,
  archive: Archive,
  print: Printer,
  share: Share2,
  bookmark: Bookmark,
  star: Star,

  // Navigation arrows
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,

  // More options
  moreHorizontal: MoreHorizontal,
  moreVertical: MoreVertical,

  // Status
  check: Check,
  close: X,
  checkCircle: CheckCircle,
  xCircle: XCircle,
  alertCircle: AlertCircle,
  alertTriangle: AlertTriangle,
  info: Info,

  // Contact
  mail: Mail,
  phone: Phone,
  location: MapPin,
  externalLink: ExternalLink,

  // User & Auth
  user: User,
  logout: LogOut,
  lock: Lock,
  unlock: Unlock,
  shield: Shield,
  key: Key,

  // Business
  building: Building,
  creditCard: CreditCard,
  dollar: DollarSign,
  banknote: Banknote,
  trendingUp: TrendingUp,
  trendingDown: TrendingDown,
  package: Package,
  briefcase: Briefcase,

  // UI Elements
  eye: Eye,
  eyeOff: EyeOff,
  loader: Loader2,
  sun: Sun,
  moon: Moon,
  menu: Menu,
  bell: Bell,
  attachment: Paperclip,
  image: Image,
  globe: Globe,
  zap: Zap,
  command: Command,
  cloud: Cloud,
  messageSquare: MessageSquare,

  // Views
  list: List,
  grid: Grid,
  columns: Columns,
  sliders: SlidersHorizontal,
  listTodo: ListTodo,

  // Charts & Analytics
  activity: Activity,
  barChart: BarChart,
  pieChart: PieChart,
  layers: Layers,

  // Legal & Professional
  gavel: Gavel,
  hash: Hash,
  bookOpen: BookOpen,

  // System & Storage
  database: Database,
  folder: Folder,
  code: Code,
  hardDrive: HardDrive,
  trash: Trash2,
  spinner: Loader2,

  // Additional icons
  x: X,
  history: History,
  play: Play,
  undo: Undo2,
} as const

export type IconName = keyof typeof Icons

export interface IconProps extends React.ComponentPropsWithoutRef<LucideIcon> {
  name?: IconName
}

/**
 * Composant Icon wrapper pour utilisation simplifiée
 * @example
 * <Icon name="dashboard" className="h-5 w-5" />
 * ou directement
 * <Icons.dashboard className="h-5 w-5" />
 */
export function Icon({ name, ...props }: IconProps) {
  if (!name) return null
  const LucideIcon = Icons[name]
  return <LucideIcon {...props} />
}
