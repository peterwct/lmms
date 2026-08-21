import { Link } from 'react-router-dom';
import { UserPlus, CalendarRange, ChevronRight } from 'lucide-react';

interface RciMenuItem {
  num: number;
  label: string;
  to: string;
  icon: React.ReactNode;
  enabled?: boolean;
}

// RCI = Resort Condominiums International — the exchange network our members are
// enrolled into. Menu numbering is display-only; the routes are what everything else
// keys off (same convention as ResortsSetup.tsx).
const RCI_ITEMS: RciMenuItem[] = [
  { num: 1, label: 'RCI Enrolment', to: '/rci/enrolment', icon: <UserPlus className="h-4 w-4" />, enabled: true },
  { num: 2, label: 'RCI Weekly Interval', to: '/rci/weekly-interval', icon: <CalendarRange className="h-4 w-4" />, enabled: true },
];

function MenuSection({ title, items }: { title: string; items: RciMenuItem[] }) {
  return (
    <div>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
      <div className="space-y-0.5">
        {items.map(item => item.enabled ? (
          <Link
            key={item.num}
            to={item.to}
            className="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border border-transparent hover:border-blue-200"
          >
            <span className="w-6 shrink-0 text-xs text-gray-400 font-mono text-right">
              {item.num}.
            </span>
            <span className="shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors">
              {item.icon}
            </span>
            <span className="flex-1 font-medium leading-snug">{item.label}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-blue-400 transition-colors" />
          </Link>
        ) : (
          <div
            key={item.num}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-400 cursor-default"
          >
            <span className="w-6 shrink-0 text-xs font-mono text-right">
              {item.num}.
            </span>
            <span className="shrink-0">
              {item.icon}
            </span>
            <span className="flex-1 font-medium leading-snug">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Rci() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">RCI</h1>
        <p className="mt-1 text-sm text-gray-500">Resort Condominiums International. Select a function.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <MenuSection title="Functions" items={RCI_ITEMS} />
      </div>
    </div>
  );
}
