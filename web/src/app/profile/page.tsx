"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FirebaseNotice from "@/components/FirebaseNotice";
import { isFirebaseConfigured } from "@/lib/firebase";
import { getProfile } from "@/lib/firestore";
import type { Profile } from "@/types";

const FIELDS: { key: keyof Profile; label: string }[] = [
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
  { key: "병역", label: "병역" },
  { key: "포트폴리오링크", label: "포트폴리오 링크" },
];

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    getProfile()
      .then(setProfile)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filledFields = profile
    ? FIELDS.filter(({ key }) => profile[key])
    : [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">내 정보</h1>
      <p className="mb-6 text-sm text-neutral-600">
        직접 입력하지 않아도 됩니다 — 서류함에 이력서를 올리면 AI가 여기 필요한 정보를 자동으로
        채워둡니다.
      </p>
      <FirebaseNotice />
      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-neutral-500">불러오는 중...</p>
      ) : filledFields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="mb-3 text-neutral-600">아직 파악된 정보가 없습니다.</p>
          <Link
            href="/documents"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            서류함에서 이력서 업로드하기
          </Link>
        </div>
      ) : (
        <dl className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2">
          {filledFields.map(({ key, label }) => (
            <div key={key}>
              <dt className="text-xs font-medium text-neutral-500">{label}</dt>
              <dd className="text-sm text-neutral-900">{profile?.[key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
