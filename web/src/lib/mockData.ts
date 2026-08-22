// 데모/개발용 더미 데이터. Firebase 연결 전에도 화면을 바로 확인할 수 있도록 폴백으로 쓰거나,
// Firebase 연결 후에는 seedDummyData()로 Firestore에 그대로 넣어 데모할 수 있다.
// 실제 값은 에이전트 A/B가 채우게 될 자리다 (IFactory개발명세초안.md §4.2).

import type { CoverLetterAnswer, Experience, Profile } from "@/types";

export const MOCK_PROFILE: Profile = {
  이름: "홍길동",
  생년월일: "2003년 05월 12일 ( 만 23세 )",
  성별: "남",
  주소: "서울특별시 용산구",
  연락처: "010-1234-5678",
  이메일: "hong@example.com",
  학교: "숙명여자대학교",
  전공: "컴퓨터과학전공",
  복수전공: null,
  학년: "4학년",
  평균학점: "4.1",
  총학점: "4.5",
  병역: "군필",
  포트폴리오링크: "github.com/hong",
};

export const MOCK_EXPERIENCES: Omit<Experience, "id">[] = [
  {
    기관: "AI 챗봇 개발 프로젝트",
    역할: "백엔드 개발",
    기간: "'25.3.~6.",
    설명: "Python/FastAPI로 챗봇 백엔드 구현",
    type: "project",
  },
  {
    기관: "교내 창업동아리",
    역할: "팀장",
    기간: "'24.9.~'25.2.",
    설명: "학생 대상 서비스 기획 및 운영",
    type: "activity",
  },
  {
    기관: "정보처리기사",
    역할: "",
    기간: "'24.11.",
    설명: "국가기술자격 취득",
    type: "award",
  },
];

export const MOCK_COVER_LETTER_ANSWERS: Omit<CoverLetterAnswer, "id">[] = [
  {
    questionText: "다른 사람과 함께 일한 경험에 대해서 설명하시오",
    answerText:
      "저는 교내 창업동아리에서 5명의 팀원과 함께 6개월간 학생 대상 서비스를 기획했습니다. 팀장으로서 매주 진행 상황을 점검하고, 의견이 갈릴 때는 각자의 근거를 정리해 데이터로 결정하는 문화를 만들었습니다.",
    fileName: "삼성2026상반기HR지원서.docx",
    fileUrl: "#",
  },
  {
    questionText: "협력에 대한 본인의 생각을 서술하시오",
    answerText:
      "협력이란 각자의 강점을 살려 하나의 목표를 향해 나아가는 과정이라고 생각합니다. AI 챗봇 프로젝트에서 저는 백엔드를, 팀원은 프론트엔드를 맡아 매일 15분씩 진행 상황을 공유하며 서로의 작업을 이해하려 노력했습니다.",
    fileName: "카카오2025인턴자소서.hwp",
    fileUrl: "#",
  },
  {
    questionText: "최근 협력을 하면서 겪은 갈등과 해결 과정을 설명하시오",
    answerText:
      "프로젝트 초반 역할 분담에서 의견 차이가 있었지만, 각자의 역량과 관심사를 정리한 표를 만들어 다시 논의한 끝에 합의점을 찾았습니다. 이 경험으로 갈등은 감정이 아니라 정보 부족에서 온다는 것을 배웠습니다.",
    fileName: "네이버2025신입공채자소서.docx",
    fileUrl: "#",
  },
  {
    questionText: "지원 동기를 작성해주세요",
    answerText:
      "귀사의 데이터 기반 의사결정 문화에 매력을 느껴 지원하게 되었습니다. 학부 시절 진행한 프로젝트에서도 항상 근거 데이터를 우선하는 방식으로 일해왔습니다.",
    fileName: "삼성2026상반기HR지원서.docx",
    fileUrl: "#",
  },
];

// 실제로는 업로드한 빈 양식(에이전트 B)에서 질문이 추출되지만, 연동 전까지는 데모용으로 고정한다.
export const MOCK_ESSAY_QUESTIONS = [
  "협력 경험에 대해서 설명하세요.",
  "지원 동기를 작성해주세요.",
];
