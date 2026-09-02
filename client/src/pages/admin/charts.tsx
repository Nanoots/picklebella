/* =========================================================
   PickleBella Park — admin chart primitives.

   Three forms, each for one job:

     AreaChart   change over time      (revenue by day)
     ColumnChart magnitude, ordered    (bookings by hour of day)
     HBarChart   magnitude, named      (occupancy by court, revenue by method)

   Every chart here plots ONE series, so none of them carries a legend: the
   card's title already names what is plotted, and a legend box with a single
   swatch just restates it. Colour is picked per chart from the validated
   palette below rather than per bar — shading each bar by its own value would
   encode length twice and burn the only free channel on nothing.

   Rendering notes:

   - The SVG is drawn at the container's real pixel width rather than at a
     fixed viewBox that gets scaled to fit. A scaled viewBox scales the text
     with it, so the same axis label ends up at 7px in the narrow admin column
     and 13px on a wide monitor. Measuring first costs a render and keeps
     every chart's typography identical.
   - Marks are thin and the grid is a hairline one step off the surface. The
     data is the only thing allowed to be loud.
   - Each chart ships a table view. The tooltip enhances; it never gates —
     every number it shows is reachable without a pointer.
   ========================================================= */

import { useLayoutEffect, useRef, useState } from 'react'
import { FONT_BODY } from '../../lib/theme'
import { useAdminTheme } from './adminTheme'

/* ---------------- Tokens ---------------- */

/** Chart surface tokens, light and dark. Each chart component reads the
 * right set via useChartColors() rather than a module-level constant, since
 * the admin shell itself now switches themes (see adminTheme.tsx). */
const LIGHT_TOKENS = {
  surface: '#FFFFFF',
  grid: '#EDEFEC',
  gridFaint: '#F7F8F6',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
}

const DARK_TOKENS = {
  surface: '#1A1F26',
  grid: '#2E3440',
  gridFaint: '#262B33',
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#7B8494',
}

function useChartColors() {
  const { dark } = useAdminTheme()
  return dark ? DARK_TOKENS : LIGHT_TOKENS
}

/**
 * Series hues, validated as a categorical set against a light surface
 * (lightness band, chroma floor, CVD separation, normal-vision separation and
 * 3:1 contrast all pass in this order). Charts pick one; the order matters
 * only if a future chart ever plots several series at once.
 */
export const VIZ = {
  green: '#1A8B4C',
  blue: '#2563EB',
  pink: '#E8187A',
  amber: '#D97706',
} as const

export type VizColor = (typeof VIZ)[keyof typeof VIZ]

/* ---------------- Scale helpers ---------------- */

/**
 * Rounds a value up to a presentable scale top.
 *
 * Used where the top is all that matters (the horizontal bar track). Charts
 * with a labelled y-axis go through niceTicks instead, which picks the STEP
 * first — rounding the top and then dividing it by four is what produces axes
 * reading 0 / 13 / 25 / 38 / 50.
 */
function niceMax(max: number): number {
  if (max <= 0) return 10
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  const norm = max / magnitude
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * magnitude
}

/**
 * Axis ticks on a round step: 0 / 10 / 20 / 30 / 40, never 0 / 13 / 25 / 38.
 *
 * The step is chosen first from {1, 2, 2.5, 5, 10} × a power of ten, then the
 * top is the first multiple of that step at or above the data. That also keeps
 * the headroom tight — a series peaking at 6,000 gets an axis topping out at
 * 6,000 rather than 10,000 with the plot squashed into its lower half.
 *
 * `count` is a target, not a promise; the real tick count lands within one.
 *
 * `integer` is for counts. Three bookings in the busiest hour would otherwise
 * produce an axis of 0 / 0.75 / 1.5 / 2.25 / 3, and there is no such thing as
 * three quarters of a booking.
 */
function niceTicks(max: number, count = 4, opts: { integer?: boolean } = {}): number[] {
  if (max <= 0) return [0]

  const rough = max / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / magnitude
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude
  if (opts.integer) step = Math.max(1, Math.round(step))

  const steps = Math.ceil(max / step)
  return Array.from({ length: steps + 1 }, (_, i) => Number((i * step).toFixed(6)))
}

