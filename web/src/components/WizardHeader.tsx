"use client";

import { ChevronLeft, Play } from "lucide-react";

// Figma의 이력서 작성 2단계 위저드 헤더(node 130:6305/130:6413/130:6448 공통) — 전역
// 탭바를 대신해서 뜬다. activeStep에 따라 1/2 원형 번호와 라벨 강조가 바뀐다.
export default function WizardHeader({
  activeStep,
  onBack,
  confirmEnabled,
  onConfirm,
}: {
  activeStep: 1 | 2;
  onBack: () => void;
  confirmEnabled: boolean;
  onConfirm?: () => void;
}) {
  const stepStyle = (step: 1 | 2) =>
    step === activeStep
      ? { circle: "bg-[#2D71F9] text-white", label: "font-bold text-[#333]" }
      : { circle: "bg-[#E3E3E3] text-[#8A8A8A]", label: "text-[#8A8A8A]" };
  const s1 = stepStyle(1);
  const s2 = stepStyle(2);

  return (
    <header className="flex h-[90px] shrink-0 items-center justify-between bg-[#F8F8F8] px-9">
      <button
        onClick={onBack}
        className="flex size-[50px] items-center justify-center rounded-full text-[#333] hover:bg-neutral-100"
      >
        <ChevronLeft size={28} />
      </button>

      <div className="flex items-center gap-[50px]">
        <div className="flex items-center gap-[17px]">
          <span className={`flex size-9 items-center justify-center rounded-full text-[18px] font-bold ${s1.circle}`}>
            1
          </span>
          <span className={`text-[18px] ${s1.label}`}>정보 확인 후 수정하기</span>
        </div>
        <Play size={20} className="fill-[#2D71F9] text-[#2D71F9]" />
        <div className="flex items-center gap-[17px]">
          <span className={`flex size-9 items-center justify-center rounded-full text-[18px] font-bold ${s2.circle}`}>
            2
          </span>
          <span className={`text-[18px] ${s2.label}`}>내용 선택하기</span>
        </div>
      </div>

      <button
        onClick={onConfirm}
        disabled={!confirmEnabled}
        className={`flex h-[50px] w-[142px] items-center justify-center rounded-full bg-[#2D71F9] text-[18px] font-bold text-white ${confirmEnabled ? "hover:bg-[#215fdb]" : "opacity-50"
          }`}
      >
        수정완료
      </button>
    </header>
  );
}
