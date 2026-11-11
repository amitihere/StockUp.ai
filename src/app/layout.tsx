import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'StockPilot | Autonomous AI Procurement for Retailers',
  description:
    'Dark enterprise B2B dashboard for autonomous inventory replenishment, supplier discovery, and automated procurement policies.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#050b14] text-slate-100 font-sans antialiased overflow-hidden">
        {children}
      </body>
    </html>
  )
}
