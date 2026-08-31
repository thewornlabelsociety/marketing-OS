/** Returns the timezone's UTC offset in milliseconds at the given UTC instant. */
function getTzOffsetMs(utcMs: number, tz: string): number {
  const d = new Date(utcMs);
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = f.formatToParts(d);
  const get = (t: string): number => parseInt(parts.find(p => p.type === t)?.value ?? '0');
  let h = get('hour');
  if (h === 24) h = 0;
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
  return localMs - utcMs;
}

export function wallClockToISO(dateStr: string, hour: number, minute: number, tz: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const guessMs = new Date(`${dateStr}T${pad(hour)}:${pad(minute)}:00.000Z`).getTime();
  const offsetMs = getTzOffsetMs(guessMs, tz);
  const correctedMs = guessMs - offsetMs;
  const verifyOffset = getTzOffsetMs(correctedMs, tz);
  return new Date(guessMs - verifyOffset).toISOString();
}

export function getHourInTz(utcIso: string, tz: string): number {
  let h = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date(utcIso)));
  if (h === 24) h = 0;
  return h;
}

export function getDateStrInTz(utcIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(utcIso));
}

export function formatTimeInTz(utcIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
  }).format(new Date(utcIso));
}

export function formatDateTimeInTz(utcIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
  }).format(new Date(utcIso));
}

export function getTimePartsInTz(utcIso: string, tz: string): { hour: number; minute: number } {
  const d = new Date(utcIso);
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = f.formatToParts(d);
  let h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  if (h === 24) h = 0;
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
  return { hour: h, minute: m };
}

export function localDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA');
}
