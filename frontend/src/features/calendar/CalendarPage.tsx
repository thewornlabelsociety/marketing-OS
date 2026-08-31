import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { ScheduleItemDrawer } from '../../components/drawers/ScheduleItemDrawer';
import { api } from '../../services/api';
import type {
  IntegrationConnection,
  ReadyToScheduleItem,
  ScheduledContentItem,
} from '../../types';

type CalendarView = 'day' | 'week' | 'month';

// ─── Status colour system ───────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  DRAFT:             { bg: '#FAFAFA', text: '#52525B', border: '#E4E4E7', label: 'Draft' },
  SCHEDULED:         { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', label: 'Scheduled' },
  READY:             { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', label: 'Ready' },
  BLOCKED:           { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', label: 'Blocked' },
  PUBLISHING:        { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE', label: 'Publishing…' },
  PUBLISHED:         { bg: '#F0FDF4', text: '#166534', border: '#86EFAC', label: 'Published' },
  FAILED:            { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA', label: 'Failed' },
  FAILED_RECONCILE:  { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74', label: 'Reconcile' },
  CANCELLED:         { bg: '#F4F4F5', text: '#71717A', border: '#D4D4D8', label: 'Cancelled' },
};

function statusKey(item: ScheduledContentItem): string {
  if (item.status === 'FAILED' && item.blockReason?.toLowerCase().includes('reconcile')) {
    return 'FAILED_RECONCILE';
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
  onDragStart,
  onClick,
}: {
  item: ScheduledContentItem;
  onDragStart: (e: React.DragEvent, item: ScheduledContentItem) => void;
  onClick: (item: ScheduledContentItem) => void;
}) {
  const sk = statusKey(item);
  const c = STATUS_COLORS[sk] ?? STATUS_COLORS.DRAFT;
  const draggable = item.status !== 'PUBLISHED' && item.status !== 'CANCELLED';
  const scheduledHHMM = new Date(item.scheduledFor).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, item) : undefined}
      onClick={() => onClick(item)}
      style={{ backgroundColor: c.bg, borderColor: c.border, color: c.text }}
      className="mb-0.5 cursor-pointer select-none rounded border px-1.5 py-1 text-[11px] leading-tight hover:opacity-80"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-medium">{item.contentKey}</span>
        <span className="shrink-0 font-semibold">{c.label}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1 opacity-80">
        <Clock className="h-2.5 w-2.5" />
        <span>{scheduledHHMM}</span>
        <span>·</span>
        <span>{item.channel}</span>
        <span>·</span>
        <span>V{item.sourceCreativeVersion}</span>
      </div>
      {item.mediaAssets[0] && (
        <div className="mt-0.5 truncate font-mono opacity-60" style={{ fontSize: 9 }}>
          {item.mediaAssets[0].id}
        </div>
      )}
    </div>
  );
}

// ─── Time slot cell (drop target) ────────────────────────────────────────────

function TimeSlot({
  day,
  hour,
  cellKey,
  items,
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
        <ItemCard key={item.id} item={item} onDragStart={onDragStart} onClick={onItemClick} />
      ))}
    </div>
  );
}

// ─── Week view ───────────────────────────────────────────────────────────────

