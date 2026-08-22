import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

// 편집된 최종 문서 미리보기(HTML)를 실제 .docx 파일로 변환해서 다운로드용으로 돌려준다.
//
// ⚠️ 임시 방편: 에이전트 B(빈칸 좌표 매칭)가 아직 없어서, 지금은 python/docx_tools.py의
// 정밀한 셀 단위 write-back 대신 "현재 화면에 보이는 HTML을 그대로 LibreOffice로 변환"하는
// 방식을 쓴다. 원본과 100% 동일한 서식은 보장 못 하지만 지금 당장 실제 다운로드가 가능하다.
// 에이전트 B가 붙으면 docx_tools.fill_values()로 교체 예정 (IFactory개발명세초안.md §4.6-1 참고).
//
// ⚠️ 배포 주의: 이 라우트는 서버에 LibreOffice(soffice)가 설치되어 있어야 동작한다.
// Vercel 서버리스 환경에서는 동작하지 않음 — LibreOffice를 설치할 수 있는 별도 서버(Railway 등)에
// 배포해야 한다.
export async function POST(req: NextRequest) {
  const { html, fileName } = (await req.json()) as { html?: string; fileName?: string };

  if (!html) {
    return NextResponse.json({ error: "html이 필요합니다." }, { status: 400 });
  }

  const workDir = await mkdtemp(join(tmpdir(), "ifactory-export-"));
  const baseName = (fileName || "이력서").replace(/[/\\?%*:|"<>]/g, "_");
  const htmlPath = join(workDir, `${baseName}.html`);
  const odtPath = join(workDir, `${baseName}.odt`);
  const docxPath = join(workDir, `${baseName}.docx`);

  try {
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
    await writeFile(htmlPath, fullHtml, "utf-8");

    // 이 LibreOffice 빌드는 HTML → DOCX 직접 변환 필터가 없어서("no export filter" 에러),
    // HTML → ODT → DOCX 2단계로 우회한다 (hwp_convert.py와 같은 패턴).
    await execFileAsync(
      "soffice",
      ["--headless", "--norestore", "--convert-to", "odt", "--outdir", workDir, htmlPath],
      { timeout: 60_000 }
    );
    await execFileAsync(
      "soffice",
      ["--headless", "--norestore", "--convert-to", "docx", "--outdir", workDir, odtPath],
      { timeout: 60_000 }
    );

    const docxBuffer = await readFile(docxPath);

    return new NextResponse(new Uint8Array(docxBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName)}.docx"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `변환 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
