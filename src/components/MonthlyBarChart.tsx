import { useState } from 'react'

interface MonthlyBarChartProps {
  data: { label: string; value: number }[]
  color: string
  formatValue: (n: number) => string
  /** Compact label drawn above each bar — falls back to formatValue when omitted. */
  formatValueShort?: (n: number) => string
}

const WIDTH = 700
const HEIGHT = 220
const PADDING = { top: 22, right: 4, bottom: 22, left: 4 }

function MonthlyBarChart({ data, color, formatValue, formatValueShort = formatValue }: MonthlyBarChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const max = Math.max(1, ...data.map((d) => d.value))
  const chartWidth = WIDTH - PADDING.left - PADDING.right
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom
  const barGap = 6
  const barWidth = (chartWidth - barGap * (data.length - 1)) / data.length
  const hovered = hoverIndex !== null ? data[hoverIndex] : null

  return (
    <div>
      <p className="text-xs font-semibold text-sage-dark h-5 mb-1">
        {hovered ? `${hovered.label} — ${formatValue(hovered.value)}` : ' '}
      </p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Graphique mensuel">
        <line
          x1={PADDING.left}
          y1={HEIGHT - PADDING.bottom}
          x2={WIDTH - PADDING.right}
          y2={HEIGHT - PADDING.bottom}
          stroke="#DCE7E1"
          strokeWidth={1}
        />
        {data.map((d, i) => {
          const barHeight = max > 0 ? (d.value / max) * chartHeight : 0
          const x = PADDING.left + i * (barWidth + barGap)
          const y = HEIGHT - PADDING.bottom - barHeight
          const isHover = hoverIndex === i
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
              tabIndex={0}
              className="cursor-pointer outline-none"
            >
              <title>
                {d.label} — {formatValue(d.value)}
              </title>
              <rect
                x={x}
                y={Math.min(y, HEIGHT - PADDING.bottom - 1)}
                width={barWidth}
                height={Math.max(barHeight, 1)}
                rx={3}
                fill={color}
                opacity={isHover ? 1 : 0.82}
              />
              <text
                x={x + barWidth / 2}
                y={Math.max(y - 5, PADDING.top - 8)}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={600}
                fill="#3A5A50"
              >
                {formatValueShort(d.value)}
              </text>
              <text
                x={x + barWidth / 2}
                y={HEIGHT - PADDING.bottom + 14}
                textAnchor="middle"
                fontSize={10}
                fill="#6B8074"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default MonthlyBarChart
