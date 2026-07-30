import { Link } from 'react-router-dom';
import {
  Package, Hotel, BedDouble, DoorOpen, CalendarRange, Wrench, CalendarDays, GraduationCap, Sun, Coins,
  ArrowLeftRight, CircleDollarSign, ChevronRight,
} from 'lucide-react';

interface ResortsMenuItem {
  num: number;
  label: string;
  to: string;
  icon: React.ReactNode;
  enabled?: boolean;
}

// Menu numbering is display-only — the routes below are stable and are what everything
// else keys off. Functions 11 and 12 were swapped on 2026-07-30 so the two CP points
// charts (home / non-home) sit next to each other at 10-11.
const SETUP_ITEMS: ResortsMenuItem[] = [
  { num: 1, label: 'Products Code Maintenance and Setup',    to: '/resorts/products',     icon: <Package className="h-4 w-4" />, enabled: true },
  { num: 2, label: 'Resorts Master Maintenance and Setup',   to: '/resorts/setup',        icon: <Hotel className="h-4 w-4" />, enabled: true },
  { num: 3, label: 'Apartment Sleep Types Maintenance and Setup', to: '/resorts/apartment-types', icon: <BedDouble className="h-4 w-4" />, enabled: true },
  { num: 4, label: "Apartment's Unit No. Maintenance and Setup",  to: '/resorts/units',   icon: <DoorOpen className="h-4 w-4" />, enabled: true },
  { num: 5, label: 'Units Availability Maintenance and Setup by Dates', to: '/resorts/availability', icon: <CalendarRange className="h-4 w-4" />, enabled: true },
  { num: 6, label: 'Resorts Unit Under Maintenance',         to: '/resorts/maintenance',  icon: <Wrench className="h-4 w-4" />, enabled: true },
  { num: 7, label: 'Public Holidays Maintenance and Setup',  to: '/resorts/holidays',     icon: <CalendarDays className="h-4 w-4" />, enabled: true },
  { num: 8, label: 'School Holidays Maintenance and Setup',  to: '/resorts/school-holidays', icon: <GraduationCap className="h-4 w-4" />, enabled: true },
  { num: 9, label: "CP's Seasons Maintenance and Setup",     to: '/resorts/seasons',      icon: <Sun className="h-4 w-4" />, enabled: true },
  // Home = a coCode '02' resort (CP-PBR today). CpSeasonPoint.
  { num: 10, label: 'CP Points Deduction for Home Resorts - Maintenance and Setup',     to: '/resorts/season-points', icon: <Coins className="h-4 w-4" />, enabled: true },
  // Non-home = every other resort: our own LHC resorts and the partner/exchange V-* codes,
  // reached through an LVC exchange programme. LvcSeasonPoint.
  { num: 11, label: 'CP Points Deduction for Non-Home Resorts - Maintenance and Setup', to: '/resorts/lvc-season-points', icon: <CircleDollarSign className="h-4 w-4" />, enabled: true },
  { num: 12, label: 'Leisure Vacation Club (LVC) Code Maintenance and Setup', to: '/resorts/lvc-codes', icon: <ArrowLeftRight className="h-4 w-4" />, enabled: true },
];

function MenuSection({ title, items }: { title: string; items: ResortsMenuItem[] }) {
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

export function ResortsSetup() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Resorts Setup</h1>
        <p className="mt-1 text-sm text-gray-500">Select a setup function.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <MenuSection title="Setup" items={SETUP_ITEMS} />
      </div>
    </div>
  );
}
