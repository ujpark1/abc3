import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { getOpenAIApiKey } from "@/lib/env";

export const dynamic = "force-dynamic";

const FALLBACK_PARAGRAPH =
  "Morning light filled the kitchen as the smell of fresh coffee drifted through the house. Outside the window, a small bird sat on the fence and watched the garden below. The grass was still wet from the rain that had fallen during the night. A few clouds moved slowly across the sky, but the sun was warm and bright. It felt like the kind of day when everything moves at a gentle pace. People walked their dogs along the quiet street, and children rode their bikes on the sidewalk. The neighborhood was calm and peaceful, just like any other ordinary morning.";

/** Difficulty 1–10: 1 = elementary, 10 = very advanced */
function getDifficultyRule(level: number): string {
  const n = Math.min(10, Math.max(1, Number(level) || 5));
  if (n <= 2) return "Elementary level (grade-school). Very simple words only, very short sentences (under 10 words). Daily life only.";
  if (n <= 4) return "Easy (A1–A2). Simple everyday vocabulary. Short sentences (under 15 words). Familiar topics only.";
  if (n <= 6) return "Intermediate (B1–B2). Normal vocabulary and sentence length. General interest, work or life.";
  if (n <= 8) return "Advanced (C1). Rich vocabulary, longer sentences. Can be professional or abstract.";
  return "Very advanced (C2). Sophisticated, nuanced vocabulary and complex sentences. Specialized or academic style.";
}

function buildPrompt(difficultyLevel: number, profession: string | null): string {
  const diffRule = getDifficultyRule(difficultyLevel);
  const professionPart = profession?.trim()
    ? ` The paragraph should be relevant to someone working in or studying: "${profession.trim()}". Use vocabulary and situations useful in that field (professional English).`
    : "";
  return `Write one short English paragraph (80–120 words). Rules: ${diffRule}.${professionPart} No questions, no lists, no headings, plain text only. Output only the paragraph.`;
}

export async function GET(request: NextRequest) {
  const apiKey = getOpenAIApiKey();
  const noCacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };

  const { searchParams } = request.nextUrl;
  const difficultyLevel = Math.min(10, Math.max(1, parseInt(searchParams.get("difficulty") ?? "5", 10) || 5));
  const profession = searchParams.get("profession") || null;

  if (!apiKey) {
    console.log("[generate] OPENAI_API_KEY is missing or empty — using fallback");
    return NextResponse.json(
      {
        id: "fallback",
        createdAt: new Date().toISOString(),
        content: FALLBACK_PARAGRAPH,
        isFallback: true,
      },
      { headers: noCacheHeaders }
    );
  }

  try {
    const openai = new OpenAI({ apiKey });
    const userContent = buildPrompt(difficultyLevel, profession);
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: userContent }],
      max_tokens: 200,
      temperature: 1,
    });

    const content = completion.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("Empty response from LLM");
    }

    const usage = completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        }
      : undefined;

    console.log("[generate] LLM OK — new paragraph generated");
    return NextResponse.json(
      {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        content,
        usage,
      },
      { headers: noCacheHeaders }
    );
  } catch (error) {
    const err = error as Error & { status?: number };
    console.error("[generate] LLM call failed:", err.message, err.status ?? "");
    return NextResponse.json(
      {
        id: "fallback",
        createdAt: new Date().toISOString(),
        content: FALLBACK_PARAGRAPH,
        isFallback: true,
        errorMessage: err.message || "Unknown error",
      },
      { headers: noCacheHeaders }
    );
  }
}