function WeekView({
  weekDays,
  itemsForCell,
  onItemClick,
  onDragStart,
  onDrop,
  dragOver,
  setDragOver,
  scrollRef,
}: {
  weekDays: Date[];
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
      {/* Day headers */}
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

      {/* Scrollable hour grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {HOURS.map((hour) => (
          <div key={hour} className="flex" style={{ height: `${HOUR_PX}px` }}>
            {/* Time label */}
            <div className="relative w-12 shrink-0 border-r border-[#F4F4F5]">
              <span className="absolute -top-2 right-1.5 text-[10px] text-[#A1A1AA]">
                {fmtHour(hour)}
              </span>
            </div>
            {/* Day columns */}
            {weekDays.map((day, di) => {
              const cellKey = `${day.toISOString().slice(0, 10)}-${hour}`;
              return (
                <TimeSlot
                  key={di}
                  day={day}
                  hour={hour}
                  cellKey={cellKey}
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
  itemsForCell,
  onItemClick,
  onDragStart,
  onDrop,
  dragOver,
  setDragOver,
  scrollRef,
}: {
  day: Date;
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
      {/* Day header */}
      <div className="flex shrink-0 border-b border-[#E4E4E7]">
        <div className="w-12 shrink-0" />
        <div className={`flex flex-1 flex-col items-center py-2 text-xs ${isToday(day) ? 'text-blue-600' : 'text-[#71717A]'}`}>
          <span className="font-medium uppercase">{day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {HOURS.map((hour) => {
          const cellKey = `${day.toISOString().slice(0, 10)}-${hour}`;
          return (
            <div key={hour} className="flex" style={{ height: `${HOUR_PX}px` }}>
              <div className="relative w-12 shrink-0 border-r border-[#F4F4F5]">
                <span className="absolute -top-2 right-1.5 text-[10px] text-[#A1A1AA]">{fmtHour(hour)}</span>
              </div>
              <TimeSlot
                day={day}
                hour={hour}
                cellKey={cellKey}
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
  onItemClick,
  onDayClick,
}: {
  anchor: Date;
  items: ScheduledContentItem[];
  onItemClick: (item: ScheduledContentItem) => void;
  onDayClick: (day: Date) => void;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDow = firstOfMonth.getDay(); // 0=Sun
  // align to Monday
  const gridStart = addDays(firstOfMonth, -(startDow === 0 ? 6 : startDow - 1));
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  function itemsForDay(day: Date) {
    return items.filter(it => isSameDay(new Date(it.scheduledFor), day));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      {/* DOW labels */}
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium uppercase text-[#A1A1AA]">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d}>{d}</div>
        ))}
      </div>
      {/* Calendar grid */}
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
                      {item.contentKey}
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
                    <p className="truncate text-xs font-medium text-[#09090B]">{item.contentKey}</p>
                    <p className="truncate text-[11px] text-[#71717A]">
                      {item.campaignName}
                    </p>
                    <p className="text-[11px] text-[#A1A1AA]">
                      {item.channel} · {item.format} · V{item.version}
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
    STATUS_COLORS.BLOCKED,
    STATUS_COLORS.PUBLISHING,
    STATUS_COLORS.PUBLISHED,
    STATUS_COLORS.FAILED,
    STATUS_COLORS.FAILED_RECONCILE,
    STATUS_COLORS.CANCELLED,
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-1.5 border-b border-[#F4F4F5]">
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
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));

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
    ])
      .then(([sched, ready, intgs, campaigns]) => {
        setItems(sched);
        setReadyItems(ready);
        setIntegrations(intgs);
        const nameMap: Record<string, string> = {};
        campaigns.forEach(c => { nameMap[c.id] = c.name; });
        setCampaignNames(nameMap);
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
    const today = new Date();
    if (view === 'week') setAnchor(startOfWeek(today));
    else setAnchor(today);
  }

  // Meta connection warning: expired/reauth integration + Meta-channel item due within 48h
  const metaWarning =
    integrations.some(
      c =>
        (c.providerKey === 'meta' ||
          c.capabilities?.some(
            cap => cap.toLowerCase().includes('instagram') || cap.toLowerCase().includes('facebook')
          )) &&
        (c.status === 'EXPIRED' || c.status === 'REAUTH_REQUIRED')
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

  function itemsForCell(day: Date, hour: number): ScheduledContentItem[] {
    return items.filter(it => {
      const d = new Date(it.scheduledFor);
      return isSameDay(d, day) && d.getHours() === hour;
    });
  }

  function onDragStart(e: React.DragEvent, item: ScheduledContentItem) {
    setDragId(item.id);
    e.dataTransfer.setData(
      'text/plain',
      JSON.stringify({ scheduleId: item.id, campaignId: item.campaignId })
    );
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(e: React.DragEvent, day: Date, hour: number) {
    e.preventDefault();
    setDragOver(null);

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

    const newDate = new Date(day);
    newDate.setHours(hour, 0, 0, 0);

    api
      .rescheduleItem(campaignId, scheduleId, workspaceId, newDate.toISOString(), draggedItem.timezone)
      .then(() => load())
      .catch(err => console.error('Reschedule failed', err));

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
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-6 py-3">
        <h1 className="text-sm font-semibold text-[#09090B]">Calendar</h1>
        <div className="flex items-center gap-3">
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
            <button
              type="button"
              onClick={() => nav(-1)}
              className="rounded p-1 text-[#71717A] hover:bg-[#FAFAFA]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[200px] text-center text-xs font-medium text-[#09090B]">
              {dateLabel}
            </span>
            <button
              type="button"
              onClick={() => nav(1)}
              className="rounded p-1 text-[#71717A] hover:bg-[#FAFAFA]"
            >
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

          {loading && (
            <span className="text-xs text-[#A1A1AA]">Loading…</span>
          )}
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
              items={items}
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
