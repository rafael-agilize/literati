import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Literati — Chat with Authors',
  description: 'Upload books and have conversations with AI-powered author personas.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
