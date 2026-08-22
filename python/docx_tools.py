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


def fill_values(input_path: str, values: list[dict], output_path: str) -> None:
    """extract_structure()와 같은 좌표계(table/row/mergedGroupIndex)로 지정된 값을
    원본 docx의 정확한 셀에 써넣고 output_path로 저장한다. 원본 파일은 건드리지 않는다.

    values: [{"table": int, "row": int, "mergedGroupIndex": int, "value": str}, ...]
    """
    doc = Document(input_path)
    value_map = {
        (v["table"], v["row"], v["mergedGroupIndex"]): v["value"] for v in values
    }

    for ti, table in enumerate(doc.tables):
        for ri, row in enumerate(table.rows):
            groups = _merge_groups_with_cells(row)
            for gi, (cell, _text, _span) in enumerate(groups):
                key = (ti, ri, gi)
                if key in value_map:
                    cell.text = value_map[key]

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
