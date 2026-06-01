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

  return enhanceNegotiationConstraints(enforceContract(repairPastScheduleDates(normalized)));
}

function normalizeEvent(value: unknown): EventCandidate | null {
  if (!isRecord(value)) return null;
  const startAt = nullableDateString(value.start_at);
  const endAt = nullableDateString(value.end_at);
  return {
    title: stringValue(value.title, "일정"),
    start_at: startAt,
    end_at: isAfter(endAt, startAt) ? endAt : null,
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
    due_at: nullableDateString(value.due_at),
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
  const startAt = nullableDateString(record.start_at);
  const endAt = nullableDateString(record.end_at);
  return {
    start_at: startAt,
    end_at: isAfter(endAt, startAt) ? endAt : null,
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
    candidate_start_at: nullableDateString(record.candidate_start_at),
    candidate_end_at: nullableDateString(record.candidate_end_at),
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

function nullableDateString(value: unknown) {
  const text = nullableString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : text;
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

function enforceContract(payload: ExtractionPayload): ExtractionPayload {
  const cleaned = {
    ...payload,
    missing_fields: unique(payload.missing_fields),
    suggestions: payload.suggestions.map(repairSuggestion)
  };

  if (cleaned.classification === "not_schedule_related") {
    return {
      ...cleaned,
      events: [],
      time_constraints: [],
      suggestions: []
    };
  }

  if (cleaned.classification === "todo_only" && !cleaned.todos.length) {
    return withFollowUp(cleaned, ["TODO 내용"]);
  }

  if (cleaned.classification === "confirmed_event") {
    const concreteEvents = cleaned.events.filter((event) => event.start_at);
    if (!concreteEvents.length) {
      return withFollowUp(
        {
          ...cleaned,
          events: []
        },
        ["날짜", "시간"]
      );
    }
    return {
      ...cleaned,
      events: concreteEvents
    };
  }

  if (cleaned.classification === "negotiating_event") {
    if (!hasConcreteTimeConstraints(cleaned.time_constraints)) {
      return withFollowUp(
        {
          ...cleaned,
          events: []
        },
        ["참석자별 가능 시간"]
      );
    }
    return {
      ...cleaned,
      events: []
    };
  }

  if (cleaned.classification === "needs_more_info") {
    return {
      ...cleaned,
      events: []
    };
  }

  return cleaned;
}

function repairSuggestion(suggestion: Suggestion): Suggestion {
  const candidateEndAt = isAfter(suggestion.candidate_end_at, suggestion.candidate_start_at)
    ? suggestion.candidate_end_at
    : null;
  if ((suggestion.type === "register_event" || suggestion.type === "propose_time") && !suggestion.candidate_start_at) {
    return {
      ...suggestion,
      type: "ask_follow_up",
      candidate_end_at: null,
      risk: suggestion.risk ?? "후보 시간이 없어 바로 등록하거나 제안할 수 없습니다."
    };
  }

  return {
    ...suggestion,
    candidate_end_at: candidateEndAt
  };
}

function withFollowUp(payload: ExtractionPayload, missingFields: string[]): ExtractionPayload {
  const mergedMissingFields = unique([...payload.missing_fields, ...missingFields]);
  const hasAskFollowUp = payload.suggestions.some((suggestion) => suggestion.type === "ask_follow_up");
  return {
    ...payload,
    classification: "needs_more_info",
    missing_fields: mergedMissingFields,
    suggestions: hasAskFollowUp
      ? payload.suggestions
      : [
          {
            type: "ask_follow_up",
            message: `${mergedMissingFields.join(", ")} 정보가 더 필요합니다. 확인 메시지를 보낼까요?`,
            candidate_start_at: null,
            candidate_end_at: null,
            risk: "AI 응답이 저장 가능한 일정 계약을 만족하지 않았습니다."
          },
          ...payload.suggestions
        ]
  };
}

function hasConcreteTimeConstraints(constraints: TimeConstraint[]) {
  return constraints.some((constraint) =>
    [...constraint.available, ...constraint.unavailable].some((window) => window.start_at)
  );
}

function isAfter(value: string | null, baseline: string | null) {
  if (!value) return false;
  if (!baseline) return true;
  return new Date(value).getTime() > new Date(baseline).getTime();
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
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
