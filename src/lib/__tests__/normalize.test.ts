import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "../normalize";

describe("normalizeExtraction", () => {
  it("sanitizes invalid AI payload fields into the app contract", () => {
    const payload = normalizeExtraction(
      {
        classification: "calendar_event",
        confidence: 7,
        title: "",
        events: [
          {
            title: "",
            start_at: "",
            end_at: 123,
            location: "강남역",
            description: null,
            source_confidence: -3
          }
        ],
        todos: ["자료 보내기", { text: "", due_at: null }],
        checklist: ["노트북", "", 42],
        participants: ["김시현", ""],
        suggestions: [{ type: "unknown", message: "" }],
        missing_fields: ["시간", ""]
      },
      "fallback title"
    );

    expect(payload.classification).toBe("needs_more_info");
    expect(payload.confidence).toBe(1);
    expect(payload.title).toBe("fallback title");
    expect(payload.events).toEqual([]);
    expect(payload.todos.map((todo) => todo.text)).toEqual(["자료 보내기", "할 일"]);
    expect(payload.checklist).toEqual(["노트북"]);
    expect(payload.participants).toEqual(["김시현"]);
    expect(payload.suggestions[0]).toMatchObject({
      type: "ask_follow_up",
      message: "추가 확인이 필요합니다."
    });
    expect(payload.missing_fields).toEqual(["시간"]);
  });

  it("adds a deterministic negotiation suggestion when AI omits suggestions", () => {
    const payload = normalizeExtraction({
      classification: "negotiating_event",
      confidence: 0.8,
      title: "회의 조율",
      time_constraints: [
        {
          person: "김시현",
          available: [
            {
              start_at: "2026-06-06T14:00:00+09:00",
              end_at: "2026-06-06T16:00:00+09:00",
              text: "토요일 2시부터 4시 가능"
            }
          ],
          unavailable: []
        },
        {
          person: "조현준",
          available: [
            {
              start_at: "2026-06-06T15:00:00+09:00",
              end_at: "2026-06-06T17:00:00+09:00",
              text: "토요일 3시부터 5시 가능"
            }
          ],
          unavailable: []
        }
      ],
      suggestions: []
    });

    expect(payload.suggestions[0].type).toBe("propose_time");
    expect(payload.suggestions[0].candidate_start_at).toBeTruthy();
  });

  it("downgrades confirmed events with invalid or missing dates before they can be saved", () => {
    const payload = normalizeExtraction({
      classification: "confirmed_event",
      confidence: 0.9,
      title: "팀 회의",
      events: [
        {
          title: "팀 회의",
          start_at: "not-a-date",
          end_at: "2026-06-01T14:00:00+09:00",
          location: "강남역",
          description: "날짜가 깨진 AI 응답",
          source_confidence: 0.9
        }
      ],
      suggestions: [
        {
          type: "register_event",
          message: "등록할까요?",
          candidate_start_at: "not-a-date",
          candidate_end_at: "2026-06-01T14:00:00+09:00"
        }
      ]
    });

    expect(payload.classification).toBe("needs_more_info");
    expect(payload.events).toEqual([]);
    expect(payload.missing_fields).toContain("날짜");
    expect(payload.missing_fields).toContain("시간");
    expect(payload.suggestions[0].type).toBe("ask_follow_up");
    expect(payload.suggestions[0].candidate_start_at).toBeNull();
  });

  it("prevents negotiating payloads from carrying event rows and asks for constraints when missing", () => {
    const payload = normalizeExtraction({
      classification: "negotiating_event",
      confidence: 0.7,
      title: "회의 조율",
      events: [
        {
          title: "회의",
          start_at: "2026-06-06T19:00:00+09:00",
          end_at: "2026-06-06T20:00:00+09:00",
          source_confidence: 0.7
        }
      ],
      time_constraints: [],
      suggestions: [
        {
          type: "propose_time",
          message: "토요일 7시는 어떤가요?",
          candidate_start_at: "2026-06-06T19:00:00+09:00",
          candidate_end_at: "2026-06-06T18:00:00+09:00"
        }
      ]
    });

    expect(payload.classification).toBe("needs_more_info");
    expect(payload.events).toEqual([]);
    expect(payload.missing_fields).toContain("참석자별 가능 시간");
    expect(payload.suggestions[0].candidate_end_at).toBeNull();
  });
});
