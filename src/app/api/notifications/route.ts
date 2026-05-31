import { NextResponse } from "next/server";
import { updateNotificationStatus } from "@/lib/store";
import type { StoredNotification } from "@/lib/types";

export const runtime = "nodejs";

const statuses: StoredNotification["status"][] = ["scheduled", "shown", "cancelled"];

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      status?: StoredNotification["status"];
    };
    if (!body.id || !statuses.includes(body.status as StoredNotification["status"])) {
      return NextResponse.json({ error: "invalid notification update" }, { status: 400 });
    }

    const notification = await updateNotificationStatus(body.id, body.status!);
    return NextResponse.json({ notification });
  } catch {
    return NextResponse.json({ error: "failed to update notification" }, { status: 500 });
  }
}
