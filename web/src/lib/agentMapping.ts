// 에이전트 A(Extract) 출력 → 우리 Firestore 모델(Korean 키) 변환.
//
// 실제 호출로 확인된 에이전트 A의 실제 필드 어휘 (2026-08-23, 영어 snake_case):
//   korea_name, english_name, professional_title, phone_number, email_address, address,
//   linkedin_url, sns, date_of_birth, gender, university, major, my_gpa, avg_gpa, military,
//   education_records[], work_experience_records[], project_experience_records[],
//   skills[], award[], language_tests[], self_introduce[]
//
// 2026-08-23 업데이트: 팀원이 학교/전공 분리(university/major), 평균·총학점 분리
// (my_gpa=평균학점, avg_gpa=총학점 — 이름이 직관과 반대라 헷갈리기 쉬움, 힌트 "0.0점/4.5점"
// 순서로 확인함), 자소서 Q&A 리스트 추출(self_introduce: [{question, answer}])을 반영함.
//
// 에이전트 B의 canonicalKey도 같은 영어 어휘를 쓴다(korea_name, date_of_birth, gender, address,
// university, my_gpa, avg_gpa 등 확인됨) — 두 에이전트가 이미 서로 일치하므로, 번역은 여기
// (우리 쪽 Firestore/UI 표시용)에서만 한 번 한다. 매칭(A값 ↔ B빈칸)은 원본 영어 키로 바로 하면
// 되고 번역을 거칠 필요 없다.

import type { CoverLetterAnswer, Experience, ExperienceType, Profile } from "@/types";

export interface AgentAExtract {
  korea_name?: string;
  english_name?: string;
  professional_title?: string;
  phone_number?: string;
  email_address?: string;
  address?: string;
  linkedin_url?: string;
  sns?: string;
  date_of_birth?: string;
  gender?: string;
  university?: string;
  major?: string;
  my_gpa?: string;
  avg_gpa?: string;
  military?: string;
  education_records?: Record<string, unknown>[];
  work_experience_records?: Record<string, unknown>[];
  project_experience_records?: Record<string, unknown>[];
  skills?: Record<string, unknown>[];
  award?: Record<string, unknown>[];
  language_tests?: Record<string, unknown>[];
  self_introduce?: { question?: string; answer?: string }[];
  [key: string]: unknown;
}

const PROFILE_FIELD_MAP: Partial<Record<keyof AgentAExtract, keyof Profile>> = {
  korea_name: "이름",
  date_of_birth: "생년월일",
  gender: "성별",
  address: "주소",
  phone_number: "연락처",
  email_address: "이메일",
  university: "학교",
  major: "전공",
  my_gpa: "평균학점",
  avg_gpa: "총학점",
  military: "병역",
  linkedin_url: "포트폴리오링크",
};

// canonicalKey별로 "실제 라벨에 이 키워드 중 하나는 있어야 말이 된다"는 최소한의 상식 체크.
// 에이전트 B의 cellRef가 완전히 다른 행을 가리키는 사고(§3-1)를 막기 위한 교차검증용.
// 키워드가 하나도 안 걸리면 그 필드는 신뢰하지 않고 빈칸으로 남긴다(값을 안 쓰는 것보다
// 엉뚱한 사람 정보로 채우는 게 훨씬 나쁘다).
export const CANONICAL_KEY_KEYWORDS: Record<string, string[]> = {
  korea_name: ["성명", "이름"],
  english_name: ["영문", "english"],
  professional_title: ["직함", "타이틀", "title"],
  phone_number: ["연락처", "전화", "휴대폰", "hp"],
  email_address: ["e-mail", "이메일", "메일", "email"],
  address: ["주소"],
  linkedin_url: ["포트폴리오", "github", "notion", "blog", "링크", "linkedin"],
  sns: ["sns"],
  date_of_birth: ["생년월일", "생일"],
  gender: ["성별"],
  major: ["전공", "학과"],
  school: ["대학", "학교"],
  university: ["대학", "학교"],
  my_gpa: ["학점", "평점"],
  avg_gpa: ["학점", "총점", "만점"],
  military: ["병역"],
};

// 라벨은 보통 짧다("성명", "생년월일(나이)"). 안내문/제목처럼 긴 문장은 우연히 키워드를
// 포함하고 있어도("...본인 성명으로 변경...") 실제 라벨이 아니므로 검증 대상에서 뺀다.
// (실제로 에이전트 B가 표 자체를 완전히 잘못 짚었는데, 그 표의 안내문에 우연히 "성명"이라는
// 단어가 들어있어서 검증을 통과해버린 사고가 있었음 — 2026-08-23 확인)
const LABEL_MAX_LENGTH = 25;

/** 라벨 비교용 정규화 — 공백/하이픈 표기 차이를 무시한다("E - mail" vs "e-mail" 같은 경우,
 * 실제 문서에서 확인됨 2026-08-23). */
function normalizeLabel(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
}

/** rowLabels(그 cellRef가 속한 행의 실제 라벨 텍스트들)에 canonicalKey의 키워드가 하나라도
 * 있는지 확인한다. 이 canonicalKey에 등록된 키워드가 없으면(모르는 키) 검증을 건너뛰고 통과시킨다. */
