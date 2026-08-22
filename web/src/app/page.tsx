import { redirect } from "next/navigation";

// 새 탭바 구조(2026-08-23)에서 "메인화면"은 이력서 생성(/resume-preview)이다 —
// 예전 IFactory 3카드 홈은 폐기하고 여기로 리다이렉트한다.
export default function Home() {
  redirect("/resume-preview");
}
