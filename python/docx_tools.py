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
        for _ti, _ri, groups in all_rows:
            for label_idx, (_c, text, _s) in enumerate(groups):
                norm = _normalize_label(text)
                matched = norm == needle if exact else (needle and needle in norm)
                if not matched:
                    continue
                # ⚠️ 이 행에 라벨 말고 다른 칸이 없으면(표 전체 폭을 차지하는 섹션 제목 행,
                # 예: "활동사항" colspan=7) "다음 칸"이 없다 — 그 경우 라벨 자신으로 되돌아가서
                # 섹션 제목 자체를 덮어쓰게 된다(실측 확인, 2026-08-23). 그런 매치는 쓸 수
                # 없으니 건너뛰고 다른 매치를 계속 찾는다.
                if label_idx + 1 > len(groups) - 1:
                    continue
                return groups[label_idx + 1][0]
        return None

    for entry in values:
        ti, ri, gi = entry["table"], entry["row"], entry["mergedGroupIndex"]
        raw_label = entry.get("rawLabel")
        target_cell = None
        label_search_attempted = False

        if raw_label:
            needle = _normalize_label(raw_label)
            if needle:
                label_search_attempted = True
                target_cell = find_by_label(needle, exact=True) or find_by_label(needle, exact=False)

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
