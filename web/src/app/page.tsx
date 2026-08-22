import Link from "next/link";
import FirebaseNotice from "@/components/FirebaseNotice";

const CARDS = [
  {
    href: "/profile",
    title: "내 정보",
    desc: "이름, 학력, 연락처 등 기본 인적사항을 관리합니다.",
  },
  {
    href: "/documents",
    title: "서류함",
    desc: "자격증·어학성적·대외활동증명서를 업로드하고 만료일을 관리합니다.",
  },
  {
    href: "/resume-preview",
    title: "이력서 미리보기",
    desc: "최종 이력서에 포함할 경력/경험을 선택합니다.",
  },
];

export default function Home() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">IFactory</h1>
      <p className="mb-6 text-neutral-600">
        이력서/자기소개서 작성을 돕는 AI 에이전트 — 동시에 당신의 개인 데이터를 안전하게
        아카이빙합니다.
      </p>
      <FirebaseNotice />
      <div className="grid gap-4 sm:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-400 hover:shadow-sm"
          >
            <h2 className="mb-1 font-semibold">{card.title}</h2>
            <p className="text-sm text-neutral-600">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
