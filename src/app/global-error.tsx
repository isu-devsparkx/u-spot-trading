'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console in dev — replace with a proper logging service later
    console.error('[U-SPOT Error]', error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0e17] text-slate-200 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={28} className="text-rose-400" />
          </div>
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-slate-500 mb-6">
            {error.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={reset}
            className="btn-primary inline-flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
          {error.digest && (
            <p className="text-[10px] text-slate-600 mt-4 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
