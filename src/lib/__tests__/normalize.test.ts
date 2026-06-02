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

  it("downgrades unsafe confirmed events without a valid start time", () => {
    const payload = normalizeExtraction({
      classification: "confirmed_event",
      confidence: 0.9,
      title: "팀 회의",
      assistant_message: "팀 회의로 등록할까요?",
      events: [
        {
          title: "팀 회의",
          start_at: "tomorrow afternoon",
          end_at: "2026-06-01T14:00:00+09:00",
          location: null,
          description: null,
          source_confidence: 0.9
        }
      ],
      suggestions: [
        {
          type: "register_event",
          message: "팀 회의로 등록할까요?",
          candidate_start_at: "not-a-date",
          candidate_end_at: null,
          risk: null
        }
      ],
      missing_fields: []
    });

    expect(payload.classification).toBe("needs_more_info");
    expect(payload.events).toEqual([]);
    expect(payload.suggestions[0]).toMatchObject({
      type: "ask_follow_up",
      candidate_start_at: null
    });
    expect(payload.missing_fields).toContain("날짜/시간");
  });

  it("nulls invalid date strings before negotiation enhancement", () => {
    const payload = normalizeExtraction({
      classification: "negotiating_event",
      confidence: 0.7,
      title: "회의 조율",
      time_constraints: [
        {
          person: "김시현",
          available: [
            {
              start_at: "bad-date",
              end_at: "also-bad",
              text: "토요일 오후 가능"
            }
          ],
          unavailable: []
        }
      ],
      suggestions: [
        {
          type: "propose_time",
          message: "토요일 오후는 어떤가요?",
          candidate_start_at: "bad-date",
          candidate_end_at: "also-bad",
          risk: null
        }
      ]
    });

    expect(payload.events).toEqual([]);
    expect(payload.time_constraints[0].available[0]).toMatchObject({
      start_at: null,
      end_at: null
    });
    expect(payload.suggestions[0]).toMatchObject({
      type: "ask_follow_up",
      candidate_start_at: null,
      candidate_end_at: null
    });
    expect(payload.missing_fields).toContain("최종 승인");
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

  it("adds multiple deterministic negotiation suggestions when the common window is long", () => {
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
              end_at: "2026-06-06T18:00:00+09:00",
              text: "토요일 2시부터 6시까지 가능"
            }
          ],
          unavailable: []
        },
        {
          person: "조현준",
          available: [
            {
              start_at: "2026-06-06T14:00:00+09:00",
              end_at: "2026-06-06T18:00:00+09:00",
              text: "토요일 2시부터 6시까지 가능"
            }
          ],
          unavailable: []
        }
      ],
      suggestions: []
    });

    const proposed = payload.suggestions.filter((suggestion) => suggestion.type === "propose_time");
    expect(proposed).toHaveLength(3);
  });

  it("deduplicates AI and deterministic proposals by candidate time", () => {
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
              end_at: "2026-06-06T18:00:00+09:00",
              text: "토요일 2시부터 6시까지 가능"
            }
          ],
          unavailable: []
        },
        {
          person: "조현준",
          available: [
            {
              start_at: "2026-06-06T14:00:00+09:00",
              end_at: "2026-06-06T18:00:00+09:00",
              text: "토요일 2시부터 6시까지 가능"
            }
          ],
          unavailable: []
        }
      ],
      suggestions: [
        {
          type: "propose_time",
          message: "AI가 낸 같은 후보",
          candidate_start_at: "2026-06-06T14:00:00+09:00",
          candidate_end_at: "2026-06-06T15:00:00+09:00",
          risk: null
        }
      ]
    });

    const proposed = payload.suggestions.filter((suggestion) => suggestion.type === "propose_time");
    expect(proposed).toHaveLength(3);
    expect(proposed.map((suggestion) => suggestion.candidate_start_at)).toEqual([
      "2026-06-06T05:00:00.000Z",
      "2026-06-06T06:00:00.000Z",
      "2026-06-06T07:00:00.000Z"
    ]);
  });
});
