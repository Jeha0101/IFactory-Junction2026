import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";
import { DEMO_USER_ID } from "./demoUser";

export async function uploadDocumentFile(file: File): Promise<string> {
  if (!storage) {
    throw new Error(
      "Firebase Storage가 설정되지 않았습니다. web/.env.local에 NEXT_PUBLIC_FIREBASE_* 값을 채워주세요."
    );
  }
  const path = `users/${DEMO_USER_ID}/documents/${Date.now()}_${file.name}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
}
