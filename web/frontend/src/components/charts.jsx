import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export const colours = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  gray: "#898781",
  lightGray: "#c3c2b7",
  paleBlue: "#cde2fb",
  ink: "#111318",
  inkSoft: "#4a4e57",
  grid: "#e6e7ea",
  good: "#0ca30c",
  warn: "#fab219",
  bad: "#d03b3b",
}

const axisTick = { fontSize: 11, fill: colours.inkSoft }

function round(value, digits) {
  const factor = Math.pow(10, digits)
  return Math.round(value * factor) / factor
}

function SimpleTooltip({ active, payload, render }) {
  if (!active || !payload || payload.length === 0) {
    return null
  }
  return <div className="tooltip">{render(payload[0].payload)}</div>
}

export function ScoreWaterfall({ scores }) {
  const steps = [
    ["Rubric", scores.rubric_before_penalty, "start", "Rubric points confirmed by the evidence check"],
    ["Penalty", scores.rubric - scores.rubric_before_penalty, "change", "Half a point off for each wrong statement"],
    ["+ LLM", scores.llm_rubric_average - scores.rubric, "change", "Average with the LLM's own score"],
    ["Calibration", scores.llm_calibrated - scores.llm_rubric_average, "change", "Mapped to the teachers' marking scale"],
    ["+ Similarity", scores.final - scores.llm_calibrated, "change", "Average with the similarity model (" + scores.similarity_model + ")"],
    ["Final", scores.final, "total", "Final mark out of 5, before scaling and rounding"],
  ]
  let running = 0
  const rows = []
  for (const step of steps) {
    const value = step[1]
    if (step[2] === "change") {
      let sign = "+"
      let colour = colours.blue
      if (value < 0) {
        sign = "−"
        colour = colours.bad
      }
      rows.push({ name: step[0], base: Math.min(running, running + value), amount: Math.abs(value), colour: colour, label: sign + round(Math.abs(value), 2), help: step[3] })
      running = running + value
    } else {
      let colour = colours.blue
      if (step[2] === "start") {
        colour = colours.gray
      }
      rows.push({ name: step[0], base: 0, amount: value, colour: colour, label: String(round(value, 2)), help: step[3] })
      running = value
    }
  }
  return (
    <div>
      <div className="chart-title">How this mark was calculated (out of 5)</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 22, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={colours.grid} vertical={false} />
          <XAxis dataKey="name" tick={axisTick} interval={0} tickLine={false} />
          <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "rgba(42,120,214,0.06)" }} content={<SimpleTooltip render={(row) => <span><strong>{row.label}</strong> — {row.help}</span>} />} />
          <Bar dataKey="base" stackId="steps" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="amount" stackId="steps" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {rows.map((row) => <Cell key={row.name} fill={row.colour} />)}
            <LabelList dataKey="label" position="top" style={{ fontSize: 11, fill: colours.ink }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ConfidenceCurve({ reliability, confidence, height }) {
  const points = []
  for (const row of reliability) {
    points.push({ x: row["Average confidence"], y: row["Really within ±1 (%)"] / 100, group: row["Confidence"], share: row["Share of answers (%)"] })
  }
  const diagonal = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
  return (
    <ResponsiveContainer width="100%" height={height || 240}>
      <ComposedChart margin={{ top: 12, right: 14, left: -14, bottom: 4 }}>
        <CartesianGrid stroke={colours.grid} />
        <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} label={{ value: "Confidence given", position: "insideBottom", offset: -2, fontSize: 11, fill: colours.inkSoft }} height={34} />
        <YAxis type="number" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tick={axisTick} tickFormatter={(value) => Math.round(value * 100) + "%"} />
        <Tooltip content={<SimpleTooltip render={(row) => row.group ? <span>Confidence {row.group}: <strong>{Math.round(row.y * 1000) / 10}%</strong> really within ±1 mark ({row.share}% of answers)</span> : <span>Perfectly honest confidence</span>} />} />
        <Line data={diagonal} dataKey="y" stroke={colours.gray} strokeDasharray="4 4" dot={false} isAnimationActive={false} name="Perfectly honest" />
        <Line data={points} dataKey="y" stroke={colours.blue} strokeWidth={2} dot={{ r: 4, fill: colours.blue }} isAnimationActive={false} name="Evaluation results" />
        {confidence !== undefined && confidence !== null && <ReferenceLine x={confidence} stroke={colours.orange} strokeWidth={2} label={{ value: "this answer: " + Math.round(confidence * 100) + "%", position: "insideBottomRight", fontSize: 11, fill: colours.orange }} />}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function Corridor({ points, height }) {
  const band = []
  for (let step = 0; step <= 50; step = step + 1) {
    const x = step / 10
    const low = Math.max(0, x - 1)
    const high = Math.min(5, x + 1)
    band.push({ x: x, low: low, width: high - low })
  }
  const diagonal = [{ x: 0, y: 0 }, { x: 5, y: 5 }]
  return (
    <ResponsiveContainer width="100%" height={height || 300}>
      <ComposedChart data={band} margin={{ top: 10, right: 12, left: -12, bottom: 6 }}>
        <CartesianGrid stroke={colours.grid} />
        <XAxis type="number" dataKey="x" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={axisTick} label={{ value: "Teacher's mark (out of 5)", position: "insideBottom", offset: -4, fontSize: 11, fill: colours.inkSoft }} height={36} />
        <YAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={axisTick} />
        <Tooltip content={<SimpleTooltip render={(row) => row.label ? <span>{row.label}<br />teacher {round(row.x, 2)} | grader {round(row.y, 2)}</span> : null} />} />
        <Area dataKey="low" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
        <Area dataKey="width" stackId="band" stroke="none" fill={colours.paleBlue} fillOpacity={0.8} isAnimationActive={false} name="±1 mark band" />
        <Line data={diagonal} dataKey="y" stroke={colours.gray} dot={false} isAnimationActive={false} />
        <Scatter data={points} dataKey="y" fill={colours.blue} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function HorizontalCounts({ rows, height, valueLabel }) {
  return (
    <ResponsiveContainer width="100%" height={height || 40 + rows.length * 38}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, left: 10, bottom: 4 }}>
        <CartesianGrid stroke={colours.grid} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={axisTick} />
        <YAxis type="category" dataKey="name" width={170} tick={axisTick} />
        <Tooltip cursor={{ fill: "rgba(42,120,214,0.06)" }} content={<SimpleTooltip render={(row) => <span>{row.name}: <strong>{row.value}</strong> {valueLabel || ""}</span>} />} />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={22} isAnimationActive={false}>
          {rows.map((row) => <Cell key={row.name} fill={row.colour || colours.blue} />)}
          <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: colours.ink }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ConceptStack({ rows, height, percent }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height || 50 + rows.length * 34}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 4 }}>
          <CartesianGrid stroke={colours.grid} horizontal={false} />
          <XAxis type="number" tick={axisTick} domain={percent ? [0, 100] : [0, "auto"]} tickFormatter={(value) => percent ? value + "%" : value} />
          <YAxis type="category" dataKey="name" width={150} tick={axisTick} />
          <Tooltip cursor={{ fill: "rgba(42,120,214,0.06)" }} content={<SimpleTooltip render={(row) => <span><strong>{row.name}</strong><br />present {round(row.present, 1)} · partial {round(row.partial, 1)} · missing {round(row.missing, 1)}</span>} />} />
          <Bar dataKey="present" stackId="status" fill={colours.good} stroke="#ffffff" strokeWidth={1.5} barSize={20} isAnimationActive={false} />
          <Bar dataKey="partial" stackId="status" fill={colours.warn} stroke="#ffffff" strokeWidth={1.5} barSize={20} isAnimationActive={false} />
          <Bar dataKey="missing" stackId="status" fill={colours.bad} stroke="#ffffff" strokeWidth={1.5} barSize={20} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i style={{ background: colours.good }} />✓ present</span>
        <span><i style={{ background: colours.warn }} />~ partial</span>
        <span><i style={{ background: colours.bad }} />✗ missing</span>
      </div>
    </div>
  )
}

