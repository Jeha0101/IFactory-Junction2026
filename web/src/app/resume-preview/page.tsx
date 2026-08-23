"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FirebaseNotice from "@/components/FirebaseNotice";
import DocxLivePreview from "@/components/DocxLivePreview";
import UploadProgressModal from "@/components/UploadProgressModal";
import ParsingLoadingScreen from "@/components/ParsingLoadingScreen";
import WizardHeader from "@/components/WizardHeader";
import EssaySelectStep from "@/components/EssaySelectStep";
import { isFirebaseConfigured } from "@/lib/firebase";
import { createResumeDraft, getResumeDraft, updateResumeDraft } from "@/lib/firestore";
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
  const router = useRouter();
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

  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [formDragOver, setFormDragOver] = useState(false);
  const [showLoadedToast, setShowLoadedToast] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [expSelections, setExpSelections] = useState<Record<string, Set<string>>>({});
  const renderRequestSeqRef = useRef(0);
  const [uploadModal, setUploadModal] = useState<{
    fileName: string;
    fileSizeBytes: number;
    progress: number;
  } | null>(null);
  const uploadCancelledRef = useRef(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const draftIdParam = searchParams.get("draft");
    if (!draftIdParam) return;
    // 나의 이력서(/my-resumes) 목록에서 특정 초안을 골라 들어온 경우 — 그 초안을 바로 이어서 연다.
    getResumeDraft(draftIdParam).then((draft) => {
      if (!draft) return;
      setDraftId(draft.id);
      startWithForm(draft.formFileUrl, draft.formFileName, draft.fieldValues);
    });
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
    const requestId = ++renderRequestSeqRef.current;
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
      const blob = await res.blob();
      // 타이핑하면서 연달아 요청이 나갈 수 있는데, 응답은 순서가 뒤바뀌어 도착할 수 있다 —
      // 가장 마지막에 "보낸" 요청의 결과만 반영해서 오래된 응답이 최신 내용을 덮어쓰지 않게 함.
      if (requestId === renderRequestSeqRef.current) setPreviewFile(blob);
    } catch (e) {
      if (requestId === renderRequestSeqRef.current) setError(String(e));
    } finally {
      if (requestId === renderRequestSeqRef.current) setRendering(false);
    }
  }

  function updateFieldValue(id: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [id]: value }));
  }

  function formatExperienceForField(exp: Experience): string {
    const header = [exp.기관, exp.역할, exp.기간].filter(Boolean).join(" · ");
    return exp.설명 ? `${header}\n${exp.설명}` : header;
  }

  // 경력/경험 카드에서 "+ {필드명}" 버튼을 누르면 그 반복형 필드(예: 프로젝트 경험)에
  // 선택한 경험들을 이어붙여 넣는다. 표의 반복 행에 하나씩 나눠 넣는 게 아니라 한 칸에
  // 텍스트로 몰아넣는 방식 — 진짜 "행 단위로 나눠 넣기"는 아직 없음(README/QA 문서 참고).
  function toggleExperienceForField(fieldId: string, exp: Experience) {
    const nextSet = new Set(expSelections[fieldId] ?? []);
    if (nextSet.has(exp.id)) nextSet.delete(exp.id);
    else nextSet.add(exp.id);
    setExpSelections((prev) => ({ ...prev, [fieldId]: nextSet }));
    const joined = experiences
      .filter((e) => nextSet.has(e.id))
      .map(formatExperienceForField)
      .join("\n\n");
    updateFieldValue(fieldId, joined);
  }

  // 필드 값이 바뀔 때마다(타이핑 중 포함) 500ms 묶어서 미리보기에 자동 반영한다 — 별도
  // "새로고침" 버튼 없이 오른쪽에서 고치면 왼쪽 미리보기가 바로바로 따라오는 느낌을 준다.
  // ⚠️ 이 스케줄링은 setFieldValues 업데이터 함수 안이 아니라 여기 effect에서 해야 한다 —
  // 업데이터 함수는 React가 개발 모드에서 두 번 호출할 수 있어서, 그 안에서 setTimeout 같은
  // 부작용을 실행하면 요청이 중복으로 나가고 응답 순서가 뒤바뀌어 최신 값을 덮어쓸 수 있다.
  useEffect(() => {
    if (!formFileUrl || !started) return;
    const t = setTimeout(() => renderPreview(formFileUrl, fieldValues), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValues]);

  async function startWithForm(url: string, name: string, overrideValues?: Record<string, string>) {
    setFormFileUrl(url);
    setFormName(name);
    setDraftId(null);
    setSavedAt(null);
    setStarted(true);
    setStep(1);
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

  async function finishStep2() {
    // "내용 선택하기"에서 수정완료를 누르면 초안을 저장하고 나의 이력서 목록으로 보낸다 —
    // 이 화면 이후에 대한 Figma 디자인은 아직 없어서 임의로 정한 동작.
    await handleSaveDraft();
    router.push("/my-resumes");
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
      </div>
    );
  }

  const essayFields = fields.filter((f) => f.isEssay);
  const repeatableFields = fields.filter((f) => f.isRepeatable && !f.isEssay);
  const editableDocFields = fields.filter((f) => !f.isEssay);

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

      <WizardHeader
        activeStep={step}
        onBack={() => (step === 2 ? setStep(1) : setStarted(false))}
        confirmEnabled={!analyzing && !!previewFile}
        onConfirm={step === 1 ? () => setStep(2) : finishStep2}
      />

      {error && (
        <div className="mx-9 mt-4 flex items-center justify-between rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
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

      {step === 1 ? (
        // 1단계: 왼쪽은 문서(값 칸을 바로 클릭해서 고침 — DocxLivePreview의 contentEditable
        // 배선), 오른쪽은 경력/경험 목록 — "+ 필드명"을 누르면 해당 반복형 칸에 바로 채워진다.
        <div className="flex min-h-0 flex-1 gap-6 overflow-hidden px-9 py-6">
          <div className="flex min-w-0 flex-[3] flex-col overflow-y-auto">
            {formName && (
              <p className="mb-2 text-sm text-neutral-500">&quot;{formName}&quot; 양식 기준</p>
            )}

            {showLoadedToast && (
              <div className="mb-4 rounded-xl bg-[rgba(45,113,249,0.7)] px-5 py-3">
                <p className="text-sm font-bold tracking-[-0.32px] text-white">
                  기본정보를 새로운 이력서에서 불러왔어요. 내용을 확인하고 잘못된 부분을 수정하세요.
                </p>
              </div>
            )}
            {fillStats && (
              <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                감지된 필드 {fillStats.total}개 중 <strong>{fillStats.matched}개</strong> 자동으로
                채웠어요.
                {fillStats.rejected > 0 && (
                  <> ({fillStats.rejected}개는 라벨이 안 맞는 것 같아 비워뒀어요.)</>
                )}
              </div>
            )}

            <div className="mb-3 flex items-center justify-end gap-2">
              {savedAt && <span className="text-xs text-green-700">저장됨</span>}
              <button
                onClick={handleSaveDraft}
                disabled={saving || !isFirebaseConfigured}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                {downloading ? "변환 중..." : "다운로드"}
              </button>
            </div>

            {previewFile ? (
              <DocxLivePreview
                file={previewFile}
                fields={editableDocFields}
                fieldValues={fieldValues}
                onFieldChange={updateFieldValue}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
                미리보기 준비 중...
              </div>
            )}

            {!isFirebaseConfigured && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-semibold text-neutral-500">기본 정보 (참고용)</h3>
                <dl className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-xs">
                  {PROFILE_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <dt className="font-medium text-neutral-500">{label}</dt>
                      <dd className="text-neutral-900">{profile[key] || "-"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-[2] flex-col overflow-y-auto">
            <h3 className="mb-2 text-xs font-semibold text-neutral-500">경력/경험</h3>
            <ul className="space-y-2">
              {experiences.map((exp) => (
                <li
                  key={exp.id}
                  className="rounded-lg border border-neutral-200 bg-white p-2.5 text-xs"
                >
                  <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                    {exp.type ? TYPE_LABEL[exp.type] : "미분류"}
                  </span>
                  <span className="font-medium">{exp.기관}</span>
                  {exp.역할 && <span className="text-neutral-500"> · {exp.역할}</span>}
                  {exp.기간 && <span className="text-neutral-400"> ({exp.기간})</span>}
                  {exp.설명 && <p className="mt-1 text-neutral-700">{exp.설명}</p>}
                  {repeatableFields.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {repeatableFields.map((f) => {
                        const active = expSelections[f.id]?.has(exp.id) ?? false;
                        return (
                          <button
                            key={f.id}
                            onClick={() => toggleExperienceForField(f.id, exp)}
                            className={`rounded-full border px-2 py-0.5 text-[10px] ${
                              active
                                ? "border-[#2D71F9] bg-[#2D71F9] text-white"
                                : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                            }`}
                          >
                            {active ? "✓ " : "+ "}
                            {f.rawLabel}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        // 2단계: 왼쪽은 읽기 전용 문서, 오른쪽은 자소서 문항 선택.
        <div className="flex min-h-0 flex-1 gap-6 overflow-hidden px-9 py-6">
          <div className="flex min-w-0 flex-[3] flex-col overflow-y-auto">
            {previewFile && <DocxLivePreview file={previewFile} />}
          </div>
          <div className="flex min-w-0 flex-[2] flex-col overflow-y-auto">
            <EssaySelectStep
              essayFields={essayFields}
              coverLetterAnswers={coverLetterAnswers}
              fieldValues={fieldValues}
              onInsert={updateFieldValue}
            />
          </div>
        </div>
      )}
    </div>
  );
}
