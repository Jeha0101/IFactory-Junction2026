import { NextResponse } from "next/server";
import { runAgentOnFile, AgentNonJsonResponseError } from "@/lib/upstage";
import {
  extractScalarFields,
  extractToCoverLetterAnswers,
  extractToExperiences,
  extractToProfilePatch,
  type AgentAExtract,
} from "@/lib/agentMapping";
import {
  addCoverLetterAnswer,
  addExperience,
  deleteCoverLetterAnswersBySource,
  deleteExperiencesBySource,
  getDocumentRecord,
  saveProfile,
  saveRawExtract,
  updateDocumentRecord,
} from "@/lib/firestore";

const AGENT_A_ID = process.env.AGENT_A_ID;

// 서류함에 업로드된 문서 하나를 에이전트 A로 처리한다.
// 이력서로 판단되면 프로필/경력/자소서 JSON을 Extract해서 돌려주고, 이력서가 아니면(재학증명서/
// 수료증 등) 짧은 분류 라벨 문자열만 돌려주는 것으로 확인됨(2026-08-23) — 아래 catch에서 그
// 라벨을 category로 저장한다. 이력서가 아닌 문서 종류별 Extract(취득일/만료일 등, 기능3)는
// 아직 없음 — 팀원에게 문서종별 스키마 추가를 요청해야 함.
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
    // 재처리 시 중복 저장을 막기 위해 이 문서에서 이전에 저장된 경력을 먼저 지운다.
    await deleteExperiencesBySource(id);
    for (const exp of experiences) {
      await addExperience(exp);
    }

    // 자소서 Q&A (QA_수정요구사항.md §3-4 — 에이전트 A가 self_introduce로 질문별 리스트를 줌)
    const coverLetterAnswers = extractToCoverLetterAnswers(raw, id);
    await deleteCoverLetterAnswersBySource(id);
    for (const answer of coverLetterAnswers) {
      await addCoverLetterAnswer(answer);
    }

    await updateDocumentRecord(id, { status: "done", category: "이력서", errorMessage: null });

    return NextResponse.json({
      ok: true,
      profilePatch,
      experiencesAdded: experiences.length,
      coverLetterAnswersAdded: coverLetterAnswers.length,
    });
  } catch (e) {
    // 에이전트 A가 이력서가 아닌 문서(재학증명서/수료증 등)라고 판단하면, Extract용 JSON
    // 대신 짧은 분류 라벨 하나만 텍스트로 돌려주는 것으로 확인됨(2026-08-23, 실사용 중 발견).
    // 예: "재학증명서", "수료증", "기타" — 문장이 아니라 라벨이면 실패가 아니라 분류 성공으로
    // 처리한다. (지금은 이런 문서 종류별 Extract가 없어서 분류만 기록하고 끝냄)
    if (e instanceof AgentNonJsonResponseError) {
      const label = e.rawText.trim().replace(/^["']|["']$/g, "");
      const looksLikeCategoryLabel = label.length > 0 && label.length <= 20 && !/[.?!]/.test(label);
      if (looksLikeCategoryLabel) {
        await updateDocumentRecord(id, { status: "done", category: label, errorMessage: null });
        return NextResponse.json({
          ok: true,
          classifiedAs: label,
          profilePatch: {},
          experiencesAdded: 0,
          coverLetterAnswersAdded: 0,
        });
      }
    }

    const message = e instanceof Error ? e.message : String(e);
    await updateDocumentRecord(id, { status: "error", errorMessage: message }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
