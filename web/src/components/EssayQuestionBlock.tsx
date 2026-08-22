"use client";

import { rankSimilarAnswers } from "@/lib/matchQuestions";
import type { CoverLetterAnswer } from "@/types";

export default function EssayQuestionBlock({
  question,
  allAnswers,
  value,
  onChange,
}: {
  question: string;
  allAnswers: CoverLetterAnswer[];
  value: string;
  onChange: (value: string) => void;
}) {
  const candidates = rankSimilarAnswers(question, allAnswers, 3);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="mb-2 font-medium">Q. {question}</p>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="(해당 항목에 대해 작성하세요)"
        rows={4}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />

      {candidates.length > 0 ? (
        <div className="mt-3 rounded-md bg-neutral-50 p-3">
          <p className="mb-2 text-sm font-medium text-neutral-700">
            기존 자료에서 비슷한 질문을 찾았어요!
          </p>
          <ul className="space-y-3">
            {candidates.map((c, i) => (
              <li key={c.id ?? i} className="rounded-md border border-neutral-200 bg-white p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                  <span>
                    {i + 1}. 파일명: {c.fileName ?? "출처 파일"}
                  </span>
                  {c.fileUrl && (
                    <a
                      href={c.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-neutral-500 hover:underline"
                    >
                      바로가기
                    </a>
                  )}
                </div>
                <p className="text-sm text-neutral-700">
                  <span className="font-medium">Q</span> {c.questionText}
                </p>
                <p className="mt-1 text-sm text-neutral-700">
                  <span className="font-medium">A</span> {c.answerText}
                </p>
                <button
                  onClick={() => onChange(c.answerText)}
                  className="mt-2 text-sm font-medium text-neutral-900 hover:underline"
                >
                  → 삽입하기
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">
          아직 이 질문과 비슷한 자기소개서 답변을 찾지 못했습니다. 직접 작성해주세요.
        </p>
      )}
    </div>
  );
}
