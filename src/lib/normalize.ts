import type {
  Classification,
  EventCandidate,
  ExtractionPayload,
  Suggestion,
  TimeConstraint,
  TodoCandidate
} from "./types";
import { enhanceNegotiationConstraints } from "./negotiation";

const classifications: Classification[] = [
  "confirmed_event",
  "negotiating_event",
  "needs_more_info",
  "todo_only",
  "not_schedule_related"
];
const suggestionTypes: Suggestion["type"][] = [
  "register_event",
  "propose_time",
  "ask_follow_up",
  "create_todo"
];

export function normalizeExtraction(input: unknown, fallbackTitle = "일정 후보"): ExtractionPayload {
  const source = isRecord(input) ? input : {};
  const classification = classifications.includes(source.classification as Classification)
    ? (source.classification as Classification)
    : "needs_more_info";

  const normalized: ExtractionPayload = {
    classification,
    confidence: clampNumber(source.confidence, 0.55),
    title: stringValue(source.title, fallbackTitle),
    assistant_message: stringValue(
      source.assistant_message,
      "추론한 내용을 확인한 뒤 승인해 주세요."
    ),
    raw_summary: stringValue(source.raw_summary, ""),
    events: arrayValue(source.events).map(normalizeEvent).filter(Boolean) as EventCandidate[],
    todos: arrayValue(source.todos).map(normalizeTodo).filter(Boolean) as TodoCandidate[],
    checklist: arrayValue(source.checklist)
      .map((item) => stringValue(item, ""))
      .filter(Boolean),
    participants: arrayValue(source.participants)
      .map((item) => stringValue(item, ""))
      .filter(Boolean),
    time_constraints: arrayValue(source.time_constraints).map(normalizeConstraint),
    suggestions: arrayValue(source.suggestions).map(normalizeSuggestion),
    missing_fields: arrayValue(source.missing_fields)
      .map((item) => stringValue(item, ""))
      .filter(Boolean)
  };

  return enforceSchemaRules(enhanceNegotiationConstraints(repairPastScheduleDates(normalized)));
}

function normalizeEvent(value: unknown): EventCandidate | null {
  if (!isRecord(value)) return null;
  const startAt = nullableIsoString(value.start_at);
  const endAt = normalizeEndAt(startAt, nullableIsoString(value.end_at));
  return {
    title: stringValue(value.title, "일정"),
    start_at: startAt,
    end_at: endAt,
    location: nullableString(value.location),
    description: nullableString(value.description),
    source_confidence: clampNumber(value.source_confidence, 0.7)
  };
}

function normalizeTodo(value: unknown): TodoCandidate | null {
  if (!isRecord(value)) {
    const text = stringValue(value, "");
    return text ? { text, due_at: null, source_confidence: 0.6 } : null;
  }
  return {
    text: stringValue(value.text, "할 일"),
    due_at: nullableIsoString(value.due_at),
    source_confidence: clampNumber(value.source_confidence, 0.7)
  };
}

function normalizeConstraint(value: unknown): TimeConstraint {
  const record = isRecord(value) ? value : {};
  return {
    person: stringValue(record.person, "미상"),
    available: arrayValue(record.available).map(normalizeWindow),
    unavailable: arrayValue(record.unavailable).map(normalizeWindow)
  };
}

function normalizeWindow(value: unknown) {
  const record = isRecord(value) ? value : {};
  const startAt = nullableIsoString(record.start_at);
  const endAt = normalizeEndAt(startAt, nullableIsoString(record.end_at));
  return {
    start_at: startAt,
    end_at: endAt,
    text: stringValue(record.text, "")
  };
}

