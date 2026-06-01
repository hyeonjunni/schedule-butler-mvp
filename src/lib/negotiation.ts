import type { Suggestion, TimeConstraint, TimeWindow } from "./types";

const DEFAULT_DURATION_MINUTES = 60;
const MIN_SLOT_MINUTES = 30;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type Interval = {
  start: number;
  end: number;
  people: Set<string>;
  texts: string[];
};

export type NegotiationResult = {
  suggestion: Suggestion;
  candidate: TimeWindow | null;
};

export function buildNegotiationSuggestion(
  constraints: TimeConstraint[],
  durationMinutes = DEFAULT_DURATION_MINUTES
): NegotiationResult {
  const availability = constraints.flatMap((constraint) =>
    constraint.available.flatMap((window) => {
      const interval = toInterval(window, constraint.person);
      return interval ? [interval] : [];
    })
  );
  const unavailable = constraints.flatMap((constraint) =>
    constraint.unavailable.flatMap((window) => {
      const interval = toInterval(window, constraint.person);
      return interval ? [interval] : [];
    })
  );

  if (!availability.length) {
    return {
      candidate: null,
      suggestion: {
        type: "ask_follow_up",
        message: "아직 공통 가능 시간이 명확하지 않습니다. 참석자들에게 날짜와 시간 범위를 다시 물어보세요.",
        candidate_start_at: null,
        candidate_end_at: null,
        risk: "구체적인 가능 시간 창을 찾지 못했습니다."
      }
    };
  }

  const requiredPeople = peopleWithAvailability(constraints);
  const candidates = findCommonCandidates(availability, unavailable, requiredPeople, durationMinutes);
  const candidate = candidates[0] ?? null;

  if (candidate) {
    const window = intervalToWindow(candidate);
    const alternatives = candidates.slice(1, 3).map(intervalToWindow);
    const alternativeText = alternatives.length
      ? ` 대안: ${alternatives.map(formatWindow).join(", ")}.`
      : "";
    return {
      candidate: window,
      suggestion: {
        type: "propose_time",
        message: `공통 후보는 ${formatWindow(window)}입니다.${alternativeText} 이 시간으로 제안할까요?`,
        candidate_start_at: window.start_at,
        candidate_end_at: window.end_at,
        risk: buildRisk(candidate.texts)
      }
    };
  }

  const fallback = availability.sort((a, b) => a.start - b.start)[0];
  const fallbackWindow = intervalToWindow(fallback);
  const conflicts = conflictTexts(unavailable, fallback);

  return {
    candidate: fallbackWindow,
    suggestion: {
      type: "ask_follow_up",
      message: `가장 가까운 후보는 ${formatWindow(fallbackWindow)}이지만 모두에게 맞지 않을 수 있습니다. 다른 시간을 물어보세요.`,
      candidate_start_at: fallbackWindow.start_at,
      candidate_end_at: fallbackWindow.end_at,
      risk: conflicts.length
        ? conflicts.join(" / ")
        : "모든 참석자의 가능/불가능 시간을 동시에 만족하는 후보가 없습니다."
    }
  };
}

export function enhanceNegotiationConstraints<T extends { time_constraints: TimeConstraint[]; suggestions: Suggestion[] }>(
  payload: T
): T {
  if (!payload.time_constraints.length) return payload;
  const { suggestion } = buildNegotiationSuggestion(payload.time_constraints);
  const hasConcreteSuggestion = payload.suggestions.some(
    (item) => item.candidate_start_at && item.type === "propose_time"
  );

  if (hasConcreteSuggestion && suggestion.type !== "propose_time") return payload;

  return {
    ...payload,
    suggestions: [suggestion, ...payload.suggestions.filter((item) => item.message !== suggestion.message)]
  };
}

