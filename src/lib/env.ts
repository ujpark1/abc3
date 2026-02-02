import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";

/** process.cwd()에서 위로 올라가며 package.json이 있는 디렉터리(프로젝트 루트) 반환 */
function findProjectRoot(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * OpenAI API 키 반환. process.env에서 먼저 읽고, 없으면 프로젝트 루트의 .env.local 직접 읽기.
 */
export function getOpenAIApiKey(): string | undefined {
  let key = process.env.OPENAI_API_KEY?.trim();
  if (key) return key;
  try {
    const root = findProjectRoot();
    if (!root) return undefined;
    const envPath = join(root, ".env.local");
    if (!existsSync(envPath)) return undefined;
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/OPENAI_API_KEY\s*=\s*(.+)/);
    if (!match) return undefined;
    key = match[1].trim().replace(/^["']|["']$/g, "");
    return key || undefined;
  } catch {
    return undefined;
  }
}

/** 디버그용: 키 로드 상태 (키 값은 노출하지 않음) */
export function getEnvCheck(): {
  cwd: string;
  projectRoot: string | null;
  envLocalPath: string | null;
  envLocalExists: boolean;
  hasKey: boolean;
} {
  const cwd = process.cwd();
  const projectRoot = findProjectRoot() ?? null;
  const envLocalPath = projectRoot ? join(projectRoot, ".env.local") : null;
  const envLocalExists = envLocalPath ? existsSync(envLocalPath) : false;
  const hasKey = !!getOpenAIApiKey();
  return { cwd, projectRoot, envLocalPath, envLocalExists, hasKey };
}
