"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────

interface ParagraphData {
  id: string;
  createdAt: string;
  content: string;
  isFallback?: boolean;
  errorMessage?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface WordDefinition {
  word: string;
  meanings: string[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface SavedWord {
  word: string;
  meaning: string;
  dateAdded: string;
}

const STORAGE_KEY = "my_words_v1";
const USAGE_STORAGE_KEY = "openai_usage_v1";
const DEF_LANG_STORAGE_KEY = "definition_language_v1";
const PARAGRAPH_LANG_STORAGE_KEY = "paragraph_language_v1";
const SENTENCE_STYLE_STORAGE_KEY = "sentence_style_v1";

// 뜻 보기·단락 생성 공통 9개 언어 (프랑스어 포함)
const CONTENT_LANGUAGES: { code: string; name: string }[] = [
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
];

// gpt-4o-mini approximate: $0.15/1M input, $0.60/1M output (USD)
function estimateCost(promptTokens: number, completionTokens: number): number {
  return (promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000;
}

function getStoredUsage(): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_usd: number;
} {
  if (typeof window === "undefined")
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_usd: 0 };
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_usd: 0 };
    const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 } = JSON.parse(raw);
    return {
      prompt_tokens,
      completion_tokens,
      total_tokens,
      estimated_usd: estimateCost(prompt_tokens, completion_tokens),
    };
  } catch {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_usd: 0 };
  }
}