function findCommonCandidates(
  availability: Interval[],
  unavailable: Interval[],
  requiredPeople: Set<string>,
  durationMinutes: number
) {
  const points = [
    ...new Set(
      [...availability, ...unavailable].flatMap((interval) => [interval.start, interval.end])
    )
  ].sort((a, b) => a - b);
  const minDuration = Math.max(MIN_SLOT_MINUTES, durationMinutes);
  const results: Interval[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end - start < minDuration * 60 * 1000) continue;

    const covering = availability.filter((interval) => interval.start <= start && interval.end >= end);
    const people = new Set(covering.map((interval) => interval.people).flatMap((set) => [...set]));
    if (!isSuperset(people, requiredPeople)) continue;

    const blocked = unavailable.filter((interval) => overlaps(interval, { start, end, people, texts: [] }));
    if (blocked.length) continue;

    results.push({
      start,
      end: start + durationMinutes * 60 * 1000 <= end ? start + durationMinutes * 60 * 1000 : end,
      people,
      texts: covering.map((interval) => interval.texts).flat()
    });
  }

  return mergeAdjacent(results);
}

function peopleWithAvailability(constraints: TimeConstraint[]) {
  return new Set(
    constraints
      .filter((constraint) => constraint.available.some((window) => window.start_at))
      .map((constraint) => constraint.person)
  );
}

function toInterval(window: TimeWindow, person: string): Interval | null {
  const start = parseDate(window.start_at);
  if (start === null) return null;
  const end =
    parseDate(window.end_at) ??
    inferOpenEndedEnd(start, window.text) ??
    start + DEFAULT_DURATION_MINUTES * 60 * 1000;
  if (end <= start) return null;
  return {
    start,
    end,
    people: new Set([person]),
    texts: window.text ? [`${person}: ${window.text}`] : []
  };
}

function parseDate(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function isSuperset<T>(source: Set<T>, required: Set<T>) {
  for (const item of required) {
    if (!source.has(item)) return false;
  }
  return true;
}

function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

function mergeAdjacent(intervals: Interval[]) {
  return intervals.sort((a, b) => a.start - b.start);
}

function inferOpenEndedEnd(start: number, text: string) {
  if (!hasOpenEndedExpression(text)) return null;
  const kstDate = new Date(start + KST_OFFSET_MS);
  return Date.UTC(
    kstDate.getUTCFullYear(),
    kstDate.getUTCMonth(),
    kstDate.getUTCDate(),
    14,
    59,
    59,
    999
  );
}

function buildRisk(texts: string[]) {
  const notes = [...texts];
  if (texts.some(hasOpenEndedExpression)) {
    notes.push("끝 시간이 없는 표현은 해당 날짜 끝까지 가능한 것으로 해석했습니다.");
  }
  if (texts.some(hasAmbiguousMeridiem)) {
    notes.push("오전/오후가 생략된 시간 표현은 추정값이므로 확인이 필요합니다.");
  }
  return notes.length ? notes.join(" / ") : null;
}

function hasOpenEndedExpression(text: string) {
  return (
    /(부터|이후|이상|뒤|후부터)/.test(text) ||
    /\d{1,2}\s*(?:시)?\s*[-~–]\s*(?:$|[,，\s]|[A-Za-z가-힣])/.test(text)
  );
}

function hasAmbiguousMeridiem(text: string) {
  if (/(오전|오후|저녁|밤|새벽|정오|자정)/.test(text)) return false;
  return /(?:^|[^\d])(?:1[0-2]|[1-9])\s*(?:시|[-~–]|부터|까지|전|후|,|$)/.test(text);
}

function intervalToWindow(interval: Interval): TimeWindow {
  return {
    start_at: new Date(interval.start).toISOString(),
    end_at: new Date(interval.end).toISOString(),
    text: formatWindow({
      start_at: new Date(interval.start).toISOString(),
      end_at: new Date(interval.end).toISOString(),
      text: ""
    })
  };
}

function conflictTexts(unavailable: Interval[], candidate: Interval) {
  return unavailable
    .filter((interval) => overlaps(interval, candidate))
    .flatMap((interval) => interval.texts)
    .slice(0, 4);
}

function formatWindow(window: TimeWindow) {
  const start = formatDate(window.start_at);
  const end = formatDate(window.end_at);
  return end ? `${start} - ${end}` : start;
}

function formatDate(value: string | null) {
  if (!value) return "time TBD";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
