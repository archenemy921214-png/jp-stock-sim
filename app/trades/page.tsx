'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SimulatedTrade } from '@/types'

interface TradeWithStock extends SimulatedTrade {
  stocks?: { name: string }
}

export default function TradesPage() {
  const [trades, setTrades] = useState<TradeWithStock[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCode, setFilterCode] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/trades')
      .then(r => r.json())
      .then(data => setTrades(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  const codes = [...new Set(trades.map(t => t.stock_code))].sort()
  const filtered = filterCode ? trades.filter(t => t.stock_code === filterCode) : trades

  const totalPnl = filtered.reduce((s, t) => s + Number(t.pnl), 0)
  const wins = filtered.filter(t => Number(t.pnl) > 0).length
  const losses = filtered.filter(t => Number(t.pnl) <= 0).length
  const winRate = filtered.length > 0 ? (wins / filtered.length) * 100 : 0

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">取引履歴</h1>
        <Link href="/performance" className="text-blue-400 hover:text-blue-300 text-sm">
          成績集計 →
        </Link>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: '累計損益',
            value: (
              <span className={totalPnl > 0 ? 'text-green-400' : totalPnl < 0 ? 'text-red-400' : 'text-slate-400'}>
                {totalPnl > 0 ? '+' : ''}{totalPnl.toLocaleString()}円
              </span>
            )
          },
          { label: '総トレード数', value: <span className="text-white">{filtered.length}回</span> },
          { label: '勝率', value: <span className="text-white">{winRate.toFixed(1)}%</span> },
          {
            label: '勝/負',
            value: <span className="text-white"><span className="text-green-400">{wins}</span>/<span className="text-red-400">{losses}</span></span>
          }
        ].map(item => (
          <div key={item.label} className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
            <p className="text-slate-400 text-xs mb-1">{item.label}</p>
            <p className="text-lg font-bold">{item.value}</p>
          </div>
        ))}
      </div>

      {/* フィルター */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={filterCode}
          onChange={e => setFilterCode(e.target.value)}
          className="bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">全銘柄</option>
          {codes.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-slate-400 text-sm">{filtered.length}件</span>
      </div>

      {/* テーブル */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">📊</p>
          <p>取引履歴がありません</p>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          {/* モバイル: カード表示 */}
          <div className="sm:hidden divide-y divide-slate-700/50">
            {filtered.map(trade => {
              const pnl = Number(trade.pnl)
              const pnlRate = ((Number(trade.exit_price) - Number(trade.entry_price)) / Number(trade.entry_price)) * 100
              const isWin = pnl > 0
              return (
                <div key={trade.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link href={`/stocks/${trade.stock_code}`} className="text-blue-400 font-mono font-bold">
                        {trade.stock_code}
                      </Link>
                      <span className="text-slate-500 text-xs ml-2">{(trade.stocks as any)?.name}</span>
                    </div>
                    <span className={`font-bold text-sm ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                      {isWin ? '+' : ''}{pnlRate.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{trade.entry_date} → {trade.exit_date}</span>
                    <span className={`font-medium text-sm ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                      {isWin ? '+' : ''}{pnl.toLocaleString()}円
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    買: ¥{Number(trade.entry_price).toLocaleString()} → 売: ¥{Number(trade.exit_price).toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
          {/* PC: テーブル表示 */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-700 bg-slate-900/50">
                  <th className="px-4 py-3 text-left">銘柄</th>
                  <th className="px-4 py-3 text-left">買付日</th>
                  <th className="px-4 py-3 text-right">買値</th>
                  <th className="px-4 py-3 text-left">決済日</th>
                  <th className="px-4 py-3 text-right">売値</th>
                  <th className="px-4 py-3 text-right">損益</th>
                  <th className="px-4 py-3 text-right">損益率</th>
                  <th className="px-4 py-3 text-left">決済理由</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filtered.map(trade => {
                  const pnl = Number(trade.pnl)
                  const pnlRate = ((Number(trade.exit_price) - Number(trade.entry_price)) / Number(trade.entry_price)) * 100
                  const isWin = pnl > 0
                  return (
                    <tr key={trade.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/stocks/${trade.stock_code}`} className="text-blue-400 hover:text-blue-300 font-mono font-bold">
                          {trade.stock_code}
                        </Link>
                        <p className="text-slate-500 text-xs truncate max-w-[80px]">{(trade.stocks as any)?.name}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{trade.entry_date}</td>
                      <td className="px-4 py-3 text-right text-white">{Number(trade.entry_price).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{trade.exit_date}</td>
                      <td className="px-4 py-3 text-right text-white">{Number(trade.exit_price).toLocaleString()}</td>
                      <td className={`px-4 py-3 text-right font-medium ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                        {isWin ? '+' : ''}{pnl.toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                        {pnlRate >= 0 ? '+' : ''}{pnlRate.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">
                        {trade.exit_reason}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
