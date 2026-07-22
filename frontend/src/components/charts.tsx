'use client';

/**
 * Gráficos leves em SVG puro (sem dependência externa), no visual da marca.
 * Todos recebem valores já agregados e cuidam só do desenho/escala.
 */

const COLORS = {
  red: '#D9251D',
  gold: '#F2B705',
  goldDark: '#D99E00',
  cream: '#FBF3DA',
  creamDark: '#F3E6BE',
  ink: '#292423',
  green: '#1F7A3F',
};

/** Linha de tendência com pontos. Aceita 1 ou 2 séries (ex.: atual × anterior). */
export function LineChart({
  points,
  compare,
  height = 160,
  formatY,
}: {
  points: { label: string; value: number }[];
  compare?: { value: number }[];
  height?: number;
  formatY?: (v: number) => string;
}) {
  const width = 640;
  const padX = 8;
  const padY = 16;
  if (points.length === 0) {
    return <p className="text-sm text-brand-ink/40">Sem dados no período.</p>;
  }

  const all = [...points.map((p) => p.value), ...(compare ?? []).map((c) => c.value)];
  const max = Math.max(1, ...all);
  const stepX =
    points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const y = (v: number) =>
    height - padY - (v / max) * (height - padY * 2);
  const x = (i: number) => padX + i * stepX;

  const path = (series: { value: number }[]) =>
    series
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
      .join(' ');

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[420px] w-full" role="img">
        {/* eixo base */}
        <line
          x1={padX}
          y1={height - padY}
          x2={width - padX}
          y2={height - padY}
          stroke={COLORS.creamDark}
          strokeWidth={1}
        />
        {compare && compare.length === points.length && (
          <path
            d={path(compare)}
            fill="none"
            stroke={COLORS.goldDark}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            opacity={0.7}
          />
        )}
        <path d={path(points)} fill="none" stroke={COLORS.red} strokeWidth={2.5} />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.value)} r={3} fill={COLORS.red} />
          </g>
        ))}
        {/* rótulo do máximo */}
        <text x={padX} y={12} fontSize={11} fill={COLORS.ink} opacity={0.5}>
          {formatY ? formatY(max) : max}
        </text>
      </svg>
      <div className="flex justify-between px-2 text-[10px] text-brand-ink/40">
        <span>{points[0].label}</span>
        {points.length > 1 && <span>{points[points.length - 1].label}</span>}
      </div>
    </div>
  );
}

/** Barras horizontais simples com rótulo e valor. */
export function BarChart({
  bars,
  formatValue,
  colorFor,
}: {
  bars: { label: string; value: number; hint?: string }[];
  formatValue?: (v: number) => string;
  colorFor?: (bar: { label: string; value: number }) => string;
}) {
  if (bars.length === 0) {
    return <p className="text-sm text-brand-ink/40">Sem dados no período.</p>;
  }
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="space-y-1">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2 text-sm">
          <span className="w-40 shrink-0 truncate" title={b.label}>
            {b.label}
          </span>
          <div className="h-4 flex-1 rounded bg-brand-cream-dark/50">
            <div
              className="h-4 rounded"
              style={{
                width: `${(b.value / max) * 100}%`,
                backgroundColor: colorFor ? colorFor(b) : COLORS.gold,
              }}
            />
          </div>
          <span className="w-24 shrink-0 text-right tabular-nums text-brand-ink/70">
            {formatValue ? formatValue(b.value) : b.value}
            {b.hint ? ` ${b.hint}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Heatmap dia-da-semana × hora. `cells` traz a intensidade por (weekday, hour);
 * a cor vai do creme (baixo) ao vermelho (pico).
 */
export function Heatmap({
  cells,
  hourFrom = 8,
  hourTo = 23,
}: {
  cells: { weekday: number; hour: number; value: number }[];
  hourFrom?: number;
  hourTo?: number;
}) {
  const max = Math.max(1, ...cells.map((c) => c.value));
  const lookup = new Map(cells.map((c) => [`${c.weekday}-${c.hour}`, c.value]));
  const hours: number[] = [];
  for (let h = hourFrom; h <= hourTo; h++) hours.push(h);

  const color = (v: number) => {
    if (v <= 0) return COLORS.cream;
    const t = v / max; // 0..1
    // interpola creme → vermelho
    const from = [251, 243, 218];
    const to = [217, 37, 29];
    const mix = from.map((f, i) => Math.round(f + (to[i] - f) * t));
    return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="text-[10px]">
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} className="px-0.5 font-normal text-brand-ink/40">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((wd, wi) => (
            <tr key={wd}>
              <td className="pr-1 text-brand-ink/60">{wd}</td>
              {hours.map((h) => {
                const v = lookup.get(`${wi}-${h}`) ?? 0;
                return (
                  <td key={h} className="p-0.5">
                    <div
                      className="h-4 w-4 rounded-sm"
                      style={{ backgroundColor: color(v) }}
                      title={`${wd} ${h}h — ${v} pedido(s)`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
