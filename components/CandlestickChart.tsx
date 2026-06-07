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

interface OHLCBar { time: string; open: number; high: number; low: number; close: number }
interface LinePoint { time: string; value: number }
interface VolumeBar { time: string; value: number; color: string }
interface ChartMarker { time: string; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }

interface Props {
  candles: OHLCBar[]
  ma5?: LinePoint[]
  ma25?: LinePoint[]
  ma75?: LinePoint[]
  volumes?: VolumeBar[]
  vol5avg?: LinePoint[]
  markers?: ChartMarker[]
}

export default function CandlestickChart({ candles, ma5 = [], ma25 = [], ma75 = [], volumes = [], vol5avg = [], markers = [] }: Props) {
  const mainRef = useRef<HTMLDivElement>(null)
  const volRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mainRef.current || !volRef.current) return

    const base = {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: '#94a3b8',
        fontSize: 11
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' }
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#334155', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#334155', timeVisible: true, fixLeftEdge: true, fixRightEdge: true }
    }

    const w = mainRef.current.clientWidth

    const mainChart = createChart(mainRef.current, { ...base, width: w, height: 450 })

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#4ade80',
      wickDownColor: '#f87171'
    })
    candleSeries.setData(candles.map(c => ({ ...c, time: c.time as Time })))

    if (markers.length > 0) {
      const sm = createSeriesMarkers(candleSeries, [])
      sm.setMarkers(markers.map(m => ({ time: m.time as Time, position: m.position, color: m.color, shape: m.shape, text: m.text })) as SeriesMarker<Time>[])
    }

    if (ma5.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#facc15', lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false })
      s.setData(ma5.map(p => ({ time: p.time as Time, value: p.value })))
    }
    if (ma25.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#60a5fa', lineWidth: 2, lastValueVisible: false, priceLineVisible: false })
      s.setData(ma25.map(p => ({ time: p.time as Time, value: p.value })))
    }
    if (ma75.length > 0) {
      const s = mainChart.addSeries(LineSeries, { color: '#f87171', lineWidth: 2, lastValueVisible: false, priceLineVisible: false })
      s.setData(ma75.map(p => ({ time: p.time as Time, value: p.value })))
    }

    mainChart.timeScale().fitContent()

    const volChart = createChart(volRef.current, {
      ...base,
      width: w,
      height: 100,
      timeScale: { ...base.timeScale, timeVisible: false, visible: false }
    })

    if (volumes.length > 0) {
      const vSeries = volChart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
      vSeries.setData(volumes.map(v => ({ time: v.time as Time, value: v.value, color: v.color })))
    }
    if (vol5avg.length > 0) {
      const avgSeries = volChart.addSeries(LineSeries, { color: '#a78bfa', lineWidth: 1, lastValueVisible: false, priceLineVisible: false })
      avgSeries.setData(vol5avg.map(p => ({ time: p.time as Time, value: p.value })))
    }

    volChart.timeScale().fitContent()

    mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) volChart.timeScale().setVisibleLogicalRange(range)
    })
    volChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range) mainChart.timeScale().setVisibleLogicalRange(range)
    })

    const ro = new ResizeObserver(() => {
      const nw = mainRef.current?.clientWidth ?? w
      mainChart.applyOptions({ width: nw })
      volChart.applyOptions({ width: nw })
    })
    if (mainRef.current.parentElement) ro.observe(mainRef.current.parentElement)

    return () => {
      ro.disconnect()
      mainChart.remove()
      volChart.remove()
    }
  }, [candles, ma5, ma25, ma75, volumes, vol5avg, markers])

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-3 text-xs mb-3 px-1">
        {[
          { color: '#facc15', label: 'MA5', dashed: true },
          { color: '#60a5fa', label: 'MA25' },
          { color: '#f87171', label: 'MA75' },
          { color: '#a78bfa', label: '出来高MA5' },
          { color: '#22c55e', label: '買いシグナル', marker: '▲' },
          { color: '#3b82f6', label: '仮想買い', marker: '▲' },
          { color: '#94a3b8', label: '仮想売り', marker: '▼' },
        ].map(item => (
          <span key={item.label} className="flex items-center gap-1.5">
            {item.marker ? (
              <span style={{ color: item.color }}>{item.marker}</span>
            ) : (
              <span style={{ display: 'inline-block', width: 20, height: 2, borderTop: item.dashed ? `2px dashed ${item.color}` : `2px solid ${item.color}` }} />
            )}
            <span className="text-slate-400">{item.label}</span>
          </span>
        ))}
      </div>
      <div ref={mainRef} className="w-full rounded-t overflow-hidden" />
      <div className="px-2 py-1 bg-[#0f172a] border-t border-slate-800">
        <span className="text-slate-500 text-xs">出来高</span>
      </div>
      <div ref={volRef} className="w-full rounded-b overflow-hidden" />
    </div>
  )
}
