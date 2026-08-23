"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronDown, MoreHorizontal, Check, FilePlus2, X } from "lucide-react";
import { useAppData } from "@/lib/AppDataContext";
import { deleteResumeDraft } from "@/lib/firestore";
import { isFirebaseConfigured } from "@/lib/firebase";
import FirebaseNotice from "@/components/FirebaseNotice";
import DocPreviewModal from "@/components/DocPreviewModal";
import type { ResumeDraft } from "@/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function MyResumesPage() {
  const { resumeDrafts } = useAppData();
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<ResumeDraft | null>(null);

  const drafts = useMemo(() => {
    // 1. 검색어 정규화 (공백 제거, 소문자화, 한글 자모 조합 통일)
    const normalizedQuery = search.trim().toLowerCase().normalize("NFC");

    const filtered = normalizedQuery
      ? resumeDrafts.filter((d) => {
        const fileName = (d.formFileName ?? "").toLowerCase().normalize("NFC");
        const createdDate = formatDate(d.createdAt).toLowerCase();

        // 파일 이름 또는 생성일자에 검색어가 포함되어 있는지 확인
        return fileName.includes(normalizedQuery) || createdDate.includes(normalizedQuery);
      })
      : resumeDrafts;

    return [...filtered].sort((a, b) =>
      sortAsc
        ? (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "")
        : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
    );
  }, [resumeDrafts, search, sortAsc]);

  async function handleDelete(id: string) {
    setOpenMenuId(null);
    await deleteResumeDraft(id);
  }

  return (
    <div>
      {/* <h1 className="mb-1 text-2xl font-bold">나의 이력서</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Resup 에이전트로 만든 이력서를 모아서 보여드려요.
      </p> */}
      <FirebaseNotice />

      {previewDraft && (
        <DocPreviewModal
          title={previewDraft.formFileName}
          source={{
            kind: "draft",
            formFileUrl: previewDraft.formFileUrl,
            fieldValues: previewDraft.fieldValues,
          }}
          onClose={() => setPreviewDraft(null)}
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

      {drafts.length === 0 ? (
        <div className="rounded-xl bg-white py-16 text-center text-sm text-neutral-500">
          {isFirebaseConfigured
            ? "아직 만든 이력서가 없어요. 이력서 생성 탭에서 시작해보세요."
            : "Firebase가 설정되지 않아 목록을 표시할 수 없어요."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              onClick={() => setPreviewDraft(draft)}
              className="relative flex h-[108px] cursor-pointer items-center justify-between rounded-2xl bg-white px-8 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-md"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[24px] font-bold text-[#333]">{draft.formFileName}</p>
                <p className="mt-2 flex gap-2 text-[15px] text-[#B3B3B3]">
                  <span>생성일자</span>
                  <span>{formatDate(draft.createdAt)}</span>
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId((id) => (id === draft.id ? null : draft.id));
                }}
                className="shrink-0 rounded-full p-2 text-[#7F7F7F] hover:bg-neutral-100"
              >
                <MoreHorizontal size={24} />
              </button>
              {openMenuId === draft.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-9 top-16 z-10 w-36 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
                >
                  <Link
                    href={`/resume-preview?draft=${draft.id}`}
                    className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    이어서 작성
                  </Link>
                  <button
                    onClick={() => handleDelete(draft.id)}
                    className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* "+" = 새 이력서 만들기 시작점 — 실제 생성 흐름은 /resume-preview에 있음
          ("/create-resume"은 존재하지 않는 라우트였음, 2026-08-23 병합 중 발견해서 수정). */}
      <Link
        href="/resume-preview"
        className="fixed bottom-8 right-8 flex size-14 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <FilePlus2 size={24} />
      </Link>
    </div>
  );
}
