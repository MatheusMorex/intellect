import React from 'react';

export function MetricBadge({
  label,
  value,
  trend,
  trendUp
}: {
  label: string,
  value: string,
  trend: string,
  trendUp: boolean
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-secondary/50 border border-border rounded-full text-[10px] font-bold">
      <span className="text-muted-foreground uppercase">{label}:</span>
      <span className="text-foreground">{value}</span>
      <span className={`ml-1 ${trendUp ? 'text-green-500' : 'text-red-500'}`}>
        {trendUp ? '↑' : '↓'} {trend}
      </span>
    </div>
  );
}
