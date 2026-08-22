import { NextResponse } from "next/server";
import { runAgentOnFile } from "@/lib/upstage";
import {
  extractScalarFields,
  extractToExperiences,
  extractToProfilePatch,
  type AgentAExtract,
} from "@/lib/agentMapping";
import {
  addExperience,
  getDocumentRecord,
  saveProfile,
  saveRawExtract,
  updateDocumentRecord,
} from "@/lib/firestore";

const AGENT_A_ID = process.env.AGENT_A_ID;

// 서류함에 업로드된 문서 하나를 에이전트 A로 처리한다.
// ⚠️ 지금은 Classify 신호가 없어서 category를 "이력서"로 고정한다 — 실제로는 자소서/증명서 등도
// 올라올 수 있으므로, 에이전트 A에 Classify 분기가 추가되면 이 부분을 실제 판단값으로 교체해야 함.
export async function POST(_req: Request, ctx: RouteContext<"/api/documents/[id]/process">) {
  const { id } = await ctx.params;

  if (!AGENT_A_ID) {
    return NextResponse.json({ error: "AGENT_A_ID가 설정되지 않았습니다." }, { status: 500 });
  }

  const docRecord = await getDocumentRecord(id);
  if (!docRecord) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const fileRes = await fetch(docRecord.fileUrl);
    if (!fileRes.ok) throw new Error(`파일 다운로드 실패 (${fileRes.status})`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const raw = (await runAgentOnFile(AGENT_A_ID, buffer, docRecord.fileName)) as AgentAExtract;

    const profilePatch = extractToProfilePatch(raw);
    const experiences = extractToExperiences(raw, id);

    if (Object.keys(profilePatch).length > 0) {
      await saveProfile(profilePatch);
    }
    await saveRawExtract(extractScalarFields(raw));
    for (const exp of experiences) {
      await addExperience(exp);
    }

    await updateDocumentRecord(id, { status: "done", category: "이력서" });

    return NextResponse.json({
      ok: true,
      profilePatch,
      experiencesAdded: experiences.length,
    });
  } catch (e) {
    await updateDocumentRecord(id, { status: "error" }).catch(() => {});
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