/** Axis ticks: clean, comma'd, and never collapsed to 0/1 on a small range. */
function formatTick(v: number): string {
  if (v === 0) return '0'
  if (Math.abs(v) < 10) return (Math.round(v * 100) / 100).toLocaleString()
  return Math.round(v).toLocaleString()
}

// Which category indices get an x-axis label — evenly spaced, and only appends
// the final index when it lands a full step away (otherwise it collides with
// the previous label on dense charts, e.g. 16 hourly columns).
function labelIndices(n: number, step: number): Set<number> {
  const idx = new Set<number>()
  for (let i = 0; i < n; i += step) idx.add(i)
  const last = n - 1
  if (!idx.has(last)) {
    const prevShown = Math.max(...idx)
    if (last - prevShown >= step) idx.add(last)
  }
  return idx
}

/* ---------------- Layout measurement ---------------- */

/**
 * The element's content width, so the SVG can be drawn 1:1 in CSS pixels.
 *
 * Starts at 0 and paints nothing on the first pass; that one frame is what
 * buys identical label sizes at every container width.
 */
function useElementWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, width]
}

/* ---------------- Shared pieces ---------------- */

export type Point = { label: string; value: number }

function EmptyState({ height, message }: { height: number; message: string }) {
  const c = useChartColors()
  return (
    <div
      style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: c.textMuted, fontSize: '0.82rem', fontFamily: FONT_BODY,
      }}
    >
      {message}
    </div>
  )
}

/**
 * The keyboard- and screen-reader-reachable copy of the plot.
 *
 * Toggled rather than always shown: it is the chart's accessible equal, not a
 * caption. Every value the tooltip can show appears here.
 */
