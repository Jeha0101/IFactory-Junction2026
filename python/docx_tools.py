"""
DOCX 표 구조 추출 + 값 채우기 유틸리티.

IFactory개발명세초안.md §4.6, Agent_요구사항명세서.md §3 에서 검증한 알고리즘의 재사용 가능한
구현체입니다. 에이전트 B는 extract_structure()의 출력(라벨/힌트 목록)을 입력으로 받아 canonicalKey
매핑을 판단하고, 그 판단 결과(어느 mergedGroupIndex에 어떤 값을 넣을지)를 fill_values()에 넘기면
실제 파일에 서식을 유지한 채 값이 채워집니다.

핵심 아이디어: python-docx는 병합된 셀을 "같은 <w:tc> 객체가 반복되는" 방식으로 노출합니다.
텍스트가 아니라 셀 객체 identity(id(cell._tc))로 그룹핑하면 하드코딩 없이 "라벨 그룹 → 값 그룹"
쌍을 정확히 뽑아낼 수 있습니다.

사용법:
    python docx_tools.py extract <input.docx> [output.json]
    python docx_tools.py fill <input.docx> <values.json> <output.docx>

values.json 형식:
    [
      {"table": 1, "row": 0, "mergedGroupIndex": 3, "value": "홍길동"},
      ...
    ]
"""

import json
import sys

from docx import Document
from docx.table import _Cell, _Row


def _merge_groups_with_cells(row: _Row):
    """행(row)을 병합그룹 단위로 묶어 (대표 셀, 텍스트, colspan) 리스트를 반환한다."""
    groups: list[list] = []
    for cell in row.cells:
        key = id(cell._tc)
        if groups and groups[-1][0] == key:
            groups[-1][3] += 1
        else:
            groups.append([key, cell, cell.text.strip(), 1])
    return [(cell, text, span) for _, cell, text, span in groups]


def extract_structure(input_path: str) -> dict:
    """docx의 모든 표를 병합그룹 단위로 분석해 라벨/힌트/위치 정보를 반환한다.

    에이전트 B(AI)의 입력으로 그대로 사용 가능 — 여기엔 의미 해석(canonicalKey 매핑)은
    포함되지 않는다. 그건 AI가 판단할 몫이다 (구조 감지는 코드, 의미 해석은 AI).
    """
    doc = Document(input_path)
    result = {
        "sourceFile": input_path.split("/")[-1],
        "note": (
            "python-docx 전처리 원본 출력. 표 안의 병합그룹만 감지함 — 표 밖 문단 인라인 "
            "빈칸(예: '성  명 :          (인)')은 포함되지 않음."
        ),
        "tables": [],
    }

    for ti, table in enumerate(doc.tables):
        table_obj = {
            "tableIndex": ti,
            "rowCount": len(table.rows),
            "colCount": len(table.columns),
            "rows": [],
        }
        for ri, row in enumerate(table.rows):
            groups = _merge_groups_with_cells(row)
            row_obj = {
                "rowIndex": ri,
                "groups": [
                    {"mergedGroupIndex": gi, "text": text, "colspan": span}
                    for gi, (_cell, text, span) in enumerate(groups)
                ],
            }
            table_obj["rows"].append(row_obj)
        result["tables"].append(table_obj)

    return result


def _normalize_label(text: str) -> str:
    """라벨 텍스트 비교용 정규화 — 공백/하이픈 표기 차이를 무시한다.
    실제 문서에서 "E-mail" 라벨이 "E - mail"(공백 포함)로 추출되는 경우가 확인됨(2026-08-23),
    단순 소문자 substring 매칭으로는 이런 표기 차이를 못 잡아서 공백/하이픈을 아예 제거하고 비교한다.
    """
    return "".join(text.lower().split()).replace("-", "")


def _column_kind(header_text: str) -> str:
    """반복형 표(활동사항/경력사항 등)의 헤더 칸 텍스트를 보고 Experience의 어느 필드가
    거기 들어가야 하는지 추정한다. 사람이 채우는 표라 헤더 문구가 문서마다 제각각이라
    (기간/일자/취득일, 기관/장소/발행처 등) 완벽하진 않지만, 데모에서 실제로 쓰는 "활동사항"
    표(기간/활동 내용/활동구분/기관 및 장소) 기준으로는 4칸이 각각 다른 종류로 정확히 갈린다.
    """
    t = header_text.replace(" ", "")
    if any(k in t for k in ("기간", "일자", "날짜", "취득")):
        return "period"
    if any(k in t for k in ("기관", "장소", "발행처", "소속", "회사", "단체", "학교")):
        return "org"
    if any(k in t for k in ("구분", "분야", "유형", "종류", "역할", "직책")):
        return "type"
    return "desc"


