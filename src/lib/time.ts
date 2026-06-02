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
  const today = getKstCalendarDate();
  const daysAhead = (weekday - today.getUTCDay() + 7) % 7 || 7;
  today.setUTCDate(today.getUTCDate() + daysAhead);
  return kstWallTimeToIso(
    today.getUTCFullYear(),
    today.getUTCMonth() + 1,
    today.getUTCDate(),
    hour,
    minute
  );
}

export function startOfKstDayIso(value: string) {
  return boundaryOfKstDayIso(value, 0, 0);
}

export function endOfKstDayIso(value: string) {
  return boundaryOfKstDayIso(value, 23, 59);
}

export function addHoursIso(value: string, hours: number) {
  const date = new Date(value);
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function boundaryOfKstDayIso(value: string, hour: number, minute: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getKstDateParts(date);
  return kstWallTimeToIso(parts.year, parts.month, parts.day, hour, minute);
}

function getKstCalendarDate() {
  const parts = getKstDateParts(new Date());
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function getKstDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value)
  };
}

function kstWallTimeToIso(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0)).toISOString();
}
