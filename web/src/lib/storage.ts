import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";
import { DEMO_USER_ID } from "./demoUser";

/** onProgress(0~100)를 주면 실제 업로드 진행률을 실시간으로 보고한다 (업로드 로딩바용). */
export async function uploadDocumentFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!storage) {
    throw new Error(
      "Firebase Storage가 설정되지 않았습니다. web/.env.local에 NEXT_PUBLIC_FIREBASE_* 값을 채워주세요."
    );
  }
  const path = `users/${DEMO_USER_ID}/documents/${Date.now()}_${file.name}`;
  const fileRef = ref(storage, path);
  const task = uploadBytesResumable(fileRef, file);

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      () => resolve()
    );
  });

  return getDownloadURL(fileRef);
}