def _find_repeatable_rows(all_rows: list[tuple[int, int, list]], rows_by_coord: dict, needle: str):
    """라벨(예: "활동사항") 바로 다음 행을 헤더로, 그 아래 헤더와 칸 수가 같은 행들을 빈
    데이터 행으로 본다. 표 형태 반복 필드는 에이전트가 cellRef를 못 주므로(2026-08-23
    확인 — extract_structure의 "표 안 병합그룹만 감지" 한계와 별개로, 빈 칸이라 라벨 텍스트
    자체가 없어서 라벨 탐색으로도 못 찾음), 이 구조적 패턴(라벨 행 → 헤더 행 → 헤더와 같은
    폭의 빈 행들)을 하드코딩해서 위치를 잡는다. 다음 섹션(예: "어학")의 전체 폭 구분 행을
    만나면(칸 수가 헤더와 다름) 멈춘다.
    """
    for ti, ri, groups in all_rows:
        if len(groups) != 1:
            continue
        if _normalize_label(groups[0][1]) != needle:
            continue
        header = rows_by_coord.get((ti, ri + 1))
        if not header or len(header) <= 1:
            continue
        blank_rows = []
        j = ri + 2
        while True:
            row = rows_by_coord.get((ti, j))
            if not row or len(row) != len(header):
                break
            blank_rows.append(row)
            j += 1
        if blank_rows:
            return header, blank_rows
    return None, []