function TableView({
  data, valueFormatter, categoryHeading, valueHeading,
}: {
  data: readonly Point[]
  valueFormatter: (n: number) => string
  categoryHeading: string
  valueHeading: string
}) {
  const c = useChartColors()
  return (
    <div style={{ maxHeight: '260px', overflowY: 'auto', marginTop: '0.75rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT_BODY, fontSize: '0.8rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.4rem 0', color: c.textSecondary, fontWeight: 600, borderBottom: `1px solid ${c.grid}` }}>
              {categoryHeading}
            </th>
            <th style={{ textAlign: 'right', padding: '0.4rem 0', color: c.textSecondary, fontWeight: 600, borderBottom: `1px solid ${c.grid}` }}>
              {valueHeading}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <td style={{ padding: '0.35rem 0', color: c.textSecondary, borderBottom: `1px solid ${c.gridFaint}` }}>{d.label}</td>
              <td style={{ padding: '0.35rem 0', textAlign: 'right', color: c.textPrimary, fontWeight: 600, borderBottom: `1px solid ${c.gridFaint}`, fontVariantNumeric: 'tabular-nums' }}>
                {valueFormatter(d.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const c = useChartColors()
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        background: 'none', border: 'none', padding: '0.35rem 0 0', cursor: 'pointer',
        fontFamily: FONT_BODY, fontSize: '0.72rem', fontWeight: 600, color: c.textMuted,
      }}
    >
      {open ? 'Hide data table' : 'View as table'}
    </button>
  )
}

/** Value-leading readout, keyed by a short stroke of the series colour. */
function Tooltip({
  x, y, color, children,
}: {
  x: number
  y: number
  color: string
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      style={{
        position: 'absolute', pointerEvents: 'none', left: x, top: y,
        transform: 'translate(-50%, -100%)', marginTop: '-10px',
        backgroundColor: '#111827', color: 'white', borderRadius: '8px',
        padding: '7px 10px', fontSize: '0.72rem', lineHeight: 1.5,
        whiteSpace: 'nowrap', boxShadow: '0 6px 20px rgba(0,0,0,0.22)', zIndex: 10,
        display: 'flex', alignItems: 'flex-start', gap: '7px', fontFamily: FONT_BODY,
      }}
    >
      <span style={{ width: '3px', alignSelf: 'stretch', borderRadius: '99px', backgroundColor: color, flexShrink: 0, marginTop: '2px' }} />
      <span>{children}</span>
    </div>
  )
}

/* =========================================================
   AreaChart — change over time
   ========================================================= */

interface AreaChartProps<T extends Point> {
  data: T[]
  color?: VizColor
  height?: number
  valueFormatter?: (n: number) => string
  labelEvery?: number
  renderTooltip?: (d: T) => React.ReactNode
  categoryHeading?: string
  valueHeading?: string
  emptyMessage?: string
}

export function AreaChart<T extends Point>({
  data,
  color = VIZ.green,
  height = 220,
  valueFormatter = String,
  labelEvery,
  renderTooltip,
  categoryHeading = 'Date',
  valueHeading = 'Value',
  emptyMessage = 'No data for this period.',
}: AreaChartProps<T>) {
  const c = useChartColors()
  const [wrapRef, width] = useElementWidth()
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const padL = 52, padR = 16, padT = 14, padB = 26
  const plotW = Math.max(width - padL - padR, 0)
  const plotH = height - padT - padB

  const maxVal = Math.max(...data.map((d) => d.value), 0)
  const ticks = niceTicks(maxVal)
  const top = ticks[ticks.length - 1] || 1

  const n = Math.max(data.length - 1, 1)
  const x = (i: number) => padL + (plotW * i) / n
  const y = (v: number) => padT + plotH - (plotH * v) / top

  const step = labelEvery ?? Math.max(1, Math.ceil(data.length / 8))
  const shownLabels = labelIndices(data.length, step)
  const hovered = hover !== null ? data[hover] : null

  // The pointer only has to be nearest, not on the 2px line.
  function nearestIndex(clientX: number, rect: DOMRect) {
    const local = clientX - rect.left - padL
    if (plotW <= 0) return 0
    const i = Math.round((local / plotW) * n)
    return Math.min(Math.max(i, 0), data.length - 1)
  }

  if (data.length === 0) return <EmptyState height={height} message={emptyMessage} />

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ')
  const areaPath = `${linePath} L ${x(data.length - 1)} ${padT + plotH} L ${x(0)} ${padT + plotH} Z`
  const lastIdx = data.length - 1

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${valueHeading} by ${categoryHeading.toLowerCase()}`}
            style={{ display: 'block', touchAction: 'pan-y' }}
            onPointerMove={(e) => setHover(nearestIndex(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={c.grid} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={padL - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={c.textMuted}>
                  {formatTick(t)}
                </text>
              </g>
            ))}

            <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
            <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {data.map((d, i) => shownLabels.has(i) && (
              <text
                key={`lbl-${i}`}
                x={x(i)}
                y={height - 7}
                textAnchor={i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle'}
                fontSize={11}
                fill={c.textMuted}
              >
                {d.label}
              </text>
            ))}

            {hover !== null && hovered && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke={color} strokeWidth={1} opacity={0.35} shapeRendering="crispEdges" />
                <circle cx={x(hover)} cy={y(hovered.value)} r={5} fill={color} stroke={c.surface} strokeWidth={2} />
              </>
            )}

            {/* The end point is the one mark labelled directly — it is the
                figure a reader looks for, and labelling every point would be
                unreadable noise. */}
            {hover === null && (
              <circle cx={x(lastIdx)} cy={y(data[lastIdx]!.value)} r={4.5} fill={color} stroke={c.surface} strokeWidth={2} />
            )}

            {/* Keyboard equivalent of hovering, one stop per point. */}
            {data.map((d, i) => (
              <rect
                key={`hit-${i}`}
                x={x(i) - Math.max(plotW / n / 2, 12)}
                y={padT}
                width={Math.max(plotW / n, 24)}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${d.label}: ${valueFormatter(d.value)}`}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ outline: 'none' }}
              />
            ))}
          </svg>
        )}

        {hovered && hover !== null && width > 0 && (
          <Tooltip x={x(hover)} y={y(hovered.value)} color={color}>
            {renderTooltip ? renderTooltip(hovered) : (
              <>
                <strong style={{ fontSize: '0.8rem' }}>{valueFormatter(hovered.value)}</strong>
                <span style={{ opacity: 0.7, marginLeft: '6px' }}>{hovered.label}</span>
              </>
            )}
          </Tooltip>
        )}
      </div>

      <TableToggle open={showTable} onToggle={() => setShowTable((v) => !v)} />
      {showTable && (
        <TableView data={data} valueFormatter={valueFormatter} categoryHeading={categoryHeading} valueHeading={valueHeading} />
      )}
    </div>
  )
}

/* =========================================================
   ColumnChart — magnitude across an ordered category (hours of the day)
   ========================================================= */

interface ColumnChartProps {
  data: Point[]
  color?: VizColor
  height?: number
  valueFormatter?: (n: number) => string
  categoryHeading?: string
  valueHeading?: string
  emptyMessage?: string
}

