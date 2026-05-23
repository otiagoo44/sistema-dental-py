import { CalendarClock, ClipboardList, Gauge, LogOut, Settings, Stethoscope, Users, Zap } from 'lucide-react';
import { NAV_ITEMS } from '../lib/constants';

const icons = {
  dashboard: Gauge,
  today: Zap,
  leads: Users,
  agenda: CalendarClock,
  tasks: ClipboardList,
  settings: Settings,
};

export default function AppLayout({ activeView, setActiveView, clinic, profile, onLogout, children }) {
  return (
    <div className="min-h-screen bg-ink text-cream">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-white/10 bg-panel/95 p-5 lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-mint text-ink">
            <Stethoscope className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-cream/55">Clinica</p>
            <h2 className="truncate font-semibold text-cream">{clinic?.name || 'CRM Dental'}</h2>
          </div>
        </div>

        <nav className="space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = icons[item.id];
            const selected = activeView === item.id;

            return (
              <button
                key={item.id}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${
                  selected ? 'bg-mint text-ink' : 'text-cream/70 hover:bg-white/5 hover:text-cream'
                }`}
                type="button"
                onClick={() => setActiveView(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="absolute inset-x-5 bottom-5 rounded-lg border border-white/10 bg-ink/60 p-4">
          <p className="truncate text-sm font-semibold">{profile?.full_name}</p>
          <p className="truncate text-xs text-cream/50">{profile?.email}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gold">{profile?.role}</p>
          <button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-cream/80 hover:bg-white/5"
            type="button"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-ink/90 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-mint">{clinic?.name || 'CRM Dental'}</p>
              <h1 className="text-xl font-semibold text-cream">{NAV_ITEMS.find((item) => item.id === activeView)?.label}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:hidden">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${activeView === item.id ? 'bg-mint text-ink' : 'bg-panel text-cream/70'}`}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                >
                  {item.label}
                </button>
              ))}
              <button className="rounded-lg border border-white/10 px-3 py-2 text-xs text-cream/70" type="button" onClick={onLogout}>
                Logout
              </button>
            </div>

            <div className="hidden text-right lg:block">
              <p className="text-sm font-semibold">{profile?.full_name}</p>
              <p className="text-xs text-cream/50">{profile?.email}</p>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
