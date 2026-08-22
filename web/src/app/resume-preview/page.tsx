"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import FirebaseNotice from "@/components/FirebaseNotice";
import EssayQuestionBlock from "@/components/EssayQuestionBlock";
import DocxLivePreview from "@/components/DocxLivePreview";
import UploadProgressModal from "@/components/UploadProgressModal";
import ParsingLoadingScreen from "@/components/ParsingLoadingScreen";
import WizardHeader from "@/components/WizardHeader";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  addCoverLetterAnswer,
  addExperience,
  createResumeDraft,
  getLatestResumeDraft,
  getResumeDraft,
  saveProfile,
  updateResumeDraft,
} from "@/lib/firestore";
import { uploadDocumentFile } from "@/lib/storage";
import { useAppData } from "@/lib/AppDataContext";
import { MOCK_COVER_LETTER_ANSWERS, MOCK_EXPERIENCES, MOCK_PROFILE } from "@/lib/mockData";
import type { Experience, Profile, ResumeDraft } from "@/types";
import type { AnalyzedField } from "@/app/api/analyze-form/route";

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
  return (
    <Suspense fallback={null}>
      <ResumePreviewInner />
    </Suspense>
  );
}

function ResumePreviewInner() {
  const searchParams = useSearchParams();
  const [started, setStarted] = useState(false);
  const [uploadingForm, setUploadingForm] = useState(false);
  const [formName, setFormName] = useState<string | null>(null);
  const [formFileUrl, setFormFileUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<Blob | null>(null); // render-docx가 만든 최종 결과물
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 전역 캐시(AppDataProvider)에서 가져온다 — 이 페이지가 따로 Firestore를 다시 읽지 않는다.
  const cached = useAppData();
  const profile: Profile =
    isFirebaseConfigured && Object.keys(cached.profile).length > 0 ? cached.profile : MOCK_PROFILE;
  const experiences =
    isFirebaseConfigured && cached.experiences.length > 0
      ? cached.experiences
      : MOCK_EXPERIENCES.map((e, i) => ({ ...e, id: `mock-${i}` }));
  const coverLetterAnswers =
    isFirebaseConfigured && cached.coverLetterAnswers.length > 0
      ? cached.coverLetterAnswers
      : MOCK_COVER_LETTER_ANSWERS.map((a, i) => ({ ...a, id: `mock-${i}` }));

  const [fields, setFields] = useState<AnalyzedField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [fillStats, setFillStats] = useState<{
    total: number;
    matched: number;
    rejected: number;
  } | null>(null);

  const [existingDraft, setExistingDraft] = useState<ResumeDraft | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [formDragOver, setFormDragOver] = useState(false);
  const [showLoadedToast, setShowLoadedToast] = useState(false);
  const [uploadModal, setUploadModal] = useState<{
    fileName: string;
    fileSizeBytes: number;
    progress: number;
  } | null>(null);
  const uploadCancelledRef = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const draftIdParam = searchParams.get("draft");
    if (draftIdParam) {
      // 나의 이력서(/my-resumes) 목록에서 특정 초안을 골라 들어온 경우 — 그 초안을 바로 이어서 연다.
      getResumeDraft(draftIdParam).then((draft) => {
        if (!draft) return;
        setDraftId(draft.id);
        startWithForm(draft.formFileUrl, draft.formFileName, draft.fieldValues);
      });
      return;
    }
    getLatestResumeDraft()
      .then(setExistingDraft)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyzeAndRender(url: string, name: string, overrideValues?: Record<string, string>) {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: url, fileName: name }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `분석 실패 (${res.status})`);
      const data = await res.json();
      const analyzed = data.fields as AnalyzedField[];
      setFields(analyzed);
      setFillStats({
        total: data.totalFields,
        matched: data.matchedFields,
        rejected: data.rejectedFields,
      });

      const initialValues: Record<string, string> = {};
      for (const f of analyzed) initialValues[f.id] = f.value;
      const merged = { ...initialValues, ...overrideValues };
      setFieldValues(merged);

      setShowLoadedToast(true);
      setTimeout(() => setShowLoadedToast(false), 4000);

      await renderPreview(url, merged, analyzed);
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  async function renderPreview(
    url: string,
    values: Record<string, string>,
    fieldsForLabels: AnalyzedField[] = fields
  ) {
    setRendering(true);
    try {
      // ⚠️ fields state는 setFields 직후 같은 함수 안에서 바로 읽으면 아직 갱신 전이라
      // analyzeAndRender에서 호출할 땐 방금 분석한 목록을 fieldsForLabels로 직접 넘겨받는다.
      const rawLabelById = new Map(fieldsForLabels.map((f) => [f.id, f.rawLabel]));
      const res = await fetch("/api/render-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: url,
          values: Object.entries(values).map(([id, value]) => ({
            id,
            value,
            rawLabel: rawLabelById.get(id),
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `미리보기 생성 실패 (${res.status})`);
      setPreviewFile(await res.blob());
    } catch (e) {
      setError(String(e));
    } finally {
      setRendering(false);
    }
  }

  function updateFieldValue(id: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [id]: value }));
  }

  function refreshPreview() {
    if (!formFileUrl) return;
    renderPreview(formFileUrl, fieldValues);
  }

  async function startWithForm(url: string, name: string, overrideValues?: Record<string, string>) {
    setFormFileUrl(url);
    setFormName(name);
    setDraftId(null);
    setSavedAt(null);
    setStarted(true);
    if (isFirebaseConfigured) {
      await analyzeAndRender(url, name, overrideValues);
    } else {
      // Firebase/에이전트 연결 전엔 원본 파일을 그대로 미리보기로 보여준다.
      const blob = await (await fetch(url)).blob();
      setPreviewFile(blob);
    }
  }

  async function uploadFormFile(file: File) {
    uploadCancelledRef.current = false;
    setUploadingForm(true);
    setError(null);
    setUploadModal({ fileName: file.name, fileSizeBytes: file.size, progress: 0 });
    try {
      const url = isFirebaseConfigured
        ? await uploadDocumentFile(file, (percent) => {
            setUploadModal((m) => (m ? { ...m, progress: percent } : m));
          })
        : URL.createObjectURL(file);
      setUploadModal(null); // 업로드 끝 — 이후 분석 단계는 ParsingLoadingScreen(analyzing 상태)이 보여준다.
      if (uploadCancelledRef.current) return;
      await startWithForm(url, file.name);
    } catch (e) {
      setError(String(e));
      setUploadModal(null);
    } finally {
      setUploadingForm(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function cancelUpload() {
    uploadCancelledRef.current = true;
    setUploadModal(null);
  }

  function handleFormUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFormFile(file);
  }

  function handleFormDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setFormDragOver(false);
    if (uploadingForm) return;
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFormFile(file);
  }

  async function loadSampleForm() {
    setError(null);
    const absoluteUrl = `${window.location.origin}/samples/sample-form.docx`;
    await startWithForm(absoluteUrl, "(샘플) 2026년 ICT인턴십 지원서류.docx");
  }

  async function continueDraft() {
    if (!existingDraft) return;
    setError(null);
    await startWithForm(existingDraft.formFileUrl, existingDraft.formFileName, existingDraft.fieldValues);
    setDraftId(existingDraft.id);
  }

  async function seedDummyData() {
    if (!isFirebaseConfigured) {
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
      const now = new Date().toISOString();
      if (draftId) {
        await updateResumeDraft(draftId, { fieldValues, updatedAt: now });
      } else {
        const id = await createResumeDraft({
          formFileName: formName ?? "이력서",
          formFileUrl,
          fieldValues,
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
    if (!formFileUrl) return;
    setDownloading(true);
    setError(null);
    try {
      const rawLabelById = new Map(fields.map((f) => [f.id, f.rawLabel]));
      const res = await fetch("/api/render-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: formFileUrl,
          values: Object.entries(fieldValues).map(([id, value]) => ({
            id,
            value,
            rawLabel: rawLabelById.get(id),
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `다운로드 실패 (${res.status})`);
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
      <div className="flex min-h-[70vh] flex-col">
        {uploadModal && (
          <UploadProgressModal
            fileName={uploadModal.fileName}
            fileSizeBytes={uploadModal.fileSizeBytes}
            progress={uploadModal.progress}
            onCancel={cancelUpload}
          />
        )}
        {analyzing && <ParsingLoadingScreen onBack={() => setStarted(false)} />}
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

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setFormDragOver(true);
          }}
          onDragLeave={() => setFormDragOver(false)}
          onDrop={handleFormDrop}
          className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-[21px] rounded-xl text-center transition ${
            formDragOver ? "bg-[#eef3fe]" : ""
          }`}
        >
          <p className="text-[28px] font-bold text-[#404348]">새 이력서 만들기</p>
          <p className="text-[20px] text-[#6E737C]">
            새로운 이력서 양식을 끌어다 놓으면 새 이력서 만들기가 시작됩니다.
          </p>
          <span className="rounded-full bg-[#2D71F9] px-9 py-4 text-[18px] font-bold text-white">
            {uploadingForm ? "업로드 중..." : "이력서 양식 업로드"}
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

  const scalarFields = fields.filter((f) => !f.isEssay && !f.isRepeatable);
  const essayFields = fields.filter((f) => f.isEssay);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#F0F1F1]">
      {uploadModal && (
        <UploadProgressModal
          fileName={uploadModal.fileName}
          fileSizeBytes={uploadModal.fileSizeBytes}
          progress={uploadModal.progress}
          onCancel={cancelUpload}
        />
      )}
      {analyzing && <ParsingLoadingScreen onBack={() => setStarted(false)} />}

      <WizardHeader onBack={() => setStarted(false)} confirmEnabled={!analyzing && !!previewFile} />

      {showLoadedToast && (
        <div className="fixed left-1/2 top-[127px] z-20 -translate-x-1/2 rounded-xl bg-[rgba(45,113,249,0.7)] px-9 py-[18px]">
          <p className="text-[16px] font-bold tracking-[-0.32px] text-white">
            기본정보를 새로운 이력서에서 불러왔어요. 내용을 확인하고 잘못된 부분을 수정하세요.
          </p>
        </div>
      )}

      <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 py-8">
      {formName && (
        <p className="mb-4 text-sm text-neutral-500">&quot;{formName}&quot; 양식 기준</p>
      )}

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{error}</span>
          {formFileUrl && formName && (
            <button
              onClick={() => analyzeAndRender(formFileUrl, formName, fieldValues)}
              className="ml-4 shrink-0 rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-100"
            >
              다시 시도
            </button>
          )}
        </div>
      )}

      {fillStats && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          감지된 필드 {fillStats.total}개 중 <strong>{fillStats.matched}개</strong> 자동으로
          채웠어요.
          {fillStats.rejected > 0 && (
            <> ({fillStats.rejected}개는 라벨이 안 맞는 것 같아 안전하게 비워뒀어요.)</>
          )}{" "}
          나머지는 아래에서 직접 입력해주세요.
        </div>
      )}

      {previewFile && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">최종 문서 미리보기</h2>
            <div className="flex items-center gap-2">
              {savedAt && <span className="text-xs text-green-700">저장됨</span>}
              <button
                onClick={handleSaveDraft}
                disabled={saving || !isFirebaseConfigured}
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
          </div>
          <DocxLivePreview file={previewFile} />
        </section>
      )}

      {scalarFields.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">감지된 필드 (수정하면 미리보기에 반영돼요)</h2>
            <button
              onClick={refreshPreview}
              disabled={rendering}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              {rendering ? "반영 중..." : "미리보기 새로고침"}
            </button>
          </div>
          <div className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2">
            {scalarFields.map((f, i) => (
              // ⚠️ 같은 셀을 가리키는 필드가 2개 이상 나올 수 있음(예: 평균학점/총학점이 원래
              // "0.0점 / 4.5점" 한 칸에 같이 있던 경우) — 이땐 id가 겹쳐서 같은 값을 공유하게
              // 된다. React key 충돌만 막고, 값이 겹치는 건 알려진 제한사항으로 남겨둠
              // (QA_수정요구사항.md 참고).
              <label key={`${f.id}-${i}`} className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-neutral-700">{f.rawLabel}</span>
                <input
                  type="text"
                  data-field-id={f.id}
                  value={fieldValues[f.id] ?? ""}
                  onChange={(e) => updateFieldValue(f.id, e.target.value)}
                  onBlur={refreshPreview}
                  className="rounded-md border border-neutral-300 px-3 py-2 focus:border-neutral-500 focus:outline-none"
                />
              </label>
            ))}
          </div>
        </section>
      )}

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
        {fields.some((f) => f.isRepeatable) && (
          <p className="mt-2 text-xs text-neutral-400">
            (경력/경험을 문서의 반복 표(프로젝트 경험 등)에 자동으로 나눠 넣는 기능은 아직
            준비 중이에요 — 지금은 위 목록으로만 확인 가능합니다.)
          </p>
        )}
      </section>

      {essayFields.length > 0 && (
        <section className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">자기소개서 문항</h2>
            <button
              onClick={refreshPreview}
              disabled={rendering}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              {rendering ? "반영 중..." : "미리보기 새로고침"}
            </button>
          </div>
          {essayFields.map((f) => (
            <EssayQuestionBlock
              key={f.id}
              question={f.rawLabel}
              allAnswers={coverLetterAnswers}
              value={fieldValues[f.id] ?? ""}
              onChange={(v) => updateFieldValue(f.id, v)}
            />
          ))}
        </section>
      )}

      {!isFirebaseConfigured && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold">기본 정보 (참고용)</h2>
          <dl className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2">
            {PROFILE_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <dt className="text-xs font-medium text-neutral-500">{label}</dt>
                <dd className="text-sm text-neutral-900">{profile[key] || "-"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      </div>
    </div>
  );
}
