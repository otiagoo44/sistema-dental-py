import { BarChart3, CalendarDays, CheckSquare2, Gauge, LogOut, Settings, Sparkles, Stethoscope, Users } from 'lucide-react';
import { NAV_ITEMS } from '../lib/constants';

const icons = {
  dashboard: Gauge,
  leads: Users,
  followups: Sparkles,
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
        compact ? 'min-h-11 px-3 py-2 text-xs' : 'w-full px-3 py-3 text-sm'
      } ${selected ? 'bg-blue-50 text-mint' : 'text-slate-600 hover:bg-slate-50 hover:text-cream'}`}
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={selected ? 'page' : undefined}
    >
      <Icon className={`h-4 w-4 ${selected ? 'text-mint' : 'text-slate-400 group-hover:text-slate-600'}`} />
      <span>{item.label}</span>
      {Number(count) > 0 ? (
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${selected ? 'bg-mint text-white' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
      ) : null}
    </button>
  );
}

export default function AppLayout({ activeView, setActiveView, clinic, profile, isAdmin = false, navCounts = {}, onLogout, children }) {
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const activeItem = NAV_ITEMS.find((item) => item.id === activeView) || (activeView === 'lead-detail' ? NAV_ITEMS.find((item) => item.id === 'leads') : null);
  const initials = String(profile?.full_name || profile?.email || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen bg-ink text-cream">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <div className="mb-8 flex items-center gap-3 px-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint text-white shadow-sm">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-mint">Anti-pérdida</p>
            <h2 className="truncate text-sm font-bold text-cream">{clinic?.name || 'CRM Dental'}</h2>
          </div>
        </div>

        <nav className="space-y-1" aria-label="Navegación principal">
          {visibleNavItems.map((item) => (
            <NavButton key={item.id} item={item} activeView={activeView} count={navCounts[item.id]} onSelect={setActiveView} />
          ))}
        </nav>

        <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-mint shadow-sm">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cream">{profile?.full_name || 'Usuario'}</p>
              <p className="truncate text-xs text-slate-500">{profile?.email}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{isAdmin ? 'Owner / admin' : 'Recepción'}</span>
            <button className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-danger" type="button" onClick={onLogout} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-8 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-mint">{clinic?.name || 'CRM Dental'}</p>
              <h1 className="truncate text-lg font-bold text-cream">{activeItem?.label || 'CRM Dental'}</h1>
            </div>
            <button className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500" type="button" onClick={onLogout} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <nav className="scrollbar-soft -mx-1 mt-3 flex gap-1 overflow-x-auto pb-1" aria-label="Navegación principal móvil">
            {visibleNavItems.map((item) => (
              <NavButton key={item.id} compact item={item} activeView={activeView} count={navCounts[item.id]} onSelect={setActiveView} />
            ))}
          </nav>
        </header>

        <main key={activeView} className="page-enter mx-auto w-full max-w-[1600px] p-4 pb-12 md:p-8">{children}</main>
      </div>
    </div>
  );
}
