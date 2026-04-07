const AUCTION_TIME_ZONE = 'Australia/Adelaide';

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: AUCTION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
}

function getDateTimeParts(date: Date): DateTimeParts {
  const parts = getFormatter().formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find(part => part.type === type)?.value;
    return value ? Number(value) : 0;
  };

  return {
    year: lookup('year'),
    month: lookup('month'),
    day: lookup('day'),
    hour: lookup('hour'),
    minute: lookup('minute'),
    second: lookup('second')
  };
}

function getTimeZoneOffsetMs(date: Date): number {
  const parts = getDateTimeParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatAuctionDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: AUCTION_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatAuctionDateInput(date: Date): string {
  const parts = getDateTimeParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function formatAuctionTimeInput(date: Date): string {
  const parts = getDateTimeParts(date);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
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

  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(naiveUtcMs);

  for (let i = 0; i < 3; i++) {
    const offsetMs = getTimeZoneOffsetMs(candidate);
    const corrected = new Date(naiveUtcMs - offsetMs);
    if (corrected.getTime() === candidate.getTime()) {
      break;
    }
    candidate = corrected;
  }

  const finalParts = getDateTimeParts(candidate);
  if (
    finalParts.year !== year ||
    finalParts.month !== month ||
    finalParts.day !== day ||
    finalParts.hour !== hour ||
    finalParts.minute !== minute
  ) {
    return null;
  }

  return candidate.toISOString();
}

export { AUCTION_TIME_ZONE };
