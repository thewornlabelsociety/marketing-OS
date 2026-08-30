import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../app/AppContext';
import type { ContentItem } from '../../types';

export function DropCalendarTab() {
  const { activeEntity } = useApp();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeEntity) return;
    setLoading(true);
    try {
      const data = await api.getContent(activeEntity.id);
      setItems(data.filter((item) => item.type === 'drop'));
    } finally {
      setLoading(false);
    }
  }, [activeEntity]);

  useEffect(() => {
    void load();
  }, [load]);

  const calendar = useMemo(() => buildCalendar(items), [items]);

  if (!activeEntity) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-[#71717A]">
        Select an entity to view scheduled drops.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[#09090B]">Drop Calendar</h1>
        <p className="mt-1 text-sm text-[#71717A]">
          Scheduled and draft drops for {activeEntity.name}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <MiniCalendar days={calendar.days} />

        <div className="rounded-xl border border-[#E4E4E7] bg-white">
          <div className="border-b border-[#E4E4E7] px-5 py-4">
            <h2 className="text-sm font-semibold text-[#09090B]">Upcoming drops</h2>
          </div>
          <div className="divide-y divide-[#E4E4E7]">
            {loading ? (
              <p className="p-5 text-sm text-[#71717A]">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-5 text-sm text-[#71717A]">No drops yet. Create one in Studio.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-medium text-[#09090B]">{item.title}</p>
                    <p className="mt-1 text-xs text-[#71717A]">
                      {item.scheduledFor
                        ? new Date(item.scheduledFor).toLocaleString()
                        : 'Not scheduled'}
                      {' · '}
                      <span className="capitalize">{item.status}</span>
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-[#71717A]">
                      {item.bodyMarkdown?.replace(/\*\*/g, '') ?? 'No body copy'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void api.deleteContent(item.id).then(load)}
                    className="rounded-lg border border-[#E4E4E7] p-2 text-[#71717A] hover:bg-[#FAFAFA]"
                    aria-label="Delete drop"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniCalendar({ days }: { days: Array<{ date: Date; count: number; isToday: boolean }> }) {
  const monthLabel = days[0]?.date.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
      <p className="mb-4 text-sm font-semibold text-[#09090B]">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-[#71717A]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((day) => (
          <div
            key={day.date.toISOString()}
            className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-xs ${
              day.isToday
                ? 'border-[#09090B] bg-[#09090B] text-white'
                : day.count > 0
                  ? 'border-[#A1A1AA] bg-[#FAFAFA] text-[#09090B]'
                  : 'border-transparent text-[#71717A]'
            }`}
          >
            <span>{day.date.getDate()}</span>
            {day.count > 0 && (
              <span className="mt-0.5 text-[9px] opacity-80">{day.count} drop</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildCalendar(items: ContentItem[]) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const days: Array<{ date: Date; count: number; isToday: boolean }> = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const count = items.filter((item) => {
      if (!item.scheduledFor) return false;
      const scheduled = new Date(item.scheduledFor);
      return (
        scheduled.getFullYear() === date.getFullYear() &&
        scheduled.getMonth() === date.getMonth() &&
        scheduled.getDate() === date.getDate()
      );
    }).length;

    const today = new Date();
    days.push({
      date,
      count,
      isToday:
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate(),
    });
  }

  return { days };
}