export function isPlausibleMatch(canonicalKey: string, rowLabels: string[]): boolean {
  const keywords = CANONICAL_KEY_KEYWORDS[canonicalKey];
  if (!keywords || keywords.length === 0) return true; // 모르는 키는 막지 않음
  const shortLabels = rowLabels.filter((t) => t.length <= LABEL_MAX_LENGTH);
  const haystack = normalizeLabel(shortLabels.join(" "));
  return keywords.some((kw) => haystack.includes(normalizeLabel(kw)));
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** 에이전트 A 출력 중 값이 있는 필드만 Profile(한글 키) 패치로 변환한다 (빈 값은 덮어쓰지 않음). */
export function extractToProfilePatch(data: AgentAExtract): Partial<Profile> {
  const patch: Partial<Profile> = {};
  for (const [enKey, koKey] of Object.entries(PROFILE_FIELD_MAP) as [
    keyof AgentAExtract,
    keyof Profile,
  ][]) {
    const value = data[enKey];
    if (nonEmpty(value)) {
      patch[koKey] = value as string;
    }
  }
  return patch;
}

/**
 * 에이전트 A는 레코드 종류(work/project/skill/award)마다 필드명을 조금씩 다르게 준다
 * (예: award는 award_organization/award_detail/award_period 처럼 접두사가 붙음). 후보 키로
 * 못 찾은 나머지 값도 원본 JSON 문법 그대로 노출하지 말고 "값만" 이어붙여서 최소한 사람이
 *읽을 수 있는 텍스트로 만든다 — 새로운 필드명이 또 나와도 원본 JSON이 화면에 새지 않는다.
 */
function recordToExperience(
  record: Record<string, unknown>,
  type: ExperienceType,
  sourceDocumentId: string
): Omit<Experience, "id"> {
  const used = new Set<string>();
  const pick = (keys: string[]): string => {
    for (const k of keys) {
      const v = record[k];
      if (nonEmpty(v)) {
        used.add(k);
        return v;
      }
    }
    return "";
  };

  const 기관 = pick([
    "project_name",
    "company_name",
    "organization",
    "organization_name",
    "experience_section",
    "skill_category",
    "award_name",
    "award_organization",
    "name",
  ]);
  const 역할 = pick(["role", "position", "position_title"]);
  const start = pick(["start_date"]);
  const end = pick(["end_date"]);
  const duration = pick(["duration_text", "period", "date", "award_period"]);
  const 기간 = duration || [start, end].filter(Boolean).join(" ~ ");
  const knownDesc = pick(["description", "skill_items", "tools", "detail", "award_detail"]);

  const leftover = Object.entries(record)
    .filter(([k, v]) => !used.has(k) && nonEmpty(v))
    .map(([, v]) => v as string);
  const 설명 = [knownDesc, ...leftover].filter(Boolean).join(" · ");

  return { 기관, 역할, 기간, 설명, type, sourceDocumentId };
}

/** 에이전트 A 출력 중 스칼라(문자열) 필드만 뽑아 원본 영어 키 그대로 반환한다.
 * 에이전트 B의 canonicalKey와 번역 없이 직접 매칭하기 위한 용도(§4 매칭 단계). */
export function extractScalarFields(data: AgentAExtract): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (nonEmpty(value)) result[key] = value;
  }
  return result;
}

/** 에이전트 A의 self_introduce 리스트를 coverLetterAnswers 레코드로 변환한다 (QA_수정요구사항.md
 * §3-4 — 이제 에이전트 A가 질문별로 나눠서 주므로 그대로 저장하면 됨, 하나로 뭉치지 않음). */
export function extractToCoverLetterAnswers(
  data: AgentAExtract,
  sourceDocumentId: string
): Omit<CoverLetterAnswer, "id">[] {
  return (data.self_introduce ?? [])
    .filter((qa) => nonEmpty(qa.question) && nonEmpty(qa.answer))
    .map((qa) => ({
      questionText: qa.question as string,
      answerText: qa.answer as string,
      sourceDocumentId,
    }));
}

/** 에이전트 A 출력의 반복 필드(work/project/skills/award)를 experiences 레코드 목록으로 변환한다. */
export function extractToExperiences(
  data: AgentAExtract,
  sourceDocumentId: string
): Omit<Experience, "id">[] {
  const groups: [Record<string, unknown>[] | undefined, ExperienceType][] = [
    [data.work_experience_records, "work"],
    [data.project_experience_records, "project"],
    [data.skills, "skill"],
    [data.award, "award"],
  ];

  const result: Omit<Experience, "id">[] = [];
  for (const [records, type] of groups) {
    for (const record of records ?? []) {
      // 완전히 빈 레코드(모든 값이 "")는 건너뛴다 — Extract가 자리만 잡아둔 빈 항목인 경우가 있음.
      if (Object.values(record).every((v) => !nonEmpty(v))) continue;
      result.push(recordToExperience(record, type, sourceDocumentId));
    }
  }
  return result;
}
