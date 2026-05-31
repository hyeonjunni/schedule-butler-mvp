import { resolveOpenAIKey } from "./env";
import { heuristicExtract } from "./heuristic";
import { normalizeExtraction } from "./normalize";
import { getBaseDateKst } from "./time";
import type { ExtractionPayload, InputType } from "./types";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export async function extractSchedule(rawText: string, inputType: InputType): Promise<ExtractionPayload> {
  const key = await resolveOpenAIKey();
  if (!key) return heuristicExtract(rawText, inputType);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "gpt-4.1-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: buildSystemPrompt()
          },
          {
            role: "user",
            content: `입력 타입: ${inputType}\n기준 날짜: ${getBaseDateKst()} Asia/Seoul\n\n원문:\n${rawText}`
          }
        ]
      })
    });

    if (!response.ok) return heuristicExtract(rawText, inputType);
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return heuristicExtract(rawText, inputType);
    return normalizeExtraction(JSON.parse(content), "AI 일정 후보");
  } catch {
    return heuristicExtract(rawText, inputType);
  }
}

function buildSystemPrompt() {
  return `
너는 정제되지 않은 카톡, 이메일 원문, 통화 STT, 메모에서 일정을 추론하는 승인형 스케줄 비서다.
절대 설명 문장을 JSON 밖에 쓰지 말고, 오직 JSON 객체 하나만 반환한다.

핵심 규칙:
- 사용자 승인 전에는 확정 일정처럼 말하지 않는다.
- 시간이 조율 중이면 classification을 "negotiating_event"로 둔다.
- 날짜/시간/제목이 충분하면 "confirmed_event"로 둔다.
- 정보가 부족하면 "needs_more_info"로 둔다.
- TODO만 있으면 "todo_only"로 둔다.
- 일정 관련이 아니면 "not_schedule_related"로 둔다.
- 상대 표현은 기준 날짜와 Asia/Seoul 타임존으로 ISO 문자열에 정규화한다.
- 애매하거나 충돌하는 필드는 missing_fields 또는 suggestions[].risk에 적는다.
- 참석자별 가능/불가능 시간은 time_constraints에 넣는다.
- 미확정 회의는 바로 events에 확정 일정을 만들지 말고 suggestions에 제안 또는 추가 질문 초안을 넣는다.

반환 JSON shape:
{
  "classification": "confirmed_event | negotiating_event | needs_more_info | todo_only | not_schedule_related",
  "confidence": 0.0,
  "title": "짧은 제목",
  "assistant_message": "사용자에게 보여줄 승인/제안 메시지",
  "raw_summary": "원문 요약",
  "events": [
    {
      "title": "일정 제목",
      "start_at": "ISO string or null",
      "end_at": "ISO string or null",
      "location": "string or null",
      "description": "string or null",
      "source_confidence": 0.0
    }
  ],
  "todos": [
    {
      "text": "할 일",
      "due_at": "ISO string or null",
      "source_confidence": 0.0
    }
  ],
  "checklist": ["준비물 또는 확인사항"],
  "participants": ["이름"],
  "time_constraints": [
    {
      "person": "이름",
      "available": [{"start_at": "ISO or null", "end_at": "ISO or null", "text": "근거 원문"}],
      "unavailable": [{"start_at": "ISO or null", "end_at": "ISO or null", "text": "근거 원문"}]
    }
  ],
  "suggestions": [
    {
      "type": "register_event | propose_time | ask_follow_up | create_todo",
      "message": "승인받거나 상대에게 보낼 메시지",
      "candidate_start_at": "ISO string or null",
      "candidate_end_at": "ISO string or null",
      "risk": "string or null"
    }
  ],
  "missing_fields": ["부족한 정보"]
}`.trim();
}
