"use client";

import { useEffect, useRef, useState } from "react";
import FirebaseNotice from "@/components/FirebaseNotice";
import EssayQuestionBlock from "@/components/EssayQuestionBlock";
import DocxLivePreview, { DocxLivePreviewHandle } from "@/components/DocxLivePreview";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  addCoverLetterAnswer,
  addExperience,
  createResumeDraft,
  getLatestResumeDraft,
  getProfile,
  listCoverLetterAnswers,
  listExperiences,
  saveProfile,
  updateResumeDraft,
} from "@/lib/firestore";
import { uploadDocumentFile } from "@/lib/storage";
import {
  MOCK_COVER_LETTER_ANSWERS,
  MOCK_ESSAY_QUESTIONS,
  MOCK_EXPERIENCES,
  MOCK_PROFILE,
} from "@/lib/mockData";
import type { CoverLetterAnswer, Experience, Profile, ResumeDraft } from "@/types";

const TYPE_LABEL: Record<NonNullable<Experience["type"]>, string> = {
  project: "프로젝트",
  work: "근무 경력",
  activity: "대외활동",
  award: "수상",
  skill: "기술/역량",
};

const PROFILE_FIELDS: { key: keyof Profile; label: string }[] = [
  { key: "이름", label: "이름" },
  { key: "생년월일", label: "생년월일" },
  { key: "학교", label: "학교" },
  { key: "전공", label: "전공" },
  { key: "학년", label: "학년" },
  { key: "평균학점", label: "평균학점" },
  { key: "연락처", label: "연락처" },
  { key: "이메일", label: "이메일" },
];

