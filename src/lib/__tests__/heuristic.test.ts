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

  it("understands open-ended and before-deadline availability in chat text", () => {
    const payload = heuristicExtract(
      [
        "조현준: 토요일 6시부터 가능",
        "배민: 토요일 7시 전까지 안됨",
        "김시현: 토요일 하루종일 가능"
      ].join("\n"),
      "kakao"
    );

    const candidate = payload.suggestions[0].candidate_start_at;
    expect(payload.classification).toBe("negotiating_event");
    expect(payload.suggestions[0].type).toBe("propose_time");
    expect(candidate).toBeTruthy();
    expect(kstHour(candidate!)).toBe(19);
  });

  it("keeps comma-separated open-ended ranges on the same weekday", () => {
    const payload = heuristicExtract(
      [
        "나: 토 2-4, 6- 가능",
        "친구: 토요일 7시부터 가능"
      ].join("\n"),
      "kakao"
    );
    const myConstraint = payload.time_constraints.find((constraint) => constraint.person === "나");

    expect(myConstraint?.available).toHaveLength(2);
    expect(kstHour(myConstraint!.available[0].start_at!)).toBe(14);
    expect(kstHour(myConstraint!.available[1].start_at!)).toBe(18);
    expect(kstHour(payload.suggestions[0].candidate_start_at!)).toBe(19);
  });
});

function kstHour(value: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      hour12: false
    }).format(new Date(value))
  );
}
