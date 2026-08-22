"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface DocxLivePreviewHandle {
  getHtml: () => string;
}

interface Props {
  file: File | Blob | null;
  // 있으면 파일을 다시 렌더링하지 않고 이 HTML로 복원한다 (저장된 초안 이어서 작성할 때)
  initialHtml?: string | null;
}

// 업로드된 DOCX를 실제 Word 서식(표/폰트/레이아웃) 그대로 브라우저에 렌더링하고,
// 그 렌더링 결과를 contentEditable로 만들어 "최종 출력 형태 그 안에서" 바로 편집할 수 있게 한다.
// ref.getHtml()로 현재 편집 상태를 꺼내서 저장(Firestore)하거나 다운로드(export API)에 쓸 수 있다.
const DocxLivePreview = forwardRef<DocxLivePreviewHandle, Props>(function DocxLivePreview(
  { file, initialHtml },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    getHtml: () => containerRef.current?.innerHTML ?? "",
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    if (initialHtml) {
      containerRef.current.innerHTML = initialHtml;
      containerRef.current.contentEditable = "true";
      return;
    }

    if (!file) return;
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
        .then(() => {
          if (cancelled || !containerRef.current) return;
          containerRef.current.contentEditable = "true";
        })
        .catch((e) => !cancelled && setError(String(e)))
        .finally(() => !cancelled && setLoading(false));
    });

    return () => {
      cancelled = true;
    };
  }, [file, initialHtml]);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-xs text-neutral-500">
        <span>최종 문서 미리보기 — 클릭해서 바로 수정할 수 있어요</span>
        {loading && <span>렌더링 중...</span>}
      </div>
      {error && <p className="p-4 text-sm text-red-600">{error}</p>}
      <div ref={containerRef} className="docx-live-preview max-h-[70vh] overflow-auto p-4" />
    </div>
  );
});

export default DocxLivePreview;
