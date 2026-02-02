import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getOpenAIApiKey } from "@/lib/env";

const LANG_NAMES: Record<string, string> = {
  ko: "Korean",
  zh: "Chinese",
  ja: "Japanese",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
};

const SUPPORTED_LANGS = new Set(Object.keys(LANG_NAMES));

interface MeaningResult {
  meanings: string[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function getMeaningInLanguage(word: string, lang: string): Promise<MeaningResult> {
  const languageName = LANG_NAMES[lang] ?? LANG_NAMES.en;
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    const meanings = lang === "en" ? await getEnglishThenFallback(word) : ["(Could not load definition)"];
    return { meanings };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Give the meaning of the English word "${word}" in ${languageName}. Return 1–2 short definitions only, one per line, in ${languageName} only. No numbers, bullets, or extra explanation. Output only the definitions.`,
        },
      ],
      max_tokens: 60,
      temperature: 0.3,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return { meanings: ["(Could not load definition)"] };

    const meanings = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 2);

    const usage = completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        }
      : undefined;

    return {
      meanings: meanings.length > 0 ? meanings : ["(Could not load definition)"],
      usage,
    };
  } catch {
    const meanings = lang === "en" ? await getEnglishThenFallback(word) : ["(Could not load definition)"];
    return { meanings };
  }
}

async function getEnglishThenFallback(word: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    if (!res.ok) return ["(Could not load definition)"];

    const data = await res.json();
    const meanings: string[] = [];

    for (const entry of data) {
      for (const m of entry.meanings ?? []) {
        for (const def of m.definitions ?? []) {
          if (def.definition) meanings.push(def.definition);
          if (meanings.length >= 2) break;
        }
        if (meanings.length >= 2) break;
      }
      if (meanings.length >= 2) break;
    }

    return meanings.length > 0 ? meanings : ["(Could not load definition)"];
  } catch {
    return ["(Could not load definition)"];
  }
}

export async function GET(request: NextRequest) {
  const word = request.nextUrl.searchParams.get("word")?.toLowerCase().trim();
  const lang = request.nextUrl.searchParams.get("lang")?.toLowerCase() || "ko";
  const safeLang = SUPPORTED_LANGS.has(lang) ? lang : "ko";

  if (!word) {
    return NextResponse.json(
      { word: "", meanings: ["(Could not load definition)"] },
      { status: 400 }
    );
  }

  const { meanings, usage } = await getMeaningInLanguage(word, safeLang);
  return NextResponse.json({ word, meanings, usage });
}
