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
    expect(payload.events[0]).toMatchObject({
      title: "일정",
      start_at: null,
      end_at: null,
      location: "강남역",
      source_confidence: 0
    });
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
});
