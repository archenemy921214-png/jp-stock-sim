'use client'

import { useState } from 'react'
import StockCodeInput from '@/components/StockCodeInput'
import type { BacktestParams, BacktestResult, BacktestTrade } from '@/lib/backtester'
import { runBacktest } from '@/lib/backtester'
import { generateDummyPrices } from '@/lib/dummyData'
import type { Period } from '@/lib/dummyData'

const DEFAULT_PARAMS: BacktestParams = {
  stockCode: '7203',
  period: '1y',
  shortMaPeriod: 5,
  longMaPeriod: 25,
  stopLossRate: 3,
  takeProfitRate: 6,
  quantity: 100,
  commission: 0,
}

function PnlText({ value }: { value: number }) {
  const color = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-slate-400'
  return (
    <span className={color}>
      {value > 0 ? '+' : ''}{value.toLocaleString()}円
    </span>
  )
}

function MonthlyBar({ pnl, maxAbs }: { pnl: number; maxAbs: number }) {
  const pct = maxAbs === 0 ? 0 : (Math.abs(pnl) / maxAbs) * 100
  return (
    <div className="flex-1 bg-slate-700 rounded h-5 overflow-hidden">
      <div
        className={`h-full rounded transition-all ${pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}

function KpiCard({
  label,
  children,
  accent,
}: {
  label: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div className={`bg-slate-800 border ${accent ?? 'border-slate-700'} rounded-xl p-4 text-center`}>
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-xl font-bold">{children}</p>
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  step,
  suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  step?: number
  suffix?: string
}) {
  return (
    <div>
      <label className="block text-slate-400 text-xs mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          min={min ?? 1}
          step={step ?? 1}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export default function SimulatorPage() {
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof BacktestParams>(key: K, value: BacktestParams[K]) =>
    setParams(prev => ({ ...prev, [key]: value }))

  function validate(): string {
    if (!params.stockCode.trim()) return '銘柄コードを入力してください'
    if (params.shortMaPeriod >= params.longMaPeriod) return '短期MAは長期MAより小さくしてください'
    if (params.stopLossRate <= 0) return '損切り率は0より大きくしてください'
    if (params.takeProfitRate <= 0) return '利確率は0より大きくしてください'
    if (params.quantity <= 0) return '株数は0より大きくしてください'
    return ''
  }

  function handleRun() {
    const msg = validate()
    if (msg) { setError(msg); return }
    setError('')
    setRunning(true)
    // Defer to next tick to let UI update before heavy computation
    setTimeout(() => {
      try {
        const prices = generateDummyPrices(params.stockCode, params.period, params.longMaPeriod)
        const res = runBacktest(params, prices)
        setResult(res)
      } finally {
        setRunning(false)
      }
    }, 0)
  }

  const maxMonthlyAbs = Math.max(...(result?.monthly ?? []).map(m => Math.abs(m.pnl)), 1)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">バックテスト・シミュレーター</h1>
      <p className="text-slate-400 text-sm -mt-4">
        ゴールデンクロス／デッドクロス戦略を過去データで検証します（ダミーデータ使用）
      </p>

      {/* 入力フォーム */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <h2 className="text-white font-semibold">シミュレーション条件</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-slate-400 text-xs mb-1">銘柄コード / 銘柄名</label>
            <StockCodeInput
              value={params.stockCode}
              onChange={v => set('stockCode', v)}
              className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1">期間</label>
            <select
              value={params.period}
              onChange={e => set('period', e.target.value as Period)}
              className="w-full bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="3m">3か月</option>
              <option value="6m">6か月</option>
              <option value="1y">1年</option>
            </select>
          </div>

          <NumberInput
            label="短期移動平均（日）"
            value={params.shortMaPeriod}
            onChange={v => set('shortMaPeriod', v)}
            min={1}
          />
          <NumberInput
            label="長期移動平均（日）"
            value={params.longMaPeriod}
            onChange={v => set('longMaPeriod', v)}
            min={2}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <NumberInput
            label="損切り率"
            value={params.stopLossRate}
            onChange={v => set('stopLossRate', v)}
            min={0.1}
            step={0.1}
            suffix="%"
          />
          <NumberInput
            label="利確率"
            value={params.takeProfitRate}
            onChange={v => set('takeProfitRate', v)}
            min={0.1}
            step={0.1}
            suffix="%"
          />
          <NumberInput
            label="株数"
            value={params.quantity}
            onChange={v => set('quantity', v)}
            min={1}
          />
          <NumberInput
            label="手数料（片道）"
            value={params.commission}
            onChange={v => set('commission', v)}
            min={0}
            suffix="円"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={handleRun}
          disabled={running}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-8 py-2.5 rounded-lg text-sm transition-colors"
        >
          {running ? 'シミュレーション中...' : 'シミュレーション開始'}
        </button>
      </div>

      {/* 結果セクション */}
      {result && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">結果</h2>
            <span className="text-slate-500 text-sm font-mono">{params.stockCode}</span>
          </div>

          {result.tradeCount === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-400">
              <p className="text-3xl mb-3">📉</p>
              <p>この条件では取引シグナルが発生しませんでした</p>
              <p className="text-sm mt-1">期間を延長するか、MA期間を調整してください</p>
            </div>
          ) : (
            <>
              {/* KPI */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard
                  label="総損益"
                  accent={
                    result.totalPnl > 0
                      ? 'border-green-700/50'
                      : result.totalPnl < 0
                      ? 'border-red-700/50'
                      : 'border-slate-700'
                  }
                >
                  <PnlText value={result.totalPnl} />
                </KpiCard>
                <KpiCard label="取引回数">
                  <span className="text-white">{result.tradeCount}回</span>
                </KpiCard>
                <KpiCard label="勝率">
                  <span className={result.winRate >= 50 ? 'text-green-400' : 'text-slate-300'}>
                    {result.winRate.toFixed(1)}%
                  </span>
                </KpiCard>
                <KpiCard label="勝/負">
                  <span>
                    <span className="text-green-400">{result.winCount}</span>
                    <span className="text-slate-500"> / </span>
                    <span className="text-red-400">{result.lossCount}</span>
                  </span>
                </KpiCard>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="平均利益">
                  <span className="text-green-400">
                    {result.avgWin.toLocaleString()}円
                  </span>
                </KpiCard>
                <KpiCard label="平均損失">
                  <span className="text-red-400">
                    {result.avgLoss.toLocaleString()}円
                  </span>
                </KpiCard>
                <KpiCard label="ペイオフレシオ">
                  <span className={result.payoffRatio >= 1 ? 'text-green-400' : 'text-red-400'}>
                    {result.payoffRatio.toFixed(2)}
                  </span>
                </KpiCard>
                <KpiCard label="最大ドローダウン">
                  <span className="text-orange-400">
                    {result.maxDrawdown.toLocaleString()}円
                  </span>
                </KpiCard>
              </div>

              {/* 月別損益 */}
              {result.monthly.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <h3 className="text-white font-semibold mb-4">月別損益</h3>
                  <div className="space-y-2">
                    {result.monthly.map(m => (
                      <div key={m.month} className="flex items-center gap-3 text-sm">
                        <span className="text-slate-400 w-20 shrink-0">{m.month}</span>
                        <MonthlyBar pnl={m.pnl} maxAbs={maxMonthlyAbs} />
                        <span
                          className={`text-xs w-28 text-right font-medium shrink-0 ${
                            m.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {m.pnl >= 0 ? '+' : ''}{m.pnl.toLocaleString()}円
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 銘柄別成績 */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700">
                  <h3 className="text-white font-semibold">銘柄別成績</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 text-xs border-b border-slate-700 bg-slate-900/50">
                        <th className="px-4 py-2 text-left">銘柄コード</th>
                        <th className="px-4 py-2 text-right">損益</th>
                        <th className="px-4 py-2 text-right">取引数</th>
                        <th className="px-4 py-2 text-right">勝率</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {result.byStock.map(s => {
                        const wr = s.count > 0 ? (s.wins / s.count) * 100 : 0
                        return (
                          <tr key={s.code} className="hover:bg-slate-700/30">
                            <td className="px-4 py-3 font-mono font-bold text-blue-400">{s.code}</td>
                            <td className={`px-4 py-3 text-right font-medium ${s.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {s.pnl >= 0 ? '+' : ''}{s.pnl.toLocaleString()}円
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

              {/* 売買履歴一覧 */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700">
                  <h3 className="text-white font-semibold">
                    売買履歴一覧
                    <span className="text-slate-400 font-normal text-sm ml-2">{result.trades.length}件</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 text-xs border-b border-slate-700 bg-slate-900/50">
                        <th className="px-3 py-2 text-left">エントリー日</th>
                        <th className="px-3 py-2 text-left">決済日</th>
                        <th className="px-3 py-2 text-left">銘柄</th>
                        <th className="px-3 py-2 text-right">エントリー価格</th>
                        <th className="px-3 py-2 text-right">決済価格</th>
                        <th className="px-3 py-2 text-right">株数</th>
                        <th className="px-3 py-2 text-right">損益</th>
                        <th className="px-3 py-2 text-right">損益率</th>
                        <th className="px-3 py-2 text-left hidden sm:table-cell">決済理由</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {result.trades.map((trade, idx) => {
                        const isWin = trade.pnl > 0
                        return (
                          <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                            <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{trade.entryDate}</td>
                            <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{trade.exitDate}</td>
                            <td className="px-3 py-2.5 font-mono font-bold text-blue-400">{trade.stockCode}</td>
                            <td className="px-3 py-2.5 text-right text-white">
                              {trade.entryPrice.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right text-white">
                              {trade.exitPrice.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-300">
                              {trade.quantity.toLocaleString()}
                            </td>
                            <td className={`px-3 py-2.5 text-right font-medium ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                              {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toLocaleString()}
                            </td>
                            <td className={`px-3 py-2.5 text-right font-medium ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                              {trade.pnlRate >= 0 ? '+' : ''}{trade.pnlRate.toFixed(2)}%
                            </td>
                            <td className="px-3 py-2.5 text-slate-400 text-xs hidden sm:table-cell max-w-[180px] truncate">
                              {trade.exitReason}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
