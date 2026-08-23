import { useId, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { SupportedCurrency } from "@/data/repositories";

type SparklineProps = {
  data: number[];
  height?: number;
  color?: string;
  /** Sparklines repeat a value already stated in text, so they are decorative by default. */
  label?: string;
};

const toPoints = (data: number[], width: number, height: number, pad = 0) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const inner = height - pad * 2;
  return data.map((value, index) => {
    const x = data.length === 1 ? width : (index / (data.length - 1)) * width;
    const y = pad + inner - ((value - min) / range) * inner;
    return [x, y] as const;
  });
};

const toSmoothPath = (points: ReadonlyArray<readonly [number, number]>) => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;

  return points.slice(1).reduce(
    (path, [x, y], index) => {
      const [previousX, previousY] = points[index];
      const controlX = (previousX + x) / 2;
      return `${path} C ${controlX.toFixed(2)} ${previousY.toFixed(2)}, ${controlX.toFixed(2)} ${y.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)}`;
    },
    `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`,
  );
};

const toLinearPath = (points: ReadonlyArray<readonly [number, number]>) =>
  points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

export function Sparkline({
  data,
  height = 32,
  color = "var(--color-mint)",
  label,
}: SparklineProps) {
  const width = 120;
  if (data.length === 0) return null;
  const points = toPoints(data, width, height, 1);
  const path = toSmoothPath(points);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full"
      preserveAspectRatio="none"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

type PriceChartProps = {
  data: readonly (number | PriceChartPoint)[];
  height?: number;
  /**
   * Accessible description. Optional so existing callers keep compiling, but pass a
   * specific one wherever the chart carries meaning of its own.
   */
  label?: string;
  showAxis?: boolean;
  className?: string;
  currency?: SupportedCurrency;
};

export type PriceChartPoint = {
  value: number;
  timestamp?: string;
  source?: string;
  previousChange?: number | null;
  previousChangeBps?: number | null;
  rangeChange?: number | null;
  rangeChangeBps?: number | null;
  refreshedAt?: string | null;
};

function isPriceChartPoint(value: number | PriceChartPoint): value is PriceChartPoint {
  return typeof value === "object";
}

function formatMoney(value: number, currency: SupportedCurrency) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTooltipDate(value?: string) {
  if (!value) return "Observation";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBps(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const percent = value / 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}

function formatAxisLabel(value: number, currency: SupportedCurrency) {
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "CAD" ? "CA$" : "$";
  return `${symbol}${Math.round(value).toLocaleString("en-GB")}`;
}

export function PriceChart({
  data,
  height = 200,
  label = "Price history",
  showAxis = true,
  className,
  currency = "GBP",
}: PriceChartProps) {
  // Gradients are referenced by id, so each instance needs its own or charts bleed into each other.
  const gradientId = useId();
  const width = 900;

  if (data.length < 2) return null;

  const pointsData = data.map((item) =>
    isPriceChartPoint(item) ? item : { value: item },
  );
  const values = pointsData.map((item) => item.value);

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin || rawMax || 1) * 0.12, 1);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const points = values.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return [x, y] as const;
  });

  const line = toLinearPath(points);
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  const [lastX, lastY] = points[points.length - 1]!;
  const rising = values[values.length - 1]! >= values[0]!;
  const colour = rising ? "var(--color-positive)" : "var(--color-negative)";

  const ticks = [max, min + range * 0.75, min + range * 0.5, min + range * 0.25, min];
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activePoint = activeIndex === null ? null : pointsData[activeIndex];
  const activeCoordinates = activeIndex === null ? null : points[activeIndex];
  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = Math.max(0, Math.min(width, ((event.clientX - rect.left) / rect.width) * width));
    setActiveIndex(Math.round((x / width) * (points.length - 1)));
  };

  return (
    <figure
      className={`price-chart relative m-0 h-full w-full ${className ?? ""}`}
      onPointerLeave={() => setActiveIndex(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        focusable="false"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
            <stop offset="100%" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.4, 0.6, 0.8].map((step) => (
          <line
            key={step}
            x1="0"
            x2={width}
            y1={height * step}
            y2={height * step}
            stroke="rgba(255,255,255,0.045)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path className="price-chart__area" d={area} fill={`url(#${gradientId})`} />
        <path
          className="price-chart__line"
          d={line}
          fill="none"
          stroke={colour}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map(([x, y], index) => (
          <circle
            key={`${x}-${y}`}
            className="price-chart__observation"
            cx={x}
            cy={y}
            r={activeIndex === index ? 5 : points.length <= 24 ? 3 : 2}
            fill={colour}
            opacity={activeIndex === index || points.length <= 24 ? 0.86 : 0.28}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {activeCoordinates ? (
          <line
            className="price-chart__crosshair"
            x1={activeCoordinates[0]}
            x2={activeCoordinates[0]}
            y1="0"
            y2={height}
            stroke="rgba(221, 238, 234, 0.4)"
            strokeDasharray="3 4"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <circle
          className="price-chart__dot"
          cx={activeCoordinates?.[0] ?? lastX}
          cy={activeCoordinates?.[1] ?? lastY}
          r="4"
          fill={activeCoordinates ? "#eaf8f3" : colour}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {showAxis && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-between py-1 tabular text-[10px] text-muted"
        >
          {ticks.map((tick, index) => (
            <span key={index} className="leading-none">
              {formatAxisLabel(tick, currency)}
            </span>
          ))}
        </div>
      )}
      {activePoint && activeCoordinates ? (
        <div
          className="price-chart__tooltip"
          style={{
            left: `${(activeCoordinates[0] / width) * 100}%`,
            top: `${Math.max(5, Math.min(66, (activeCoordinates[1] / height) * 100 - 8))}%`,
          }}
          role="status"
          aria-live="polite"
        >
          <strong>{formatMoney(activePoint.value, currency)}</strong>
          <span>{formatTooltipDate(activePoint.timestamp)}</span>
          {activePoint.previousChange !== undefined ? (
            <span>
              Previous observation: {activePoint.previousChange === null ? "Not available" : `${activePoint.previousChange >= 0 ? "+" : ""}${formatMoney(activePoint.previousChange, currency)}${formatBps(activePoint.previousChangeBps) ? ` (${formatBps(activePoint.previousChangeBps)})` : ""}`}
            </span>
          ) : null}
          {activePoint.rangeChange !== undefined ? (
            <span>
              Range start: {activePoint.rangeChange === null ? "Not available" : `${activePoint.rangeChange >= 0 ? "+" : ""}${formatMoney(activePoint.rangeChange, currency)}${formatBps(activePoint.rangeChangeBps) ? ` (${formatBps(activePoint.rangeChangeBps)})` : ""}`}
            </span>
          ) : null}
          {activePoint.source ? <span>{activePoint.source} reference</span> : null}
          {activePoint.refreshedAt ? <span>Refreshed {formatTooltipDate(activePoint.refreshedAt)}</span> : null}
        </div>
      ) : null}
    </figure>
  );
}
