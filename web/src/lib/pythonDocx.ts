// python/docx_tools.py를 호출하는 공용 유틸 (서버 사이드 전용).
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);
const PYTHON_DIR = join(process.cwd(), "..", "python");

export interface StructureGroup {
  mergedGroupIndex: number;
  text: string;
  colspan: number;
}
export interface StructureRow {
  rowIndex: number;
  groups: StructureGroup[];
}
export interface StructureTable {
  tableIndex: number;
  rows: StructureRow[];
}
export interface StructureResult {
  tables: StructureTable[];
}

export interface FillValueEntry {
  table: number;
  row: number;
  mergedGroupIndex: number;
  value: string;
  rawLabel?: string; // 있으면 mergedGroupIndex 대신 라벨 텍스트로 값 칸을 다시 찾는다 (docx_tools.py 참고)
}

/** docx 파일(버퍼)의 표 구조를 추출한다 (python-docx, 결정적/정확). */
export async function extractDocxStructure(buffer: Buffer): Promise<StructureResult> {
  const workDir = await mkdtemp(join(tmpdir(), "ifactory-extract-"));
  try {
    const inputPath = join(workDir, "input.docx");
    const outputPath = join(workDir, "structure.json");
    await writeFile(inputPath, buffer);
    await execFileAsync(
      "python3",
      [join(PYTHON_DIR, "docx_tools.py"), "extract", inputPath, outputPath],
      { timeout: 30_000 }
    );
    return JSON.parse(await readFile(outputPath, "utf-8")) as StructureResult;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** docx 원본(버퍼) + 값 목록을 받아 정확한 셀에 써넣은 새 docx 버퍼를 반환한다. */
export async function fillDocx(buffer: Buffer, values: FillValueEntry[]): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "ifactory-fill-"));
  try {
    const inputPath = join(workDir, "input.docx");
    const valuesPath = join(workDir, "values.json");
    const outputPath = join(workDir, "output.docx");
    await writeFile(inputPath, buffer);
    await writeFile(valuesPath, JSON.stringify(values), "utf-8");
    await execFileAsync(
      "python3",
      [join(PYTHON_DIR, "docx_tools.py"), "fill", inputPath, valuesPath, outputPath],
      { timeout: 30_000 }
    );
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** table/row별 그룹 텍스트 모음 — canonicalKey 교차검증에 쓴다. */
export function buildRowLabelsMap(structure: StructureResult): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const t of structure.tables) {
    for (const r of t.rows) {
      map.set(
        `${t.tableIndex}-${r.rowIndex}`,
        r.groups.map((g) => g.text).filter(Boolean)
      );
    }
  }
  return map;
}
