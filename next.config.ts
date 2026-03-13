import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow up to 50 MB file uploads for document processing
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // External image domains (for Google OAuth avatars)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
}

export default nextConfig
