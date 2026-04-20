function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatAuctionDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatAuctionDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatAuctionTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getAuctionNowDate(): Date {
  return new Date();
}

export function getAuctionNowPlusMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export function zonedDateTimeToUtcIso(date: string | null | undefined, time: string | null | undefined): string | null {
  if (!date || !time) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !timeMatch) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day ||
    localDate.getHours() !== hour ||
    localDate.getMinutes() !== minute
  ) {
    return null;
  }

  return localDate.toISOString();
}