export function ColumnChart({
  data,
  color = VIZ.blue,
  height = 220,
  valueFormatter = String,
  categoryHeading = 'Category',
  valueHeading = 'Value',
  emptyMessage = 'Nothing to show for this period.',
}: ColumnChartProps) {
  const c = useChartColors()
  const [wrapRef, width] = useElementWidth()
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const padL = 44, padR = 16, padT = 14, padB = 26
  const plotW = Math.max(width - padL - padR, 0)
  const plotH = height - padT - padB

  const maxVal = Math.max(...data.map((d) => d.value), 0)
  // Whole steps: this form plots counts, never fractions of one.
  const ticks = niceTicks(maxVal, 4, { integer: true })
  const top = ticks[ticks.length - 1] || 1

  const n = data.length
  const slot = n > 0 ? plotW / n : 0
  // Capped, and never allowed to fill its slot — the leftover band is the
  // 2px-plus surface gap that keeps neighbouring columns reading as separate.
  const barW = Math.max(Math.min(24, slot - 4), 2)
  const y = (v: number) => padT + plotH - (plotH * v) / top

  const shownLabels = labelIndices(n, Math.max(1, Math.ceil(n / 12)))
  const allZero = maxVal === 0

  if (n === 0 || allZero) return <EmptyState height={height} message={emptyMessage} />

  // Only the peak column is labelled directly; the axis carries the rest.
  const peakIdx = data.reduce((best, d, i) => (d.value > data[best]!.value ? i : best), 0)

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${valueHeading} by ${categoryHeading.toLowerCase()}`} style={{ display: 'block' }}>
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={c.grid} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={padL - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={c.textMuted}>
                  {formatTick(t)}
                </text>
              </g>
            ))}

            {data.map((d, i) => {
              const cx = padL + slot * i + slot / 2
              const barH = Math.max(plotH - (y(d.value) - padT), 0)
              const isHover = hover === i
              const r = Math.min(4, barW / 2, barH)
              // Rounded at the data end, square at the baseline.
              const path = barH <= 0
                ? ''
                : `M ${cx - barW / 2} ${padT + plotH}
                   L ${cx - barW / 2} ${y(d.value) + r}
                   Q ${cx - barW / 2} ${y(d.value)} ${cx - barW / 2 + r} ${y(d.value)}
                   L ${cx + barW / 2 - r} ${y(d.value)}
                   Q ${cx + barW / 2} ${y(d.value)} ${cx + barW / 2} ${y(d.value) + r}
                   L ${cx + barW / 2} ${padT + plotH} Z`

              return (
                <g key={i}>
                  {path && <path d={path} fill={color} opacity={isHover ? 1 : 0.88} />}

                  {i === peakIdx && barH > 14 && (
                    <text x={cx} y={y(d.value) - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill={c.textSecondary}>
                      {valueFormatter(d.value)}
                    </text>
                  )}

                  {shownLabels.has(i) && (
                    <text
                      x={cx}
                      y={height - 7}
                      textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                      fontSize={11}
                      fill={c.textMuted}
                    >
                      {d.label}
                    </text>
                  )}

                  {/* Hit target spans the whole band, not just the painted bar. */}
                  <rect
                    x={cx - slot / 2}
                    y={padT}
                    width={Math.max(slot, 24)}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${d.label}: ${valueFormatter(d.value)}`}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  />
                </g>
              )
            })}
          </svg>
        )}

        {hover !== null && data[hover] && width > 0 && (
          <Tooltip x={padL + slot * hover + slot / 2} y={y(data[hover]!.value)} color={color}>
            <strong style={{ fontSize: '0.8rem' }}>{valueFormatter(data[hover]!.value)}</strong>
            <span style={{ opacity: 0.7, marginLeft: '6px' }}>{data[hover]!.label}</span>
          </Tooltip>
        )}
      </div>

      <TableToggle open={showTable} onToggle={() => setShowTable((v) => !v)} />
      {showTable && (
        <TableView data={data} valueFormatter={valueFormatter} categoryHeading={categoryHeading} valueHeading={valueHeading} />
      )}
    </div>
  )
}

