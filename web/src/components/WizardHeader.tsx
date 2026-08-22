"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Figma의 이력서 작성 2단계 위저드 헤더(node 130:6305/130:6413에서 공통) — 전역 탭바를
// 대신해서 뜬다. 2단계(내용 선택하기)는 아직 화면이 없어서 계속 비활성 상태로만 둠.
export default function WizardHeader({
  onBack,
  confirmEnabled,
  onConfirm,
}: {
  onBack: () => void;
  confirmEnabled: boolean;
  onConfirm?: () => void;
}) {
  return (
    <header className="flex h-[90px] shrink-0 items-center justify-between border-b border-[#EDEDED] bg-[#F8F8F8] px-9">
      <button
        onClick={onBack}
        className="flex size-[50px] items-center justify-center rounded-full text-[#333] hover:bg-neutral-100"
      >
        <ChevronLeft size={28} />
      </button>

      <div className="flex items-center gap-[50px]">
        <div className="flex items-center gap-[17px]">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#2D71F9] text-[18px] font-bold text-white">
            1
          </span>
          <span className="text-[18px] font-bold text-[#333]">정보 확인 후 수정하기</span>
        </div>
        <ChevronRight size={20} className="text-neutral-300" />
        <div className="flex items-center gap-[17px]">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#E3E3E3] text-[18px] font-bold text-[#8A8A8A]">
            2
          </span>
          <span className="text-[18px] text-[#8A8A8A]">내용 선택하기</span>
        </div>
      </div>

      <button
        onClick={onConfirm}
        disabled={!confirmEnabled}
        className={`flex h-[50px] w-[142px] items-center justify-center rounded-full bg-[#2D71F9] text-[18px] font-bold text-white ${
          confirmEnabled ? "hover:bg-[#215fdb]" : "opacity-50"
        }`}
      >
        수정완료
      </button>
    </header>
  );
}
