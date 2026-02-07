const createNextIntlPlugin = require('next-intl/plugin')
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ignorer ESLint pendant le build (les warnings sont vérifiés en CI séparément)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Mode standalone requis pour Docker production
  output: 'standalone',

  // Compression activée
  compress: true,

  // Optimisation des imports pour réduire le bundle
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },

  images: {
    domains: [
      'your-project.supabase.co', // Pour les images stockées sur Supabase (legacy)
      'localhost', // Pour développement local avec MinIO
    ],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'minio',
        port: '9000',
        pathname: '/documents/**',
      },
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_APP_DOMAIN || 'moncabinet.tn',
        pathname: '/api/storage/**',
      },
    ],
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Pour les uploads de documents
    },
    // Optimisation du bundle - tree shaking agressif
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      'date-fns',
      'date-fns/locale',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      'recharts',
      'react-hook-form',
      '@hookform/resolvers',
      'zod',
      'class-variance-authority',
      'clsx',
      'cmdk',
      'next-intl',
    ],
  },

  // Modules natifs externalisés (nécessaires pour OCR, conversion PDF)
  serverExternalPackages: ['canvas', 'pdf-to-img', 'tesseract.js', 'pdf-parse', 'pdfjs-dist'],

  // Exclure les polyfills Node.js côté client pour réduire le bundle
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        buffer: false,
        util: false,
      }
    }
    return config
  },

  // Headers de sécurité et cache
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache agressif pour les assets Next.js
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // Optimisation du bundling
  poweredByHeader: false,
  reactStrictMode: true,
}

module.exports = withNextIntl(nextConfig)
