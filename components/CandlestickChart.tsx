'use client'

import { useEffect, useRef } from 'react'
import {
  createChart,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type Time,
  type SeriesMarker
} from 'lightweight-charts'

interface OHLCBar {
  time: string
  open: number
  high: number
  low: number
  close: number
}

interface LinePoint {
  time: string
  value: number
}

interface VolumeBar {
  time: string
  value: number
  color: string
}

interface ChartMarker {
  time: string
  position: 'aboveBar' | 'belowBar'
  color: string
  shape: 'arrowUp' | 'arrowDown'
  text: string
}

interface Props {
  candles: OHLCBar[]
  ma5?: LinePoint[]
  ma25?: LinePoint[]
  ma75?: LinePoint[]
  volumes?: VolumeBar[]
  vol5avg?: LinePoint[]
  markers?: ChartMarker[]
}

export default function CandlestickChart({
  candles,
  ma5 = [],
  ma25 = [],
  ma75 = [],
  volumes = [],
  vol5avg = [],
  markers = []
}: Props) {
  const mainRef = useRef<HTMLDivElement>(null)
  const volRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mainRef.current || !volRef.current) return

    const base = {
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8'
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' }
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#475569' },
      timeScale: { borderColor: '#475569', timeVisible: true }
    }

    // メインチャート
    const mainChart = createChart(mainRef.current, { ...base, height: 380 })

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444'
    })
    candleSeries.setData(candles.map(c => ({ ...c, time: c.time as Time })))

    // マーカー（v5: createSeriesMarkers）
    if (markers.length > 0) {
      const sm = createSeriesMarkers(candleSeries, [])
      sm.setMarkers(
        markers.map(m => ({
          time: m.time as Time,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text
        })) as SeriesMarker<Time>[]
      )
    }

    if (ma5.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#facc15', lineWidth: 1, lineStyle: LineStyle.Dashed })
      s.setData(ma5.map(p => ({ time: p.time as Time, value: p.value })))
    }
    if (ma25.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 2 })
      s.setData(ma25.map(p => ({ time: p.time as Time, value: p.value })))
    }
    if (ma75.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#f87171', lineWidth: 2 })
      s.setData(ma75.map(p => ({ time: p.time as Time, value: p.value })))
    }

    mainChart.timeScale().fitContent()

    // 出来高チャート
    const volChart = createChart(volRef.current, {
      ...base,
      height: 120,
      timeScale: { ...base.timeScale, timeVisible: false }
    })

    if (volumes.length > 0) {
      const vSeries = volChart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' } })
      vSeries.setData(volumes.map(v => ({ time: v.time as Time, value: v.value, color: v.color })))
    }
    if (vol5avg.length > 0) {
      const avgSeries = volChart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1 })
      avgSeries.setData(vol5avg.map(p => ({ time: p.time as Time, value: p.value })))
    }

    volChart.timeScale().fitContent()

    // 時間軸同期
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) volChart.timeScale().setVisibleLogicalRange(range)
    })
    volChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) mainChart.timeScale().setVisibleLogicalRange(range)
    })

    // レスポンシブ
    const handleResize = () => {
      const w = mainRef.current?.clientWidth ?? 600
      mainChart.applyOptions({ width: w })
      volChart.applyOptions({ width: w })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      mainChart.remove()
      volChart.remove()
    }
  }, [candles, ma5, ma25, ma75, volumes, vol5avg, markers])

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-4 text-xs mb-2 px-1">
        <span className="text-yellow-400">── MA5</span>
        <span className="text-blue-400">── MA25</span>
        <span className="text-red-400">── MA75</span>
        <span className="text-purple-400">── 出来高5日平均</span>
        <span className="text-green-400">▲ 買いシグナル</span>
        <span className="text-blue-300">▲ 仮想買い</span>
        <span>▼ 仮想売り</span>
      </div>
      <div ref={mainRef} className="w-full" />
      <div ref={volRef} className="w-full mt-1" />
    </div>
  )
}
