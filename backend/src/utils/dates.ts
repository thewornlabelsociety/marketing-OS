export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(value: string | number | Date | null | undefined): string | null {
  if (value == null) return null;
  return new Date(value).toISOString();
}
