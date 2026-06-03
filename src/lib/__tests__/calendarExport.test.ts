import { describe, expect, it } from "vitest";
import { buildEventIcs } from "../calendarExport";
import type { StoredEvent } from "../types";

describe("buildEventIcs", () => {
  it("exports an approved event as an iCalendar payload", () => {
    const event: StoredEvent = {
      id: "event-1",
      draft_id: "draft-1",
      title: "팀 회의",
      start_at: "2026-06-06T14:00:00+09:00",
      end_at: "2026-06-06T15:00:00+09:00",
      location: "강남역",
      description: "회의 안건 확인",
      created_at: "2026-06-03T00:00:00.000Z"
    };

    const ics = buildEventIcs(event);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:event-1@schedule-butler.local");
    expect(ics).toContain("DTSTART:20260606T050000Z");
    expect(ics).toContain("DTEND:20260606T060000Z");
    expect(ics).toContain("SUMMARY:팀 회의");
    expect(ics).toContain("LOCATION:강남역");
    expect(ics).toContain("DESCRIPTION:회의 안건 확인");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("defaults missing end time to one hour after start", () => {
    const event: StoredEvent = {
      id: "event-2",
      draft_id: null,
      title: "통화",
      start_at: "2026-06-06T14:00:00+09:00",
      end_at: null,
      location: null,
      description: null,
      created_at: "2026-06-03T00:00:00.000Z"
    };

    const ics = buildEventIcs(event);

    expect(ics).toContain("DTSTART:20260606T050000Z");
    expect(ics).toContain("DTEND:20260606T060000Z");
  });
});
