// 에이전트 A(Extract) 출력 → 우리 Firestore 모델(Korean 키) 변환.
//
// 실제 호출로 확인된 에이전트 A의 실제 필드 어휘 (2026-08-23, 영어 snake_case):
//   korea_name, english_name, professional_title, phone_number, email_address, address,
//   linkedin_url, sns, date_of_birth, gender, major, gpa, self_introduction, military,
//   education_records[], work_experience_records[], project_experience_records[],
//   skills[], award[], language_tests[]
//
// 에이전트 B의 canonicalKey도 같은 영어 어휘를 쓴다(korea_name, date_of_birth, gender, address 등
// 확인됨) — 두 에이전트가 이미 서로 일치하므로, 번역은 여기(우리 쪽 Firestore/UI 표시용)에서만
// 한 번 한다. 매칭(A값 ↔ B빈칸)은 원본 영어 키로 바로 하면 되고 번역을 거칠 필요 없다.

import type { Experience, ExperienceType, Profile } from "@/types";

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
  major?: string;
  gpa?: string;
  self_introduction?: string;
  military?: string;
  education_records?: Record<string, unknown>[];
  work_experience_records?: Record<string, unknown>[];
  project_experience_records?: Record<string, unknown>[];
  skills?: Record<string, unknown>[];
  award?: Record<string, unknown>[];
  language_tests?: Record<string, unknown>[];
  [key: string]: unknown;
}

const PROFILE_FIELD_MAP: Partial<Record<keyof AgentAExtract, keyof Profile>> = {
  korea_name: "이름",
  date_of_birth: "생년월일",
  gender: "성별",
  address: "주소",
  phone_number: "연락처",
  email_address: "이메일",
  major: "전공",
  gpa: "평균학점",
  military: "병역",
  linkedin_url: "포트폴리오링크",
};

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

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = record[k];
    if (nonEmpty(v)) return v;
  }
  return "";
}

function recordToExperience(
  record: Record<string, unknown>,
  type: ExperienceType,
  sourceDocumentId: string
): Omit<Experience, "id"> {
  const 기관 = pickString(record, [
    "project_name",
    "company_name",
    "organization",
    "experience_section",
    "skill_category",
    "award_name",
    "name",
  ]);
  const 역할 = pickString(record, ["role", "position"]);
  const start = pickString(record, ["start_date"]);
  const end = pickString(record, ["end_date"]);
  const duration = pickString(record, ["duration_text", "period", "date"]);
  const 기간 = duration || [start, end].filter(Boolean).join(" ~ ");
  const 설명 =
    pickString(record, ["description", "skill_items", "tools", "detail"]) ||
    // 알려진 키가 하나도 안 맞으면 원본을 그대로 남겨서 데이터 유실을 막는다.
    JSON.stringify(record);

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
