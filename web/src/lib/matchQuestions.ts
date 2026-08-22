// 자소서 문항 유사도 매칭 — 임시(휴리스틱) 버전.
// 실제로는 에이전트가 Solar Pro2(Instruct)로 의미 기반 판단을 한다 (Agent_요구사항명세서.md §4,
// IFactory개발명세초안.md §3 기능2). 백엔드 연동 전까지 화면을 테스트하기 위한 자리표시자다.

import type { CoverLetterAnswer } from "@/types";

function tokenize(text: string): string[] {
  return text
    .replace(/[.,!?()"'~*]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function sharedPrefixLen(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  return i;
}

export function rankSimilarAnswers(
  targetQuestion: string,
  candidates: CoverLetterAnswer[],
  topN = 3
): CoverLetterAnswer[] {
  const targetTokens = tokenize(targetQuestion);

  const scored = candidates.map((c) => {
    const candidateTokens = tokenize(c.questionText);
    let score = 0;
    for (const t of targetTokens) {
      let best = 0;
      for (const ct of candidateTokens) {
        best = Math.max(best, sharedPrefixLen(t, ct));
      }
      if (best >= 2) score += best;
    }
    return { c, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.c);
}
