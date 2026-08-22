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

    ⚠️ 방어 로직 (2026-08-23 갱신): 에이전트 B가 cellRef.mergedGroupIndex를 값 칸이 아닌
    엉뚱한 인덱스(라벨 칸이거나 그 이전 빈 칸)로 돌려주는 경우가 실제로 확인됨. 예전엔 "그 행의
    마지막 그룹으로 보정"했는데, 이건 한 행에 라벨-값 쌍이 **하나뿐일 때만** 맞는 가정이었다.
    실제 양식에는 "휴대폰/전화번호", "E-mail/SNS"처럼 **한 행에 라벨-값 쌍이 두 개 이상** 있는
    경우가 흔한데, 이때 무조건 "마지막 그룹"으로 보내면 완전히 다른 필드(예: 이메일 값이 SNS
    칸에 들어감)로 값이 새어버리는 걸 실측으로 확인함.

    그래서 `rawLabel`이 주어지면, cellRef 인덱스를 신뢰하는 대신 **그 행 안에서 rawLabel과
    텍스트가 일치하는 그룹을 직접 찾아 그 바로 다음 그룹**을 값 칸으로 쓴다 (라벨 바로 다음 칸이
    값/힌트 칸이라는 표 구조 관례 그대로, 단 이번엔 라벨 자체를 텍스트로 특정해서 같은 행 안의
    다른 라벨-값 쌍과 섞이지 않게 함). rawLabel이 없거나 행에서 못 찾으면 예전 방식(마지막 그룹)으로
    폴백한다.
    """
    doc = Document(input_path)
    value_map: dict[tuple[int, int, int], dict] = {
        (v["table"], v["row"], v["mergedGroupIndex"]): v for v in values
    }

    for ti, table in enumerate(doc.tables):
        for ri, row in enumerate(table.rows):
            groups = _merge_groups_with_cells(row)
            last_index = len(groups) - 1
            for gi, (cell, _text, _span) in enumerate(groups):
                key = (ti, ri, gi)
                if key not in value_map:
                    continue
                entry = value_map[key]
                raw_label = entry.get("rawLabel")
                target_cell = None
                if raw_label:
                    needle = _normalize_label(raw_label)
                    for label_idx, (_c, text, _s) in enumerate(groups):
                        if needle and needle in _normalize_label(text):
                            value_idx = min(label_idx + 1, last_index)
                            target_cell = groups[value_idx][0]
                            break
                if target_cell is None:
                    target_cell = groups[last_index][0] if gi != last_index else cell
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
