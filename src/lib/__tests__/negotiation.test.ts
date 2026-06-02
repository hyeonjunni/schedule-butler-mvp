import { describe, expect, it } from "vitest";
import { buildNegotiationSuggestion } from "../negotiation";
import type { TimeConstraint } from "../types";

describe("buildNegotiationSuggestion", () => {
  it("finds an overlapping slot and subtracts unavailable windows", () => {
    const constraints: TimeConstraint[] = [
      {
        person: "김시현",
        available: [
          {
            start_at: "2026-06-06T14:00:00+09:00",
            end_at: "2026-06-06T17:00:00+09:00",
            text: "토요일 2시부터 5시까지 가능"
          }
        ],
        unavailable: []
      },
      {
        person: "조현준",
        available: [
          {
            start_at: "2026-06-06T15:00:00+09:00",
            end_at: "2026-06-06T18:00:00+09:00",
            text: "토요일 3시부터 6시까지 가능"
          }
        ],
        unavailable: []
      },
      {
        person: "배민",
        available: [],
        unavailable: [
          {
            start_at: "2026-06-06T16:00:00+09:00",
            end_at: "2026-06-06T17:00:00+09:00",
            text: "토요일 4시는 안돼요"
          }
        ]
      }
    ];

    const result = buildNegotiationSuggestion(constraints);

    expect(result.suggestion.type).toBe("propose_time");
    expect(result.suggestion.candidate_start_at).toBe("2026-06-06T06:00:00.000Z");
    expect(result.suggestion.candidate_end_at).toBe("2026-06-06T07:00:00.000Z");
    expect(result.suggestion.risk).toContain("김시현");
    expect(result.suggestion.risk).toContain("조현준");
  });

  it("asks a follow-up when no common slot satisfies everyone", () => {
    const constraints: TimeConstraint[] = [
      {
        person: "김시현",
        available: [
          {
            start_at: "2026-06-06T14:00:00+09:00",
            end_at: "2026-06-06T15:00:00+09:00",
            text: "토요일 2시 가능"
          }
        ],
        unavailable: []
      },
      {
        person: "조현준",
        available: [
          {
            start_at: "2026-06-06T16:00:00+09:00",
            end_at: "2026-06-06T17:00:00+09:00",
            text: "토요일 4시 가능"
          }
        ],
        unavailable: []
      }
    ];

    const result = buildNegotiationSuggestion(constraints);

    expect(result.suggestion.type).toBe("ask_follow_up");
    expect(result.suggestion.risk).toContain("No slot satisfies");
  });

  it("treats open-ended windows as available until the end of that KST day", () => {
    const constraints: TimeConstraint[] = [
      {
        person: "조현준",
        available: [
          {
            start_at: "2026-06-06T18:00:00+09:00",
            end_at: null,
            text: "토요일 6시부터 가능"
          }
        ],
        unavailable: []
      },
      {
        person: "김시현",
        available: [
          {
            start_at: "2026-06-06T19:00:00+09:00",
            end_at: "2026-06-06T21:00:00+09:00",
            text: "토요일 7시부터 9시까지 가능"
          }
        ],
        unavailable: []
      }
    ];

    const result = buildNegotiationSuggestion(constraints);

    expect(result.suggestion.type).toBe("propose_time");
    expect(result.suggestion.candidate_start_at).toBe("2026-06-06T10:00:00.000Z");
    expect(result.suggestion.candidate_end_at).toBe("2026-06-06T11:00:00.000Z");
  });
});
