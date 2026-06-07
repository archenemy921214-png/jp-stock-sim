'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { PriceHistory, Indicator, Signal, SimulatedPosition, SimulatedTrade } from '@/types'

const CandlestickChart = dynamic(() => import('@/components/CandlestickChart'), { ssr: false })

interface StockData {
  prices: PriceHistory[]
  indicators: Indicator[]
  signals: Signal[]
  positions: SimulatedPosition[]
  trades: SimulatedTrade[]
}

function PnlCell({ value }: { value: number }) {
  const color = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-slate-400'
  return <span className={`font-medium ${color}`}>{value > 0 ? '+' : ''}{value.toLocaleString()}円</span>
}

export default function StockDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const [data, setData] = useState<StockData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [stockName, setStockName] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const [dataRes, stocksRes] = await Promise.all([
        fetch(`/api/stocks/${code}/data`).then(r => r.json()),
        fetch('/api/stocks').then(r => r.json())
      ])
      setData(dataRes)
      const stock = (stocksRes as any[]).find(s => s.code === code)
      if (stock) setStockName(stock.name)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [code])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch(`/api/stocks/${code}/refresh`, { method: 'POST' })
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-800 rounded w-48" />
          <div className="h-[560px] bg-slate-800 rounded-xl" />
          <div className="h-24 bg-slate-800 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!data) return <div className="p-6 text-slate-400">データがありません</div>

  const sortedPrices = [...data.prices].sort((a, b) => a.date.localeCompare(b.date))
  const sortedInd = [...data.indicators].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sortedPrices[sortedPrices.length - 1]
  const prev = sortedPrices[sortedPrices.length - 2]

  const candles = sortedPrices.map(p => ({
    time: p.date, open: Number(p.open), high: Number(p.high), low: Number(p.low), close: Number(p.close)
  }))

  const ma5 = sortedInd.filter(i => i.ma5).map(i => ({ time: i.date, value: Number(i.ma5) }))
  const ma25 = sortedInd.filter(i => i.ma25).map(i => ({ time: i.date, value: Number(i.ma25) }))
  const ma75 = sortedInd.filter(i => i.ma75).map(i => ({ time: i.date, value: Number(i.ma75) }))

  const volumes = sortedPrices.map(p => {
    const prev2 = sortedPrices[sortedPrices.indexOf(p) - 1]
    const up = !prev2 || Number(p.close) >= Number(prev2.close)
    return { time: p.date, value: Number(p.volume), color: up ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)' }
  })

  const vol5avg = sortedInd.filter(i => i.vol5avg).map(i => ({ time: i.date, value: Number(i.vol5avg) }))

  const markers: any[] = []
  for (const sig of data.signals) {
    if ((sig.score ?? 0) >= 80) {
      markers.push({ time: sig.date, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: `買${sig.score}` })
    }
  }
  for (const trade of data.trades) {
    markers.push({ time: trade.entry_date, position: 'belowBar', color: '#3b82f6', shape: 'arrowUp', text: '買' })
    markers.push({ time: trade.exit_date, position: 'aboveBar', color: Number(trade.pnl) >= 0 ? '#22c55e' : '#ef4444', shape: 'arrowDown', text: Number(trade.pnl) >= 0 ? '利' : '損' })
  }
  markers.sort((a, b) => a.time.localeCompare(b.time))

  const openPos = data.positions.find(p => p.status === 'open')
  const totalPnl = data.trades.reduce((s, t) => s + Number(t.pnl), 0)
  const wins = data.trades.filter(t => Number(t.pnl) > 0).length
  const winRate = data.trades.length > 0 ? (wins / data.trades.length) * 100 : 0
  const latestInd = sortedInd[sortedInd.length - 1]

  const diff = prev ? Number(latest.close) - Number(prev.close) : 0
  const pct = prev ? (diff / Number(prev.close)) * 100 : 0
  const priceUp = diff >= 0

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">

      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/" className="text-slate-500 hover:text-white transition-colors mt-1 shrink-0 text-sm">← 戻る</Link>
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white font-mono">{code}</h1>
              <span className="text-slate-400">{stockName}</span>
            </div>
            {latest && (
              <div className="flex items-baseline gap-3 mt-0.5 flex-wrap">
                <span className="text-3xl font-bold text-white">{Number(latest.close).toLocaleString()}<span className="text-base text-slate-400 ml-1">円</span></span>
                <span className={`text-sm font-semibold px-2 py-0.5 rounded ${priceUp ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(0)} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="shrink-0 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors border border-slate-600"
        >
          {refreshing ? '更新中...' : '🔄 データ更新'}
        </button>
      </div>

      {/* チャート */}
      <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-4 shadow-xl">
        <CandlestickChart candles={candles} ma5={ma5} ma25={ma25} ma75={ma75} volumes={volumes} vol5avg={vol5avg} markers={markers} />
      </div>

      {/* テクニカル指標 */}
      {latestInd && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
          <p className="text-slate-500 text-xs mb-3">テクニカル指標（{latestInd.date}）</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[
              { label: 'MA5', value: latestInd.ma5, color: 'text-yellow-400', border: 'border-yellow-700/40' },
              { label: 'MA25', value: latestInd.ma25, color: 'text-blue-400', border: 'border-blue-700/40' },
              { label: 'MA75', value: latestInd.ma75, color: 'text-red-400', border: 'border-red-700/40' },
              { label: '出来高MA5', value: latestInd.vol5avg ? Math.round(Number(latestInd.vol5avg)).toLocaleString() : null, color: 'text-purple-400', border: 'border-purple-700/40' },
              { label: '20日高値', value: latestInd.high20, color: 'text-orange-400', border: 'border-orange-700/40' }
            ].map(item => (
              <div key={item.label} className={`bg-slate-800 border ${item.border} rounded-lg p-3 text-center`}>
                <p className="text-slate-500 text-xs mb-1">{item.label}</p>
                <p className={`font-bold text-sm ${item.color}`}>
                  {item.value !== null && item.value !== undefined
                    ? typeof item.value === 'string' ? item.value : Number(item.value).toLocaleString()
                    : '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 保有中ポジション */}
      {openPos && (
        <div className="bg-green-950/40 border border-green-700/40 rounded-xl p-4">
          <h2 className="text-green-400 font-semibold text-sm mb-3">● 保有中</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><p className="text-slate-500 text-xs mb-0.5">買付日</p><p className="text-white font-medium">{openPos.entry_date}</p></div>
            <div><p className="text-slate-500 text-xs mb-0.5">買付単価</p><p className="text-white font-medium">{Number(openPos.entry_price).toLocaleString()}円</p></div>
            <div><p className="text-slate-500 text-xs mb-0.5">保有株数</p><p className="text-white font-medium">{openPos.quantity}株</p></div>
            {latest && (
              <div>
                <p className="text-slate-500 text-xs mb-0.5">含み損益</p>
                <p className={`font-bold ${latest.close > openPos.entry_price ? 'text-green-400' : 'text-red-400'}`}>
                  {((Number(latest.close) - Number(openPos.entry_price)) * openPos.quantity > 0 ? '+' : '')}
                  {((Number(latest.close) - Number(openPos.entry_price)) * openPos.quantity).toLocaleString()}円
                </p>
              </div>
            )}
          </div>
          {openPos.signal_reasons && openPos.signal_reasons.length > 0 && (
            <div className="mt-3 pt-3 border-t border-green-800/40">
              <p className="text-slate-500 text-xs mb-1">買いシグナル理由（スコア: {openPos.signal_score}点）</p>
              <ul className="text-slate-400 text-xs space-y-0.5">
                {openPos.signal_reasons.map((r, i) => <li key={i}>・{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 成績サマリー */}
      {data.trades.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '累計損益', value: <span className={totalPnl > 0 ? 'text-green-400' : totalPnl < 0 ? 'text-red-400' : 'text-slate-400'}>{totalPnl > 0 ? '+' : ''}{totalPnl.toLocaleString()}円</span> },
            { label: 'トレード数', value: <span className="text-white">{data.trades.length}回</span> },
            { label: '勝率', value: <span className="text-white">{winRate.toFixed(1)}%</span> }
          ].map(item => (
            <div key={item.label} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-center">
              <p className="text-slate-500 text-xs">{item.label}</p>
              <p className="text-xl font-bold mt-1">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 取引履歴 */}
      {data.trades.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/60">
            <h2 className="text-white font-semibold text-sm">取引履歴</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs border-b border-slate-700/60 bg-slate-900/30">
                  <th className="px-4 py-2 text-left">買付日</th>
                  <th className="px-4 py-2 text-right">買値</th>
                  <th className="px-4 py-2 text-left">決済日</th>
                  <th className="px-4 py-2 text-right">売値</th>
                  <th className="px-4 py-2 text-right">損益</th>
                  <th className="px-4 py-2 text-right">損益率</th>
                  <th className="px-4 py-2 text-left hidden sm:table-cell">決済理由</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {data.trades.map(trade => {
                  const pnl = Number(trade.pnl)
                  const pnlRate = ((Number(trade.exit_price) - Number(trade.entry_price)) / Number(trade.entry_price)) * 100
                  return (
                    <tr key={trade.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{trade.entry_date}</td>
                      <td className="px-4 py-2.5 text-right text-white font-mono">{Number(trade.entry_price).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{trade.exit_date}</td>
                      <td className="px-4 py-2.5 text-right text-white font-mono">{Number(trade.exit_price).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right"><PnlCell value={pnl} /></td>
                      <td className={`px-4 py-2.5 text-right font-medium text-sm ${pnlRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {pnlRate >= 0 ? '+' : ''}{pnlRate.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs hidden sm:table-cell">{trade.exit_reason}</td>
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
