import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { ScheduleItemDrawer } from '../../components/drawers/ScheduleItemDrawer';
import { api } from '../../services/api';
import type {
  IntegrationConnection,
  ReadyToScheduleItem,
  ScheduledContentItem,
} from '../../types';
import {
  formatTimeInTz,
  getDateStrInTz,
  getHourInTz,
  localDateStr,
  wallClockToISO,
} from '../../utils/timezone';

type CalendarView = 'day' | 'week' | 'month';

// ─── Status colour system ───────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  DRAFT:             { bg: '#FAFAFA', text: '#52525B', border: '#E4E4E7', label: 'Draft' },
  SCHEDULED:         { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', label: 'Scheduled' },
  READY:             { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', label: 'Ready' },
  BLOCKED:           { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', label: 'Blocked' },
  PUBLISHING:        { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE', label: 'Publishing…' },
  PUBLISHED:         { bg: '#F0FDF4', text: '#166534', border: '#86EFAC', label: 'Published' },
  FAILED:            { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA', label: 'Publishing failed' },
  FAILED_RECONCILE:  { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74', label: 'Check publication' },
  CANCELLED:         { bg: '#F4F4F5', text: '#71717A', border: '#D4D4D8', label: 'Cancelled' },
};

function statusKey(item: ScheduledContentItem): string {
  if (item.reconciliationRequired) return 'FAILED_RECONCILE';
  if (item.status === 'FAILED' && item.blockReason?.toLowerCase().includes('reconcile')) {
    return 'FAILED_RECONCILE'; // fallback for data without reconciliationRequired field
  }
  return item.status;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Monday-first
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dateInTimezone(utcInstant: Date, timezone: string): Date {
  const [year, month, day] = getDateStrInTz(utcInstant.toISOString(), timezone).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

function fmtDow(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function fmtDate(d: Date) {
  return d.getDate();
}

function fmtHour(hour: number) {
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 – 23:00
const HOUR_PX = 64;

// ─── Item card ───────────────────────────────────────────────────────────────

function ItemCard({
  item,
  calendarTz,
  onDragStart,
  onClick,
}: {
  item: ScheduledContentItem;
  calendarTz: string;
  onDragStart: (e: React.DragEvent, item: ScheduledContentItem) => void;
  onClick: (item: ScheduledContentItem) => void;
}) {
  const sk = statusKey(item);
  const c = STATUS_COLORS[sk] ?? STATUS_COLORS.DRAFT;
  const draggable = item.status !== 'PUBLISHED' && item.status !== 'CANCELLED';
  const tz = calendarTz;
  const scheduledHHMM = formatTimeInTz(item.scheduledFor, tz);

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, item) : undefined}
      onClick={() => onClick(item)}
      style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
      className="mb-0.5 cursor-pointer select-none rounded-lg border px-2 py-1.5 text-[11px] leading-tight transition hover:-translate-y-px hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-semibold">{humanContentTitle(item.contentKey)}</span>
        <span className="shrink-0 font-semibold">{c.label}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1 opacity-80">
        <Clock className="h-2.5 w-2.5" />
        <span>{scheduledHHMM}</span>
        <span>·</span>
        <span>{titleCase(item.channel)}</span>
      </div>
    </div>
  );
}

// ─── Time slot cell (drop target) ────────────────────────────────────────────

function TimeSlot({
  day,
  hour,
  cellKey,
  items,
  calendarTz,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onItemClick,
}: {
  day: Date;
  hour: number;
  cellKey: string;
  items: ScheduledContentItem[];
  calendarTz: string;
  isOver: boolean;
  onDragOver: (key: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, day: Date, hour: number) => void;
  onDragStart: (e: React.DragEvent, item: ScheduledContentItem) => void;
  onItemClick: (item: ScheduledContentItem) => void;
}) {
  return (
    <div
      className={`relative flex-1 overflow-hidden border-b border-r border-[#F4F4F5] p-0.5 transition-colors ${
        isOver ? 'bg-blue-50' : ''
      }`}
      style={{ minHeight: `${HOUR_PX}px` }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(cellKey); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, day, hour)}
    >
      {items.map((item) => (
        <ItemCard key={item.id} item={item} calendarTz={calendarTz} onDragStart={onDragStart} onClick={onItemClick} />
      ))}
    </div>
  );
}

// ─── Week view ───────────────────────────────────────────────────────────────

function WeekView({
  weekDays,
  calendarTz,
  itemsForCell,
  onItemClick,
  onDragStart,
  onDrop,
  dragOver,
  setDragOver,
  scrollRef,
}: {
  weekDays: Date[];
  calendarTz: string;
  itemsForCell: (day: Date, hour: number) => ScheduledContentItem[];
  onItemClick: (item: ScheduledContentItem) => void;
  onDragStart: (e: React.DragEvent, item: ScheduledContentItem) => void;
  onDrop: (e: React.DragEvent, day: Date, hour: number) => void;
  dragOver: string | null;
  setDragOver: (k: string | null) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-[#E4E4E7]">
        <div className="w-12 shrink-0" />
        {weekDays.map((day, i) => (
          <div
            key={i}
            className={`flex flex-1 flex-col items-center py-2 text-xs ${
              isToday(day) ? 'text-blue-600' : 'text-[#71717A]'
            }`}
          >
            <span className="font-medium uppercase">{fmtDow(day)}</span>
            <span
              className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                isToday(day) ? 'bg-blue-600 text-white' : 'text-[#09090B]'
              }`}
            >
              {fmtDate(day)}
            </span>
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {HOURS.map((hour) => (
          <div key={hour} className="flex" style={{ height: `${HOUR_PX}px` }}>
            <div className="relative w-12 shrink-0 border-r border-[#F4F4F5]">
              <span className="absolute -top-2 right-1.5 text-[10px] text-[#A1A1AA]">
                {fmtHour(hour)}
              </span>
            </div>
            {weekDays.map((day, di) => {
              const cellKey = `${localDateStr(day)}-${hour}`;
              return (
                <TimeSlot
                  key={di}
                  day={day}
                  hour={hour}
                  cellKey={cellKey}
                  calendarTz={calendarTz}
                  items={itemsForCell(day, hour)}
                  isOver={dragOver === cellKey}
                  onDragOver={setDragOver}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={onDrop}
                  onDragStart={onDragStart}
                  onItemClick={onItemClick}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Day view ────────────────────────────────────────────────────────────────

function DayView({
  day,
  calendarTz,
  itemsForCell,
  onItemClick,
  onDragStart,
  onDrop,
  dragOver,
  setDragOver,
  scrollRef,
}: {
  day: Date;
  calendarTz: string;
  itemsForCell: (day: Date, hour: number) => ScheduledContentItem[];
  onItemClick: (item: ScheduledContentItem) => void;
  onDragStart: (e: React.DragEvent, item: ScheduledContentItem) => void;
  onDrop: (e: React.DragEvent, day: Date, hour: number) => void;
  dragOver: string | null;
  setDragOver: (k: string | null) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-[#E4E4E7]">
        <div className="w-12 shrink-0" />
        <div className={`flex flex-1 flex-col items-center py-2 text-xs ${isToday(day) ? 'text-blue-600' : 'text-[#71717A]'}`}>
          <span className="font-medium uppercase">{day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {HOURS.map((hour) => {
          const cellKey = `${localDateStr(day)}-${hour}`;
          return (
            <div key={hour} className="flex" style={{ height: `${HOUR_PX}px` }}>
              <div className="relative w-12 shrink-0 border-r border-[#F4F4F5]">
                <span className="absolute -top-2 right-1.5 text-[10px] text-[#A1A1AA]">{fmtHour(hour)}</span>
              </div>
              <TimeSlot
                day={day}
                hour={hour}
                cellKey={cellKey}
                calendarTz={calendarTz}
                items={itemsForCell(day, hour)}
                isOver={dragOver === cellKey}
                onDragOver={setDragOver}
                onDragLeave={() => setDragOver(null)}
                onDrop={onDrop}
                onDragStart={onDragStart}
                onItemClick={onItemClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Month view ──────────────────────────────────────────────────────────────

function MonthView({
  anchor,
  items,
  calendarTz,
  onItemClick,
  onDayClick,
}: {
  anchor: Date;
  items: ScheduledContentItem[];
  calendarTz: string;
  onItemClick: (item: ScheduledContentItem) => void;
  onDayClick: (day: Date) => void;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDow = firstOfMonth.getDay();
  const gridStart = addDays(firstOfMonth, -(startDow === 0 ? 6 : startDow - 1));
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  function itemsForDay(day: Date) {
    const ds = localDateStr(day);
    return items.filter(it => getDateStrInTz(it.scheduledFor, calendarTz) === ds);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium uppercase text-[#A1A1AA]">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#E4E4E7]">
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === month;
          const dayItems = itemsForDay(day);
          return (
            <div
              key={i}
              onClick={() => onDayClick(day)}
              className={`cursor-pointer overflow-hidden p-1 text-xs transition-colors hover:bg-blue-50 ${
                inMonth ? 'bg-white' : 'bg-[#FAFAFA]'
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isToday(day)
                    ? 'bg-blue-600 text-white'
                    : inMonth
                    ? 'text-[#09090B]'
                    : 'text-[#D4D4D8]'
                }`}
              >
                {day.getDate()}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayItems.slice(0, 3).map((item) => {
                  const sk = statusKey(item);
                  const c = STATUS_COLORS[sk] ?? STATUS_COLORS.DRAFT;
                  return (
                    <div
                      key={item.id}
                      onClick={(e) => { e.stopPropagation(); onItemClick(item); }}
                      style={{ fontSize: 9, backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                      className="truncate rounded border px-1 py-0.5"
                    >
                      {humanContentTitle(item.contentKey)}
                    </div>
                  );
                })}
                {dayItems.length > 3 && (
                  <div className="text-[9px] text-[#A1A1AA]">+{dayItems.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ready to Schedule sidebar ────────────────────────────────────────────────

function ReadyToScheduleSidebar({
  items,
  onSchedule,
  onNavigate,
}: {
  items: ReadyToScheduleItem[];
  onSchedule: (item: ReadyToScheduleItem) => void;
  onNavigate: (campaignId: string) => void;
}) {
  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-[#E4E4E7] bg-[#FAFAFA]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
          Ready to Schedule
        </p>
        <span className="rounded-full bg-[#E4E4E7] px-1.5 py-0.5 text-[10px] font-medium text-[#71717A]">
          {items.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
            <Calendar className="h-6 w-6 text-[#D4D4D8]" />
            <p className="text-xs text-[#A1A1AA]">
              Approve creative in Campaigns to see it here.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {items.map((item) => (
              <div
                key={item.artifactId}
                className="group border-b border-[#F4F4F5] px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#09090B]">{humanContentTitle(item.contentKey)}</p>
                    <p className="truncate text-[11px] text-[#71717A]">
                      {humanCampaignLabel(item.campaignName, item.contentKey)}
                    </p>
                    <p className="text-[11px] text-[#A1A1AA]">
                      {titleCase(item.channel)} · {humanFormat(item.format)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSchedule(item)}
                    className="shrink-0 rounded-lg border border-[#E4E4E7] bg-white p-1 text-[#09090B] opacity-0 hover:bg-[#F4F4F5] group-hover:opacity-100"
                    title="Schedule"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(item.campaignId)}
                  className="mt-1 text-[10px] text-[#A1A1AA] hover:text-[#71717A] hover:underline"
                >
                  View campaign
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Status legend ────────────────────────────────────────────────────────────

function StatusLegend() {
  const entries = [
    STATUS_COLORS.SCHEDULED,
    STATUS_COLORS.READY,
    STATUS_COLORS.PUBLISHED,
    STATUS_COLORS.FAILED_RECONCILE,
    STATUS_COLORS.FAILED,
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[#F4F4F5] px-4 py-1.5">
      {entries.map(c => (
        <div key={c.label} className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-sm border" style={{ backgroundColor: c.bg, borderColor: c.border }} />
          <span className="text-[10px] text-[#A1A1AA]">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── CalendarPage ─────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { activeEntity, setActiveTab, setActiveCampaignId } = useApp();
  const workspaceId = activeEntity?.id ?? '';

  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(new Date()));
  const [items, setItems] = useState<ScheduledContentItem[]>([]);
  const [readyItems, setReadyItems] = useState<ReadyToScheduleItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConnection[]>([]);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});
  const [drawerItem, setDrawerItem] = useState<ScheduledContentItem | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ReadyToScheduleItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarTz, setCalendarTz] = useState('UTC');

  // Filters
  const [filterCampaignId, setFilterCampaignId] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));

  // Distinct campaigns and channels for filter dropdowns
  const allCampaigns = useMemo(() => {
    const seen = new Set<string>();
    return items.filter(it => { if (seen.has(it.campaignId)) return false; seen.add(it.campaignId); return true; });
  }, [items]);

  const allChannels = useMemo(() => {
    const seen = new Set<string>();
    return items.filter(it => { if (seen.has(it.channel)) return false; seen.add(it.channel); return true; }).map(it => it.channel);
  }, [items]);

  // Filtered items (no persistence — view-local state only)
  const filteredItems = useMemo(() => items.filter(it => {
    if (filterCampaignId && it.campaignId !== filterCampaignId) return false;
    if (filterChannel && it.channel !== filterChannel) return false;
    if (filterStatus) {
      if (filterStatus === 'FAILED_RECONCILE') return statusKey(it) === 'FAILED_RECONCILE';
      return it.status === filterStatus;
    }
    return true;
  }), [items, filterCampaignId, filterChannel, filterStatus]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (9 - 6) * HOUR_PX; // scroll to 9am
    }
  }, [view]);

  const load = useCallback(() => {
    if (!workspaceId) return;
    setLoading(true);
    Promise.all([
      api.getWorkspaceSchedule(workspaceId),
      api.getReadyToSchedule(workspaceId),
      api.getIntegrations(workspaceId),
      api.getCampaigns(workspaceId),
      api.getCalendarConfig(),
    ])
      .then(([sched, ready, intgs, campaigns, config]) => {
        setItems(sched);
        setReadyItems(ready);
        setIntegrations(intgs);
        const nameMap: Record<string, string> = {};
        campaigns.forEach(c => { nameMap[c.id] = c.name; });
        setCampaignNames(nameMap);
        setCalendarTz(config.timezone);
        setAnchor(current => {
          const configuredToday = dateInTimezone(new Date(), config.timezone);
          return localDateStr(current) === localDateStr(startOfWeek(new Date()))
            ? startOfWeek(configuredToday)
            : current;
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  function nav(dir: -1 | 1) {
    setAnchor(prev => {
      if (view === 'day') return addDays(prev, dir);
      if (view === 'week') return addDays(prev, dir * 7);
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return startOfWeek(d);
    });
  }

  function goToday() {
    const today = dateInTimezone(new Date(), calendarTz);
    if (view === 'week') setAnchor(startOfWeek(today));
    else setAnchor(today);
  }

  // Meta connection warning: expired/reauth integration + Meta-channel item due within 48h
  const metaWarning =
    integrations.some(
      c =>
        (c.providerKey === 'meta' ||
          c.capabilities?.some(
            cap => cap.toLowerCase().includes('instagram') || cap.toLowerCase().includes('facebook'),
          )) &&
        (c.status === 'EXPIRED' || c.status === 'REAUTH_REQUIRED'),
    ) &&
    items.some(item => {
      const d = new Date(item.scheduledFor);
      return (
        (item.channel === 'INSTAGRAM' || item.channel === 'FACEBOOK') &&
        d.getTime() <= Date.now() + 48 * 3600 * 1000 &&
        item.status !== 'PUBLISHED' &&
        item.status !== 'CANCELLED'
      );
    });

    // Calendar cells and items are always compared in the authoritative configured timezone.
  function itemsForCell(day: Date, hour: number): ScheduledContentItem[] {
    const cellDate = localDateStr(day); // YYYY-MM-DD in browser local (= operator local for local-first)
    return filteredItems.filter(it => {
      return getDateStrInTz(it.scheduledFor, calendarTz) === cellDate && getHourInTz(it.scheduledFor, calendarTz) === hour;
    });
  }

  function onDragStart(e: React.DragEvent, item: ScheduledContentItem) {
    setDragId(item.id);
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ scheduleId: item.id, campaignId: item.campaignId }),
    );
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(e: React.DragEvent, day: Date, hour: number) {
    e.preventDefault();
    setDragOver(null);
    setDropError(null);

    let scheduleId = dragId;
    let campaignId = '';
    try {
      const parsed = JSON.parse(e.dataTransfer.getData('text/plain')) as {
        scheduleId: string;
        campaignId: string;
      };
      scheduleId = parsed.scheduleId;
      campaignId = parsed.campaignId;
    } catch { /* fall back to dragId */ }

    if (!scheduleId) return;
    const draggedItem = items.find(it => it.id === scheduleId);
    if (!draggedItem) return;
    if (!campaignId) campaignId = draggedItem.campaignId;

    // Convert the displayed wall-clock cell through the authoritative calendar timezone.
    const tz = calendarTz;
    const dayStr = localDateStr(day); // YYYY-MM-DD (calendar day as displayed)
    const scheduledFor = wallClockToISO(dayStr, hour, 0, tz);

    api
      .rescheduleItem(campaignId, scheduleId, workspaceId, scheduledFor, tz)
      .then(() => load())
      .catch(err => {
        setDropError(err instanceof Error ? err.message : 'Reschedule failed — item not moved.');
      });

    setDragId(null);
  }

  function goToCampaign(campaignId: string) {
    setActiveCampaignId(campaignId);
    setActiveTab('campaigns');
  }

  const dateLabel =
    view === 'week'
      ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : view === 'day'
      ? anchor.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (!activeEntity) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#71717A]">
        No workspace selected.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#FAFAFA]">
      {/* ── Header ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#E4E4E7] bg-white px-6 py-4">
        <div><p className="mos-eyebrow">Plan the week</p><h1 className="mt-0.5 text-xl font-semibold tracking-tight text-[#09090B]">Calendar</h1></div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View switcher */}
          <div className="flex rounded-lg border border-[#E4E4E7] text-xs">
            {(['day', 'week', 'month'] as CalendarView[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 capitalize first:rounded-l-[7px] last:rounded-r-[7px] ${
                  view === v
                    ? 'bg-[#09090B] text-white'
                    : 'text-[#71717A] hover:bg-[#FAFAFA]'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Date navigator */}
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => nav(-1)} className="rounded p-1 text-[#71717A] hover:bg-[#FAFAFA]">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[200px] text-center text-xs font-medium text-[#09090B]">{dateLabel}</span>
            <button type="button" onClick={() => nav(1)} className="rounded p-1 text-[#71717A] hover:bg-[#FAFAFA]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-[#E4E4E7] px-3 py-1.5 text-xs text-[#71717A] hover:bg-[#FAFAFA]"
          >
            Today
          </button>

          {/* Timezone badge */}
          <span className="rounded bg-[#F4F4F5] px-2 py-1 text-[10px] text-[#71717A]" title="Authoritative scheduling timezone">
            Times shown in {calendarTz}
          </span>

          {loading && <span className="text-xs text-[#A1A1AA]">Loading…</span>}
        </div>

        {/* Filters row */}
        <div className="flex w-full items-center gap-2 pt-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[#A1A1AA]">Filter:</span>

          <select
            value={filterCampaignId}
            onChange={e => setFilterCampaignId(e.target.value)}
            className="rounded border border-[#E4E4E7] px-2 py-1 text-[11px] text-[#09090B]"
          >
            <option value="">All campaigns</option>
            {allCampaigns.map(it => (
              <option key={it.campaignId} value={it.campaignId}>
                {humanCampaignLabel(campaignNames[it.campaignId] ?? '', it.contentKey)}
              </option>
            ))}
          </select>

          <select
            value={filterChannel}
            onChange={e => setFilterChannel(e.target.value)}
            className="rounded border border-[#E4E4E7] px-2 py-1 text-[11px] text-[#09090B]"
          >
            <option value="">All channels</option>
            {allChannels.map(ch => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded border border-[#E4E4E7] px-2 py-1 text-[11px] text-[#09090B]"
          >
            <option value="">All statuses</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="READY">Ready</option>
            <option value="BLOCKED">Blocked</option>
            <option value="PUBLISHING">Publishing now</option>
            <option value="PUBLISHED">Published</option>
            <option value="FAILED">Publishing failed</option>
            <option value="FAILED_RECONCILE">Publication needs checking</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {(filterCampaignId || filterChannel || filterStatus) && (
            <button
              type="button"
              onClick={() => { setFilterCampaignId(''); setFilterChannel(''); setFilterStatus(''); }}
              className="flex items-center gap-0.5 text-[11px] text-[#A1A1AA] hover:text-[#71717A]"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}

          <span className="ml-auto text-[10px] text-[#A1A1AA]">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            {readyItems.length > 0 && ` · ${readyItems.length} approved, unscheduled`}
          </span>
        </div>
      </div>

      {/* ── Meta re-auth warning banner ── */}
      {metaWarning && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            A Meta connection needs re-authorisation. Instagram / Facebook posts due within 48h may
            fail. Reconnect before they are due.
          </span>
        </div>
      )}

      {/* ── Drop failure error banner ── */}
      {dropError && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{dropError}</span>
          </div>
          <button type="button" onClick={() => setDropError(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Status legend ── */}
      <StatusLegend />

      {/* ── Body: sidebar + calendar ── */}
      <div className="flex min-h-0 flex-1">
        <ReadyToScheduleSidebar
          items={readyItems}
          onSchedule={setScheduleTarget}
          onNavigate={goToCampaign}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {view === 'week' && (
            <WeekView
              weekDays={weekDays}
              calendarTz={calendarTz}
              itemsForCell={itemsForCell}
              onItemClick={setDrawerItem}
              onDragStart={onDragStart}
              onDrop={onDrop}
              dragOver={dragOver}
              setDragOver={setDragOver}
              scrollRef={scrollRef}
            />
          )}
          {view === 'day' && (
            <DayView
              day={anchor}
              calendarTz={calendarTz}
              itemsForCell={itemsForCell}
              onItemClick={setDrawerItem}
              onDragStart={onDragStart}
              onDrop={onDrop}
              dragOver={dragOver}
              setDragOver={setDragOver}
              scrollRef={scrollRef}
            />
          )}
          {view === 'month' && (
            <MonthView
              anchor={anchor}
              items={filteredItems}
              calendarTz={calendarTz}
              onItemClick={setDrawerItem}
              onDayClick={(d) => {
                setAnchor(d);
                setView('day');
              }}
            />
          )}
        </div>
      </div>

      {/* ── Schedule item drawer (view mode) ── */}
      {drawerItem && (
        <ScheduleItemDrawer
          mode="view"
          campaignId={drawerItem.campaignId}
          workspaceId={workspaceId}
          campaignName={campaignNames[drawerItem.campaignId] ?? drawerItem.campaignId}
          item={drawerItem}
          onClose={() => setDrawerItem(null)}
          onSaved={() => { setDrawerItem(null); load(); }}
          onNavigateToCampaign={goToCampaign}
        />
      )}

      {/* ── Schedule item drawer (create mode from Ready sidebar) ── */}
      {scheduleTarget && (
        <ScheduleItemDrawer
          mode="create"
          campaignId={scheduleTarget.campaignId}
          workspaceId={workspaceId}
          campaignName={scheduleTarget.campaignName}
          contentKey={scheduleTarget.contentKey}
          channel={scheduleTarget.channel}
          creativeArtifactId={scheduleTarget.artifactId}
          creativeVersion={scheduleTarget.version}
          onClose={() => setScheduleTarget(null)}
          onSaved={() => { setScheduleTarget(null); load(); }}
        />
      )}
    </div>
  );
}

function humanContentTitle(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()).replace(/\b0*\d+\b/g, '').replace(/\s+/g, ' ').trim() || 'Untitled content';
}

function humanCampaignLabel(name: string, contentKey: string): string {
  return /^(Campaign|Cmp) camp_/i.test(name) || !name ? `${humanContentTitle(contentKey)} campaign` : name;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
}

function humanFormat(value: string): string {
  return titleCase(value.replaceAll('_', ' '));
}
