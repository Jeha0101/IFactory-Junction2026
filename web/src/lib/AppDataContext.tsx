"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { DEMO_USER_ID } from "./demoUser";
import type { CoverLetterAnswer, DocumentRecord, Experience, Profile } from "@/types";

// 루트 레이아웃에서 한 번만 구독을 시작해서, 페이지를 이동해도(같은 세션 안에서는) Firestore를
// 다시 읽지 않는다. onSnapshot은 최초 1회 전체를 받아온 뒤로는 변경분만 실시간으로 밀어주므로
// "수정사항이 발생했을 때만 갱신"이 자연스럽게 된다 (QA_수정요구사항.md §1-5/§2-1).
interface AppData {
  profile: Profile;
  experiences: Experience[];
  documents: DocumentRecord[];
  coverLetterAnswers: CoverLetterAnswer[];
  loading: boolean;
}

const AppDataContext = createContext<AppData>({
  profile: {},
  experiences: [],
  documents: [],
  coverLetterAnswers: [],
  loading: true,
});

export function useAppData() {
  return useContext(AppDataContext);
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>({});
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [coverLetterAnswers, setCoverLetterAnswers] = useState<CoverLetterAnswer[]>([]);
  const [loadedFlags, setLoadedFlags] = useState({
    profile: false,
    experiences: false,
    documents: false,
    coverLetterAnswers: false,
  });

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;
    const userRef = doc(db, "users", DEMO_USER_ID);

    const unsubs = [
      onSnapshot(userRef, (snap) => {
        setProfile((snap.data()?.profile as Profile) ?? {});
        setLoadedFlags((f) => ({ ...f, profile: true }));
      }),
      onSnapshot(collection(userRef, "experiences"), (snap) => {
        setExperiences(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Experience, "id">) }))
        );
        setLoadedFlags((f) => ({ ...f, experiences: true }));
      }),
      onSnapshot(query(collection(userRef, "documents"), orderBy("uploadedAt", "desc")), (snap) => {
        setDocuments(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DocumentRecord, "id">) }))
        );
        setLoadedFlags((f) => ({ ...f, documents: true }));
      }),
      onSnapshot(collection(userRef, "coverLetterAnswers"), (snap) => {
        setCoverLetterAnswers(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CoverLetterAnswer, "id">) }))
        );
        setLoadedFlags((f) => ({ ...f, coverLetterAnswers: true }));
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, []);

  const loading = !Object.values(loadedFlags).every(Boolean);

  return (
    <AppDataContext.Provider
      value={{ profile, experiences, documents, coverLetterAnswers, loading }}
    >
      {children}
    </AppDataContext.Provider>
  );
}
