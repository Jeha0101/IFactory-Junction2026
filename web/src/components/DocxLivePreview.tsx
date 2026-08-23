"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalyzedField } from "@/app/api/analyze-form/route";

interface Props {
  file: File | Blob | null;
  /** 있으면 라벨 옆 칸을 문서 안에서 바로 클릭해서 편집할 수 있게 만든다 (자소서형 제외 —
   * 그건 "내용 선택하기" 단계에서 따로 다룬다). */
  fields?: AnalyzedField[];
  fieldValues?: Record<string, string>;
  onFieldChange?: (id: string, value: string) => void;
}

function normalizeLabel(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
}

// 업로드/생성된 DOCX를 실제 Word 서식(표/폰트/레이아웃) 그대로 브라우저에 렌더링한다.
// ⚠️ 여기서 사용자가 셀을 클릭해 직접 타이핑해도, 그 편집 내용을 HTML→docx로 재변환하는 게
// 아니다 — 화면에 그려진 이 HTML은 항상 python-docx(render-docx)가 만든 최종 결과물을
// "보여주기만" 하는 read-only 스냅샷이고, 실제 값은 오직 fieldValues(React 상태)에만
// 저장된다. 셀에서 blur되면 onFieldChange로 fieldValues를 갱신 → 부모가 render-docx를
// 다시 호출해 python-docx로 정확히 재조립한 새 스냅샷을 다시 그린다. 그래서 "문서를 직접
// 고치는" 느낌을 주면서도, 예전에 겪었던 "미리보기용 HTML을 그대로 docx로 되돌리다 서식이
// 깨지는" 문제(QA_수정요구사항.md §3-7)가 구조적으로 재발하지 않는다.
export default function DocxLivePreview({ file, fields, fieldValues, onFieldChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editableFields = (fields ?? []).filter((f) => !f.isEssay);

  useEffect(() => {
    if (!file || !containerRef.current) return;
    // 지금 어느 칸이 편집 중(포커스)이면 새로 그리지 않는다 — 타이핑 도중에 문서 전체를
    // 다시 그리면 커서/포커스가 날아간다. 다음 blur 이후 변경분이 오면 그때 그린다.
    if (containerRef.current.contains(document.activeElement)) return;

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
          wireEditableCells(containerRef.current);
        })
        .catch((e) => !cancelled && setError(String(e)))
        .finally(() => !cancelled && setLoading(false));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function wireEditableCells(container: HTMLDivElement) {
    if (editableFields.length === 0) return;
    const cells = Array.from(container.querySelectorAll("td, th")) as HTMLElement[];
    for (const field of editableFields) {
      const needle = normalizeLabel(field.rawLabel);
      if (!needle) continue;
      const labelCell = cells.find((c) => normalizeLabel(c.textContent ?? "") === needle);
      if (!labelCell) continue;
      // ⚠️ 라벨 칸 바로 다음 칸이 없으면(표 전체 폭을 차지하는 섹션 제목 행, 예: "활동사항"
      // colspan=7) 편집 가능하게 만들 대상이 없다는 뜻 — 라벨 칸 자신을 편집 가능하게
      // 만들면 섹션 제목 자체가 덮어써진다(python 쪽 fill_values에서 실측 확인된 것과 같은
      // 버그). 그 경우 이 필드는 그냥 배선하지 않고 건너뛴다.
      const targetCell = labelCell.nextElementSibling as HTMLElement | null;
      if (!targetCell) continue;
      targetCell.contentEditable = "true";
      targetCell.dataset.fieldId = field.id;
      targetCell.textContent = fieldValues?.[field.id] ?? "";
      targetCell.classList.add("docx-editable-cell");
      targetCell.addEventListener("blur", () => {
        onFieldChange?.(field.id, targetCell.textContent?.trim() ?? "");
      });
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-xs text-neutral-500">
        <span>
          {editableFields.length > 0
            ? "파란 칸을 클릭해서 바로 수정하세요"
            : "최종 문서 미리보기 (읽기 전용)"}
        </span>
        {loading && <span>렌더링 중...</span>}
      </div>
      {error && <p className="p-4 text-sm text-red-600">{error}</p>}
      <div ref={containerRef} className="docx-live-preview max-h-[70vh] overflow-auto p-4" />
    </div>
  );
}
