'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import AddStockModal from '@/components/AddStockModal'
import type { Stock, SimulatedPosition, SimulatedTrade } from '@/types'

interface StockItem extends Stock {
  latestPrice: number | null
  prevClose: number | null
  openPosition: SimulatedPosition | null
  totalPnl: number
  tradeCount: number
  lastSignalScore: number | null
  lastUpdated: string | null
  refreshing: boolean
}

function PnlBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-slate-400">±0</span>
  const color = value > 0 ? 'text-green-400' : 'text-red-400'
  return <span className={color}>{value > 0 ? '+' : ''}{value.toLocaleString()}円</span>
}

function ChangeBadge({ current, prev }: { current: number | null; prev: number | null }) {
  if (!current || !prev) return <span className="text-slate-500">—</span>
  const diff = current - prev
  const pct = (diff / prev) * 100
  const color = diff >= 0 ? 'text-green-400' : 'text-red-400'
  return (
    <span className={color}>
      {diff >= 0 ? '+' : ''}{diff.toFixed(0)} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
    </span>
  )
}

export default function WatchlistPage() {
  const [stocks, setStocks] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const loadStocks = useCallback(async () => {
    setLoading(true)
    try {
      const [stocksRes, tradesRes, positionsRes] = await Promise.all([
        fetch('/api/stocks').then(r => r.json()),
        fetch('/api/trades').then(r => r.json()),
        fetch('/api/stocks').then(() =>
          fetch('/api/performance').then(r => r.json())
        )
      ])

      const stockList: Stock[] = Array.isArray(stocksRes) ? stocksRes : []

      const items: StockItem[] = await Promise.all(
        stockList.map(async stock => {
          const data = await fetch(`/api/stocks/${stock.code}/data`).then(r => r.json())
          const prices: any[] = data.prices || []
          const positions: SimulatedPosition[] = data.positions || []
          const trades: SimulatedTrade[] = data.trades || []

          const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date))
          const latest = sorted[sorted.length - 1]
          const prev = sorted[sorted.length - 2]

          const openPos = positions.find(p => p.status === 'open') || null
          const totalPnl = trades.reduce((s, t) => s + Number(t.pnl), 0)

          const signals: any[] = data.signals || []
          const lastSignal = signals[signals.length - 1]

          return {
            ...stock,
            latestPrice: latest ? Number(latest.close) : null,
            prevClose: prev ? Number(prev.close) : null,
            openPosition: openPos,
            totalPnl,
            tradeCount: trades.length,
            lastSignalScore: lastSignal?.score ?? null,
            lastUpdated: latest?.date ?? null,
            refreshing: false
          }
        })
      )

      setStocks(items)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStocks() }, [loadStocks])

  const handleRefresh = async (code: string) => {
    setStocks(prev => prev.map(s => s.code === code ? { ...s, refreshing: true } : s))
    try {
      await fetch(`/api/stocks/${code}/refresh`, { method: 'POST' })
      await loadStocks()
    } finally {
      setStocks(prev => prev.map(s => s.code === code ? { ...s, refreshing: false } : s))
    }
  }

  const handleDelete = async (code: string) => {
    if (!confirm(`${code} を削除しますか？`)) return
    await fetch(`/api/stocks/${code}`, { method: 'DELETE' })
    setStocks(prev => prev.filter(s => s.code !== code))
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">選定銘柄一覧</h1>
          <p className="text-slate-400 text-sm mt-1">{stocks.length}銘柄を監視中</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          ＋ 選定銘柄追加
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-slate-800 rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : stocks.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">📈</p>
          <p className="text-lg font-medium">監視銘柄がありません</p>
          <p className="text-sm mt-2">「銘柄追加」から銘柄を登録してください</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stocks.map(stock => (
            <div
              key={stock.code}
              className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-500 transition-colors"
            >
              {/* ヘッダー */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-mono font-bold text-lg">{stock.code}</span>
                    {stock.openPosition && (
                      <span className="bg-green-900/50 text-green-400 text-xs px-2 py-0.5 rounded-full">
                        保有中
                      </span>
                    )}
                  </div>
                  <p className="text-white font-medium text-sm mt-0.5 truncate max-w-[160px]">{stock.name}</p>
                </div>
                <div className="text-right">
                  {stock.latestPrice ? (
                    <p className="text-white font-bold text-xl">{stock.latestPrice.toLocaleString()}</p>
                  ) : (
                    <p className="text-slate-500">—</p>
                  )}
                  <ChangeBadge current={stock.latestPrice} prev={stock.prevClose} />
                </div>
              </div>

              {/* 指標 */}
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-slate-700/50 rounded-lg p-2">
                  <p className="text-slate-400 text-xs">累計損益</p>
                  <PnlBadge value={stock.totalPnl} />
                </div>
                <div className="bg-slate-700/50 rounded-lg p-2">
                  <p className="text-slate-400 text-xs">取引数</p>
                  <p className="text-white text-sm font-medium">{stock.tradeCount}回</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-2">
                  <p className="text-slate-400 text-xs">シグナル</p>
                  <p className={`text-sm font-bold ${(stock.lastSignalScore ?? 0) >= 80 ? 'text-green-400' : 'text-slate-400'}`}>
                    {stock.lastSignalScore !== null ? `${stock.lastSignalScore}pt` : '—'}
                  </p>
                </div>
              </div>

              {/* オープンポジション情報 */}
              {stock.openPosition && (
                <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-2 mb-3 text-xs">
                  <span className="text-green-400 font-medium">買建中:</span>
                  <span className="text-slate-300 ml-2">
                    {stock.openPosition.entry_date} @ {Number(stock.openPosition.entry_price).toLocaleString()}円
                  </span>
                  {stock.latestPrice && (
                    <span className={`ml-2 font-medium ${stock.latestPrice > stock.openPosition.entry_price ? 'text-green-400' : 'text-red-400'}`}>
                      ({((stock.latestPrice - stock.openPosition.entry_price) / stock.openPosition.entry_price * 100).toFixed(2)}%)
                    </span>
                  )}
                </div>
              )}

              {/* アクション */}
              <div className="flex gap-2">
                <Link
                  href={`/stocks/${stock.code}`}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-center py-1.5 rounded-lg text-sm transition-colors"
                >
                  詳細
                </Link>
                <button
                  onClick={() => handleRefresh(stock.code)}
                  disabled={stock.refreshing}
                  className="flex-1 bg-blue-700/50 hover:bg-blue-600/50 disabled:opacity-50 text-blue-300 py-1.5 rounded-lg text-sm transition-colors"
                >
                  {stock.refreshing ? '更新中...' : '更新'}
                </button>
                <button
                  onClick={() => handleDelete(stock.code)}
                  className="bg-red-900/30 hover:bg-red-800/50 text-red-400 px-3 py-1.5 rounded-lg text-sm transition-colors"
                >
                  削除
                </button>
              </div>

              {stock.lastUpdated && (
                <p className="text-slate-500 text-xs mt-2">最終更新: {stock.lastUpdated}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddStockModal
          onClose={() => setShowModal(false)}
          onAdded={loadStocks}
        />
      )}
    </div>
  )
}
