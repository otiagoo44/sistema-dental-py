import { BarChart3, CalendarDays, CheckSquare2, Gauge, ListTodo, LogOut, Settings, Users } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { NAV_ITEMS } from '../lib/constants';

const icons = {
  dashboard: Gauge,
  leads: Users,
  pending: ListTodo,
  followups: ListTodo,
  agenda: CalendarDays,
  tasks: CheckSquare2,
  metrics: BarChart3,
  settings: Settings,
};

function NavButton({ item, activeView, count, onSelect, compact = false }) {
  const Icon = icons[item.id];
  const selected = activeView === item.id || (activeView === 'lead-detail' && item.id === 'leads');

  return (
    <button
      className={`group flex shrink-0 items-center gap-3 rounded-xl text-left font-semibold transition duration-200 ${
        compact ? 'min-h-11 snap-start px-3 py-2 text-sm' : 'min-h-11 w-full px-3 py-3 text-[15px] leading-5'
      } ${selected ? 'border border-mint/45 bg-mint/10 text-cream shadow-[inset_3px_0_0_#C8A96A]' : item.id === 'metrics' ? 'border border-mint/15 bg-mint/[0.04] text-textMuted hover:border-mint/30 hover:bg-elevated hover:text-cream' : 'border border-transparent text-textMuted hover:bg-elevated hover:text-cream'}`}
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={selected ? 'page' : undefined}
    >
      <Icon className={`h-4 w-4 ${selected || item.id === 'metrics' ? 'text-mint' : 'text-textFaint group-hover:text-cream'}`} />
      <span>{item.label}</span>
      {Number(count) > 0 ? (
        <span className="ml-auto rounded-full bg-mint px-2 py-0.5 text-xs text-inverse">{count}</span>
      ) : null}
    </button>
  );
}

export default function AppLayout({ activeView, setActiveView, clinic, profile, isAdmin = false, navCounts = {}, onLogout, children }) {
  const reduceMotion = useReducedMotion();
  const roleLabel = (item) => ({ ...item, label: isAdmin && item.adminLabel ? item.adminLabel : item.label });
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.hiddenFromMain && (!item.adminOnly || isAdmin)).map(roleLabel);
  const activeItemRaw = NAV_ITEMS.find((item) => item.id === activeView) || (activeView === 'lead-detail' ? NAV_ITEMS.find((item) => item.id === 'leads') : null);
  const activeItem = activeItemRaw ? roleLabel(activeItemRaw) : null;
  const initials = String(profile?.full_name || profile?.email || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className="app-shell premium-grid">
      <aside className="sidebar ui-dark-surface fixed inset-y-0 left-0 z-20 hidden h-screen w-72 flex-col overflow-hidden px-5 py-5 backdrop-blur-xl lg:flex">
        <div className="mb-6 shrink-0 border-l-2 border-mint pl-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-mint">Dental CRM</p>
          <h2 className="mt-1 truncate text-xl font-bold tracking-[-0.025em] text-cream">Sistema Dental</h2>
          <p className="mt-1 truncate text-sm font-medium text-textMuted">Clínica · {clinic?.name || 'Anti-pérdida de pacientes'}</p>
        </div>

        <nav className="scrollbar-soft -mr-2 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-2" aria-label="Navegación principal">
          {visibleNavItems.map((item) => (
            <NavButton key={item.id} item={item} activeView={activeView} count={navCounts[item.id]} onSelect={setActiveView} />
          ))}
        </nav>

        <div className="mt-4 shrink-0 rounded-2xl border border-slate-200 bg-soft p-4 text-cream shadow-glow">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-mint/25 bg-mint/10 text-xs font-bold text-mint">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cream">{profile?.full_name || 'Usuario'}</p>
              <p className="truncate text-sm text-textMuted">{profile?.email}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-textSoft">{isAdmin ? 'Owner / admin' : 'Recepción'}</span>
            <button className="rounded-lg p-2 text-textMuted transition hover:bg-elevated hover:text-danger" type="button" onClick={onLogout} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-soft/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl md:px-8 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-mint">Dental CRM · {clinic?.name || 'Sistema Dental'}</p>
              <h1 className="truncate text-lg font-bold text-cream">{activeItem?.label || 'CRM Dental'}</h1>
            </div>
            <button className="rounded-xl border border-slate-200 bg-card p-2.5 text-textMuted transition hover:border-mint/30 hover:bg-elevated hover:text-cream" type="button" onClick={onLogout} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <nav className="mobile-nav-scroll -mx-1 mt-3 flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain pb-1" aria-label="Navegación principal móvil">
            {visibleNavItems.map((item) => (
              <NavButton key={item.id} compact item={item} activeView={activeView} count={navCounts[item.id]} onSelect={setActiveView} />
            ))}
          </nav>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={activeView}
            className="safe-bottom mx-auto w-full max-w-[1600px] p-4 pb-12 md:p-8"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -3 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
