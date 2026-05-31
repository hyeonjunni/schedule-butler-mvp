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

  return enhanceNegotiationConstraints(repairPastScheduleDates(normalized));
}

function normalizeEvent(value: unknown): EventCandidate | null {
  if (!isRecord(value)) return null;
  return {
    title: stringValue(value.title, "일정"),
    start_at: nullableString(value.start_at),
    end_at: nullableString(value.end_at),
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
    due_at: nullableString(value.due_at),
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
  return {
    start_at: nullableString(record.start_at),
    end_at: nullableString(record.end_at),
    text: stringValue(record.text, "")
  };
}

function normalizeSuggestion(value: unknown): Suggestion {
  const record = isRecord(value) ? value : {};
  const allowed = ["register_event", "propose_time", "ask_follow_up", "create_todo"];
  const type = allowed.includes(String(record.type)) ? String(record.type) : "ask_follow_up";
  return {
    type: type as Suggestion["type"],
    message: stringValue(record.message, "추가 확인이 필요합니다."),
    candidate_start_at: nullableString(record.candidate_start_at),
    candidate_end_at: nullableString(record.candidate_end_at),
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

function clampNumber(value: unknown, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
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
