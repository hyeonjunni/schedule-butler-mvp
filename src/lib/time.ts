const SEOUL_OFFSET = "+09:00";

export function nowIso() {
  return new Date().toISOString();
}

export function toLocalDateInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export function fromLocalDateInputValue(value: string) {
  if (!value) return null;
  return `${value}:00${SEOUL_OFFSET}`;
}

export function subtractMinutes(value: string | null, minutes: number) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() - minutes * 60 * 1000).toISOString();
}

export function formatKoreanDateTime(value: string | null) {
  if (!value) return "시간 미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function getBaseDateKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function nextWeekdayIso(weekday: number, hour: number, minute = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const kstMidnight = Date.UTC(year, month - 1, day);
  const kstWeekday = new Date(kstMidnight).getUTCDay();
  const daysAhead = (weekday - kstWeekday + 7) % 7 || 7;
  const utcTime = Date.UTC(year, month - 1, day + daysAhead, hour - 9, minute, 0, 0);
  return new Date(utcTime).toISOString();
}

export function addHoursIso(value: string, hours: number) {
  const date = new Date(value);
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}
