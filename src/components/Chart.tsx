import { useId } from "react";

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

const axisLabel = (value: number) =>
  value >= 1000 ? `£${Math.round(value / 1000)}K` : `£${Math.round(value)}`;

type PriceChartProps = {
  data: number[];
  height?: number;
  /**
   * Accessible description. Optional so existing callers keep compiling, but pass a
   * specific one wherever the chart carries meaning of its own.
   */
  label?: string;
  showAxis?: boolean;
  className?: string;
};

export function PriceChart({
  data,
  height = 200,
  label = "Price history",
  showAxis = true,
  className,
}: PriceChartProps) {
  // Gradients are referenced by id, so each instance needs its own or charts bleed into each other.
  const gradientId = useId();
  const width = 900;

  if (data.length < 2) return null;

  const rawMin = Math.min(...data);
  const rawMax = Math.max(...data);
  const pad = (rawMax - rawMin || rawMax || 1) * 0.12;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return [x, y] as const;
  });

  const line = toSmoothPath(points);
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  const [lastX, lastY] = points[points.length - 1];
  const rising = data[data.length - 1] >= data[0];
  const colour = rising ? "var(--color-positive)" : "var(--color-negative)";

  const ticks = [max, min + range * 0.66, min + range * 0.33, min];

  return (
    <figure className={`price-chart relative m-0 h-full w-full ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        focusable="false"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity="0.28" />
            <stop offset="100%" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((step) => (
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
        <circle
          className="price-chart__dot"
          cx={lastX}
          cy={lastY}
          r="4"
          fill={colour}
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
              {axisLabel(tick)}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