export function Benchmark({ rows, metric, title }) {
  const data = []
  for (const row of rows) {
    let colour = colours.lightGray
    if (row.method.startsWith("B5 v2")) {
      colour = colours.blue
    }
    data.push({ name: row.method, value: round(row[metric], 3), error: round(row[metric + "_sd"], 3), colour: colour })
  }
  return (
    <div>
      <div className="chart-title">{title}</div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 10, bottom: 4 }}>
          <CartesianGrid stroke={colours.grid} horizontal={false} />
          <XAxis type="number" tick={axisTick} domain={[0, "auto"]} />
          <YAxis type="category" dataKey="name" width={200} tick={axisTick} />
          <Tooltip cursor={{ fill: "rgba(42,120,214,0.06)" }} content={<SimpleTooltip render={(row) => <span>{row.name}: <strong>{row.value}</strong> ± {row.error} (SD over 5 folds)</span>} />} />
          <Bar dataKey="value" barSize={18} radius={[0, 3, 3, 0]} isAnimationActive={false}>
            {data.map((row) => <Cell key={row.name} fill={row.colour} />)}
            <ErrorBar dataKey="error" width={4} stroke={colours.inkSoft} direction="x" />
            <LabelList dataKey="value" position="right" offset={22} style={{ fontSize: 11, fill: colours.ink }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function QualityBars({ rows, bands }) {
  const palette = [colours.lightGray, colours.aqua, colours.orange, colours.blue]
  const data = []
  for (const band of bands) {
    const entry = { band: band }
    for (const row of rows) {
      entry[row.method] = round(row[band], 2)
    }
    data.push(entry)
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 16, right: 10, left: -14, bottom: 4 }}>
        <CartesianGrid stroke={colours.grid} vertical={false} />
        <XAxis dataKey="band" tick={axisTick} tickLine={false} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: "rgba(42,120,214,0.06)" }} />
        <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
        {rows.map((row, position) => (
          <Bar key={row.method} dataKey={row.method} fill={palette[position % palette.length]} radius={[3, 3, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey={row.method} position="top" style={{ fontSize: 10, fill: colours.inkSoft }} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CalibrationLines({ isotonic, week5 }) {
  const data = []
  for (let step = 0; step <= 100; step = step + 1) {
    const x = step / 20
    let isotonicValue = isotonic.output_points[0]
    for (let index = 0; index < isotonic.input_points.length - 1; index = index + 1) {
      const x0 = isotonic.input_points[index]
      const x1 = isotonic.input_points[index + 1]
      if (x >= x0 && x <= x1) {
        const y0 = isotonic.output_points[index]
        const y1 = isotonic.output_points[index + 1]
        isotonicValue = y0 + (y1 - y0) * ((x - x0) / Math.max(x1 - x0, 1e-9))
      }
    }
    if (x > isotonic.input_points[isotonic.input_points.length - 1]) {
      isotonicValue = isotonic.output_points[isotonic.output_points.length - 1]
    }
    const straight = Math.min(5, Math.max(0, week5.intercept + (week5.llm_weight + week5.rubric_weight) * x))
    data.push({ x: x, isotonic: round(isotonicValue, 2), straight: round(straight, 2), same: x })
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 14, left: -14, bottom: 6 }}>
        <CartesianGrid stroke={colours.grid} />
        <XAxis type="number" dataKey="x" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={axisTick} label={{ value: "Raw LLM score (LLM and rubric average)", position: "insideBottom", offset: -4, fontSize: 11, fill: colours.inkSoft }} height={36} />
        <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={axisTick} />
        <Tooltip />
        <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="same" name="No change" stroke={colours.gray} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        <Line dataKey="straight" name="Week 5: straight line" stroke={colours.orange} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="isotonic" name="Week 6: isotonic steps" stroke={colours.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function OcrNoiseChart({ rows }) {
  const plain = []
  const aware = []
  for (const row of rows) {
    const point = { x: Number(row["measured CER"]), y: Number(row["MAE vs teachers"]), name: row.condition }
    if (row.condition.indexOf("aware") >= 0) {
      aware.push(point)
    } else {
      plain.push(point)
    }
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart margin={{ top: 14, right: 16, left: -10, bottom: 6 }}>
          <CartesianGrid stroke={colours.grid} />
          <XAxis type="number" dataKey="x" domain={[0, 0.4]} ticks={[0, 0.1, 0.2, 0.3, 0.4]} tick={axisTick} label={{ value: "OCR character error rate", position: "insideBottom", offset: -4, fontSize: 11, fill: colours.inkSoft }} height={36} />
          <YAxis type="number" domain={[0, "auto"]} tick={axisTick} />
          <Tooltip content={<SimpleTooltip render={(row) => <span>{row.name}: MAE <strong>{row.y}</strong></span>} />} />
          <Line data={plain} dataKey="y" stroke={colours.blue} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false}>
            <LabelList dataKey="y" position="top" style={{ fontSize: 11, fill: colours.ink }} />
          </Line>
          <Line data={aware} dataKey="y" stroke={colours.orange} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i style={{ background: colours.blue }} />normal prompt</span>
        <span><i style={{ background: colours.orange }} />OCR-aware prompt</span>
      </div>
    </div>
  )
}
