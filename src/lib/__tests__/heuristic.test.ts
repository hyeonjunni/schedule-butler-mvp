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

  it("expands open-ended shorthand and until-before constraints in negotiations", () => {
    const payload = heuristicExtract(
      [
        "나: 토 2-4, 6- 가능",
        "조현준: 토요일 7시 이후 가능",
        "배민: 토요일 7시 전까지 안됨"
      ].join("\n"),
      "kakao"
    );

    const myConstraint = payload.time_constraints.find((constraint) => constraint.person === "나");
    const baeminConstraint = payload.time_constraints.find((constraint) => constraint.person === "배민");
    const openEnded = myConstraint?.available[1];
    const unavailableUntilSeven = baeminConstraint?.unavailable[0];

    expect(payload.classification).toBe("negotiating_event");
    expect(openEnded?.end_at).toBeTruthy();
    expect(
      new Date(openEnded!.end_at!).getTime() - new Date(openEnded!.start_at!).getTime()
    ).toBeGreaterThan(4 * 60 * 60 * 1000);
    expect(
      new Date(unavailableUntilSeven!.end_at!).getTime() -
        new Date(unavailableUntilSeven!.start_at!).getTime()
    ).toBeGreaterThanOrEqual(10 * 60 * 60 * 1000);
    expect(payload.suggestions[0].type).toBe("propose_time");
    expect(payload.suggestions[0].risk).toContain("끝 시간이 없는 표현");
  });

  it("splits multiple weekday segments in one shorthand line", () => {
    const payload = heuristicExtract(
      ["김시현: 언제 가능해?", "나: 토 2-4, 6- 일요일 8-9 가능"].join("\n"),
      "kakao"
    );
    const constraint = payload.time_constraints.find((item) => item.person === "나");
    const localWeekdays = constraint!.available.map((window) => kstWeekday(window.start_at));

    expect(constraint?.available).toHaveLength(3);
    expect(localWeekdays).toEqual([6, 6, 0]);
  });

  it("uses a previous unavailable-time request to classify shorthand replies", () => {
    const payload = heuristicExtract(
      [
        "김시현: 안되는시간 다 보내주세요",
        "조현준: 토요일 7- 일요일 8-9",
        "나: 토 2-4, 6-"
      ].join("\n"),
      "kakao"
    );

    const hyunjun = payload.time_constraints.find((item) => item.person === "조현준");
    const me = payload.time_constraints.find((item) => item.person === "나");

    expect(hyunjun?.available).toHaveLength(0);
    expect(hyunjun?.unavailable).toHaveLength(2);
    expect(me?.available).toHaveLength(0);
    expect(me?.unavailable).toHaveLength(2);
  });
});

function kstWeekday(value: string | null) {
  expect(value).toBeTruthy();
  return new Date(new Date(value!).getTime() + 9 * 60 * 60 * 1000).getUTCDay();
}
