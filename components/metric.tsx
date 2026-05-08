import { cn } from "@/lib/utils";

export function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-2xl font-semibold tracking-normal">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
