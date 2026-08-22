"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Laptop, Download } from "lucide-react";

// Figma "Tab bar" 컴포넌트(node 136:4575 / 130:7186) 이식 — 알약 모양 플로팅 탭바.
// 내 정보(/profile)는 디자인 개편에서 우선 제외됨(2026-08-23) — 라우트는 남겨두고 탭에서만 뺐음.
const TABS = [
  { href: "/resume-preview", label: "이력서 생성", icon: Home },
  { href: "/my-resumes", label: "나의 이력서", icon: Laptop },
  { href: "/documents", label: "자료보관함", icon: Download },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-[50px] items-center justify-center gap-[2px] rounded-full bg-transparent">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`flex h-[50px] items-center gap-[2px] rounded-full py-[10px] pr-[20px] pl-[7px] transition ${
              active ? "bg-white shadow-[0px_1px_7.5px_rgba(45,113,249,0.25)]" : ""
            }`}
          >
            <span className="flex size-[50px] items-center justify-center rounded-full">
              <Icon
                size={22}
                strokeWidth={2}
                color={active ? "#2D71F9" : "#53565D"}
              />
            </span>
            <span
              className={`whitespace-nowrap text-[18px] ${active ? "font-semibold" : "font-normal"}`}
              style={{ color: active ? "#2D71F9" : "#53565D" }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
