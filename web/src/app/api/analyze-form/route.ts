import { NextResponse } from "next/server";
import { runAgentOnFile } from "@/lib/upstage";
import { getRawExtract } from "@/lib/firestore";
import { isPlausibleMatch } from "@/lib/agentMapping";
import { extractDocxStructure, buildRowLabelsMap } from "@/lib/pythonDocx";

const AGENT_B_ID = process.env.AGENT_B_ID;

interface AgentBField {
  rawLabel: string;
  canonicalKey: string | null;
  formatHint?: string | null;
  isRepeatable?: boolean;
  cellRef?: { table: number; row: number; mergedGroupIndex: number };
}

export interface AnalyzedField {
  id: string; // `${table}-${row}-${mergedGroupIndex}` — render-docx로 값 되돌려보낼 때 키로 씀
  rawLabel: string;
  canonicalKey: string | null;
  isEssay: boolean;
  isRepeatable: boolean;
  value: string; // 아카이빙된 값과 매칭된 초기값 (없으면 "")
}

// 빈 양식(fileUrl)을 분석해서 편집 가능한 필드 목록을 돌려준다. docx를 생성하지 않는다 —
// 실제 문서 생성은 /api/render-docx가 전담해서, 미리보기와 다운로드가 항상 같은 파이프라인을 탄다.
export async function POST(req: Request) {
  const { fileUrl, fileName } = (await req.json()) as { fileUrl?: string; fileName?: string };

  if (!AGENT_B_ID) {
    return NextResponse.json({ error: "AGENT_B_ID가 설정되지 않았습니다." }, { status: 500 });
  }
  if (!fileUrl) {
    return NextResponse.json({ error: "fileUrl이 필요합니다." }, { status: 400 });
  }

  try {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`파일 다운로드 실패 (${fileRes.status})`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    // ⚠️ 2026-08-23: 한때 여기서 python-docx 구조 JSON을 input_text로 같이 보냈었는데,
    // 그게 오히려 Instruct를 "이 데이터를 설명해줘"로 착각하게 만들어서 최종 JSON 대신 설명글을
    // 반환하는 회귀를 일으켰다 (동일 파일로 텍스트 유무만 다르게 A/B 테스트해서 확인함 — 파일만
    // 보내면 정상 JSON, 텍스트를 추가하면 설명글). 파일만 보내는 게 정답이라 되돌림.
    const [structure, rawExtract] = await Promise.all([
      extractDocxStructure(buffer),
      getRawExtract(),
    ]);
    const fieldsResult = await runAgentOnFile(AGENT_B_ID, buffer, fileName || "form.docx");

    if (!Array.isArray(fieldsResult)) {
      throw new Error(
        `에이전트 B 응답이 배열이 아닙니다: ${JSON.stringify(fieldsResult).slice(0, 200)}`
      );
    }
    const fields = fieldsResult as AgentBField[];
    const rowLabelsByKey = buildRowLabelsMap(structure);
    const extract = rawExtract ?? {};

    const analyzed: AnalyzedField[] = [];
    let matched = 0;
    let rejected = 0;

    for (const f of fields) {
      if (!f.cellRef) continue; // 좌표 없으면(체크리스트 등) 자동 채움 대상 아님 — 건너뜀
      const id = `${f.cellRef.table}-${f.cellRef.row}-${f.cellRef.mergedGroupIndex}`;
      // 에이전트 A가 자소서 Q&A를 self_introduce로 부르는 것으로 확인됨(2026-08-23) —
      // 에이전트 B도 같은 어휘를 쓸 가능성이 높아 같이 체크한다.
      const isEssay =
        f.canonicalKey === "self_introduce" ||
        f.canonicalKey === "self_introduction" ||
        f.canonicalKey === "자소서QnA" ||
        f.canonicalKey === "coverLetterQnA";

      let value = "";
      if (!isEssay && f.canonicalKey) {
        const candidate = extract[f.canonicalKey];
        if (typeof candidate === "string" && candidate.trim()) {
          const rowLabels = rowLabelsByKey.get(`${f.cellRef.table}-${f.cellRef.row}`) ?? [];
          if (isPlausibleMatch(f.canonicalKey, rowLabels)) {
            value = candidate;
            matched++;
          } else {
            rejected++;
          }
        }
      }

      analyzed.push({
        id,
        rawLabel: f.rawLabel,
        canonicalKey: f.canonicalKey,
        isEssay,
        isRepeatable: Boolean(f.isRepeatable),
        value,
      });
    }

    return NextResponse.json({
      fields: analyzed,
      totalFields: fields.length,
      matchedFields: matched,
      rejectedFields: rejected,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