def fill_values(input_path: str, values: list[dict], output_path: str) -> None:
    """extract_structure()와 같은 좌표계(table/row/mergedGroupIndex)로 지정된 값을
    원본 docx의 정확한 셀에 써넣고 output_path로 저장한다. 원본 파일은 건드리지 않는다.

    values: [{"table": int, "row": int, "mergedGroupIndex": int, "value": str, "rawLabel": str?}, ...]

    ⚠️ 에이전트 B의 cellRef는 신뢰할 수 없다는 게 실측으로 여러 번 확인됐다:
    1) 라벨 칸이나 그 이전 빈 칸의 인덱스를 돌려주는 경우 (한 행에 라벨-값 쌍이 여러 개면
       "마지막 그룹으로 보정"이 완전히 다른 필드를 오염시킴 — 2026-08-23 1차 수정)
    2) **table/row 좌표 자체가 통째로 틀린 경우** — 예: "성명" 라벨의 실제 위치는 표1인데
       cellRef가 표0(제목 행, 그룹이 1개뿐)을 가리켜서, 그 행엔 존재하지도 않는
       mergedGroupIndex라 for 루프가 아예 방문을 안 하고 값이 통째로 증발함 (2026-08-23 2차
       확인 — 실제 업로드 파일로 라이브 테스트하다 발견, 에러 없이 조용히 사라져서 더 위험함).

    그래서 좌표는 참고용 힌트로만 쓰고, `rawLabel`이 있으면 **문서 전체**에서 그 라벨 텍스트와
    일치하는 그룹을 찾아 바로 다음 그룹을 값 칸으로 쓰는 걸 최우선으로 한다(정확히 일치 → 그다음
    부분 포함). 좌표 기반 보정은 라벨을 못 찾았을 때만 쓰는 최후의 폴백이다.
    """
    doc = Document(input_path)

    all_rows: list[tuple[int, int, list]] = []
    for ti, table in enumerate(doc.tables):
        for ri, row in enumerate(table.rows):
            all_rows.append((ti, ri, _merge_groups_with_cells(row)))
    rows_by_coord = {(ti, ri): groups for ti, ri, groups in all_rows}

    def find_by_label(needle: str, exact: bool):
        for ti, ri, groups in all_rows:
            for label_idx, (_c, text, _s) in enumerate(groups):
                norm = _normalize_label(text)
                matched = norm == needle if exact else (needle and needle in norm)
                if not matched:
                    continue
                # 이 행에 라벨 말고 다른 칸이 있으면(같은 행에 라벨-값 쌍), 바로 다음 칸이 값 칸.
                if label_idx + 1 <= len(groups) - 1:
                    return groups[label_idx + 1][0]
                # ⚠️ 이 행에 라벨 혼자뿐이면(표 전체 폭을 차지하는 행) 두 가지 경우가 있다:
                # 1) "활동사항"처럼 섹션 제목 행 — 실제 값 칸은 여러 칸짜리 다음 행들(표 형태)에
                #    있어서 우리가 자동으로 못 채운다(2026-08-23 1차 확인).
                # 2) "성장과정"처럼 자소서 라벨 행 — 정확히 다음 한 행 전체가 그 답변 칸이다
                #    (실측: "성장과정" 행 바로 다음 행이 그룹 1개짜리 "해당내용을 작성합니다."
                #    행, 2026-08-23 2차 확인). 이 경우엔 다음 행이 그룹 1개뿐이라 안전하게 구분
                #    가능 — 라벨 자신을 덮어쓸 위험 없이 값을 넣을 수 있다.
                # 다음 행이 "그룹 1개짜리"일 때만 2번으로 보고 채운다. 그 외(다음 행이 여러
                # 칸짜리 표 헤더 등)는 여전히 못 믿으니 건너뛰고 다른 매치를 계속 찾는다.
                next_groups = rows_by_coord.get((ti, ri + 1))
                if next_groups and len(next_groups) == 1:
                    return next_groups[0][0]
        return None

    for entry in values:
        ti, ri, gi = entry["table"], entry["row"], entry["mergedGroupIndex"]
        raw_label = entry.get("rawLabel")
        exp = entry.get("exp")
        target_cell = None
        label_search_attempted = False

        if raw_label:
            needle = _normalize_label(raw_label)
            if needle:
                label_search_attempted = True
                target_cell = find_by_label(needle, exact=True) or find_by_label(needle, exact=False)

        # ⚠️ 활동사항/자격증처럼 "라벨 행 → 헤더 행 → 빈 데이터 행들" 구조인 표형 반복 필드는
        # find_by_label로 못 찾는다(라벨 다음 행이 헤더라 칸이 여러 개라서 위에서 skip됨).
        # 프론트(경력/경험 카드의 "+ 필드명")에서 구조화된 exp 데이터를 함께 보내주면, 헤더 텍스트
        # (기간/활동구분/기관 등)로 각 칸의 의미를 추측해 첫 번째 빈 행에 나눠 넣는다 — 데모 범위상
        # 여러 항목을 여러 행에 나눠 넣는 건 아직 없고 한 항목만 채운다(2026-08-23).
        if target_cell is None and label_search_attempted and exp:
            needle = _normalize_label(raw_label)
            header, blank_rows = _find_repeatable_rows(all_rows, rows_by_coord, needle)
            if header and blank_rows:
                for (_h_cell, header_text, _h_span), (cell, _t, _s) in zip(header, blank_rows[0]):
                    text = exp.get(_column_kind(header_text)) or exp.get("desc") or ""
                    if text:
                        cell.text = text
                continue

        # ⚠️ rawLabel을 줬는데 문서 어디서도 못 찾았다면, 활동사항/자격증 같은 반복형(표) 필드일
        # 가능성이 높다 — 실측 확인: 에이전트 B가 "활동사항"이라는 요약 라벨을 주지만 문서엔
        # "활동구분"/"활동 내용"처럼 실제 칼럼 헤더가 따로 있어 라벨 텍스트가 애초에 문서에
        # 없고, 게다가 이때 준 좌표(table/row)도 성명 사례처럼 완전히 다른 표(예: 학력사항
        # 표)를 가리켜서 틀렸다(2026-08-23 3차 확인). 이 경우 좌표 폴백을 쓰면 엉뚱한 표의
        # 라벨/제목 칸에 값이 새어 들어간다 — 차라리 안 쓰는 게 안전하다("억지로 채우지
        # 않는다" 원칙). 그래서 라벨 탐색을 "시도했는데 실패"한 경우엔 좌표 폴백을 건너뛰고,
        # rawLabel 자체가 없었던(레거시) 경우에만 좌표 폴백을 쓴다.
        if target_cell is None and not label_search_attempted:
            groups = rows_by_coord.get((ti, ri))
            if groups and 0 <= gi < len(groups):
                last_index = len(groups) - 1
                target_cell = groups[last_index][0] if gi != last_index else groups[gi][0]

        if target_cell is not None:
            target_cell.text = entry["value"]

    doc.save(output_path)


def _main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    if command == "extract":
        input_path = sys.argv[2]
        result = extract_structure(input_path)
        output = json.dumps(result, ensure_ascii=False, indent=2)
        if len(sys.argv) >= 4:
            with open(sys.argv[3], "w", encoding="utf-8") as f:
                f.write(output)
            print(f"저장됨: {sys.argv[3]}")
        else:
            print(output)

    elif command == "fill":
        input_path, values_path, output_path = sys.argv[2], sys.argv[3], sys.argv[4]
        with open(values_path, "r", encoding="utf-8") as f:
            values = json.load(f)
        fill_values(input_path, values, output_path)
        print(f"저장됨: {output_path}")

    else:
        print(f"알 수 없는 명령어: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    _main()
