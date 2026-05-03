'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'

const navItems = [
  { href: '/', label: '銘柄', mobileLabel: '銘柄', icon: '📋' },
  { href: '/claude-portfolio', label: 'AI売買', mobileLabel: 'AI売買', icon: '🤖' },
  { href: '/trades', label: '取引履歴', mobileLabel: '取引', icon: '📊' },
  { href: '/performance', label: '成績集計', mobileLabel: '成績', icon: '🏆' },
{ href: '/settings', label: '通知設定', mobileLabel: '設定', icon: '🔔' },
]

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = getSupabase()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Desktop top nav */}
      <nav className="hidden sm:flex bg-slate-900 border-b border-slate-700 px-6 py-3 items-center gap-8">
        <span className="text-white font-bold text-lg tracking-tight">
          JP株トレード
        </span>
        <div className="flex gap-2 flex-1">
          {navItems.map(item => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
        <div className="ml-auto">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-sm truncate max-w-[160px]">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-md font-medium transition-colors"
            >
              ログイン
            </Link>
          )}
        </div>
      </nav>

      {/* Mobile top bar */}
      <div className="sm:hidden bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <span className="text-white font-bold">JP株トレード</span>
        {user ? (
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded transition-colors"
          >
            ログアウト
          </button>
        ) : (
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded font-medium transition-colors"
          >
            ログイン
          </Link>
        )}
      </div>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 z-50">
        <div className="flex">
          {navItems.map(item => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                  active ? 'text-blue-400' : 'text-slate-400'
                }`}
              >
                <span className="text-lg mb-0.5">{item.icon}</span>
                {item.mobileLabel}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
