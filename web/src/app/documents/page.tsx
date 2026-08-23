"use client";

import { useRef, useState } from "react";
import FirebaseNotice from "@/components/FirebaseNotice";
import { isFirebaseConfigured } from "@/lib/firebase";
import { addDocumentRecord, deleteDocumentRecord, updateDocumentRecord } from "@/lib/firestore";
import { uploadDocumentFile } from "@/lib/storage";
import { useAppData } from "@/lib/AppDataContext";
import { Search, ChevronDown, MoreHorizontal, Check, FilePlus2 } from "lucide-react";
import Link from "next/link";



const EXPIRY_WARNING_DAYS = 30;

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function DocumentsPage() {
  const { documents, loading } = useAppData();
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 여러 파일을 한 번에 올릴 수 있지만, 에이전트 처리를 동시에 여러 개 돌리면 에러가 날 수 있어
  // 순차 처리한다 (QA_수정요구사항.md §2-2).
  async function uploadFiles(files: File[]) {
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const fileUrl = await uploadDocumentFile(file);
        const docId = await addDocumentRecord({
          fileName: file.name,
          fileUrl,
          status: "processing",
          category: null,
          acquiredAt: null,
          expiresAt: null,
          linkedExperienceId: null,
          uploadedAt: new Date().toISOString(),
        });
        // onSnapshot이 목록을 알아서 갱신해준다 — 여기서 따로 refresh할 필요 없음.
        await fetch(`/api/documents/${docId}/process`, { method: "POST" }).catch(() => { });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    uploadFiles(files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    if (!isFirebaseConfigured || uploading) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) uploadFiles(files);
  }

  async function handleDelete(id: string) {
    await deleteDocumentRecord(id);
  }

  async function retryProcessing(id: string) {
    await updateDocumentRecord(id, { status: "processing", errorMessage: null });
    await fetch(`/api/documents/${id}/process`, { method: "POST" }).catch(() => { });
  }

  return (
    <div>
      {/* <h1 className="mb-1 text-2xl font-bold">서류함</h1>
      <p className="mb-6 text-sm text-neutral-600">
        이력서, 자소서, 자격증, 어학성적, 대외활동증명서 등 뭐든 그냥 올려주세요. 종류 분류와
        취득일·만료일은 AI가 알아서 파악합니다. (기능 3·4)
      </p>
      <FirebaseNotice />
      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mb-8 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition ${
          dragOver ? "border-neutral-500 bg-neutral-50" : "border-neutral-300 bg-white"
        } ${!isFirebaseConfigured ? "pointer-events-none opacity-40" : "cursor-pointer hover:border-neutral-400"}`}
      >
        <span className="text-2xl">＋</span>
        <span className="font-medium">자료 추가하기</span>
        <span className="text-xs text-neutral-500">
          {uploading ? "업로드 중..." : "클릭하거나 파일을 끌어다 놓으세요 (여러 개 가능, 분류는 자동)"}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelected}
          disabled={uploading || !isFirebaseConfigured}
        />
      </label> */}

      <div className="mb-3 flex h-16 items-center justify-between rounded-xl bg-[#EFEFEF] px-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="파일 이름"
          className="w-full bg-transparent text-[18px] text-[#333] placeholder:text-[#ACACAC] focus:outline-none"
        />
        <Search size={22} color="#ACACAC" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        {/* "생성한 이력서만 보기": 지금은 나의 이력서에 뜨는 게 전부 Resup으로 생성한 초안뿐이라
            필터링해도 결과가 똑같음 — 나중에 "직접 업로드한 완성본"류가 추가되면 실제로 갈릴 것. */}
        <div className="flex items-center gap-2 text-[16px] text-[#333]">
        </div>
        <button
          onClick={() => setSortAsc((v) => !v)}
          className="flex items-center gap-1 text-[16px] text-[#6E737C]"
        >
          {sortAsc ? "오래된순" : "최신순"}
          <ChevronDown size={14} />
        </button>
      </div>
      {loading ? (
        <p className="text-neutral-500">불러오는 중...</p>
      ) : documents.length === 0 ? (
        <p className="text-neutral-500">아직 업로드한 서류가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {documents.map((d) => {
            const remain = daysUntil(d.expiresAt);
            const isExpiringSoon = remain !== null && remain <= EXPIRY_WARNING_DAYS;
            const isExpired = remain !== null && remain < 0;
            return (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg bg-white p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    {d.status === "processing" ? (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                        분석 중...
                      </span>
                    ) : d.category ? (
                      <span className="rounded bg-neutral-110 px-8 py-5 text-xs text-neutral-600">
                        {d.category}
                      </span>
                    ) : (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">
                        분류 실패
                      </span>
                    )}
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {d.fileName}
                    </a>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {d.acquiredAt && <span>취득일 {d.acquiredAt} · </span>}
                    {d.expiresAt && <span>만료일 {d.expiresAt}</span>}
                  </div>
                  {isExpired && (
                    <p className="mt-1 text-xs font-medium text-red-600">만료되었습니다.</p>
                  )}
                  {!isExpired && isExpiringSoon && (
                    <p className="mt-1 text-xs font-medium text-amber-600">
                      {remain}일 후 만료됩니다.
                    </p>
                  )}
                  {d.status === "error" && (
                    <p className="mt-1 max-w-md text-xs text-red-500">
                      {d.errorMessage ?? "처리 중 문제가 발생했습니다."}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-neutral-500 hover:underline"
                  >
                    미리보기
                  </a>
                  {d.status === "error" && (
                    <button
                      onClick={() => retryProcessing(d.id)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      다시 시도
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/create-resume"
        className="fixed bottom-8 right-8 flex size-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <FilePlus2 size={24} />
      </Link>
    </div>
  );
}
