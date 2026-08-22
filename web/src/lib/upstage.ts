// Upstage Agents API 클라이언트 — 서버 사이드 전용 (API 라우트에서만 import할 것).
// UPSTAGE_API_KEY는 NEXT_PUBLIC_ 접두사가 없어 브라우저에 노출되지 않는다.
//
// 실제 호출로 검증된 사실 (2026-08-23):
// - 엔드포인트는 OpenAI Responses API 호환: POST/GET /v2/responses
// - model 파라미터에 agent_id를 넣는다
// - 파일은 /v2/files에 먼저 업로드해서 file_id를 받고 input에 참조로 넣는다
// - Job은 비동기라 status가 "completed"/"failed"가 될 때까지 폴링해야 한다

const BASE_URL = "https://api.upstage.ai/v2";

function apiKey(): string {
  const key = process.env.UPSTAGE_API_KEY;
  if (!key) {
    throw new Error("UPSTAGE_API_KEY가 설정되지 않았습니다 (web/.env.local 확인).");
  }
  return key;
}

export async function uploadFileToUpstage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)]), filename);

  const res = await fetch(`${BASE_URL}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upstage 파일 업로드 실패 (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.id as string;
}

export async function createAgentJob(agentId: string, fileId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: agentId,
      input: [
        {
          role: "user",
          content: [{ type: "input_file", file_id: fileId }],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Upstage Job 생성 실패 (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.id as string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getJob(jobId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/responses/${jobId}?include[]=all`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    throw new Error(`Upstage Job 조회 실패 (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function pollJob(
  jobId: string,
  { intervalMs = 2000, timeoutMs = 90_000 }: { intervalMs?: number; timeoutMs?: number } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await getJob(jobId);
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Upstage Job 폴링 타임아웃 (90초 초과)");
}

/**
 * 에이전트 응답 텍스트를 JSON으로 파싱한다. 두 가지 잡음을 처리한다:
 * 1. 코드펜스(```json ... ```)로 감싸져 오는 경우
 * 2. 이따금 응답 전체가 JSON 문자열로 한 번 더 감싸져 오는 경우(이중 인코딩) — 이걸 못 벗기면
 *    배열 대신 문자열 하나로 파싱되어 버린다 (실제로 발생 확인됨, 2026-08-23)
 */
export function parseAgentJson(text: string): unknown {
  let candidate = text.trim();
  if (candidate.startsWith('"') && candidate.endsWith('"')) {
    try {
      const unwrapped = JSON.parse(candidate);
      if (typeof unwrapped === "string") candidate = unwrapped;
    } catch {
      // 이중 인코딩이 아니면 원래 텍스트로 계속 진행
    }
  }
  const stripped = candidate
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(stripped);
}

/** 에이전트 실행 결과의 마지막 output 항목 텍스트를 꺼낸다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLastOutputText(job: any): string {
  const output = job.output ?? [];
  const last = output[output.length - 1];
  return last?.content?.[0]?.text ?? "";
}

/** 파일을 업로드하고 에이전트를 실행해서 마지막 output의 파싱된 JSON을 반환하는 편의 함수. */
export async function runAgentOnFile(
  agentId: string,
  buffer: Buffer,
  filename: string
): Promise<unknown> {
  const fileId = await uploadFileToUpstage(buffer, filename);
  const jobId = await createAgentJob(agentId, fileId);
  const job = await pollJob(jobId);
  if (job.status !== "completed") {
    throw new Error(`Upstage Job 실패: ${JSON.stringify(job.error)}`);
  }
  const text = getLastOutputText(job);
  return parseAgentJson(text);
}
