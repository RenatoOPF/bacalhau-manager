'use client';

import { localIsoDate } from '@/lib/date';

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

/**
 * Linha de tendência com área preenchida por gradiente.
 * Aceita 1 ou 2 séries (ex.: atual × anterior).
 */
export function AreaChart({
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
  const stepX = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const baseline = height - padY;
  const y = (v: number) => height - padY - (v / max) * (height - padY * 2);
  const x = (i: number) => padX + i * stepX;

  const linePath = (series: { value: number }[]) =>
    series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');

  const areaPath = (series: { value: number }[]) => {
    const last = series.length - 1;
    return `${linePath(series)} L ${x(last).toFixed(1)} ${baseline} L ${x(0).toFixed(1)} ${baseline} Z`;
  };

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[420px] w-full" role="img">
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.red} stopOpacity="0.22" />
            <stop offset="100%" stopColor={COLORS.red} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="area-fill-prev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.goldDark} stopOpacity="0.18" />
            <stop offset="100%" stopColor={COLORS.goldDark} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={baseline} x2={width - padX} y2={baseline} stroke={COLORS.creamDark} strokeWidth={1} />
        {compare && compare.length === points.length && (
          <>
            <path d={areaPath(compare)} fill="url(#area-fill-prev)" />
            <path d={linePath(compare)} fill="none" stroke={COLORS.goldDark} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.7} />
          </>
        )}
        <path d={areaPath(points)} fill="url(#area-fill)" />
        <path d={linePath(points)} fill="none" stroke={COLORS.red} strokeWidth={2.5} />
        {points.map((p, i) => (
          <circle key={p.label} cx={x(i)} cy={y(p.value)} r={2.5} fill={COLORS.red} />
        ))}
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

