'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface DailyPickData {
  date: string
  stock_code: string
  stock_name: string
  reasoning: string
  predicted_change: number | null
  confidence: number | null
}

export default function DailyPick() {
  const [pick, setPick] = useState<DailyPickData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPick = async () => {
    const res = await fetch('/api/daily-pick')
    const data = await res.json()
    setPick(data)
    setLoading(false)
  }

  useEffect(() => { fetchPick() }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/daily-pick', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '生成に失敗しました')
      } else {
        setPick(data)
      }
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return <div className="bg-slate-800 rounded-xl h-28 animate-pulse mb-6" />
  }

  return (
    <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-700/50 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-lg">★</span>
          <span className="text-white font-bold text-sm">本日のAIピック</span>
          {pick && (
            <span className="text-slate-400 text-xs">{pick.date}</span>
          )}
        </div>
        {!pick && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            {generating ? '分析中...' : 'AIに選ばせる'}
          </button>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-xs mt-1">{error}</p>
      )}

      {pick ? (
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <Link
                href={`/stocks/${pick.stock_code}`}
                className="text-blue-400 font-mono font-bold text-xl hover:text-blue-300 transition-colors"
              >
                {pick.stock_code}
              </Link>
              <span className="text-white font-medium truncate">{pick.stock_name}</span>
              {pick.predicted_change !== null && (
                <span className="bg-green-900/50 text-green-400 text-xs px-2 py-0.5 rounded-full font-medium">
                  +{pick.predicted_change}% 予想
                </span>
              )}
              {pick.confidence !== null && (
                <span className="text-slate-400 text-xs">確信度 {pick.confidence}%</span>
              )}
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">{pick.reasoning}</p>
          </div>
          <Link
            href={`/stocks/${pick.stock_code}`}
            className="shrink-0 bg-blue-700/50 hover:bg-blue-600/50 text-blue-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            詳細
          </Link>
        </div>
      ) : !generating && !error && (
        <p className="text-slate-400 text-sm">今日のピックがまだありません。「AIに選ばせる」を押してください。</p>
      )}

      {generating && (
        <div className="flex items-center gap-2 mt-1">
          <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">全銘柄を分析中...</span>
        </div>
      )}
    </div>
  )
}
