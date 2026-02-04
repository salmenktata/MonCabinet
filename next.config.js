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

module.exports = nextConfig
