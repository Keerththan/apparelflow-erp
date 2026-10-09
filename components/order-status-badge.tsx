import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";

// Dark text on light tints: all pairs meet WCAG AA (>= 4.5:1).
const STYLES: Record<OrderStatus, string> = {
  CUTTING_IN_PROGRESS: "bg-slate-200 text-slate-900 border-slate-400",
  PENDING_VERIFICATION: "bg-blue-100 text-blue-900 border-blue-300",
  REJECTED: "bg-red-100 text-red-900 border-red-300",
  VERIFIED: "bg-green-100 text-green-900 border-green-300",
  SEWING_IN_PROGRESS: "bg-violet-100 text-violet-900 border-violet-300",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs font-bold ${STYLES[status]}`}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
