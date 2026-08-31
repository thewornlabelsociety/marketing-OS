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
  if (h === 24) h = 0; // some Intl impls return 24 for midnight
  const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
  return localMs - utcMs;
}

/**
 * Convert a wall-clock date + time in `tz` to a UTC ISO 8601 string.
 * DST-safe: performs one correction pass to handle ambiguous/skipped hours.
 *
 * @param dateStr - YYYY-MM-DD in the target timezone
 * @param hour - 0-23 wall-clock hour in the target timezone
 * @param minute - 0-59 wall-clock minute
 * @param tz - IANA timezone identifier, e.g. "Pacific/Auckland"
 */
export function wallClockToISO(dateStr: string, hour: number, minute: number, tz: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const guessMs = new Date(`${dateStr}T${pad(hour)}:${pad(minute)}:00.000Z`).getTime();
  const offsetMs = getTzOffsetMs(guessMs, tz);
  const correctedMs = guessMs - offsetMs;
  // One more pass handles DST boundaries where the offset changes at the target time
  const verifyOffset = getTzOffsetMs(correctedMs, tz);
  return new Date(guessMs - verifyOffset).toISOString();
}

/**
 * Get the 0–23 hour of a UTC ISO instant displayed in the given timezone.
 */
export function getHourInTz(utcIso: string, tz: string): number {
  let h = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz })
      .format(new Date(utcIso)),
  );
  if (h === 24) h = 0;
  return h;
}

/**
 * Get the YYYY-MM-DD date string of a UTC ISO instant in the given timezone.
 */
export function getDateStrInTz(utcIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(utcIso));
}

/**
 * Format a UTC ISO instant as "9:00 AM" in the given timezone.
 */
export function formatTimeInTz(utcIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
  }).format(new Date(utcIso));
}

/**
 * Format a UTC ISO instant as "Sep 1, 2024, 9:00 AM" in the given timezone.
 */
export function formatDateTimeInTz(utcIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
  }).format(new Date(utcIso));
}

/**
 * Get the hour (0–23) and minute (0–59) of a UTC ISO instant in the given timezone.
 */
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

/**
 * Derive the YYYY-MM-DD date string of a local Date in the browser's local timezone.
 * Used for mapping calendar-day cells to date strings.
 */
export function localDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
}
