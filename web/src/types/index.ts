// Firestore 데이터 모델 (IFactory개발명세초안.md §4.4, Agent_요구사항명세서.md §1 필드 사전과 키를 맞춤)

export interface Profile {
  이름?: string;
  생년월일?: string;
  성별?: string;
  주소?: string;
  연락처?: string;
  이메일?: string;
  학교?: string;
  전공?: string;
  복수전공?: string | null;
  학년?: string;
  평균학점?: string;
  총학점?: string;
  병역?: string;
  포트폴리오링크?: string;
}

export type ExperienceType = "project" | "work" | "activity" | "award" | "skill";

export interface Experience {
  id: string;
  기관: string;
  역할: string;
  기간: string;
  설명: string;
  type?: ExperienceType;
  sourceDocumentId?: string; // 출처 표시용 (§4.5) — 없으면 사용자가 직접 입력한 것
  selected?: boolean; // 기능7: 최종 이력서에 포함할지 여부 (로컬 UI 상태 겸 저장값)
}

// 참고용 카테고리 초안 — 실제로는 에이전트 A가 이 목록에 없는 값(예: "재학증명서", "수료증")도
// 자유롭게 반환할 수 있어서(2026-08-23 실사용 확인), 강제하지 않고 문자열 그대로 받는다.
export type DocumentCategory =
  | "이력서"
  | "자소서"
  | "어학성적"
  | "자격증"
  | "대외활동증명서"
  | "기타"
  | (string & {});

// 분류/취득일/만료일은 전부 업로드 후 에이전트 A(Classify+Extract)가 채운다 — 사용자는 파일만 올림.
// 처리 전에는 category/acquiredAt/expiresAt이 전부 비어있고 status가 "processing"이다.
// (한 파일 안에 이력서+자소서가 같이 있는 등 "복합 문서"는 Studio Classify의 Split 모드로
//  에이전트 A가 여러 DocumentRecord로 나눠 저장할 수 있음 — 프론트는 항상 1건=1분류로 취급)
export type DocumentStatus = "processing" | "done" | "error";

export interface DocumentRecord {
  id: string;
  fileName: string;
  fileUrl: string;
  status: DocumentStatus;
  category: DocumentCategory | null;
  acquiredAt?: string | null; // YYYY-MM-DD, 에이전트 A가 채움
  expiresAt?: string | null; // YYYY-MM-DD, 기능3 만료 알림 기준, 에이전트 A가 채움
  linkedExperienceId?: string | null;
  uploadedAt: string; // ISO
  errorMessage?: string | null; // status가 "error"일 때 원인 (재시도 버튼 옆에 보여줌)
}

// 이력서 작성 진행 상태 저장 (기능1·7 작업 중간 저장).
// fieldValues는 analyze-form이 준 필드 id(`table-row-mergedGroupIndex`)를 키로 하는 값 맵 —
// 이 값 그대로 render-docx에 다시 넣으면 항상 동일한 결과물이 나온다 (§3-7: HTML 스냅샷 방식은
// 미리보기/다운로드 변환이 어긋나는 문제가 있어서 좌표 기반 값 맵으로 교체함).
export interface ResumeDraft {
  id: string;
  formFileName: string;
  formFileUrl: string; // Storage에 업로드된 원본 빈 양식
  fieldValues: Record<string, string>;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface CoverLetterAnswer {
  id: string;
  questionText: string;
  answerText: string;
  sourceDocumentId?: string;
  // fileName/fileUrl은 documents 컬렉션에서 조인해도 되지만, 출처 표시(§4.5)를 UI에서
  // 바로 보여주기 위해 편의상 여기 함께 저장(비정규화)한다.
  fileName?: string;
  fileUrl?: string;
}