function normalizeSuggestion(value: unknown): Suggestion {
  const record = isRecord(value) ? value : {};
  const type = suggestionTypes.includes(record.type as Suggestion["type"])
    ? (record.type as Suggestion["type"])
    : "ask_follow_up";
  const candidateStartAt = nullableIsoString(record.candidate_start_at);
  const candidateEndAt = normalizeEndAt(candidateStartAt, nullableIsoString(record.candidate_end_at));
  return {
    type,
    message: stringValue(record.message, "추가 확인이 필요합니다."),
    candidate_start_at: candidateStartAt,
    candidate_end_at: candidateEndAt,
    risk: nullableString(record.risk)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableIsoString(value: unknown) {
  const text = nullableString(value);
  if (!text) return null;
  return Number.isNaN(new Date(text).getTime()) ? null : text;
}

function normalizeEndAt(startAt: string | null, endAt: string | null) {
  if (!endAt) return null;
  if (!startAt) return endAt;
  return new Date(endAt).getTime() > new Date(startAt).getTime() ? endAt : null;
}

function clampNumber(value: unknown, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function enforceSchemaRules(payload: ExtractionPayload): ExtractionPayload {
  const normalized: ExtractionPayload = {
    ...payload,
    checklist: uniqueStrings(payload.checklist),
    participants: uniqueStrings(payload.participants),
    missing_fields: uniqueStrings(payload.missing_fields),
    time_constraints: payload.time_constraints.filter(
      (constraint) => constraint.available.length || constraint.unavailable.length
    )
  };

  if (normalized.classification === "confirmed_event") {
    const validEvents = normalized.events.filter((event) => event.title && event.start_at);
    if (validEvents.length) return { ...normalized, events: validEvents };
    return {
      ...normalized,
      classification: "needs_more_info",
      events: [],
      assistant_message: "날짜와 시간이 부족해서 바로 등록할 수 없습니다. 추가 확인이 필요합니다.",
      suggestions: ensureAskFollowUp(
        normalized.suggestions,
        "일정으로 등록하려면 정확한 날짜와 시간을 먼저 확인해야 합니다.",
        "confirmed_event 응답에 유효한 start_at이 없습니다."
      ),
      missing_fields: uniqueStrings([...normalized.missing_fields, "날짜/시간"])
    };
  }

  if (normalized.classification === "negotiating_event") {
    return {
      ...normalized,
      events: [],
      missing_fields: uniqueStrings([...normalized.missing_fields, "최종 승인"])
    };
  }

  if (normalized.classification === "todo_only" || normalized.classification === "not_schedule_related") {
    return { ...normalized, events: [] };
  }

  return normalized;
}

function ensureAskFollowUp(suggestions: Suggestion[], message: string, risk: string): Suggestion[] {
  if (suggestions.some((suggestion) => suggestion.type === "ask_follow_up")) return suggestions;
  const followUp: Suggestion = {
    type: "ask_follow_up",
    message,
    candidate_start_at: null,
    candidate_end_at: null,
    risk
  };
  return [
    followUp,
    ...suggestions
  ];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function repairPastScheduleDates(payload: ExtractionPayload): ExtractionPayload {
  return {
    ...payload,
    events: payload.events.map((event) => ({
      ...event,
      start_at: pushFuture(event.start_at),
      end_at: pushFuture(event.end_at)
    })),
    todos: payload.todos.map((todo) => ({ ...todo, due_at: pushFuture(todo.due_at) })),
    time_constraints: payload.time_constraints.map((constraint) => ({
      ...constraint,
      available: constraint.available.map((window) => ({
        ...window,
        start_at: pushFuture(window.start_at),
        end_at: pushFuture(window.end_at)
      })),
      unavailable: constraint.unavailable.map((window) => ({
        ...window,
        start_at: pushFuture(window.start_at),
        end_at: pushFuture(window.end_at)
      }))
    })),
    suggestions: payload.suggestions.map((suggestion) => ({
      ...suggestion,
      candidate_start_at: pushFuture(suggestion.candidate_start_at),
      candidate_end_at: pushFuture(suggestion.candidate_end_at)
    }))
  };
}

function pushFuture(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  while (date.getTime() < now.getTime() - 12 * 60 * 60 * 1000) {
    date.setDate(date.getDate() + 7);
  }
  return date.toISOString();
}
