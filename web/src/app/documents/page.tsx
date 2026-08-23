"use client";

import { useRef, useState, useMemo } from "react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { addDocumentRecord, deleteDocumentRecord, updateDocumentRecord } from "@/lib/firestore";
import { uploadDocumentFile } from "@/lib/storage";
import { useAppData } from "@/lib/AppDataContext";
import { Search, ChevronDown, FilePlus2, MoreHorizontal, X } from "lucide-react";
import DocPreviewModal from "@/components/DocPreviewModal";
import type { DocumentRecord } from "@/types";

const EXPIRY_WARNING_DAYS = 30;

function formatDate(dateStr: string): string {
  return dateStr.replace(/-/g, ".");
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Figma "증빙자료 관리 탭"(node 130:6815) 이식 — 미리보기 버튼은 따로 없고 칸을 클릭하면 바로
// 미리보기가 뜨고, 삭제는 "나의 이력서"와 같은 패턴으로 "..." 버튼을 눌러야 나온다.
export default function DocumentsPage() {
  const { documents, loading } = useAppData();
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
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

  async function handleDelete(id: string) {
    setOpenMenuId(null);
    await deleteDocumentRecord(id);
  }

  async function retryProcessing(id: string) {
    setOpenMenuId(null);
    await updateDocumentRecord(id, { status: "processing", errorMessage: null });
    await fetch(`/api/documents/${id}/process`, { method: "POST" }).catch(() => { });
  }

  const sorted = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase().normalize("NFC");

    const filtered = normalizedQuery
      ? documents.filter((d) => {
        const fileName = (d.fileName ?? "").toLowerCase().normalize("NFC");
        const category = (d.category ?? "").toLowerCase().normalize("NFC");
        const acquiredAt = (d.acquiredAt ?? "").toLowerCase();
        const expiresAt = (d.expiresAt ?? "").toLowerCase();

        return (
          fileName.includes(normalizedQuery) ||
          category.includes(normalizedQuery) ||
          acquiredAt.includes(normalizedQuery) ||
          expiresAt.includes(normalizedQuery)
        );
      })
      : documents;

    return [...filtered].sort((a, b) =>
      sortAsc
        ? (a.uploadedAt ?? "").localeCompare(b.uploadedAt ?? "")
        : (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? "")
    );
  }, [documents, search, sortAsc]);

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {previewDoc && (
        <DocPreviewModal
          title={previewDoc.fileName}
          source={{ kind: "file", fileUrl: previewDoc.fileUrl }}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      <div className="mb-4 flex h-14 items-center justify-between rounded-2xl bg-[#F0F1F4] px-6 transition-all focus-within:ring-2 focus-within:ring-[#2563EB]/30">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="파일 이름"
          className="w-full bg-transparent text-[16px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="rounded-full p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
          >
            <X size={18} />
          </button>
        ) : (
          <Search size={20} className="text-neutral-400" />
        )}
      </div>

      <div className="mb-3 flex items-center justify-end">
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
      ) : sorted.length === 0 ? (
        <p className="text-neutral-500">
          {search ? "검색 결과가 없습니다." : "아직 업로드한 서류가 없습니다."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((d) => {
            const remain = daysUntil(d.expiresAt);
            const isExpiringSoon = remain !== null && remain <= EXPIRY_WARNING_DAYS;
            return (
              <div
                key={d.id}
                onClick={() => setPreviewDoc(d)}
                className="relative flex h-[122px] cursor-pointer items-center justify-between rounded-xl bg-white px-9 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {d.status === "processing" && (
                      <span className="shrink-0 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                        분석 중...
                      </span>
                    )}
                    {d.status === "error" && (
                      <span className="shrink-0 rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">
                        분류 실패
                      </span>
                    )}
                    <p className="truncate text-[24px] font-bold text-[#333]">{d.fileName}</p>
                  </div>
                  <p className="mt-2 flex gap-2 text-[15px] text-[#B3B3B3]">
                    <span>생성일자</span>
                    <span>{formatDate(d.uploadedAt.slice(0, 10))}</span>
                  </p>
                  {d.status === "error" && d.errorMessage && (
                    <p className="mt-1 max-w-md truncate text-xs text-red-500">{d.errorMessage}</p>
                  )}
                </div>

                {d.expiresAt && (
                  <div
                    className={`mr-4 flex shrink-0 items-center justify-center rounded px-2.5 py-1 text-[14px] ${
                      isExpiringSoon
                        ? "bg-[rgba(255,47,47,0.1)] text-[#FF2F2F]"
                        : "bg-[#F0F0F0] text-[#707070]"
                    }`}
                  >
                    <span className="font-bold">만료일 </span>
                    <span>{formatDate(d.expiresAt)}</span>
                  </div>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId((id) => (id === d.id ? null : d.id));
                  }}
                  className="shrink-0 rounded-full p-2 text-[#7F7F7F] hover:bg-neutral-100"
                >
                  <MoreHorizontal size={24} />
                </button>

                {openMenuId === d.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-9 top-16 z-10 w-36 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
                  >
                    {d.status === "error" && (
                      <button
                        onClick={() => retryProcessing(d.id)}
                        className="block w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                      >
                        다시 시도
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 우측 하단 "+" 버튼 = 자료 업로드 진입점(기존 드롭존 대체). 여러 개 선택 가능. */}
      <label
        className={`fixed bottom-8 right-8 flex size-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${uploading || !isFirebaseConfigured ? "pointer-events-none opacity-50" : "cursor-pointer"
          }`}
      >
        <FilePlus2 size={24} />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelected}
          disabled={uploading || !isFirebaseConfigured}
        />
      </label>
    </div>
  );
}
