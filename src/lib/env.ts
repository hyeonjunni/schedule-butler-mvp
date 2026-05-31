import { readFile } from "fs/promises";
import path from "path";

export async function resolveOpenAIKey() {
  const direct = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY;
  if (direct) return direct.trim();

  try {
    const envPath = path.join(process.cwd(), ".env");
    const file = await readFile(envPath, "utf8");
    for (const rawLine of file.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.includes("=")) {
        const [name, ...rest] = line.split("=");
        if (["OPENAI_API_KEY", "CHATGPT_API_KEY"].includes(name.trim())) {
          return rest.join("=").trim().replace(/^["']|["']$/g, "");
        }
      }
      if (line.startsWith("sk-")) return line;
    }
  } catch {
    return null;
  }

  return null;
}
