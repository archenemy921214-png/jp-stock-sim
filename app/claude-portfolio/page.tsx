'use client'

import { useEffect, useState, useCallback } from 'react'
import type { ClaudePortfolio, ClaudeTrade } from '@/types'

function PnlText({ value }: { value: number }) {
  const color = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-slate-400'
  return (
    <span className={color}>
      {value > 0 ? '+' : ''}{value.toLocaleString(undefined, { maximumFractionDigits: 0 })}円
    </span>
  )
}

function DecisionBadge({ type }: { type: 'buy' | 'sell' }) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
      type === 'buy' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
    }`}>
      {type === 'buy' ? '買い' : '売り'}
    </span>
  )
}

export default function ClaudePortfolioPage() {
  const [portfolio, setPortfolio] = useState<ClaudePortfolio | null>(null)
  const [stocks, setStocks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [analyzeAll, setAnalyzeAll] = useState(false)
  const [lastResult, setLastResult] = useState<any | null>(null)
  const [resetting, setResetting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [portRes, stocksRes] = await Promise.all([
        fetch('/api/portfolio').then(r => r.json()),
        fetch('/api/stocks').then(r => r.json())
      ])
      setPortfolio(portRes)
      setStocks(Array.isArray(stocksRes) ? stocksRes : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleAnalyze = async (code: string) => {
    setAnalyzing(code)
    setLastResult(null)
    try {
      const res = await fetch(`/api/claude-analyze/${code}`, { method: 'POST' })
      const data = await res.json()
      setLastResult(data)
      await loadData()
    } finally {
      setAnalyzing(null)
    }
  }

  const handleAnalyzeAll = async () => {
    setAnalyzeAll(true)
    setLastResult(null)
    const results: any[] = []
    for (const stock of stocks) {
      setAnalyzing(stock.code)
      try {
        const res = await fetch(`/api/claude-analyze/${stock.code}`, { method: 'POST' })
        const data = await res.json()
        results.push(data)
      } catch {
        // continue on error
      }
    }
    setAnalyzing(null)
    setAnalyzeAll(false)
    setLastResult({ batch: results })
    await loadData()
  }

  const handleReset = async () => {
    if (!confirm('ポートフォリオをリセットしますか？すべての取引履歴が削除されます。')) return
    setResetting(true)
    try {
      await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      })
      await loadData()
      setLastResult(null)
    } finally {
      setResetting(false)
    }
  }

  const totalReturn = portfolio
    ? ((portfolio.totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100
    : 0

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Claude AI ポートフォリオ</h1>
          <p className="text-slate-400 text-sm mt-1">Claude が自律的に売買判断を行う仮想ポートフォリオ</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAnalyzeAll}
            disabled={!!analyzing || analyzeAll || stocks.length === 0}
            className="flex-1 sm:flex-none bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {analyzeAll ? `分析中 (${analyzing})...` : '全銘柄をAI分析'}
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="bg-red-900/50 hover:bg-red-800/50 disabled:opacity-50 text-red-300 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            リセット
          </button>
        </div>
      </div>

      {/* ポートフォリオサマリー */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-slate-800 rounded-xl h-20 animate-pulse" />)}
        </div>
      ) : portfolio ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
            <p className="text-slate-400 text-xs mb-1">ポートフォリオ総額</p>
            <p className="text-white text-xl font-bold">¥{portfolio.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
            <p className="text-slate-400 text-xs mb-1">保有現金</p>
            <p className="text-white text-xl font-bold">¥{portfolio.cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className={`bg-slate-800 border rounded-xl p-4 text-center ${totalReturn >= 0 ? 'border-green-700/50' : 'border-red-700/50'}`}>
            <p className="text-slate-400 text-xs mb-1">トータルリターン</p>
            <p className={`text-xl font-bold ${totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
            </p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
            <p className="text-slate-400 text-xs mb-1">確定損益</p>
            <div className="text-xl font-bold"><PnlText value={portfolio.realizedPnl} /></div>
          </div>
        </div>
      ) : null}

      {/* 最新のAI判断結果 */}
      {lastResult && (
        <div className="bg-slate-800 border border-purple-700/50 rounded-xl p-4">
          <h2 className="text-purple-400 font-semibold mb-3">最新のAI判断</h2>
          {lastResult.batch ? (
            <div className="space-y-2">
              {lastResult.batch.map((r: any, i: number) => (
                <div key={i} className="flex items-start gap-3 text-sm border-b border-slate-700 pb-2 last:border-0 last:pb-0">
                  <span className="font-mono font-bold text-blue-400 w-16 shrink-0">{r.stock_code}</span>
                  <DecisionBadge type={r.decision === 'hold' ? 'buy' : r.decision} />
                  <span className={`text-xs font-medium shrink-0 ${r.decision === 'buy' ? 'text-green-400' : r.decision === 'sell' ? 'text-red-400' : 'text-slate-400'}`}>
                    {r.decision === 'buy' ? '買い' : r.decision === 'sell' ? '売り' : '様子見'}
                  </span>
                  <span className="text-slate-300 text-xs leading-relaxed">{r.reasoning}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono font-bold text-blue-400">{lastResult.stock_code}</span>
                <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                  lastResult.decision === 'buy' ? 'bg-green-900/50 text-green-400' :
                  lastResult.decision === 'sell' ? 'bg-red-900/50 text-red-400' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {lastResult.decision === 'buy' ? '買い' : lastResult.decision === 'sell' ? '売り' : '様子見'}
                </span>
                <span className="text-slate-400 text-sm">確信度: {lastResult.confidence}%</span>
              </div>
              <p className="text-slate-300 text-sm">{lastResult.reasoning}</p>
            </div>
          )}
        </div>
      )}

      {/* 銘柄別AI分析ボタン */}
      {stocks.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h2 className="text-white font-semibold mb-3">銘柄別AI分析</h2>
          <div className="flex flex-wrap gap-2">
            {stocks.map(stock => (
              <button
                key={stock.code}
                onClick={() => handleAnalyze(stock.code)}
                disabled={!!analyzing}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                <span className="font-mono font-bold text-blue-400">{stock.code}</span>
                <span className="text-slate-300">{stock.name}</span>
                {analyzing === stock.code && <span className="text-purple-400 text-xs">分析中...</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* オープンポジション */}
      {portfolio && portfolio.positions.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="text-white font-semibold">保有ポジション</h2>
          </div>
          {/* モバイル: カード表示 */}
          <div className="sm:hidden divide-y divide-slate-700/50">
            {portfolio.positions.map(pos => {
              const pnlRate = pos.entry_price > 0
                ? ((pos.current_price! - pos.entry_price) / pos.entry_price * 100)
                : 0
              return (
                <div key={pos.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-blue-400">{pos.stock_code}</span>
                      <span className="text-slate-400 text-xs ml-2">{pos.stock_name}</span>
                    </div>
                    <span className={`font-bold text-sm ${pnlRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {pnlRate >= 0 ? '+' : ''}{pnlRate.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">取得 ¥{pos.entry_price.toLocaleString()} × {pos.quantity}株</span>
                    <span className="font-medium"><PnlText value={pos.unrealized_pnl ?? 0} /></span>
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
                  <th className="px-4 py-2 text-left">銘柄</th>
                  <th className="px-4 py-2 text-right">取得価格</th>
                  <th className="px-4 py-2 text-right">現在値</th>
                  <th className="px-4 py-2 text-right">株数</th>
                  <th className="px-4 py-2 text-right">含み損益</th>
                  <th className="px-4 py-2 text-right">騰落率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {portfolio.positions.map(pos => {
                  const pnlRate = pos.entry_price > 0
                    ? ((pos.current_price! - pos.entry_price) / pos.entry_price * 100)
                    : 0
                  return (
                    <tr key={pos.id} className="hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <p className="font-mono font-bold text-blue-400">{pos.stock_code}</p>
                        <p className="text-slate-400 text-xs">{pos.stock_name}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-white">¥{pos.entry_price.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-white">¥{pos.current_price?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{pos.quantity}株</td>
                      <td className="px-4 py-3 text-right font-medium">
                        <PnlText value={pos.unrealized_pnl ?? 0} />
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${pnlRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {pnlRate >= 0 ? '+' : ''}{pnlRate.toFixed(2)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 取引履歴 */}
      {portfolio && portfolio.trades.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="text-white font-semibold">
              取引履歴
              <span className="text-slate-400 font-normal text-sm ml-2">{portfolio.trades.length}件</span>
            </h2>
          </div>
          {/* モバイル: カード表示 */}
          <div className="sm:hidden divide-y divide-slate-700/50">
            {portfolio.trades.map((trade: ClaudeTrade) => (
              <div key={trade.id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-400">{trade.stock_code}</span>
                    <DecisionBadge type={trade.trade_type} />
                  </div>
                  <span className="text-slate-400 text-xs">{trade.date}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">¥{trade.price.toLocaleString()} × {trade.quantity}株</span>
                  {trade.pnl !== null ? <PnlText value={trade.pnl} /> : <span className="text-slate-500">—</span>}
                </div>
                {trade.claude_reasoning && (
                  <p className="text-slate-500 text-xs leading-relaxed">{trade.claude_reasoning}</p>
                )}
              </div>
            ))}
          </div>
          {/* PC: テーブル表示 */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-700 bg-slate-900/50">
                  <th className="px-3 py-2 text-left">日付</th>
                  <th className="px-3 py-2 text-left">銘柄</th>
                  <th className="px-3 py-2 text-center">売買</th>
                  <th className="px-3 py-2 text-right">価格</th>
                  <th className="px-3 py-2 text-right">株数</th>
                  <th className="px-3 py-2 text-right">損益</th>
                  <th className="px-3 py-2 text-left">Claudeの判断理由</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {portfolio.trades.map((trade: ClaudeTrade) => (
                  <tr key={trade.id} className="hover:bg-slate-700/30">
                    <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{trade.date}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-bold text-blue-400">{trade.stock_code}</span>
                      <span className="text-slate-400 text-xs ml-1">{trade.stock_name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <DecisionBadge type={trade.trade_type} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-white">¥{trade.price.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-slate-300">{trade.quantity}株</td>
                    <td className="px-3 py-2.5 text-right font-medium">
                      {trade.pnl !== null ? <PnlText value={trade.pnl} /> : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs max-w-[300px]">
                      {trade.claude_reasoning}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {portfolio && portfolio.trades.length === 0 && !loading && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-4">🤖</p>
          <p className="text-lg font-medium">まだAIの取引はありません</p>
          <p className="text-sm mt-2">銘柄を登録してから「全銘柄をAI分析」を実行してください</p>
        </div>
      )}
    </div>
  )
}
