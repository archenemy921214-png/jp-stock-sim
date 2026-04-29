'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (code: string) => void
  className?: string
}

export default function StockCodeInput({ value, onChange, className }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<{ code: string; name: string }[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 外クリックでドロップダウンを閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const isCode = /^\d{1,4}$/.test(query)

    if (!query || isCode) {
      setResults([])
      setOpen(false)
      if (/^\d{4}$/.test(query)) onChange(query)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        const list = Array.isArray(data) ? data : []
        setResults(list)
        setOpen(list.length > 0)
      } catch {
        setResults([])
        setOpen(false)
      }
    }, 300)
  }, [query, onChange])

  const select = (code: string, name: string) => {
    setQuery(`${code} ${name}`)
    onChange(code)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="例: 7203 / トヨタ"
        className={className}
      />
      {open && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg overflow-hidden shadow-lg">
          {results.map(r => (
            <li key={r.code}>
              <button
                type="button"
                onMouseDown={() => select(r.code, r.name)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-600 text-left text-sm transition-colors"
              >
                <span className="text-blue-400 font-mono font-bold w-12 shrink-0">{r.code}</span>
                <span className="text-slate-200 truncate">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
