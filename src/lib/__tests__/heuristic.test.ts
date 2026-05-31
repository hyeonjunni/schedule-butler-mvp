import { describe, expect, it } from "vitest";
import { heuristicExtract } from "../heuristic";

describe("heuristicExtract", () => {
  it("classifies a meeting-time conversation as negotiating_event", () => {
    const payload = heuristicExtract(
      [
        "김시현: 토요일 2시부터 5시까지 가능",
        "조현준: 토요일 3시부터 6시까지 가능",
        "배민: 토요일 4시는 안돼요"
      ].join("\n"),
      "kakao"
    );

    expect(payload.classification).toBe("negotiating_event");
    expect(payload.events).toHaveLength(0);
    expect(payload.participants).toEqual(["김시현", "조현준", "배민"]);
    expect(payload.time_constraints).toHaveLength(3);
    expect(payload.suggestions[0].type).toBe("propose_time");
    expect(payload.suggestions[0].candidate_start_at).toBeTruthy();
  });

  it("classifies a concrete schedule as confirmed_event", () => {
    const payload = heuristicExtract(
      "내일 오후 3시에 강남역에서 팀 회의하자. 회의 자료도 확인해줘.",
      "memo"
    );

    expect(payload.classification).toBe("confirmed_event");
    expect(payload.events[0]?.title).toBe("회의");
    expect(payload.events[0]?.start_at).toBeTruthy();
    expect(payload.suggestions[0].type).toBe("register_event");
  });

  it("classifies plain work items as todo_only", () => {
    const payload = heuristicExtract("회의 자료 확인하고 예산안 작성해야 해", "memo");

    expect(payload.classification).toBe("todo_only");
    expect(payload.todos.map((todo) => todo.text)).toContain("회의 자료 확인하고 예산안 작성해야 해");
    expect(payload.suggestions[0].type).toBe("create_todo");
  });
});
