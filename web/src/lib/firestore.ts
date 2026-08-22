import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { DEMO_USER_ID } from "./demoUser";
import type { Profile, Experience, DocumentRecord, CoverLetterAnswer, ResumeDraft } from "@/types";

function requireDb() {
  if (!db) {
    throw new Error(
      "Firebase가 설정되지 않았습니다. web/.env.local에 NEXT_PUBLIC_FIREBASE_* 값을 채워주세요."
    );
  }
  return db;
}

const userDocRef = () => doc(requireDb(), "users", DEMO_USER_ID);
const experiencesCol = () => collection(userDocRef(), "experiences");
const documentsCol = () => collection(userDocRef(), "documents");
const coverLetterAnswersCol = () => collection(userDocRef(), "coverLetterAnswers");
const resumeDraftsCol = () => collection(userDocRef(), "resumeDrafts");

// ---------- Profile ----------
export async function getProfile(): Promise<Profile | null> {
  const snap = await getDoc(userDocRef());
  if (!snap.exists()) return null;
  return (snap.data()?.profile as Profile) ?? null;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await setDoc(userDocRef(), { profile }, { merge: true });
}

// ---------- Raw extract (에이전트 A/B 공용 영어 canonicalKey 어휘, 매칭용) ----------
// profile(한글 키, 표시용)과 별개로 에이전트가 실제 쓰는 영어 키 값을 그대로 보관해서,
// 에이전트 B의 canonicalKey와 번역 없이 바로 매칭할 수 있게 한다. (Agent_요구사항명세서.md §4)
export async function getRawExtract(): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(userDocRef());
  if (!snap.exists()) return null;
  return (snap.data()?.rawExtract as Record<string, unknown>) ?? null;
}

export async function saveRawExtract(patch: Record<string, unknown>): Promise<void> {
  await setDoc(userDocRef(), { rawExtract: patch }, { merge: true });
}

// ---------- Experiences (기능7) ----------
export async function listExperiences(): Promise<Experience[]> {
  const snap = await getDocs(experiencesCol());
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Experience, "id">) }));
}

export async function addExperience(exp: Omit<Experience, "id">): Promise<string> {
  const ref = await addDoc(experiencesCol(), exp);
  return ref.id;
}

export async function updateExperience(id: string, patch: Partial<Experience>): Promise<void> {
  await updateDoc(doc(experiencesCol(), id), patch);
}

export async function deleteExperience(id: string): Promise<void> {
  await deleteDoc(doc(experiencesCol(), id));
}

/** 문서 재처리 시 중복 저장을 막기 위해, 같은 출처 문서에서 이미 저장된 경력을 먼저 지운다. */
export async function deleteExperiencesBySource(sourceDocumentId: string): Promise<void> {
  const snap = await getDocs(
    query(experiencesCol(), where("sourceDocumentId", "==", sourceDocumentId))
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

// ---------- Documents (기능3·4) ----------
export async function listDocuments(): Promise<DocumentRecord[]> {
  const snap = await getDocs(query(documentsCol(), orderBy("uploadedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DocumentRecord, "id">) }));
}

export async function addDocumentRecord(docRecord: Omit<DocumentRecord, "id">): Promise<string> {
  const ref = await addDoc(documentsCol(), docRecord);
  return ref.id;
}

export async function getDocumentRecord(id: string): Promise<DocumentRecord | null> {
  const snap = await getDoc(doc(documentsCol(), id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<DocumentRecord, "id">) };
}

export async function updateDocumentRecord(
  id: string,
  patch: Partial<Omit<DocumentRecord, "id">>
): Promise<void> {
  await updateDoc(doc(documentsCol(), id), patch);
}

export async function deleteDocumentRecord(id: string): Promise<void> {
  await deleteDoc(doc(documentsCol(), id));
}

// ---------- Cover letter answers (기능2 연동 대비, Dev A 담당이지만 조회는 프론트에서도 필요) ----------
export async function listCoverLetterAnswers(): Promise<CoverLetterAnswer[]> {
  const snap = await getDocs(coverLetterAnswersCol());
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CoverLetterAnswer, "id">) }));
}

export async function addCoverLetterAnswer(
  answer: Omit<CoverLetterAnswer, "id">
): Promise<string> {
  const ref = await addDoc(coverLetterAnswersCol(), answer);
  return ref.id;
}

/** 문서 재처리 시 중복 저장을 막기 위해, 같은 출처 문서에서 이미 저장된 답변을 먼저 지운다. */
export async function deleteCoverLetterAnswersBySource(sourceDocumentId: string): Promise<void> {
  const snap = await getDocs(
    query(coverLetterAnswersCol(), where("sourceDocumentId", "==", sourceDocumentId))
  );
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

// ---------- Resume drafts (작업 중간 저장) ----------
export async function getResumeDraft(id: string): Promise<ResumeDraft | null> {
  const snap = await getDoc(doc(resumeDraftsCol(), id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<ResumeDraft, "id">) };
}

/** 최근에 저장된 초안 하나를 가져온다 (데모: 단일 데모 계정이라 최신 1건만 이어서 작성). */
export async function getLatestResumeDraft(): Promise<ResumeDraft | null> {
  const snap = await getDocs(query(resumeDraftsCol(), orderBy("updatedAt", "desc")));
  const first = snap.docs[0];
  if (!first) return null;
  return { id: first.id, ...(first.data() as Omit<ResumeDraft, "id">) };
}

export async function createResumeDraft(
  draft: Omit<ResumeDraft, "id">
): Promise<string> {
  const ref = await addDoc(resumeDraftsCol(), draft);
  return ref.id;
}

export async function updateResumeDraft(
  id: string,
  patch: Partial<Omit<ResumeDraft, "id">>
): Promise<void> {
  await updateDoc(doc(resumeDraftsCol(), id), patch);
}
