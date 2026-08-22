# python/ — DOCX 구조 감지 & 값 채우기 유틸리티

`Agent_요구사항명세서.md` §3에서 설명한 "전처리(코드, AI 아님)" 단계와 최종 write-back 단계의
실제 구현체입니다. 에이전트 B 코딩 전에 미리 만들어둔 거라, 실제 값 매핑 로직만 여기 연결하면 됩니다.

## 설치

```bash
pip install -r requirements.txt
```

HWP 변환을 쓰려면 LibreOffice도 필요합니다: `brew install --cask libreoffice`

## docx_tools.py

### 1. `extract_structure(input_path) -> dict`
docx의 모든 표를 병합그룹 단위로 분석해서 라벨/힌트/위치를 JSON으로 반환합니다.
이 출력이 **에이전트 B(AI)의 입력**입니다 — 실제 샘플 결과는 `../fixtures/agent-b-sample-input.json` 참고.

```bash
python docx_tools.py extract 양식.docx 출력.json
```

### 2. `fill_values(input_path, values, output_path) -> None`
에이전트 B + 매칭 로직이 "이 mergedGroupIndex엔 이 값" 이라고 판단한 결과를 받아서
원본 파일에 실제로 써넣습니다. 서식(표, 폰트)은 그대로 유지됩니다.

```bash
python docx_tools.py fill 양식.docx values.json 결과.docx
```

`values.json` 형식 (extract_structure의 좌표계와 동일):
```json
[
  {"table": 1, "row": 0, "mergedGroupIndex": 3, "value": "홍길동"}
]
```

⚠️ **방어 로직**: 실제 배포된 에이전트 B가 라벨 칸 자신의 mergedGroupIndex를 반환하는 경우가
확인되어(Agent_요구사항명세서.md §3 참고), `fill_values()`는 지정된 인덱스가 그 행의 마지막
그룹이 아니면 자동으로 마지막 그룹(=값 칸)으로 보정합니다. 에이전트 B 프롬프트가 고쳐져도 이 로직은
안전하게 그대로 둬도 됩니다(마지막 그룹을 가리키면 보정이 발생하지 않음).

**실제 검증 완료**: 오늘 샘플 양식(`web/public/samples/sample-form.docx`)으로 extract→fill 왕복
테스트 통과, `docx-preview`로 브라우저 렌더링까지 서식 유지 확인함.

## hwp_convert.py

python-docx는 `.hwp`를 절대 열 수 없습니다 (완전히 다른 포맷). 한국 지원서 양식은 HWP인 경우가
많아서, 업로드된 파일이 HWP면 **docx_tools.py에 넘기기 전에 먼저 DOCX로 변환**해야 합니다.

```bash
python hwp_convert.py 양식.hwp ./출력폴더
```

⚠️ **LibreOffice가 .hwp를 직접 못 여는 경우가 있어서(실제 검증됨) `.hwp → .odt(pyhwp) → .docx(LibreOffice)` 2단계로 우회합니다.** `pip install pyhwp` 필요.

**알려진 한계** (실제 샘플로 검증, 완벽하지 않음):
- 핵심 표(인적사항/학력사항/기술역량/프로젝트경험/자소서)는 구조(라벨·힌트·colspan) 그대로 보존됨 — 채우기 기능엔 지장 없음
- 사소한 공백 차이 발생 가능 (예: "전체평균학점" → "전체평균 학점") — canonicalKey 매칭 시 공백 무시하고 비교 권장
- 라벨-값 페어가 아닌 일반 데이터 표(예: 체크리스트)는 헤더 행이 깨질 수 있음 — 어차피 자동 채움 대상이 아니라 실사용엔 영향 없음

Upstage Parse가 HWP를 네이티브로 읽는 건 "이해하기"(에이전트 A)에만 해당하고, "원본에 다시
쓰기"(에이전트 B → write-back)는 Upstage로 안 되므로 이 변환이 필요합니다 (자세한 이유는
`Agent_요구사항명세서.md` §3 "왜 전처리가 필요한가" 참고).

## 전체 파이프라인 (Dev A가 연결할 순서)

```
업로드된 파일이 .hwp면 → hwp_convert.convert_hwp_to_docx() → .docx로
                                                              ↓
                                          docx_tools.extract_structure()
                                                              ↓
                                    에이전트 B(Studio Instruct) — canonicalKey 매핑
                                                              ↓
                              매칭 로직 (에이전트 A의 값 ↔ 에이전트 B의 필드) — Agent_요구사항명세서.md §4
                                                              ↓
                                            docx_tools.fill_values()
                                                              ↓
                                          완성된 .docx 다운로드/미리보기
```
