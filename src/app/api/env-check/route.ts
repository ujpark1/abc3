import { NextResponse } from "next/server";
import { getEnvCheck } from "@/lib/env";

export const dynamic = "force-dynamic";

/** API 키/환경 상태 확인 (키 값은 노출하지 않음) */
export async function GET() {
  const check = getEnvCheck();
  return NextResponse.json(check);
}
