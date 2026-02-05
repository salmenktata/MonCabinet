const createNextIntlPlugin = require('next-intl/plugin')
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    // Optimisation du bundle
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'date-fns'],
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
    ]
  },
}

module.exports = withNextIntl(nextConfig)
