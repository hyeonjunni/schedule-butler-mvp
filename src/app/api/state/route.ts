import { NextResponse } from "next/server";
import { getAppState } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getAppState());
  } catch {
    return NextResponse.json({ error: "failed to load state" }, { status: 500 });
  }
}
