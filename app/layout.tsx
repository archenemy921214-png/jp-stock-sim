import type { Metadata } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'

export const metadata: Metadata = {
  title: 'JP株シミュレーター',
  description: '日本株仮想売買シミュレーションシステム'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-slate-950 text-white min-h-screen antialiased">
        <Navigation />
        <main className="pb-16 sm:pb-0">{children}</main>
      </body>
    </html>
  )
}
