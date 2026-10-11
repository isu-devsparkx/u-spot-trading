import {
  formatTime,
  formatDate,
  formatUsd,
  getChangeColor,
  getResultBadgeClass,
  formatResultLabel,
} from '@/lib/utils';
import type { SignalHistoryRecord } from '@/types';

import { RefreshCw } from 'lucide-react';

interface RecentSignalsProps {
  records: SignalHistoryRecord[];
  isLoading?: boolean;
}

export default function RecentSignals({ records, isLoading = false }: RecentSignalsProps) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-fade-in-delay-3">
      <div className="px-5 py-4 border-b border-[var(--glass-border)]">
        <h2 className="text-sm font-semibold text-slate-200">
          Recent Signals
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Latest completed signal execution records & trade plans
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" id="recent-signals-table">
          <thead>
            <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-[var(--glass-border)]">
              <th className="text-left px-5 py-3 font-medium">Time</th>
              <th className="text-left px-3 py-3 font-medium">Coin</th>
              <th className="text-left px-3 py-3 font-medium">Dir</th>
              <th className="text-right px-3 py-3 font-medium">Score</th>
              <th className="text-right px-3 py-3 font-medium">Entry</th>
              <th className="text-right px-3 py-3 font-medium hidden sm:table-cell">
                Size
              </th>
              <th className="text-left px-3 py-3 font-medium">Result</th>
              <th className="text-right px-3 py-3 font-medium">R</th>
              <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">
                Reason
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <RefreshCw size={20} className="animate-spin text-cyan-400" />
                    <span className="text-xs font-medium">Loading recent trade records...</span>
                  </div>
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                  No recent completed trades. Live signals will appear here after entry execution.
                </td>
              </tr>
            ) : records.map((r) => (
                <tr
                  key={r.signalId}
                  className="border-b border-[var(--glass-border)] hover:bg-[var(--surface-2)]/50 transition-colors cursor-pointer"
                >
                <td className="px-5 py-3.5 text-slate-500 font-mono text-xs whitespace-nowrap">
                  <div>{formatTime(r.createdAt)}</div>
                  <div className="text-[10px]">{formatDate(r.createdAt)}</div>
                </td>
                <td className="px-3 py-3.5 font-semibold text-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span>{r.symbol.split('/')[0]}</span>
                    {r.isAiGenerated && (
                      <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1 py-0.2 rounded border border-purple-500/30">
                        AI
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <span
                    className={`
                      inline-flex px-2 py-0.5 rounded text-[10px] font-bold
                      ${
                        r.direction === 'BUY'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-rose-500/15 text-rose-400'
                      }
                    `}
                  >
                    {r.direction}
                  </span>
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-slate-300">
                  {r.tradeScore}
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-slate-300">
                  {r.actualEntry !== null
                    ? `$${r.actualEntry}`
                    : '—'}
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-slate-300 hidden sm:table-cell">
                  {formatUsd(r.initialAllocation)}
                </td>
                <td className="px-3 py-3.5">
                  <span
                    className={`
                      inline-flex px-2 py-0.5 rounded text-[10px] font-bold border
                      ${getResultBadgeClass(r.finalResult)}
                    `}
                  >
                    {formatResultLabel(r.finalResult)}
                  </span>
                </td>
                <td
                  className={`px-3 py-3.5 text-right font-mono font-semibold ${getChangeColor(
                    r.realizedR ?? 0
                  )}`}
                >
                  {r.realizedR !== null && r.realizedR !== 0
                    ? `${r.realizedR > 0 ? '+' : ''}${r.realizedR.toFixed(1)}R`
                    : '0R'}
                </td>
                <td className="px-3 py-3.5 text-xs text-slate-500 max-w-[240px] truncate hidden lg:table-cell">
                  {r.evaluationText
                    ? r.evaluationText.split('.')[0] + '.'
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
