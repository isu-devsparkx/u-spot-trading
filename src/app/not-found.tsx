import Link from 'next/link';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-slate-500/15 flex items-center justify-center mx-auto mb-6">
          <Search size={28} className="text-slate-400" />
        </div>
        <h1 className="text-4xl font-bold gradient-text mb-2">404</h1>
        <p className="text-sm text-slate-500 mb-6">
          This page doesn&#39;t exist yet. It may be part of a future phase.
        </p>
        <Link
          href="/"
          className="btn-primary inline-flex items-center gap-2"
        >
          <Home size={14} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
