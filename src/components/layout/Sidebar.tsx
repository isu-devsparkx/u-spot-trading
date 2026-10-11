'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Radar,
  History,
  BarChart3,
  FlaskConical,
  Settings,
  TrendingUp,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { config } from '@/config';

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Signals', href: '/signals', icon: Radar },
  { label: 'History', href: '/history', icon: History },
  { label: 'Performance', href: '/performance', icon: BarChart3 },
  { label: 'Strategy Lab', href: '/strategy-lab', icon: FlaskConical },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden glass-card p-2 cursor-pointer"
        aria-label="Toggle navigation"
        id="nav-toggle"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen w-64 flex flex-col
          bg-[var(--surface-1)] border-r border-[var(--glass-border)]
          transition-transform duration-300
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-[var(--glass-border)]">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
            <TrendingUp size={18} className="text-[var(--surface-0)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text tracking-tight">
              {config.app.name}
            </h1>
            <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">
              Spot Signal Research
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  nav-link flex items-center gap-3 px-4 py-3 rounded-xl
                  text-sm font-medium transition-colors
                  ${
                    isActive
                      ? 'active text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }
                `}
                id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--glass-border)]">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono">v{config.app.version}</span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-semibold">
              Spot Live
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
