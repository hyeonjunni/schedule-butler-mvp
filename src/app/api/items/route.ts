import { NextResponse } from "next/server";
import { toggleItem } from "@/lib/store";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      kind?: "todo" | "checklist";
      id?: string;
      completed?: boolean;
    };
    if (!body.kind || !body.id || typeof body.completed !== "boolean") {
      return NextResponse.json({ error: "invalid item update" }, { status: 400 });
    }
    const item = await toggleItem(body.kind, body.id, body.completed);
    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: "failed to update item" }, { status: 500 });
  }
}
