import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { AppDataProvider } from "@/lib/AppDataContext";
import Logo from "@/components/Logo";
import TabBar from "@/components/TabBar";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resup",
  description: "이력서/자기소개서 작성을 돕는 AI 에이전트",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistMono.variable} h-full antialiased`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <header className="relative border-b border-neutral-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl items-center">
            <Logo />
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <TabBar />
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
          <AppDataProvider>{children}</AppDataProvider>
        </main>
      </body>
    </html>
  );
}
