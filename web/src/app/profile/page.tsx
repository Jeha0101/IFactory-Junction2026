"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FirebaseNotice from "@/components/FirebaseNotice";
import { isFirebaseConfigured } from "@/lib/firebase";
import { saveProfile } from "@/lib/firestore";
import { useAppData } from "@/lib/AppDataContext";
import type { Profile } from "@/types";

// 병역은 저장은 하지만 이 화면에는 노출하지 않는다 (QA_수정요구사항.md §1-3).
const PROFILE_FIELDS: { key: keyof Profile; label: string }[] = [
  { key: "이름", label: "이름" },
  { key: "생년월일", label: "생년월일" },
  { key: "성별", label: "성별" },
  { key: "주소", label: "주소" },
  { key: "연락처", label: "연락처" },
  { key: "이메일", label: "이메일" },
  { key: "학교", label: "학교" },
  { key: "전공", label: "전공" },
  { key: "복수전공", label: "복수/부전공" },
  { key: "학년", label: "학년" },
  { key: "평균학점", label: "평균학점" },
  { key: "총학점", label: "총학점" },
  { key: "포트폴리오링크", label: "포트폴리오 링크" },
];

export default function ProfilePage() {
  const { profile, loading } = useAppData();
  const [form, setForm] = useState<Profile>({});
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 전역 캐시(onSnapshot)가 처음 값을 준 시점에만 편집 폼을 채운다 — 이후 백그라운드에서
  // 프로필이 갱신돼도(예: 에이전트 처리 중) 사용자가 입력 중인 내용을 덮어쓰지 않는다.
  useEffect(() => {
    if (!loading && !loadedOnce) {
      setForm(profile);
      setLoadedOnce(true);
    }
  }, [loading, loadedOnce, profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveProfile(form);
      setSavedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const hasAnyValue = PROFILE_FIELDS.some(({ key }) => form[key]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">내 정보</h1>
      <p className="mb-6 text-sm text-neutral-600">
        서류함에 이력서를 올리면 AI가 자동으로 채워둡니다. 틀린 부분은 아래에서 직접 고치고
        저장하면 돼요.
      </p>
      <FirebaseNotice />
      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-neutral-500">불러오는 중...</p>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          {PROFILE_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">{label}</span>
              <input
                type="text"
                placeholder="없음"
                value={form[key] ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="rounded-md border border-neutral-300 px-3 py-2 focus:border-neutral-500 focus:outline-none"
              />
            </label>
          ))}
          <div className="sm:col-span-2 flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !isFirebaseConfigured}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            {savedAt && <span className="text-sm text-green-700">저장되었습니다.</span>}
          </div>
        </form>
      )}

      {!loading && !hasAnyValue && (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          <p className="mb-3">아직 파악된 정보가 없습니다. 위 칸에 직접 입력하거나,</p>
          <Link href="/documents" className="text-neutral-900 underline">
            서류함에서 이력서를 업로드해보세요
          </Link>
        </div>
      )}
    </div>
  );
}
