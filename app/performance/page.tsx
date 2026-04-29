'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface PerfData {
  totalPnl: number
  totalTrades: number
  winCount: number
  lossCount: number
  winRate: number
  avgWin: number
  avgLoss: number
  monthly: { month: string; pnl: number }[]
  byStock: { code: string; name: string; pnl: number; count: number; wins: number }[]
}

function MonthlyBar({ pnl, maxAbs }: { pnl: number; maxAbs: number }) {
  const pct = maxAbs === 0 ? 0 : Math.abs(pnl) / maxAbs * 100
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded h-5 overflow-hidden">
        <div
          className={`h-full rounded transition-all ${pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-xs w-24 text-right font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}円
      </span>
    </div>
  )
}

export default function PerformancePage() {
  const [data, setData] = useState<PerfData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/performance')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data) return <div className="p-6 text-slate-400">データがありません</div>

  const maxMonthlyAbs = Math.max(
  ...(data?.monthly ?? []).map((m) => Math.abs(m.pnl)),
  1
)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">成績集計</h1>
        <Link href="/trades" className="text-blue-400 hover:text-blue-300 text-sm">
          取引履歴 →
        </Link>
      </div>

      {/* メインKPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: '累計損益',
            value: (
              <span className={data.totalPnl > 0 ? 'text-green-400' : data.totalPnl < 0 ? 'text-red-400' : 'text-white'}>
                {(data?.totalPnl ?? 0).toLocaleString()}円
              </span>
            ),
            bg: data.totalPnl > 0 ? 'border-green-700/50' : data.totalPnl < 0 ? 'border-red-700/50' : 'border-slate-700'
          },
          {
            label: '総トレード数',
            value: <span className="text-white">{data.totalTrades}回</span>,
            bg: 'border-slate-700'
          },
          {
            label: '勝率',
            value: <span className="text-white">{(data?.winRate ?? 0).toFixed(1)}%</span>,
            bg: 'border-slate-700'
          },
          {
            label: '勝/負',
            value: (
              <span>
                <span className="text-green-400">{data.winCount}</span>
                <span className="text-slate-400"> / </span>
                <span className="text-red-400">{data.lossCount}</span>
              </span>
            ),
            bg: 'border-slate-700'
          }
        ].map(item => (
          <div key={item.label} className={`bg-slate-800 border ${item.bg} rounded-xl p-4 text-center`}>
            <p className="text-slate-400 text-sm mb-1">{item.label}</p>
            <p className="text-2xl font-bold">{item.value}</p>
          </div>
        ))}
      </div>

      {/* 平均損益 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-sm mb-1">平均利益（勝ちトレード）</p>
          <p className="text-2xl font-bold text-green-400">
            {(data?.avgWin ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}円
          </p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-sm mb-1">平均損失（負けトレード）</p>
          <p className="text-2xl font-bold text-red-400">
            {(data?.avgLoss ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}円
          </p>
        </div>
      </div>

      {/* ペイオフレシオ */}
      {data.avgLoss !== 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-400 text-sm mb-1">ペイオフレシオ（平均利益 / 平均損失の絶対値）</p>
          <p className="text-xl font-bold text-white">
            {Math.abs(data.avgWin / data.avgLoss).toFixed(2)}
          </p>
          <p className="text-slate-500 text-xs mt-1">1以上なら利益の方が損失より大きい</p>
        </div>
      )}

      {/* 月次損益 */}
      {(data?.monthly ?? []).length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h2 className="text-white font-semibold mb-4">月次損益</h2>
          <div className="space-y-2">
            {data.monthly.map(m => (
              <div key={m.month} className="flex items-center gap-3 text-sm">
                <span className="text-slate-400 w-16">{m.month}</span>
                <MonthlyBar pnl={m.pnl} maxAbs={maxMonthlyAbs} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 銘柄別成績 */}
      {(data?.byStock ?? []).length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="text-white font-semibold">銘柄別成績</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-700 bg-slate-900/50">
                  <th className="px-4 py-2 text-left">銘柄</th>
                  <th className="px-4 py-2 text-right">損益</th>
                  <th className="px-4 py-2 text-right">取引数</th>
                  <th className="px-4 py-2 text-right">勝率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {data.byStock.map(s => {
                  const wr = s.count > 0 ? (s.wins / s.count) * 100 : 0
                  return (
                    <tr key={s.code} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/stocks/${s.code}`} className="text-blue-400 hover:text-blue-300 font-mono font-bold">
                          {s.code}
                        </Link>
                        <p className="text-slate-500 text-xs">{s.name}</p>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${s.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {s.pnl > 0 ? '+' : ''}{s.pnl.toLocaleString()}円
                      </td>
                      <td className="px-4 py-3 text-right text-white">{s.count}回</td>
                      <td className="px-4 py-3 text-right text-white">{wr.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.totalTrades === 0 && (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">🏆</p>
          <p>まだ取引データがありません</p>
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">
            監視銘柄を追加 →
          </Link>
        </div>
      )}
    </div>
  )
}
