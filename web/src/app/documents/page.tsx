"use client";

import { useEffect, useRef, useState } from "react";
import FirebaseNotice from "@/components/FirebaseNotice";
import { isFirebaseConfigured } from "@/lib/firebase";
import { addDocumentRecord, deleteDocumentRecord, listDocuments } from "@/lib/firestore";
import { uploadDocumentFile } from "@/lib/storage";
import type { DocumentRecord } from "@/types";

const EXPIRY_WARNING_DAYS = 30;

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const docs = await listDocuments();
    setDocuments(docs);
    return docs;
  }

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    refresh()
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // 에이전트 A가 처리 중인 문서가 있으면 4초마다 상태를 다시 불러온다 (실행에 20~30초 정도 걸림).
  useEffect(() => {
    if (!documents.some((d) => d.status === "processing")) return;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [documents]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fileUrl = await uploadDocumentFile(file);
      // 분류·취득일·만료일은 사용자가 정하지 않는다 — 업로드 후 에이전트 A(Classify+Extract)가 채운다.
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
      await refresh();
      // 에이전트 A 실행은 20~30초 정도 걸려서 업로드 응답을 막지 않고 백그라운드로 트리거만 한다.
      fetch(`/api/documents/${docId}/process`, { method: "POST" }).catch(() => {});
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    await deleteDocumentRecord(id);
    await refresh();
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">서류함</h1>
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
        className={`mb-8 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 bg-white p-8 text-center transition hover:border-neutral-400 ${
          !isFirebaseConfigured ? "pointer-events-none opacity-40" : "cursor-pointer"
        }`}
      >
        <span className="text-2xl">＋</span>
        <span className="font-medium">자료 추가하기</span>
        <span className="text-xs text-neutral-500">
          {uploading ? "업로드 중..." : "클릭해서 파일 선택 (분류는 자동)"}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelected}
          disabled={uploading || !isFirebaseConfigured}
        />
      </label>

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
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    {d.status === "processing" ? (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                        분석 중...
                      </span>
                    ) : d.category ? (
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
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
    </div>
  );
}
