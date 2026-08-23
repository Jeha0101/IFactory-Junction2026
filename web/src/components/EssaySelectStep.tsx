"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { rankSimilarAnswers } from "@/lib/matchQuestions";
import type { CoverLetterAnswer } from "@/types";
import type { AnalyzedField } from "@/app/api/analyze-form/route";

// Figma "내용 선택하기"(2단계, node 130:6448) 이식 — Q1/Q2/Q3 탭으로 자소서 문항을 골라서,
// 기존에 써둔 자소서(coverLetterAnswers)에서 비슷한 문항의 답변을 찾아 후보로 보여주고
// "본문에 넣기"로 값에 반영한다. 매칭 로직은 matchQuestions.ts의 기존 휴리스틱을 그대로 씀.
export default function EssaySelectStep({
  essayFields,
  coverLetterAnswers,
  fieldValues,
  onInsert,
}: {
  essayFields: AnalyzedField[];
  coverLetterAnswers: CoverLetterAnswer[];
  fieldValues: Record<string, string>;
  onInsert: (fieldId: string, text: string) => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const current = essayFields[selectedIdx];
  const candidates = current ? rankSimilarAnswers(current.rawLabel, coverLetterAnswers, 3) : [];

  useEffect(() => {
    if (candidates.length === 0) return;
    setShowToast(true);
    const t = setTimeout(() => setShowToast(false), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx]);

  if (essayFields.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        선택할 자기소개서 문항이 이 양식에는 없어요.
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {showToast && (
        <div className="mb-4 rounded-xl bg-[rgba(45,113,249,0.7)] px-9 py-[18px] text-center">
          <p className="text-[16px] font-bold tracking-[-0.32px] text-white">
            이전에 작성한 내용에서 현재 문항과 관련된 답변을 찾았어요.
          </p>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {essayFields.map((f, i) => (
          <button
            key={f.id}
            onClick={() => setSelectedIdx(i)}
            className={`flex h-8 items-center justify-center rounded-md px-2.5 text-[18px] font-bold ${
              i === selectedIdx ? "bg-[#2D71F9] text-white" : "bg-white text-[#333]"
            }`}
          >
            Q{i + 1}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl bg-white">
        <div className="flex h-[52px] items-center justify-center gap-3 rounded-t-xl border-b border-neutral-100">
          <p className="text-[18px] text-[#2D71F9]">
            <span>{`Q${selectedIdx + 1}. `}</span>
            <span className="font-bold">{current.rawLabel}</span>
          </p>
          <ChevronRight size={20} className="text-[#2D71F9]" />
        </div>

        <div className="flex flex-col items-end gap-4 px-5 pb-5 pt-3.5">
          {candidates.length === 0 ? (
            <p className="w-full py-8 text-center text-sm text-neutral-400">
              비슷한 문항의 답변을 못 찾았어요 — 아래 칸에 직접 작성해주세요.
            </p>
          ) : (
            candidates.map((c, i) => (
              <div
                key={c.id}
                className={`flex w-full flex-col gap-1 rounded-xl px-5 py-4 ${
                  i === 0 ? "border border-[#2D71F9] bg-[rgba(45,113,249,0.1)]" : "bg-[#F7F7F7]"
                }`}
              >
                <p className="w-full text-[18px] leading-[1.6] text-[#333]">{c.answerText}</p>
                <div className="flex w-full items-end justify-between">
                  {c.fileName && (
                    <p className="text-[14px] text-[#929292] underline">{c.fileName}</p>
                  )}
                  <button
                    onClick={() => onInsert(current.id, c.answerText)}
                    className="ml-auto flex h-10 w-[120px] items-center justify-center rounded-lg bg-[#2D71F9] text-[16px] font-bold text-white hover:bg-[#215fdb]"
                  >
                    본문에 넣기
                  </button>
                </div>
              </div>
            ))
          )}

          <textarea
            value={fieldValues[current.id] ?? ""}
            onChange={(e) => onInsert(current.id, e.target.value)}
            placeholder="직접 작성하기"
            rows={5}
            className="w-full rounded-xl border border-neutral-200 p-3 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
