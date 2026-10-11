import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  delay?: number;
  isLoading?: boolean;
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  delay = 0,
  isLoading = false,
}: StatCardProps) {
  const trendColor =
    trend === 'up'
      ? 'text-emerald-400'
      : trend === 'down'
      ? 'text-rose-400'
      : 'text-slate-400';

  return (
    <div
      className={`glass-card p-5 rounded-2xl animate-fade-in${
        delay > 0 ? `-delay-${delay}` : ''
      }`}
      style={delay > 0 ? { animationDelay: `${delay * 0.1}s` } : undefined}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          {title}
        </p>
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-[var(--surface-3)] flex items-center justify-center text-cyan-400">
            {icon}
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2 py-1">
          <div className="h-7 w-24 bg-slate-700/40 rounded-lg animate-pulse" />
          <div className="h-3 w-16 bg-slate-800/60 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <p className={`text-2xl font-bold font-mono tracking-tight ${trendColor}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1.5">{subtitle}</p>
          )}
        </>
      )}
    </div>
  );
}
