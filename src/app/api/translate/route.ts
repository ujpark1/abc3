import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getOpenAIApiKey } from "@/lib/env";

export const dynamic = "force-dynamic";

const LANG_NAMES: Record<string, string> = {
  ko: "Korean",
  zh: "Chinese",
  ja: "Japanese",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
};

export async function POST(request: NextRequest) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { translation: null, error: "OPENAI_API_KEY is not set" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const lang = typeof body.lang === "string" ? body.lang.trim() || "ko" : "ko";
    const langName = LANG_NAMES[lang] ?? LANG_NAMES.ko;

    if (!text) {
      return NextResponse.json(
        { translation: null, error: "Missing text" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Translate the following text into ${langName}. Preserve the paragraph structure. Output only the translation, no explanation.\n\n${text}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const translation = completion.choices[0]?.message?.content?.trim() ?? "";
    const usage = completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        }
      : undefined;

    return NextResponse.json({ translation, usage });
  } catch (error) {
    const err = error as Error;
    console.error("[translate]", err.message);
    return NextResponse.json(
      { translation: null, error: err.message || "Translation failed" },
      { status: 500 }
    );
  }
}
