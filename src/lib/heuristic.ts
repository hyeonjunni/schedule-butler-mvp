import { addHoursIso, getBaseDateKst, nextWeekdayIso } from "./time";
import { recommendChecklist } from "./checklist";
import { buildNegotiationSuggestion } from "./negotiation";
import type { ExtractionPayload, InputType, TimeConstraint, TimeWindow } from "./types";

const unavailablePattern = /(안\s*돼|안됨|안되|불가|못|어렵|애매)/;
const availablePattern = /(가능|괜찮|됩니다|돼요|됩니다|할게|하자)/;

export function heuristicExtract(rawText: string, inputType: InputType): ExtractionPayload {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const speakerLines = parseSpeakerLines(lines);
  const participants = [...new Set(speakerLines.map((line) => line.person))];
  const hasNegotiationSignals =
    /(가능|안\s*돼|안됨|안되|불가|괜찮|시간|언제|주말|토요일|일요일|회의)/.test(rawText) &&
    (participants.length > 1 || /(몇\s*시|가능한\s*시간|시간\s*잡)/.test(rawText));
  const hasTodoSignals = /(해야|할\s*일|준비|챙겨|체크|보내|작성)/.test(rawText);

  if (hasNegotiationSignals) {
    const constraints = buildConstraints(speakerLines);
    const suggestion = buildNegotiationSuggestion(constraints).suggestion;
    return {
      classification: "negotiating_event",
      confidence: 0.64,
      title: inferTitle(rawText, "회의 시간 조율"),
      assistant_message: suggestion.message,
      raw_summary: "참석자들이 가능한 시간과 어려운 시간을 주고받는 일정 조율 대화로 보입니다.",
      events: [],
      todos: [],
      checklist: inferChecklist(rawText),
      participants,
      time_constraints: constraints,
      suggestions: [suggestion],
      missing_fields: suggestion.candidate_start_at ? ["최종 승인"] : ["확정 시간"]
    };
  }

  const event = inferConfirmedEvent(rawText);
  if (event) {
    return {
      classification: "confirmed_event",
      confidence: 0.6,
      title: event.title,
      assistant_message: `${event.title} 일정으로 등록할까요?`,
      raw_summary: "날짜와 시간 표현이 포함된 일정 후보입니다.",
      events: [event],
      todos: inferTodos(rawText),
      checklist: inferChecklist(rawText),
      participants,
      time_constraints: [],
      suggestions: [
        {
          type: "register_event",
          message: `${event.title} 일정으로 등록할까요?`,
          candidate_start_at: event.start_at,
          candidate_end_at: event.end_at,
          risk: event.start_at ? null : "시간이 완전히 정규화되지 않았습니다."
        }
      ],
      missing_fields: event.start_at ? [] : ["정확한 시간"]
    };
  }

  if (hasTodoSignals) {
    return {
      classification: "todo_only",
      confidence: 0.55,
      title: "TODO 후보",
      assistant_message: "일정보다는 TODO에 가까워 보입니다. 목록으로 저장할까요?",
      raw_summary: "해야 할 일이나 준비물이 포함된 입력입니다.",
      events: [],
      todos: inferTodos(rawText),
      checklist: inferChecklist(rawText),
      participants,
      time_constraints: [],
      suggestions: [
        {
          type: "create_todo",
          message: "TODO 목록으로 저장할까요?",
          candidate_start_at: null,
          candidate_end_at: null,
          risk: null
        }
      ],
      missing_fields: []
    };
  }

  return {
    classification: "needs_more_info",
    confidence: 0.45,
    title: inputType === "email" ? "이메일 일정 후보" : "일정 후보",
    assistant_message: "일정으로 등록하려면 날짜나 시간이 더 필요합니다. 상대에게 확인 메시지를 보낼까요?",
    raw_summary: "일정 관련 정보가 부족합니다.",
    events: [],
    todos: [],
    checklist: [],
    participants,
    time_constraints: [],
    suggestions: [
      {
        type: "ask_follow_up",
        message: "가능한 날짜와 시간을 다시 확인해볼까요?",
        candidate_start_at: null,
        candidate_end_at: null,
        risk: "날짜 또는 시간이 부족합니다."
      }
    ],
    missing_fields: ["날짜", "시간"]
  };
}

function parseSpeakerLines(lines: string[]) {
  return lines.map((line, index) => {
    const colon = line.match(/^([^:：]{1,24})[:：]\s*(.+)$/);
    if (colon) return { person: colon[1].trim(), text: colon[2].trim() };
    const spaced = line.match(/^([가-힣A-Za-z0-9_\s]{2,18})\s{1,}(.+)$/);
    if (spaced && index > 0) return { person: spaced[1].trim(), text: spaced[2].trim() };
    return { person: index === 0 ? "사용자" : "상대", text: line };
  });
}

function buildConstraints(lines: Array<{ person: string; text: string }>): TimeConstraint[] {
  const grouped = new Map<string, { available: TimeWindow[]; unavailable: TimeWindow[] }>();
  for (const line of lines) {
    const current = grouped.get(line.person) ?? { available: [], unavailable: [] };
    const windows = parseTimeWindows(line.text);
    const fallbackWindow = { start_at: null, end_at: null, text: line.text };
    if (unavailablePattern.test(line.text)) {
      current.unavailable.push(...(windows.length ? windows : [fallbackWindow]));
    } else if (availablePattern.test(line.text)) {
      current.available.push(...(windows.length ? windows : [fallbackWindow]));
    }
    grouped.set(line.person, current);
  }

  return [...grouped.entries()].map(([person, value]) => ({
    person,
    available: value.available,
    unavailable: value.unavailable
  }));
}