/* =========================================================
   HBarChart — magnitude across named categories

   Horizontal because the categories carry real names ("Court 1", "QR Ph
   (InstaPay)"). Rotated or truncated x-axis labels are the usual price of a
   column chart here, and there is no reason to pay it.
   ========================================================= */

interface HBarChartProps {
  data: Point[]
  color?: VizColor
  valueFormatter?: (n: number) => string
  /** Fixed scale top — e.g. 100 for a percentage, so bars stay comparable. */
  max?: number
  categoryHeading?: string
  valueHeading?: string
  emptyMessage?: string
}

export function HBarChart({
  data,
  color = VIZ.green,
  valueFormatter = String,
  max,
  categoryHeading = 'Category',
  valueHeading = 'Value',
  emptyMessage = 'Nothing to show for this period.',
}: HBarChartProps) {
  const c = useChartColors()
  const [wrapRef, width] = useElementWidth()
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const ROW_H = 40
  const BAR_H = 14
  const LABEL_W = 128
  const VALUE_W = 78

  const plotW = Math.max(width - LABEL_W - VALUE_W, 0)
  const top = max ?? niceMax(Math.max(...data.map((d) => d.value), 0))

  if (data.length === 0) return <EmptyState height={120} message={emptyMessage} />

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        {width > 0 && (
          <svg width={width} height={data.length * ROW_H} role="img" aria-label={`${valueHeading} by ${categoryHeading.toLowerCase()}`} style={{ display: 'block' }}>
            {data.map((d, i) => {
              const cy = i * ROW_H + ROW_H / 2
              const w = top > 0 ? Math.max((d.value / top) * plotW, 0) : 0
              const isHover = hover === i
              const r = Math.min(4, BAR_H / 2, w)
              // Track first, then the fill — a lighter wash of the same hue so
              // "how far along this is" reads across the whole row.
              const path = w <= 0
                ? ''
                : `M ${LABEL_W} ${cy - BAR_H / 2}
                   L ${LABEL_W + w - r} ${cy - BAR_H / 2}
                   Q ${LABEL_W + w} ${cy - BAR_H / 2} ${LABEL_W + w} ${cy - BAR_H / 2 + r}
                   L ${LABEL_W + w} ${cy + BAR_H / 2 - r}
                   Q ${LABEL_W + w} ${cy + BAR_H / 2} ${LABEL_W + w - r} ${cy + BAR_H / 2}
                   L ${LABEL_W} ${cy + BAR_H / 2} Z`

              return (
                <g key={`${d.label}-${i}`}>
                  <text x={0} y={cy} dominantBaseline="middle" fontSize={12} fill={c.textSecondary}>
                    {d.label.length > 17 ? d.label.slice(0, 16) + '…' : d.label}
                  </text>

                  <rect x={LABEL_W} y={cy - BAR_H / 2} width={plotW} height={BAR_H} rx={BAR_H / 2} fill={color} opacity={0.08} />
                  {path && <path d={path} fill={color} opacity={isHover ? 1 : 0.9} />}

                  <text
                    x={width}
                    y={cy}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill={c.textPrimary}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {valueFormatter(d.value)}
                  </text>

                  <rect
                    x={0}
                    y={i * ROW_H}
                    width={width}
                    height={ROW_H}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${d.label}: ${valueFormatter(d.value)}`}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  />
                </g>
              )
            })}
          </svg>
        )}
      </div>

      <TableToggle open={showTable} onToggle={() => setShowTable((v) => !v)} />
      {showTable && (
        <TableView data={data} valueFormatter={valueFormatter} categoryHeading={categoryHeading} valueHeading={valueHeading} />
      )}
    </div>
  )
}

/* =========================================================
   Sparkline — the trend line inside a stat tile.

   No axes, no tooltip: it is a shape, not a plot, and the tile's value is the
   number the reader is here for.
   ========================================================= */

export function Sparkline({ data, color = VIZ.green, width = 108, height = 30 }: {
  data: number[]
  color?: VizColor
  width?: number
  height?: number
}) {
  const c = useChartColors()
  if (data.length < 2) return null

  const max = Math.max(...data, 1)
  const n = data.length - 1
  const x = (i: number) => (width * i) / n
  const y = (v: number) => height - 2 - ((height - 4) * v) / max
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={color} opacity={0.09} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n)} cy={y(data[n]!)} r={2.5} fill={color} stroke={c.surface} strokeWidth={1.5} />
    </svg>
  )
}
