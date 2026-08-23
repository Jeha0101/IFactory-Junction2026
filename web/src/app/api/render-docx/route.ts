import { NextResponse } from "next/server";
import { fillDocx, type FillValueEntry } from "@/lib/pythonDocx";

// 원본 양식(fileUrl) + 값 목록을 받아 python-docx로 정확한 좌표에 써넣은 docx를 돌려준다.
// 미리보기(읽기 전용 렌더링)와 다운로드 버튼이 항상 이 라우트 하나만 거치도록 해서,
// "미리보기에서 본 것과 다운로드한 파일이 다르다"는 문제가 구조적으로 생기지 않게 한다.
export async function POST(req: Request) {
  const { fileUrl, values } = (await req.json()) as {
    fileUrl?: string;
    values?: {
      id: string;
      value: string;
      rawLabel?: string;
      exp?: { period?: string; org?: string; type?: string; desc?: string };
    }[];
  };

  if (!fileUrl) {
    return NextResponse.json({ error: "fileUrl이 필요합니다." }, { status: 400 });
  }

  try {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`파일 다운로드 실패 (${fileRes.status})`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const fillValues: FillValueEntry[] = (values ?? [])
      .filter((v) => v.value && v.value.trim())
      .map((v) => {
        const [table, row, mergedGroupIndex] = v.id.split("-").map(Number);
        return { table, row, mergedGroupIndex, value: v.value, rawLabel: v.rawLabel, exp: v.exp };
      });

    const filledBuffer = await fillDocx(buffer, fillValues);

    return new NextResponse(new Uint8Array(filledBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