function parseTimeWindows(text: string): TimeWindow[] {
  const day = inferDay(text);
  if (day === null) return [];
  const results: TimeWindow[] = [];
  const rangePattern = /(?:(오전|오후|저녁|밤)\s*)?(\d{1,2})\s*(?:시)?\s*(?:부터|~|-|–|까지)\s*(?:(오전|오후|저녁|밤)\s*)?(\d{1,2})?\s*시?/g;
  const singlePattern = /(?:(오전|오후|저녁|밤)\s*)?(\d{1,2})\s*시/g;

  for (const match of text.matchAll(rangePattern)) {
    const startHour = normalizeHour(Number(match[2]), match[1] ?? match[3] ?? text);
    const endHour = match[4] ? normalizeHour(Number(match[4]), match[3] ?? match[1] ?? text) : null;
    const start = nextWeekdayIso(day, startHour);
    results.push({
      start_at: start,
      end_at: endHour === null ? null : nextWeekdayIso(day, endHour),
      text
    });
  }

  if (results.length) return results;

  for (const match of text.matchAll(singlePattern)) {
    const hour = normalizeHour(Number(match[2]), match[1] ?? text);
    const start = nextWeekdayIso(day, hour);
    results.push({
      start_at: start,
      end_at: addHoursIso(start, 1),
      text
    });
  }

  return results;
}

function inferDay(text: string) {
  if (/토요일|토\b|토\s/.test(text)) return 6;
  if (/일요일|일\b|일\s/.test(text)) return 0;
  if (/금요일|금\b|금\s/.test(text)) return 5;
  if (/목요일|목\b|목\s/.test(text)) return 4;
  if (/수요일|수\b|수\s/.test(text)) return 3;
  if (/화요일|화\b|화\s/.test(text)) return 2;
  if (/월요일|월\b|월\s/.test(text)) return 1;
  if (/주말/.test(text)) return 6;
  if (/내일/.test(text)) return (new Date(`${getBaseDateKst()}T00:00:00+09:00`).getDay() + 1) % 7;
  return null;
}

function normalizeHour(hour: number, context: string) {
  if (/오전/.test(context)) return hour === 12 ? 0 : hour;
  if (/오후|저녁|밤/.test(context)) return hour < 12 ? hour + 12 : hour;
  if (hour >= 1 && hour <= 8) return hour + 12;
  return hour;
}

function buildSuggestion(constraints: TimeConstraint[]) {
  const concrete = constraints.flatMap((constraint) =>
    constraint.available
      .filter((window) => window.start_at)
      .map((window) => ({ person: constraint.person, window }))
  );
  const candidate = concrete.sort((a, b) =>
    String(a.window.start_at).localeCompare(String(b.window.start_at))
  )[0];

  if (!candidate) {
    return {
      type: "ask_follow_up" as const,
      message:
        "공통 가능 시간이 아직 명확하지 않습니다. 가능한 날짜와 시간을 한 번에 다시 받아보는 메시지를 보낼까요?",
      candidate_start_at: null,
      candidate_end_at: null,
      risk: "구체적인 시작 시간이 부족합니다."
    };
  }

  const conflictTexts = constraints.flatMap((constraint) =>
    constraint.unavailable
      .filter((window) => sameDay(window.start_at, candidate.window.start_at))
      .map((window) => `${constraint.person}: ${window.text}`)
  );

  return {
    type: conflictTexts.length ? ("ask_follow_up" as const) : ("propose_time" as const),
    message: conflictTexts.length
      ? `${candidate.window.text}가 후보지만 일부 조건과 충돌할 수 있습니다. 이 시간대로 다시 확인해볼까요?`
      : `${candidate.window.text}가 가장 빠른 후보로 보입니다. 이 시간은 어떤가요?`,
    candidate_start_at: candidate.window.start_at,
    candidate_end_at: candidate.window.end_at,
    risk: conflictTexts.length ? conflictTexts.join(" / ") : null
  };
}

function sameDay(a: string | null, b: string | null) {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

function inferConfirmedEvent(text: string) {
  const windows = parseTimeWindows(text);
  const hasDate = /(오늘|내일|모레|월요일|화요일|수요일|목요일|금요일|토요일|일요일|주말)/.test(text);
  const hasScheduleWord = /(회의|미팅|약속|일정|만나|콜|통화|방문)/.test(text);
  if (!hasDate || !hasScheduleWord) return null;
  const start = windows[0]?.start_at ?? null;
  return {
    title: inferTitle(text, "일정"),
    start_at: start,
    end_at: windows[0]?.end_at ?? (start ? addHoursIso(start, 1) : null),
    location: inferLocation(text),
    description: text.slice(0, 500),
    source_confidence: start ? 0.66 : 0.5
  };
}

function inferTitle(text: string, fallback: string) {
  if (/회의/.test(text)) return "회의";
  if (/미팅/.test(text)) return "미팅";
  if (/통화|콜/.test(text)) return "통화";
  if (/면접/.test(text)) return "면접";
  return fallback;
}

function inferLocation(text: string) {
  const match = text.match(/([가-힣A-Za-z0-9\s]{2,24})(?:에서|로|으로)\s*(?:회의|미팅|만나|방문)/);
  return match ? match[1].trim() : null;
}

function inferTodos(text: string) {
  const todos = text
    .split(/[.\n]/)
    .map((line) => line.trim())
    .filter((line) => /(해야|보내|작성|준비|챙겨|확인)/.test(line))
    .slice(0, 5)
    .map((line) => ({ text: line, due_at: null, source_confidence: 0.55 }));
  return todos;
}

function inferChecklist(text: string) {
  return recommendChecklist(text);
}
