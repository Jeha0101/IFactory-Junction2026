import { isFirebaseConfigured } from "@/lib/firebase";

export default function FirebaseNotice() {
  if (isFirebaseConfigured) return null;
  return (
    <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Firebase가 아직 설정되지 않았습니다. <code>web/.env.local.example</code>을{" "}
      <code>web/.env.local</code>로 복사하고 Firebase 콘솔에서 값을 채운 뒤 개발 서버를
      재시작하세요.
    </div>
  );
}
