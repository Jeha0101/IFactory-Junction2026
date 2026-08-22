"use client";

import WizardHeader from "@/components/WizardHeader";

// Figma "메인화면_문서 분석중 로딩창" (node 130:6305) 이식.
export default function ParsingLoadingScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#F0F1F1]">
      <WizardHeader onBack={onBack} confirmEnabled={false} />

      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        {/* 실제 문서 미리보기(node 130:6413, 586.7x830 ≈ A4 비율)와 같은 페이지 모양의
            스켈레톤 — 사용자가 전달한 참고 이미지 비율 그대로(사진 자리 20%×18%, 막대 3개). */}
        <div className="relative aspect-[0.707] w-[340px] rounded-lg bg-white shadow-[0_2px_16px_rgba(0,0,0,0.08)]">
          <div
            className="absolute rounded bg-[#DEDEDE]"
            style={{ left: "7%", top: "6%", width: "20%", height: "18%" }}
          />
          <div
            className="absolute rounded-full bg-[#D9D9D9]"
            style={{ left: "7%", top: "29%", width: "82%", height: "1.7%" }}
          />
          <div
            className="absolute rounded-full bg-[#D9D9D9]"
            style={{ left: "7%", top: "33%", width: "62%", height: "1.7%" }}
          />
          <div
            className="absolute rounded-full bg-[#D9D9D9]"
            style={{ left: "7%", top: "37%", width: "42%", height: "1.7%" }}
          />
        </div>
        <p className="text-[24px] font-bold tracking-[-0.48px] text-[#828282]">
          내용을 분석하고 있어요..
        </p>
      </div>
    </div>
  );
}
