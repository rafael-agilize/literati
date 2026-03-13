import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // pdf-parse uses pdfjs-dist which requires a worker file and DOMMatrix —
  // keep them out of the webpack bundle so module resolution works on Vercel.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
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
