import { useState } from 'react'
import { FONT_BODY } from '../../lib/theme'

const GRID = '#EEF0ED'
const AXIS_TEXT = '#9CA3AF'

function niceMax(max: number): number {
  if (max <= 0) return 10
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  const norm = max / magnitude
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * magnitude
}

function niceTicks(max: number, count = 4): number[] {
  const top = niceMax(max)
  const step = top / count
  return Array.from({ length: count + 1 }, (_, i) => step * i)
}

// Formats an axis tick without collapsing small decimal ranges (e.g. occupancy %) to 0/1.
function formatTick(v: number): string {
  if (v === 0) return '0'
  if (Math.abs(v) < 10) return (Math.round(v * 100) / 100).toLocaleString()
  return Math.round(v).toLocaleString()
}

// Which category indices get an x-axis label — evenly spaced, and only appends
// the final index when it lands a full step away (otherwise it collides with
// the previous label on dense charts, e.g. 24 hourly bars).
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

type Point = { label: string; value: number }

interface LineChartProps<T extends Point> {
  data: T[]
  color: string
  height?: number
  valueFormatter?: (n: number) => string
  labelEvery?: number
  renderTooltip?: (d: T) => React.ReactNode
}

export function LineChart<T extends Point>({ data, color, height = 220, valueFormatter = String, labelEvery, renderTooltip }: LineChartProps<T>) {
  const [hover, setHover] = useState<number | null>(null)
  const padL = 44, padR = 12, padT = 16, padB = 28
  const width = 760
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const maxVal = Math.max(...data.map((d) => d.value), 0)
  const ticks = niceTicks(maxVal)
  const top = ticks[ticks.length - 1] || 1

  const n = Math.max(data.length - 1, 1)
  const x = (i: number) => padL + (plotW * i) / n
  const y = (v: number) => padT + plotH - (plotH * v) / top

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ')
  const areaPath = `${linePath} L ${x(data.length - 1)} ${padT + plotH} L ${x(0)} ${padT + plotH} Z`

  const step = labelEvery ?? Math.max(1, Math.ceil(data.length / 8))
  const shownLabels = labelIndices(data.length, step)
  const hovered = hover !== null ? data[hover] : null

  return (
    <div style={{ position: 'relative', fontFamily: FONT_BODY }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={AXIS_TEXT}>{formatTick(t)}</text>
          </g>
        ))}

        <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => shownLabels.has(i) && (
          <text
            key={`lbl-${i}`} x={x(i)} y={height - 8}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            fontSize={10} fill={AXIS_TEXT}
          >{d.label}</text>
        ))}

        {data.map((d, i) => (
          <g key={i}>
            {i === data.length - 1 && (
              <circle cx={x(i)} cy={y(d.value)} r={5} fill={color} stroke="white" strokeWidth={2} />
            )}
            {hover === i && (
              <>
                <line x1={x(i)} x2={x(i)} y1={padT} y2={padT + plotH} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
                <circle cx={x(i)} cy={y(d.value)} r={5} fill={color} stroke="white" strokeWidth={2} />
              </>
            )}
            <circle
              cx={x(i)} cy={y(d.value)} r={12} fill="transparent"
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              style={{ cursor: 'pointer', outline: 'none' }}
            />
          </g>
        ))}
      </svg>

      {hovered && hover !== null && (
        <div
          style={{
            position: 'absolute', pointerEvents: 'none', transform: 'translate(-50%, -100%)',
            left: `${(x(hover) / width) * 100}%`, top: `${(y(hovered.value) / height) * 100 - 4}%`,
            backgroundColor: '#111827', color: 'white', borderRadius: '8px', padding: '6px 10px',
            fontSize: '0.72rem', lineHeight: 1.5, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', zIndex: 10,
          }}
        >
          {renderTooltip ? renderTooltip(hovered) : (
            <>
              <strong>{valueFormatter(hovered.value)}</strong>
              <span style={{ opacity: 0.7, marginLeft: '6px' }}>{hovered.label}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface BarChartProps {
  data: Point[]
  color: string
  height?: number
  valueFormatter?: (n: number) => string
}

export function BarChart({ data, color, height = 220, valueFormatter = String }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const padL = 44, padR = 12, padT = 16, padB = 28
  const width = 760
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const maxVal = Math.max(...data.map((d) => d.value), 0)
  const ticks = niceTicks(maxVal)
  const top = ticks[ticks.length - 1] || 1

  const n = data.length
  const slot = plotW / n
  const barW = Math.min(24, slot * 0.6)
  const gap = 2
  const y = (v: number) => padT + plotH - (plotH * v) / top

  const step = Math.max(1, Math.ceil(n / 12))
  const shownLabels = labelIndices(n, step)

  return (
    <div style={{ position: 'relative', fontFamily: FONT_BODY }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={AXIS_TEXT}>{formatTick(t)}</text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2
          const barH = plotH - (y(d.value) - padT)
          const isHover = hover === i
          return (
            <g key={i}>
              <rect
                x={cx - barW / 2 + gap / 2} y={y(d.value)} width={Math.max(barW - gap, 1)} height={Math.max(barH, 0)}
                rx={4} fill={color} opacity={isHover ? 1 : 0.85}
              />
              <rect
                x={cx - slot / 2} y={padT} width={slot} height={plotH} fill="transparent"
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ cursor: 'pointer', outline: 'none' }}
              />
              {shownLabels.has(i) && (
                <text
                  x={cx} y={height - 8}
                  textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                  fontSize={10} fill={AXIS_TEXT}
                >{d.label}</text>
              )}
            </g>
          )
        })}
      </svg>

      {hover !== null && (
        <div
          style={{
            position: 'absolute', pointerEvents: 'none', transform: 'translate(-50%, -100%)',
            left: `${((padL + slot * hover + slot / 2) / width) * 100}%`,
            top: `${(y(data[hover].value) / height) * 100 - 4}%`,
            backgroundColor: '#111827', color: 'white', borderRadius: '8px', padding: '5px 9px',
            fontSize: '0.72rem', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.18)', zIndex: 10,
          }}
        >
          <strong>{valueFormatter(data[hover].value)}</strong>
          <span style={{ opacity: 0.7, marginLeft: '6px' }}>{data[hover].label}</span>
        </div>
      )}
    </div>
  )
}
