import { NextResponse } from "next/server";
import { extractSchedule } from "@/lib/ai";
import { createDraft, createRawInput } from "@/lib/store";
import type { InputType } from "@/lib/types";

export const runtime = "nodejs";

const inputTypes: InputType[] = ["kakao", "email", "stt", "memo"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { content?: string; inputType?: InputType };
    const content = body.content?.trim();
    const inputType = inputTypes.includes(body.inputType as InputType) ? body.inputType! : "memo";
    if (!content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const rawInput = await createRawInput(inputType, content);
    const payload = await extractSchedule(content, inputType);
    const draft = await createDraft(rawInput.id, payload);

    return NextResponse.json({ rawInput, draft });
  } catch {
    return NextResponse.json({ error: "failed to extract schedule" }, { status: 500 });
  }
}
