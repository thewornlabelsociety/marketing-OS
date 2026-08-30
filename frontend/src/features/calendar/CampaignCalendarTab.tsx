import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../app/AppContext';
import type { ScheduledContentItem } from '../../types';

export function CampaignCalendarTab() {
  const { activeEntity } = useApp();
  const [items, setItems] = useState<ScheduledContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeEntity) return;
    setLoading(true);
    try {
      const data = await api.getWorkspaceSchedule(activeEntity.id);
      setItems(data);
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
        Select a workspace to view the calendar.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[#09090B]">Campaign Calendar</h1>
        <p className="mt-1 text-sm text-[#71717A]">
          Scheduled campaign content for {activeEntity.name}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <MiniCalendar days={calendar.days} />

        <div className="rounded-xl border border-[#E4E4E7] bg-white">
          <div className="border-b border-[#E4E4E7] px-5 py-4">
            <h2 className="text-sm font-semibold text-[#09090B]">Scheduled content</h2>
          </div>
          <div className="divide-y divide-[#E4E4E7]">
            {loading ? (
              <p className="p-5 text-sm text-[#71717A]">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-5 text-sm text-[#71717A]">Nothing scheduled yet. Approve creative and schedule from a campaign.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="px-5 py-4">
                  <p className="font-medium text-[#09090B]">{item.contentKey}</p>
                  <p className="mt-1 text-xs text-[#71717A]">
                    {new Date(item.scheduledFor).toLocaleString()}
                    {' · '}
                    {item.channel}
                    {' · '}
                    <span className="capitalize">{item.status.replaceAll('_', ' ').toLowerCase()}</span>
                  </p>
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
              <span className="mt-0.5 text-[9px] opacity-80">{day.count}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildCalendar(items: ScheduledContentItem[]) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const days: Array<{ date: Date; count: number; isToday: boolean }> = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const count = items.filter((item) => {
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
