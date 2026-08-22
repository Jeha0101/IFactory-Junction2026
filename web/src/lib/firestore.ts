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

// ---------- Documents (기능3·4) ----------
export async function listDocuments(): Promise<DocumentRecord[]> {
  const snap = await getDocs(query(documentsCol(), orderBy("uploadedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DocumentRecord, "id">) }));
}

export async function addDocumentRecord(docRecord: Omit<DocumentRecord, "id">): Promise<string> {
  const ref = await addDoc(documentsCol(), docRecord);
  return ref.id;
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
