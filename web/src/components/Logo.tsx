import Link from "next/link";

// Resup 워드마크 로고. Figma 전달 스펙: color #2D71F9, font "Ria Sans" 36px/700,
// letter-spacing -1.08px. Ria Sans는 무료 배포처가 없어 Pretendard로 폴백함(globals.css 참고) —
// 실제 폰트 파일을 받으면 --font-ria-sans의 @font-face만 추가하면 됨.
// 클릭하면 메인화면(이력서 생성 탭)으로 돌아간다.
export default function Logo() {
  return (
    <Link
      href="/resume-preview"
      className="font-bold"
      style={{
        color: "#2D71F9",
        fontFamily: "var(--font-ria-sans)",
        fontSize: "36px",
        fontWeight: 700,
        lineHeight: "normal",
        letterSpacing: "-1.08px",
      }}
    >
      Resup
    </Link>
  );
}