export default function ResumePreviewPage() {
  const [started, setStarted] = useState(false);
  const [uploadingForm, setUploadingForm] = useState(false);
  const [formName, setFormName] = useState<string | null>(null);
  const [formFile, setFormFile] = useState<File | Blob | null>(null);
  const [formFileUrl, setFormFileUrl] = useState<string | null>(null);
  const [initialHtml, setInitialHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<DocxLivePreviewHandle>(null);

  const [profile, setProfile] = useState<Profile>(MOCK_PROFILE);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [coverLetterAnswers, setCoverLetterAnswers] = useState<CoverLetterAnswer[]>([]);

  const [existingDraft, setExistingDraft] = useState<ResumeDraft | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [fillStats, setFillStats] = useState<{ total: number; matched: number } | null>(null);

  // CTA 화면에서 "이어서 작성 중인 초안"이 있는지 미리 확인
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    getLatestResumeDraft()
      .then(setExistingDraft)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!started) return;
    if (!isFirebaseConfigured) {
      // Firebase 연결 전엔 목업 데이터로 화면을 바로 보여준다.
      setExperiences(MOCK_EXPERIENCES.map((e, i) => ({ ...e, id: `mock-${i}` })));
      setCoverLetterAnswers(MOCK_COVER_LETTER_ANSWERS.map((a, i) => ({ ...a, id: `mock-${i}` })));
      return;
    }
    Promise.all([getProfile(), listExperiences(), listCoverLetterAnswers()])
      .then(([p, exps, answers]) => {
        setProfile(p && Object.keys(p).length > 0 ? p : MOCK_PROFILE);
        setExperiences(
          exps.length > 0 ? exps : MOCK_EXPERIENCES.map((e, i) => ({ ...e, id: `mock-${i}` }))
        );
        setCoverLetterAnswers(
          answers.length > 0
            ? answers
            : MOCK_COVER_LETTER_ANSWERS.map((a, i) => ({ ...a, id: `mock-${i}` }))
        );
      })
      .catch((e) => setError(String(e)));
  }, [started]);

  // 에이전트 B로 필드를 감지하고, 아카이빙된 값과 매칭해서 실제로 채운 docx를 받아온다.
  // 실패하면(에이전트 미설정, 매칭 실패 등) 원본 빈 양식을 그대로 보여주는 걸로 조용히 폴백한다.
  async function fillFormViaAgentB(fileUrl: string, fileName: string): Promise<Blob | null> {
    try {
      const res = await fetch("/api/fill-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl, fileName }),
      });
      if (!res.ok) throw new Error(await res.text());
      const total = Number(res.headers.get("X-Fields-Total") ?? 0);
      const matched = Number(res.headers.get("X-Fields-Matched") ?? 0);
      setFillStats({ total, matched });
      return await res.blob();
    } catch (e) {
      console.warn("에이전트 B 채우기 실패, 원본 양식으로 폴백:", e);
      setFillStats(null);
      return null;
    }
  }

  async function handleFormUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingForm(true);
    setError(null);
    try {
      if (!isFirebaseConfigured) {
        setFormName(file.name);
        setFormFile(file);
        setInitialHtml(null);
        setDraftId(null);
        setStarted(true);
        return;
      }
      const url = await uploadDocumentFile(file);
      setFormFileUrl(url);
      const filled = await fillFormViaAgentB(url, file.name);
      setFormName(file.name);
      setFormFile(filled ?? file);
      setInitialHtml(null);
      setDraftId(null);
      setStarted(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploadingForm(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function loadSampleForm() {
    setError(null);
    try {
      const absoluteUrl = `${window.location.origin}/samples/sample-form.docx`;
      const filled = await fillFormViaAgentB(
        absoluteUrl,
        "(샘플) 2026년 ICT인턴십 지원서류.docx"
      );
      const raw = filled ?? (await (await fetch(absoluteUrl)).blob());
      setFormName("(샘플) 2026년 ICT인턴십 지원서류.docx");
      setFormFile(raw);
      setFormFileUrl(absoluteUrl);
      setInitialHtml(null);
      setDraftId(null);
      setStarted(true);
    } catch (e) {
      setError(String(e));
    }
  }

  async function continueDraft() {
    if (!existingDraft) return;
    setError(null);
    try {
      const res = await fetch(existingDraft.formFileUrl);
      const blob = await res.blob();
      setFormName(existingDraft.formFileName);
      setFormFile(blob);
      setFormFileUrl(existingDraft.formFileUrl);
      setInitialHtml(existingDraft.editedHtml);
      setDraftId(existingDraft.id);
      setStarted(true);
    } catch (e) {
      setError(String(e));
    }
  }

  async function seedDummyData() {
    if (!isFirebaseConfigured) {
      // Firebase 연결 전엔 그냥 로컬 목업으로 바로 진행 (useEffect가 폴백을 채워줌)
      setStarted(true);
      return;
    }
    try {
      await saveProfile(MOCK_PROFILE);
      for (const exp of MOCK_EXPERIENCES) await addExperience(exp);
      for (const ans of MOCK_COVER_LETTER_ANSWERS) await addCoverLetterAnswer(ans);
      setStarted(true);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSaveDraft() {
    if (!isFirebaseConfigured || !formFileUrl) return;
    setSaving(true);
    setError(null);
    try {
      const html = previewRef.current?.getHtml() ?? "";
      const now = new Date().toISOString();
      if (draftId) {
        await updateResumeDraft(draftId, { editedHtml: html, updatedAt: now });
      } else {
        const id = await createResumeDraft({
          formFileName: formName ?? "이력서",
          formFileUrl,
          editedHtml: html,
          createdAt: now,
          updatedAt: now,
        });
        setDraftId(id);
      }
      setSavedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const html = previewRef.current?.getHtml() ?? "";
      const res = await fetch("/api/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, fileName: formName?.replace(/\.(docx|hwp)$/i, "") }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `다운로드 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${formName?.replace(/\.(docx|hwp)$/i, "") || "이력서"}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
    }
  }

  if (!started) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-bold">이력서 작성</h1>
        <p className="mb-6 text-sm text-neutral-600">
          이력서 양식을 업로드하면 아카이빙된 정보로 자동 채운 초안을 바로 보여드립니다.
        </p>
        <FirebaseNotice />
        {error && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {existingDraft && (
          <button
            onClick={continueDraft}
            className="mb-4 flex w-full items-center justify-between rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 text-left hover:bg-neutral-100"
          >
            <span>
              <span className="font-medium">작성 중이던 초안이 있어요</span>
              <span className="ml-2 text-sm text-neutral-500">
                &quot;{existingDraft.formFileName}&quot;
              </span>
            </span>
            <span className="text-sm text-neutral-600">이어서 작성하기 →</span>
          </button>
        )}

        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-neutral-300 bg-white p-12 text-center transition hover:border-neutral-500">
          <span className="text-3xl">📄</span>
          <span className="text-lg font-semibold">
            이력서 양식을 업로드해서 이력서 작성을 시작하세요!
          </span>
          <span className="text-sm text-neutral-500">
            {uploadingForm
              ? "업로드 및 자동 채우기 중... (최대 30초 정도 걸려요)"
              : "어떤 양식이든 올려주세요 (DOCX 등)"}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFormUpload}
            disabled={uploadingForm}
          />
        </label>
        {process.env.NODE_ENV === "development" && (
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={seedDummyData}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              🧪 더미 데이터로 바로 초안 보기 (개발용)
            </button>
            <button
              onClick={loadSampleForm}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              🧪 실제 샘플 양식으로 미리보기 테스트 (개발용)
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">이력서 초안</h1>
          {formName && (
            <p className="text-sm text-neutral-500">&quot;{formName}&quot; 양식 기준</p>
          )}
        </div>
        <button
          onClick={() => setStarted(false)}
          className="text-sm text-neutral-500 hover:underline"
        >
          다시 업로드
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {fillStats && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          감지된 필드 {fillStats.total}개 중 <strong>{fillStats.matched}개</strong> 자동으로
          채웠어요. 나머지는 직접 입력해주세요.
        </div>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">최종 문서 미리보기</h2>
          {formFile && (
            <div className="flex items-center gap-2">
              {savedAt && <span className="text-xs text-green-700">저장됨</span>}
              <button
                onClick={handleSaveDraft}
                disabled={saving || !isFirebaseConfigured || !formFileUrl}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {downloading ? "변환 중..." : "다운로드 (.docx)"}
              </button>
            </div>
          )}
        </div>
        {formFile ? (
          <DocxLivePreview ref={previewRef} file={formFile} initialHtml={initialHtml} />
        ) : (
          <>
            <p className="mb-3 text-xs text-neutral-500">
              업로드된 원본 파일이 없어 필드 목록으로 대신 보여드립니다.
            </p>
            <dl className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2">
              {PROFILE_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-xs font-medium text-neutral-500">{label}</dt>
                  <dd className="text-sm text-neutral-900">{profile[key] || "-"}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">경력/경험</h2>
        <ul className="space-y-2">
          {experiences.map((exp) => (
            <li
              key={exp.id}
              className="rounded-lg border border-neutral-200 bg-white p-3 text-sm"
            >
              <span className="mr-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {exp.type ? TYPE_LABEL[exp.type] : "미분류"}
              </span>
              <span className="font-medium">{exp.기관}</span>
              {exp.역할 && <span className="text-neutral-500"> · {exp.역할}</span>}
              {exp.기간 && <span className="text-neutral-400"> ({exp.기간})</span>}
              {exp.설명 && <p className="mt-1 text-neutral-700">{exp.설명}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8 space-y-4">
        <h2 className="font-semibold">자기소개서 문항</h2>
        {MOCK_ESSAY_QUESTIONS.map((q) => (
          <EssayQuestionBlock key={q} question={q} allAnswers={coverLetterAnswers} />
        ))}
      </section>
    </div>
  );
}