function addStoredUsage(usage: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}): void {
  if (typeof window === "undefined") return;
  try {
    const cur = getStoredUsage();
    const next = {
      prompt_tokens: cur.prompt_tokens + usage.prompt_tokens,
      completion_tokens: cur.completion_tokens + usage.completion_tokens,
      total_tokens: cur.total_tokens + usage.total_tokens,
    };
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function resetStoredUsage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(USAGE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── Helpers ────────────────────────────────────────
// 한글·중국어·일본어 문자 허용 (Hiragana, Katakana, CJK, Hangul)
const CJK_HANGUL_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3]/;

function normalize(word: string): string {
  const kept = word
    .replace(/[^a-zA-Z'\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3]/g, "")
    .trim();
  if (!kept) return "";
  if (/^[a-zA-Z'\-]*$/.test(kept)) return kept.toLowerCase();
  return kept;
}

/** 단락을 클릭 가능한 토큰으로 분리 (공백 유지, 라틴 단어·CJK/한글 단일 문자) */
function tokenizeContent(content: string): string[] {
  const re = /\s+|[a-zA-Z'\-]+|[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3]|./g;
  const match = content.match(re);
  return match ?? [];
}

function getSavedWords(): SavedWord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveWord(word: string, meaning: string): SavedWord[] {
  const words = getSavedWords();
  const exists = words.some((w) => w.word.toLowerCase() === word.toLowerCase());
  if (exists) return words;
  const updated = [
    { word: word.toLowerCase(), meaning, dateAdded: new Date().toISOString().slice(0, 10) },
    ...words,
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

function removeWord(word: string): SavedWord[] {
  const words = getSavedWords().filter((w) => w.word.toLowerCase() !== word.toLowerCase());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  return words;
}

function isWordSaved(word: string): boolean {
  return getSavedWords().some((w) => w.word.toLowerCase() === word.toLowerCase());
}

// ── Component ──────────────────────────────────────

export default function Home() {
  const [paragraph, setParagraph] = useState<ParagraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [definition, setDefinition] = useState<WordDefinition | null>(null);
  const [defLoading, setDefLoading] = useState(false);
  const [wordAlreadySaved, setWordAlreadySaved] = useState(false);

  const [showMyWords, setShowMyWords] = useState(false);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [usageStats, setUsageStats] = useState(() => getStoredUsage());

  const [difficulty, setDifficulty] = useState(5); // 1–10
  const [profession, setProfession] = useState("");
  const [definitionLanguage, setDefinitionLanguage] = useState(() => {
    if (typeof window === "undefined") return "ko";
    try {
      return localStorage.getItem(DEF_LANG_STORAGE_KEY) || "ko";
    } catch {
      return "ko";
    }
  });
  const [paragraphLanguage, setParagraphLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    try {
      return localStorage.getItem(PARAGRAPH_LANG_STORAGE_KEY) || "en";
    } catch {
      return "en";
    }
  });
  const [sentenceStyle, setSentenceStyle] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(SENTENCE_STYLE_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [fullTranslation, setFullTranslation] = useState<string | null>(null);
  const [fullTranslationLoading, setFullTranslationLoading] = useState(false);

  const fetchParagraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedWord(null);
    setDefinition(null);
    setFullTranslation(null);
    try {
      const params = new URLSearchParams({
        difficulty: String(difficulty),
        lang: paragraphLanguage,
        ...(profession.trim() && { profession: profession.trim() }),
        ...(sentenceStyle.trim() && { style: sentenceStyle.trim() }),
        _: String(Date.now()),
      });
      const res = await fetch(`/api/generate?${params}`, { cache: "no-store" });
      const data = await res.json();
      setParagraph(data);
      if (data.usage) {
        addStoredUsage(data.usage);
        setUsageStats(getStoredUsage());
      }
    } catch {
      setError("Failed to load paragraph. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [difficulty, profession, paragraphLanguage, sentenceStyle]);

  useEffect(() => {
    fetchParagraph();
    setSavedWords(getSavedWords());
    setUsageStats(getStoredUsage());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Word click handler
  const handleWordClick = async (rawWord: string) => {
    const word = normalize(rawWord);
    if (!word) return;
    // 라틴 알파벳만 있는 경우 2글자 이상, 한/중/일은 1글자도 허용
    if (word.length < 2 && !CJK_HANGUL_REGEX.test(word)) return;

    setSelectedWord(word);
    setWordAlreadySaved(isWordSaved(word));
    setDefLoading(true);
    setDefinition(null);

    try {
      const params = new URLSearchParams({
        word,
        lang: definitionLanguage,
        fromLang: paragraphLanguage,
      });
      const res = await fetch(`/api/define?${params}`);
      const data: WordDefinition = await res.json();
      setDefinition(data);
      if (data.usage) {
        addStoredUsage(data.usage);
        setUsageStats(getStoredUsage());
      }

      // Auto-save the word
      const alreadySaved = isWordSaved(word);
      if (!alreadySaved) {
        const meaning = data.meanings[0] || "";
        const updated = saveWord(word, meaning);
        setSavedWords(updated);
        setWordAlreadySaved(false);
      } else {
        setWordAlreadySaved(true);
      }
    } catch {
      setDefinition({ word, meanings: ["(Could not load definition)"] });
    } finally {
      setDefLoading(false);
    }
  };

  // Delete from My Words
  const handleDelete = (word: string) => {
    const updated = removeWord(word);
    setSavedWords(updated);
    if (selectedWord?.toLowerCase() === word.toLowerCase()) {
      setWordAlreadySaved(false);
    }
  };

  // Close tooltip
  const closeTooltip = () => {
    setSelectedWord(null);
    setDefinition(null);
  };

  // 전체 해석
  const handleFullTranslate = async () => {
    if (!paragraph?.content?.trim()) return;
    setFullTranslationLoading(true);
    setFullTranslation(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: paragraph.content, lang: definitionLanguage }),
      });
      const data = await res.json();
      if (data.translation) {
        setFullTranslation(data.translation);
        if (data.usage) {
          addStoredUsage(data.usage);
          setUsageStats(getStoredUsage());
        }
      } else {
        setFullTranslation("(해석을 불러올 수 없습니다.)");
      }
    } catch {
      setFullTranslation("(해석을 불러올 수 없습니다.)");
    } finally {
      setFullTranslationLoading(false);
    }
  };

  // Split paragraph into clickable tokens (Latin words, CJK/Hangul per character, spaces)
  const words = paragraph?.content ? tokenizeContent(paragraph.content) : [];

  return (
    <div
      style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px", minHeight: "100vh" }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>
          Daily English
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setShowSettings(true)}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 14,
            fontFamily: "system-ui, sans-serif",
            cursor: "pointer",
            fontWeight: 600,
            color: "var(--foreground)",
          }}
        >
          Settings
        </button>
        <button
          onClick={fetchParagraph}
          disabled={loading}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 14,
            fontFamily: "system-ui, sans-serif",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            color: "var(--foreground)",
            opacity: loading ? 0.5 : 1,
          }}
        >
          Refresh
        </button>
        <button
          onClick={() => {
            setSavedWords(getSavedWords());
            setShowMyWords(true);
          }}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 14,
            fontFamily: "system-ui, sans-serif",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          My Words ({savedWords.length})
        </button>
        </div>
      </div>

      {/* Settings panel (collapsed by default) */}
      {showSettings && (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          <div style={{ marginBottom: 14 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--muted)",
                fontFamily: "system-ui, sans-serif",
                marginRight: 12,
              }}
            >
              Paragraph language
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--muted)",
              fontFamily: "system-ui, sans-serif",
              marginBottom: 10,
              marginTop: 0,
            }}
          >
            Language for the generated paragraph:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {CONTENT_LANGUAGES.map(({ code, name }) => (
              <button
                key={code}
                type="button"
                onClick={() => setParagraphLanguage(code)}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  fontFamily: "system-ui, sans-serif",
                  borderRadius: 8,
                  border: paragraphLanguage === code ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: paragraphLanguage === code ? "var(--accent-light)" : "var(--card)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontWeight: paragraphLanguage === code ? 600 : 500,
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 14 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--muted)",
                fontFamily: "system-ui, sans-serif",
                marginRight: 12,
              }}
            >
              Definition language
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--muted)",
              fontFamily: "system-ui, sans-serif",
              marginBottom: 10,
              marginTop: 0,
            }}
          >
            Show word meanings in:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {CONTENT_LANGUAGES.map(({ code, name }) => (
              <button
                key={code}
                type="button"
                onClick={() => setDefinitionLanguage(code)}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  fontFamily: "system-ui, sans-serif",
                  borderRadius: 8,
                  border: definitionLanguage === code ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: definitionLanguage === code ? "var(--accent-light)" : "var(--card)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontWeight: definitionLanguage === code ? 600 : 500,
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="sentence-style-input"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--muted)",
                fontFamily: "system-ui, sans-serif",
                marginBottom: 8,
              }}
            >
              문장 스타일 (Sentence style)
            </label>
            <input
              id="sentence-style-input"
              type="text"
              value={sentenceStyle}
              onChange={(e) => setSentenceStyle(e.target.value)}
              placeholder="e.g. formal, casual, storytelling, news (비워두면 기본)"
              style={{
                width: "100%",
                maxWidth: 320,
                padding: "10px 14px",
                fontSize: 14,
                fontFamily: "system-ui, sans-serif",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--background)",
                color: "var(--foreground)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--muted)",
                fontFamily: "system-ui, sans-serif",
                marginRight: 12,
              }}
            >
              Difficulty (1–10)
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "system-ui, sans-serif" }}>
              1 = elementary, 10 = very advanced
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDifficulty(n)}
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  fontSize: 14,
                  fontFamily: "system-ui, sans-serif",
                  borderRadius: 8,
                  border: difficulty === n ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: difficulty === n ? "var(--accent-light)" : "var(--card)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  fontWeight: difficulty === n ? 600 : 500,
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="profession-input"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--muted)",
                fontFamily: "system-ui, sans-serif",
                marginBottom: 8,
              }}
            >
              Profession / field (leave empty for general)
            </label>
            <input
              id="profession-input"
              type="text"
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              placeholder="e.g. developer, doctor, lawyer, marketing"
              style={{
                width: "100%",
                maxWidth: 320,
                padding: "10px 14px",
                fontSize: 14,
                fontFamily: "system-ui, sans-serif",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--background)",
                color: "var(--foreground)",
                boxSizing: "border-box",
              }}
            />
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["General", "Development", "Business", "Healthcare", "Law", "Education"].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setProfession(label === "General" ? "" : label)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    fontFamily: "system-ui, sans-serif",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: profession === (label === "General" ? "" : label) ? "var(--accent-light)" : "var(--card)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
            onClick={() => {
              try {
                localStorage.setItem(DEF_LANG_STORAGE_KEY, definitionLanguage);
                localStorage.setItem(PARAGRAPH_LANG_STORAGE_KEY, paragraphLanguage);
                localStorage.setItem(SENTENCE_STYLE_STORAGE_KEY, sentenceStyle);
              } catch {
                // ignore
              }
              setShowSettings(false);
            }}
              style={{
                padding: "8px 20px",
                fontSize: 14,
                fontFamily: "system-ui, sans-serif",
                fontWeight: 600,
                borderRadius: 8,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Save
            </button>
            <button
              type="button"
            onClick={() => {
              try {
                setDefinitionLanguage(localStorage.getItem(DEF_LANG_STORAGE_KEY) || "ko");
                setParagraphLanguage(localStorage.getItem(PARAGRAPH_LANG_STORAGE_KEY) || "en");
                setSentenceStyle(localStorage.getItem(SENTENCE_STYLE_STORAGE_KEY) || "");
              } catch {
                // ignore
              }
              setShowSettings(false);
            }}
              style={{
                padding: "8px 20px",
                fontSize: 14,
                fontFamily: "system-ui, sans-serif",
                fontWeight: 600,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--foreground)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Fallback notice — show when LLM is not used */}
      {paragraph?.isFallback && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            color: "#92400e",
          }}
        >
          {paragraph?.errorMessage ? (
            /rate limit|429/i.test(paragraph.errorMessage) ? (
              <>
                <strong>Rate limit reached</strong> — Wait about 20 seconds, then click{" "}
                <strong>Refresh</strong> again. You can increase limits at{" "}
                <a
                  href="https://platform.openai.com/account/rate-limits"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#92400e", textDecoration: "underline" }}
                >
                  Billing / plan
                </a>
                .
              </>
            ) : (
              <>
                <strong>OpenAI API error:</strong> {paragraph.errorMessage}
                <br />
                Check OPENAI_API_KEY in .env.local or{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#92400e", textDecoration: "underline" }}
                >
                  issue a new key
                </a>
                .
              </>
            )
          ) : (
            <>
              Fixed paragraph is shown. Add OPENAI_API_KEY to .env.local and{" "}
              <strong>restart the dev server</strong> to use the LLM.
            </>
          )}
        </div>
      )}

      {/* Usage (this device) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          padding: "8px 12px",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 13,
          fontFamily: "system-ui, sans-serif",
          color: "var(--muted)",
        }}
      >
        <span>
          Tokens: {usageStats.total_tokens.toLocaleString()} (~$
          {usageStats.estimated_usd < 0.01
            ? usageStats.estimated_usd.toFixed(4)
            : usageStats.estimated_usd.toFixed(2)}{" "}
          USD)
        </span>
        <button
          type="button"
          onClick={() => {
            resetStoredUsage();
            setUsageStats(getStoredUsage());
          }}
          style={{
            background: "none",
            border: "none",
            fontSize: 12,
            color: "var(--muted)",
            cursor: "pointer",
            textDecoration: "underline",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Reset
        </button>
      </div>

      {/* Hint */}
      <p
        style={{
          color: "var(--muted)",
          fontSize: 14,
          marginBottom: 20,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Tap any word you don&apos;t know.
      </p>

      {/* Paragraph area */}
      <div
        style={{
          background: "var(--card)",
          borderRadius: 12,
          padding: 24,
          border: "1px solid var(--border)",
          minHeight: 160,
          lineHeight: 1.8,
          fontSize: 18,
          position: "relative",
        }}
      >
        {loading && (
          <p style={{ color: "var(--muted)", fontFamily: "system-ui, sans-serif", fontSize: 15 }}>
            Loading new paragraph...
          </p>
        )}

        {error && (
          <div>
            <p style={{ color: "#dc2626", fontFamily: "system-ui, sans-serif", fontSize: 15 }}>
              {error}
            </p>
            <button
              onClick={fetchParagraph}
              style={{
                marginTop: 12,
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "system-ui, sans-serif",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && paragraph && (
          <p style={{ margin: 0 }}>
            {words.map((token, i) => {
              if (/^\s+$/.test(token)) {
                return <span key={i}>{token}</span>;
              }
              const cleaned = normalize(token);
              const isSaved = cleaned ? isWordSaved(cleaned) : false;
              const isSelected = cleaned === selectedWord;
              return (
                <span
                  key={i}
                  onClick={() => handleWordClick(token)}
                  style={{
                    cursor: "pointer",
                    borderRadius: 4,
                    padding: "2px 1px",
                    transition: "background 0.15s",
                    background: isSelected
                      ? "var(--accent-light)"
                      : isSaved
                        ? "#dcfce7"
                        : "transparent",
                    borderBottom: isSaved ? "2px solid var(--saved)" : "none",
                  }}
                >
                  {token}
                </span>
              );
            })}
          </p>
        )}

        {paragraph?.isFallback && (
          <p
            style={{
              color: "var(--muted)",
              fontSize: 12,
              marginTop: 12,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {paragraph?.errorMessage
              ? `(Fallback — ${paragraph.errorMessage})`
              : "(Using fallback paragraph — LLM unavailable)"}
          </p>
        )}
      </div>

      {/* 전체 해석 버튼 & 결과 */}
      {!loading && !error && paragraph?.content && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={handleFullTranslate}
            disabled={fullTranslationLoading}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontFamily: "system-ui, sans-serif",
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--foreground)",
              cursor: fullTranslationLoading ? "not-allowed" : "pointer",
              opacity: fullTranslationLoading ? 0.7 : 1,
            }}
          >
            {fullTranslationLoading ? "해석 중..." : "전체 해석"}
          </button>
          {fullTranslation && (
            <div
              style={{
                marginTop: 12,
                padding: 20,
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                lineHeight: 1.7,
                fontSize: 16,
                fontFamily: "system-ui, sans-serif",
                color: "var(--foreground)",
                whiteSpace: "pre-wrap",
              }}
            >
              {fullTranslation}
            </div>
          )}
        </div>
      )}

      {/* Word definition card */}
      {selectedWord && (
        <div
          style={{
            marginTop: 16,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 18,
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {selectedWord}
              </span>
              {wordAlreadySaved && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    color: "var(--saved)",
                    fontFamily: "system-ui, sans-serif",
                    fontWeight: 600,
                  }}
                >
                  Saved
                </span>
              )}
            </div>
            <button
              onClick={closeTooltip}
              style={{
                background: "none",
                border: "none",
                fontSize: 20,
                cursor: "pointer",
                color: "var(--muted)",
                padding: 0,
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          {defLoading ? (
            <p
              style={{
                color: "var(--muted)",
                fontSize: 14,
                marginTop: 8,
                fontFamily: "system-ui, sans-serif",
              }}
            >
              Loading definition...
            </p>
          ) : (
            definition && (
              <ul
                style={{
                  margin: "10px 0 0",
                  paddingLeft: 20,
                  fontSize: 15,
                  fontFamily: "system-ui, sans-serif",
                  lineHeight: 1.5,
                  color: "var(--foreground)",
                }}
              >
                {definition.meanings.map((m, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {m}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}

      {/* My Words Modal */}
      {showMyWords && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 50,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMyWords(false);
          }}
        >
          <div
            style={{
              background: "var(--card)",
              width: "100%",
              maxWidth: 600,
              maxHeight: "80vh",
              borderRadius: "16px 16px 0 0",
              padding: 24,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: "system-ui, sans-serif",
                  margin: 0,
                }}
              >
                My Words ({savedWords.length})
              </h2>
              <button
                onClick={() => setShowMyWords(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "var(--muted)",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            {savedWords.length === 0 ? (
              <p
                style={{
                  color: "var(--muted)",
                  fontSize: 14,
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                No words saved yet. Tap words in the paragraph to save them.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {savedWords.map((w) => (
                  <li
                    key={w.word}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      padding: "12px 0",
                      borderBottom: "1px solid var(--border)",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 15,
                          fontFamily: "system-ui, sans-serif",
                        }}
                      >
                        {w.word}
                      </span>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 13,
                          color: "var(--muted)",
                          fontFamily: "system-ui, sans-serif",
                          lineHeight: 1.4,
                        }}
                      >
                        {w.meaning}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(w.word)}
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: 13,
                        cursor: "pointer",
                        color: "#dc2626",
                        fontFamily: "system-ui, sans-serif",
                        flexShrink: 0,
                      }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
