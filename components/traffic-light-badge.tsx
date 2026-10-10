import { STATUS_META, type ComponentStatus } from "@/lib/domain/traffic-light";

// Colour is never the only signal: each state also has a symbol and a word.
const STYLES: Record<ComponentStatus | "NONE", string> = {
  GREEN: "bg-green-100 text-green-900 border-green-400",
  YELLOW: "bg-amber-100 text-amber-900 border-amber-400",
  RED: "bg-red-100 text-red-900 border-red-400",
  NONE: "bg-slate-100 text-slate-800 border-slate-400",
};

const SYMBOL: Record<ComponentStatus | "NONE", string> = {
  GREEN: "✓",
  YELLOW: "▲",
  RED: "✕",
  NONE: "…",
};

export function TrafficLightBadge({ status }: { status: ComponentStatus | null }) {
  const key = status ?? "NONE";
  const label = status ? `${status} (${STATUS_META[status].label})` : "NOT COUNTED";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-bold ${STYLES[key]}`}
    >
      <span aria-hidden="true">{SYMBOL[key]}</span>
      {label}
    </span>
  );
}
