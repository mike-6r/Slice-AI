import { useRef, useState, type ReactNode } from "react";

export function Section({
  index,
  title,
  subtitle,
  open,
  onToggle,
  complete,
  error,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  complete?: boolean;
  error?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      className={`border ${error ? "border-coral/60" : open ? "border-accent/50" : "border-border"} bg-surface/30`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface/60"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center font-mono text-[11px] ${
            error
              ? "bg-coral/20 text-coral"
              : complete
                ? "bg-accent text-background"
                : "border border-border-strong text-muted"
          }`}
        >
          {error ? "!" : complete ? "✓" : index}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display text-base font-semibold">{title}</span>
          {subtitle && <span className="block text-[11px] text-muted truncate">{subtitle}</span>}
        </span>
        <span
          className={`font-mono text-xs text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div ref={ref} className="border-t border-border px-5 py-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  error,
  children,
  className = "",
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="font-mono text-[10px] tracking-widest text-muted uppercase">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <div className="mt-1 font-mono text-[10px] text-coral">{error}</div>}
    </div>
  );
}

export const inputCls =
  "w-full border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent";

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between border px-3 py-2.5 text-sm ${
        value
          ? "border-accent bg-accent-dim text-foreground"
          : "border-border bg-background text-subtle"
      }`}
    >
      <span>{label}</span>
      <span
        className={`ml-3 flex h-4 w-8 items-center px-0.5 transition-colors ${
          value ? "bg-accent" : "bg-border-strong"
        }`}
      >
        <span
          className={`h-3 w-3 bg-background transition-transform duration-200 ${value ? "translate-x-4" : ""}`}
        />
      </span>
    </button>
  );
}

export function useSavedIndicator() {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  return { savedAt, setSavedAt };
}
