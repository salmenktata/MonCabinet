const createNextIntlPlugin = require('next-intl/plugin')
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['your-project.supabase.co'], // Pour les images stockées sur Supabase
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Pour les uploads de documents
    },
  },
}

module.exports = withNextIntl(nextConfig)
