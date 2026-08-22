import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { runAgentOnFile } from "@/lib/upstage";
import { getRawExtract } from "@/lib/firestore";

const execFileAsync = promisify(execFile);
const AGENT_B_ID = process.env.AGENT_B_ID;
// web/ 기준 상위 폴더의 python/ — 리포 구조: <repo>/web, <repo>/python
const PYTHON_DIR = join(process.cwd(), "..", "python");

interface FieldEntry {
  rawLabel: string;
  canonicalKey: string | null;
  formatHint?: string | null;
  isRepeatable?: boolean;
  cellRef?: { table: number; row: number; mergedGroupIndex: number };
}

// 빈 양식(fileUrl) -> 에이전트 B로 필드 감지 -> 아카이빙된 값(rawExtract)과 canonicalKey로 매칭
// -> python-docx(docx_tools.fill_values)로 실제 좌표에 써넣은 .docx를 돌려준다.
//
// ⚠️ 지금은 1차 매칭(정확히 같은 canonicalKey)만 한다 — canonicalKey가 null이거나 값이 없는
// 필드는 빈 칸으로 남는다 (Agent_요구사항명세서.md §4의 2차 AI 판단 단계는 아직 미구현).
export async function POST(req: Request) {
  const { fileUrl, fileName } = (await req.json()) as { fileUrl?: string; fileName?: string };

  if (!AGENT_B_ID) {
    return NextResponse.json({ error: "AGENT_B_ID가 설정되지 않았습니다." }, { status: 500 });
  }
  if (!fileUrl) {
    return NextResponse.json({ error: "fileUrl이 필요합니다." }, { status: 400 });
  }

  const workDir = await mkdtemp(join(tmpdir(), "ifactory-fill-"));
  try {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`파일 다운로드 실패 (${fileRes.status})`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const fieldsResult = await runAgentOnFile(AGENT_B_ID, buffer, fileName || "form.docx");
    if (!Array.isArray(fieldsResult)) {
      throw new Error(
        `에이전트 B 응답이 배열이 아닙니다: ${JSON.stringify(fieldsResult).slice(0, 200)}`
      );
    }
    const fields = fieldsResult as FieldEntry[];

    const rawExtract = (await getRawExtract()) ?? {};
    const values: { table: number; row: number; mergedGroupIndex: number; value: string }[] = [];
    for (const f of fields) {
      if (!f.canonicalKey || !f.cellRef) continue;
      const value = rawExtract[f.canonicalKey];
      if (typeof value === "string" && value.trim()) {
        values.push({ ...f.cellRef, value });
      }
    }

    const inputPath = join(workDir, "input.docx");
    const valuesPath = join(workDir, "values.json");
    const outputPath = join(workDir, "output.docx");
    await writeFile(inputPath, buffer);
    await writeFile(valuesPath, JSON.stringify(values), "utf-8");

    await execFileAsync(
      "python3",
      [join(PYTHON_DIR, "docx_tools.py"), "fill", inputPath, valuesPath, outputPath],
      { timeout: 30_000 }
    );

    const filledBuffer = await readFile(outputPath);

    return new NextResponse(new Uint8Array(filledBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "X-Fields-Total": String(fields.length),
        "X-Fields-Matched": String(values.length),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
