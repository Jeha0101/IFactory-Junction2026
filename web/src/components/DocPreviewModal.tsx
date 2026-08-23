"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import DocxLivePreview from "@/components/DocxLivePreview";

type Source =
  | { kind: "file"; fileUrl: string }
  | { kind: "draft"; formFileUrl: string; fieldValues: Record<string, string> };

// 자료보관함/나의 이력서 공용 미리보기 모달. "file"은 업로드된 원본을 그대로 보여주고(PDF는
// iframe, DOCX는 docx-preview), "draft"는 이력서 초안의 현재 fieldValues로 render-docx를 한 번
// 더 호출해 "지금 상태 그대로"를 보여준다 — 다운로드와 같은 파이프라인이라 미리보기와 실제
// 결과물이 어긋나지 않는다.
export default function DocPreviewModal({
  title,
  source,
  onClose,
}: {
  title: string;
  source: Source;
  onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isPdf = source.kind === "file" && source.fileUrl.toLowerCase().includes(".pdf");
  const isDocx = source.kind === "draft" || source.fileUrl.toLowerCase().includes(".docx");

  useEffect(() => {
    let cancelled = false;
    setBlob(null);
    setError(null);
    setLoading(true);

    async function load() {
      try {
        if (source.kind === "file") {
          if (isPdf) return; // iframe이 바로 fileUrl을 가리키므로 따로 받아올 필요 없음
          if (!isDocx) return; // pdf/docx 둘 다 아니면 "새 탭에서 열기"로 폴백
          const res = await fetch(source.fileUrl);
          if (!res.ok) throw new Error(`파일을 불러오지 못했어요 (${res.status})`);
          const b = await res.blob();
          if (!cancelled) setBlob(b);
        } else {
          const res = await fetch("/api/render-docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileUrl: source.formFileUrl,
              values: Object.entries(source.fieldValues).map(([id, value]) => ({ id, value })),
            }),
          });
          if (!res.ok) throw new Error((await res.json()).error ?? "미리보기 생성 실패");
          const b = await res.blob();
          if (!cancelled) setBlob(b);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <p className="truncate text-lg font-bold text-[#333]">{title}</p>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
          >
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!error && source.kind === "file" && isPdf && (
            <iframe
              src={source.fileUrl}
              title={title}
              className="h-full w-full rounded-lg border border-neutral-200"
            />
          )}
          {!error && source.kind === "file" && !isPdf && !isDocx && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-neutral-500">
              <p>이 파일 형식은 미리보기를 지원하지 않아요.</p>
              <a
                href={source.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#2D71F9] hover:underline"
              >
                새 탭에서 열기
              </a>
            </div>
          )}
          {!error && isDocx && (loading ? <p className="p-4 text-sm text-neutral-400">불러오는 중...</p> : <DocxLivePreview file={blob} />)}
        </div>
      </div>
    </div>
  );
}
