"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  file: File | Blob | null;
}

// 업로드/생성된 DOCX를 실제 Word 서식(표/폰트/레이아웃) 그대로 브라우저에 렌더링한다.
// ⚠️ 읽기 전용 미리보기다 — 값 편집은 옆의 필드 폼에서 하고, 이 컴포넌트는 /api/render-docx가
// 만들어준 "최종 결과물 그대로"를 보여주는 역할만 한다 (QA_수정요구사항.md §3-7: 미리보기를
// 직접 편집 가능하게 만들었다가 다운로드 시 다시 변환하면서 서식이 깨지는 문제가 있었음 —
// 편집과 렌더링을 분리해서 미리보기==다운로드 파일이 항상 같도록 함).
export default function DocxLivePreview({ file }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !containerRef.current) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    import("docx-preview").then(({ renderAsync }) => {
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = "";
      renderAsync(file, containerRef.current, undefined, {
        className: "docx-preview",
        inWrapper: false,
      })
        .catch((e) => !cancelled && setError(String(e)))
        .finally(() => !cancelled && setLoading(false));
    });

    return () => {
      cancelled = true;
    };
  }, [file]);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-xs text-neutral-500">
        <span>최종 문서 미리보기 (읽기 전용) — 값 수정은 아래 편집 항목에서 해주세요</span>
        {loading && <span>렌더링 중...</span>}
      </div>
      {error && <p className="p-4 text-sm text-red-600">{error}</p>}
      <div ref={containerRef} className="docx-live-preview max-h-[70vh] overflow-auto p-4" />
    </div>
  );
}