/** Donut chart para distribuição proporcional entre categorias. */
export function DonutChart({
  segments,
  formatValue,
  size = 180,
}: {
  segments: { label: string; value: number; color: string }[];
  formatValue?: (v: number) => string;
  size?: number;
}) {
  const active = segments.filter((s) => s.value > 0);
  const total = active.reduce((s, seg) => s + seg.value, 0);
  if (total === 0)
    return <p className="text-sm text-brand-ink/40">Sem dados no período.</p>;

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.24;
  const GAP = active.length > 1 ? 0.025 : 0;

  let angle = -Math.PI / 2;
  const arcs = active.map((seg) => {
    const sweep = (seg.value / total) * 2 * Math.PI;
    const start = angle + GAP / 2;
    const end = angle + sweep - GAP / 2;
    angle += sweep;
    return { ...seg, start, end, pct: (seg.value / total) * 100 };
  });

  function pt(a: number, rad: number): string {
    return `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
  }

  function arcPath(start: number, end: number): string {
    const large = end - start > Math.PI ? 1 : 0;
    return `M${pt(start, outerR)} A${outerR} ${outerR} 0 ${large} 1 ${pt(end, outerR)} L${pt(end, innerR)} A${innerR} ${innerR} 0 ${large} 0 ${pt(start, innerR)} Z`;
  }

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: size, height: size, flexShrink: 0 }}
        role="img"
        aria-label="Gráfico de distribuição"
      >
        {arcs.length === 1 ? (
          <>
            <circle cx={cx} cy={cy} r={outerR} fill={arcs[0].color} />
            <circle cx={cx} cy={cy} r={innerR} fill="white" />
          </>
        ) : (
          arcs.map((arc) => (
            <path key={arc.label} d={arcPath(arc.start, arc.end)} fill={arc.color}>
              <title>
                {arc.label}: {arc.pct.toFixed(1)}%
                {formatValue ? ` — ${formatValue(arc.value)}` : ''}
              </title>
            </path>
          ))
        )}
      </svg>
      <div className="flex-1 space-y-2 text-sm" style={{ minWidth: 160 }}>
        {arcs.map((arc) => (
          <div key={arc.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: arc.color }}
            />
            <span className="flex-1 truncate text-brand-ink/70">{arc.label}</span>
            <span className="font-semibold tabular-nums">{arc.pct.toFixed(1)}%</span>
            {formatValue && (
              <span className="text-xs tabular-nums text-brand-ink/50">
                {formatValue(arc.value)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Barras verticais (colunas). Suporta série dupla para comparação lado a lado
 * — útil para cashflow (entradas vs saídas) ou comparação ano a ano.
 */
export function ColumnChart({
  bars,
  series2,
  formatY,
  color = COLORS.red,
  color2 = COLORS.green,
  height = 160,
}: {
  bars: { label: string; value: number }[];
  series2?: { value: number }[];
  formatY?: (v: number) => string;
  color?: string;
  color2?: string;
  height?: number;
}) {
  if (bars.length === 0)
    return <p className="text-sm text-brand-ink/40">Sem dados no período.</p>;

  const hasS2 = !!series2 && series2.length === bars.length;
  const all = [...bars.map((b) => b.value), ...(hasS2 ? series2!.map((s) => s.value) : [])];
  const max = Math.max(1, ...all);

  const SVG_W = 640;
  const PAD_X = 8;
  const PAD_TOP = 20;
  const PAD_BOT = 28;
  const SVG_H = height + PAD_TOP + PAD_BOT;
  const n = bars.length;
  const groupW = (SVG_W - PAD_X * 2) / n;
  const colW = Math.min(groupW * (hasS2 ? 0.42 : 0.65), 32);
  const groupPad = (groupW - (hasS2 ? colW * 2 + 2 : colW)) / 2;

  const bH = (v: number) => (v / max) * height;
  const bY = (v: number) => PAD_TOP + height - bH(v);
  const gX = (i: number) => PAD_X + i * groupW;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="min-w-[320px] w-full" role="img">
        <text x={PAD_X} y={PAD_TOP - 4} fontSize={10} fill={COLORS.ink} opacity={0.5}>
          {formatY ? formatY(max) : max}
        </text>
        <line
          x1={PAD_X}
          y1={PAD_TOP + height}
          x2={SVG_W - PAD_X}
          y2={PAD_TOP + height}
          stroke={COLORS.creamDark}
          strokeWidth={1}
        />
        {bars.map((b, i) => (
          <g key={i}>
            {hasS2 && (
              <rect
                x={gX(i) + groupPad}
                y={bY(series2![i].value)}
                width={colW}
                height={bH(series2![i].value)}
                fill={color2}
                opacity={0.8}
                rx={2}
              >
                <title>{formatY ? formatY(series2![i].value) : series2![i].value}</title>
              </rect>
            )}
            <rect
              x={gX(i) + groupPad + (hasS2 ? colW + 2 : 0)}
              y={bY(b.value)}
              width={colW}
              height={bH(b.value)}
              fill={color}
              opacity={0.85}
              rx={2}
            >
              <title>
                {b.label}: {formatY ? formatY(b.value) : b.value}
              </title>
            </rect>
            <text
              x={gX(i) + groupW / 2}
              y={PAD_TOP + height + 14}
              fontSize={9}
              textAnchor="middle"
              fill={COLORS.ink}
              opacity={0.5}
            >
              {b.label.length > 6 ? `${b.label.slice(0, 5)}…` : b.label}
            </text>
          </g>
        ))}
      </svg>
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

export function RevenueDayGrid({
  byDay,
  from,
  to,
  prevByDay,
  formatValue = (v) =>
    `R$ ${(v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
}: {
  byDay: { date: string; count: number; totalCents: number }[];
  from: string;
  to: string;
  prevByDay?: { date: string; totalCents: number }[];
  formatValue?: (v: number) => string;
}) {
  if (byDay.length === 0)
    return <p className="py-6 text-center text-sm text-brand-ink/40">Sem dados no período.</p>;

  const allDates: string[] = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (cur <= end) {
    allDates.push(localIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const totalDays = allDates.length;

  const dataMap = new Map(byDay.map((d) => [d.date, d]));
  const maxCents = Math.max(1, ...byDay.map((d) => d.totalCents));

  const cellBg = (cents: number) => {
    if (cents === 0) return '#F9F3E7';
    const t = Math.pow(cents / maxCents, 0.55);
    const r = Math.round(249 + (217 - 249) * t);
    const g = Math.round(243 + (37 - 243) * t);
    const b = Math.round(231 + (29 - 231) * t);
    return `rgb(${r},${g},${b})`;
  };

  const fgColor = (cents: number) => (cents / maxCents > 0.5 ? '#fff' : '#292423');

  /* ── WEEK VIEW (1–8 days) ─────────────────────────────── */
  if (totalDays <= 8) {
    const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return (
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${totalDays}, minmax(0, 1fr))` }}
      >
        {allDates.map((d, i) => {
          const entry = dataMap.get(d);
          const cents = entry?.totalCents ?? 0;
          const count = entry?.count ?? 0;
          const prevCents = prevByDay?.[i]?.totalCents;
          const bg = cellBg(cents);
          const fg = fgColor(cents);
          const dt = new Date(d + 'T12:00:00');
          const pct =
            prevCents != null && prevCents > 0
              ? ((cents - prevCents) / prevCents) * 100
              : null;
          return (
            <div
              key={d}
              className="flex flex-col items-center rounded-xl px-2 py-3 text-center"
              style={{ backgroundColor: bg }}
            >
              <span
                className="text-[11px] font-semibold uppercase"
                style={{ color: fg, opacity: 0.6 }}
              >
                {WD[dt.getDay()]}
              </span>
              <span className="mb-1 text-[10px]" style={{ color: fg, opacity: 0.45 }}>
                {String(dt.getDate()).padStart(2, '0')}/
                {String(dt.getMonth() + 1).padStart(2, '0')}
              </span>
              <span className="text-sm font-bold" style={{ color: fg }}>
                {formatValue(cents)}
              </span>
              {count > 0 && (
                <span className="mt-0.5 text-[10px]" style={{ color: fg, opacity: 0.6 }}>
                  {count} ped.
                </span>
              )}
              {pct !== null && (
                <span
                  className={`mt-1 text-[10px] font-semibold ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}
                >
                  {pct >= 0 ? '↑' : '↓'}
                  {Math.abs(pct).toFixed(0)}% ant.
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  /* ── MONTH VIEW (9–32 days) ───────────────────────────── */
  if (totalDays <= 32) {
    const WD_HEADER = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const firstDt = new Date(allDates[0] + 'T12:00:00');
    const startOffset = (firstDt.getDay() + 6) % 7;
    const cells: (string | null)[] = Array(startOffset).fill(null);
    allDates.forEach((d) => cells.push(d));

    return (
      <div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center">
          {WD_HEADER.map((h) => (
            <span key={h} className="text-[10px] font-medium text-brand-ink/40">
              {h}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} style={{ aspectRatio: '1' }} />;
            const entry = dataMap.get(d);
            const cents = entry?.totalCents ?? 0;
            const count = entry?.count ?? 0;
            const bg = cellBg(cents);
            const fg = fgColor(cents);
            const day = new Date(d + 'T12:00:00').getDate();
            return (
              <div
                key={d}
                className="flex flex-col items-center justify-center rounded-lg p-1 text-center"
                style={{ backgroundColor: bg, minHeight: 52 }}
                title={`${d}: ${formatValue(cents)} · ${count} pedidos`}
              >
                <span
                  className="text-[11px] font-semibold leading-tight"
                  style={{ color: fg, opacity: 0.6 }}
                >
                  {day}
                </span>
                <span
                  className="text-[9px] font-medium leading-tight"
                  style={{ color: fg, opacity: cents > 0 ? 0.9 : 0.25 }}
                >
                  {cents > 0 ? formatValue(cents) : '—'}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-brand-ink/40">
          <span>Menor</span>
          <div className="flex gap-0.5">
            {[0.08, 0.25, 0.45, 0.65, 0.85].map((t) => (
              <div
                key={t}
                className="h-3 w-6 rounded-sm"
                style={{ backgroundColor: cellBg(maxCents * t) }}
              />
            ))}
          </div>
          <span>Maior</span>
        </div>
      </div>
    );
  }

  /* ── LONG VIEW (>32 days): semanas agrupadas ──────────── */
  const weeks: { label: string; totalCents: number }[] = [];
  for (let i = 0; i < allDates.length; i += 7) {
    const slice = allDates.slice(i, i + 7);
    const totalCents = slice.reduce((s, d) => s + (dataMap.get(d)?.totalCents ?? 0), 0);
    const startDt = new Date(slice[0] + 'T12:00:00');
    const label = `${String(startDt.getDate()).padStart(2, '0')}/${String(startDt.getMonth() + 1).padStart(2, '0')}`;
    weeks.push({ label, totalCents });
  }

  const maxW = Math.max(1, ...weeks.map((w) => w.totalCents));
  const COUNT = weeks.length;
  const BAR_H = 150;
  const VAL_H = 18;
  const LBL_H = 20;
  const SVG_H = VAL_H + BAR_H + LBL_H;
  const barW = Math.max(14, Math.min(40, Math.floor(560 / COUNT)));
  const gap = 3;
  const SVG_W = COUNT * (barW + gap) - gap;

  const fmtShort = (v: number) => {
    const brl = v / 100;
    if (brl >= 1000) return `${(brl / 1000).toFixed(1)}k`;
    return `${Math.round(brl)}`;
  };

  return (
    <div className="overflow-x-auto">
      <svg
        width="100%"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ minWidth: Math.max(300, SVG_W) }}
      >
        {weeks.map((w, i) => {
          const h = Math.max(2, Math.round((w.totalCents / maxW) * BAR_H));
          const x = i * (barW + gap);
          const barY = VAL_H + BAR_H - h;
          return (
            <g key={i}>
              <rect x={x} y={barY} width={barW} height={h} rx={2} fill="#D9251D" opacity={0.85} />
              {w.totalCents > 0 && (
                <text
                  x={x + barW / 2}
                  y={barY - 3}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#292423"
                  opacity={0.55}
                >
                  {fmtShort(w.totalCents)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={VAL_H + BAR_H + 14}
                textAnchor="middle"
                fontSize={7}
                fill="#292423"
                opacity={0.4}
              >
                {w.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
