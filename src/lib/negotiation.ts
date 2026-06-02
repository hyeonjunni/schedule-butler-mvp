import type { Suggestion, TimeConstraint, TimeWindow } from "./types";
import { endOfKstDayIso } from "./time";

const DEFAULT_DURATION_MINUTES = 60;
const MIN_SLOT_MINUTES = 30;
const MAX_SUGGESTIONS = 3;

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
  return buildNegotiationSuggestions(constraints, durationMinutes)[0];
}

export function buildNegotiationSuggestions(
  constraints: TimeConstraint[],
  durationMinutes = DEFAULT_DURATION_MINUTES
): NegotiationResult[] {
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
    return [
      {
        candidate: null,
        suggestion: {
          type: "ask_follow_up",
          message: "Common available time is still unclear. Ask everyone for date and time ranges.",
          candidate_start_at: null,
          candidate_end_at: null,
          risk: "No concrete available time window was found."
        }
      }
    ];
  }

  const requiredPeople = peopleWithAvailability(constraints);
  const candidates = findCommonCandidates(availability, unavailable, requiredPeople, durationMinutes);
  if (candidates.length) {
    return candidates.slice(0, MAX_SUGGESTIONS).map((candidate, index) => {
      const window = intervalToWindow(candidate);
      return {
        candidate: window,
        suggestion: {
          type: "propose_time",
          message: `공통 가능 후보 ${index + 1}: ${formatWindow(window)}. 이 시간으로 제안할까요?`,
          candidate_start_at: window.start_at,
          candidate_end_at: window.end_at,
          risk: candidate.texts.length ? candidate.texts.join(" / ") : null
        }
      };
    });
  }

  const fallback = availability.sort((a, b) => a.start - b.start)[0];
  const fallbackWindow = intervalToWindow(fallback);
  const conflicts = conflictTexts(unavailable, fallback);

  return [
    {
      candidate: fallbackWindow,
      suggestion: {
        type: "ask_follow_up",
        message: `The closest candidate is ${formatWindow(fallbackWindow)}, but it may not work for everyone. Ask for another option.`,
        candidate_start_at: fallbackWindow.start_at,
        candidate_end_at: fallbackWindow.end_at,
        risk: conflicts.length
          ? conflicts.join(" / ")
          : "No slot satisfies every participant's available and unavailable windows."
      }
    }
  ];
}

export function enhanceNegotiationConstraints<T extends { time_constraints: TimeConstraint[]; suggestions: Suggestion[] }>(
  payload: T
): T {
  if (!payload.time_constraints.length) return payload;
  const suggestions = buildNegotiationSuggestions(payload.time_constraints).map((result) => result.suggestion);
  const hasGeneratedPropose = suggestions.some((item) => item.type === "propose_time");
  const hasConcreteSuggestion = payload.suggestions.some(
    (item) => item.candidate_start_at && item.type === "propose_time"
  );

  if (hasConcreteSuggestion && !hasGeneratedPropose) return payload;

  return {
    ...payload,
    suggestions: uniqueSuggestions([...suggestions, ...payload.suggestions])
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

    for (
      let slotStart = start;
      slotStart + durationMinutes * 60 * 1000 <= end;
      slotStart += durationMinutes * 60 * 1000
    ) {
      results.push({
        start: slotStart,
        end: slotStart + durationMinutes * 60 * 1000,
        people,
        texts: covering.map((interval) => interval.texts).flat()
      });
    }
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
  const end = parseDate(window.end_at) ?? parseDate(endOfKstDayIso(window.start_at!));
  if (end === null) return null;
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

function uniqueSuggestions(suggestions: Suggestion[]) {
  const seen = new Set<string>();
  let proposeCount = 0;
  return suggestions.filter((suggestion) => {
    if (suggestion.type === "propose_time" && suggestion.candidate_start_at) {
      if (proposeCount >= MAX_SUGGESTIONS) return false;
      proposeCount += 1;
    }
    const key = suggestion.candidate_start_at
      ? [suggestion.type, suggestion.candidate_start_at, suggestion.candidate_end_at ?? ""].join("|")
      : [suggestion.type, suggestion.message].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
