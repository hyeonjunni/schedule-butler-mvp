import { NextResponse } from "next/server";
import { normalizeExtraction } from "@/lib/normalize";
import { approveDraft, rejectDraft } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      draftId?: string;
      action?: "approve" | "reject";
      payload?: unknown;
    };
    if (!body.draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    if (body.action === "reject") {
      const draft = await rejectDraft(body.draftId);
      return NextResponse.json({ draft, event: null });
    }

    const payload = normalizeExtraction(body.payload, "승인된 일정 후보");
    const result = await approveDraft(body.draftId, payload);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "failed to approve draft" }, { status: 500 });
  }
}
