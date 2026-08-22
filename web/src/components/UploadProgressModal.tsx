"use client";

import { X } from "lucide-react";

// Figma "이력서 양식 업로드" 로딩 모달 이식. 디자이너가 컴포넌트로 안 묶어놔서(개별 도형만
// 존재) get_design_context로는 못 가져왔고, 전달받은 스크린샷 2장을 보고 직접 재현함.
//
// 순수 업로드(Storage) 진행률만 보여준다 — 그 다음 분석(에이전트 B) 단계는 별도 화면
// (ParsingLoadingScreen, Figma node 130:6305)에서 보여준다.
function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)}mb` : `${Math.max(1, Math.round(bytes / 1024))}kb`;
}

export default function UploadProgressModal({
  fileName,
  fileSizeBytes,
  progress,
  onCancel,
}: {
  fileName: string;
  fileSizeBytes: number;
  progress: number; // 0~100
  onCancel: () => void;
}) {
  const ext = fileName.split(".").pop()?.toUpperCase() ?? "FILE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(58,58,58,0.4)]">
      <div className="w-[600px] max-w-[90vw] rounded-xl bg-white p-9">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[18px] font-bold text-[#333]">이력서 양식 업로드</p>
          <button onClick={onCancel} className="text-neutral-500 hover:text-neutral-800">
            <X size={22} />
          </button>
        </div>

        <div className="rounded-xl bg-[#F5F5F5] p-5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[18px] font-bold text-[#333]">{fileName}</p>
            <button onClick={onCancel} className="text-neutral-500 hover:text-neutral-800">
              <X size={18} />
            </button>
          </div>
          <p className="mb-3 text-sm text-neutral-500">
            {ext}/{formatFileSize(fileSizeBytes)}
          </p>
          <div className="h-[6px] w-full overflow-hidden rounded-full bg-[#E5E5E5]">
            <div
              className="h-full rounded-full bg-[#2D71F9] transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-neutral-500">파일 업로드 중...</p>
      </div>
    </div>
  );
}
