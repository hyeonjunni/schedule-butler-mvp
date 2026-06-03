import { NextResponse } from "next/server";
import { buildEventIcs } from "@/lib/calendarExport";
import { getAppState } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const state = await getAppState();
    const event = state.events.find((item) => item.id === id);
    if (!event) {
      return NextResponse.json({ error: "event not found" }, { status: 404 });
    }

    const ics = buildEventIcs(event);
    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="schedule-butler-${event.id}.ics"`
      }
    });
  } catch {
    return NextResponse.json({ error: "failed to export event" }, { status: 500 });
  }
}
