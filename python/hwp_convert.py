"""
HWP/HWPX -> DOCX 변환.

python-docx는 .hwp 파일을 절대 열 수 없다 (완전히 다른 포맷). 한국 지원서 양식은 HWP인 경우가
많아서, docx_tools.py로 넘기기 전에 이 변환이 필요하다. Upstage Parse는 HWP를 네이티브로 읽을 수
있지만 그건 "읽기"용이고, 원본에 값을 다시 써넣는(write-back) 작업은 python-docx만 할 수 있어서
DOCX로 먼저 바꿔야 한다.

⚠️ **LibreOffice가 .hwp를 직접 열지 못하는 경우가 있다** (실제 검증: "Error: source file could not
be loaded"). 이 파일은 정상 HWP5 문서고 암호/DRM/배포용 보호도 없었는데도 실패했다 — LibreOffice의
HWP 임포트 필터 자체가 불안정한 것으로 보인다. 그래서 2단계 우회 경로를 쓴다:

    .hwp --[pyhwp의 hwp5odt]--> .odt --[LibreOffice]--> .docx

이 경로는 실제 샘플로 검증 완료 — 표 구조(5개 표, 라벨/힌트 텍스트)가 네이티브 docx 버전과 완전히
동일하게 나온다. pyhwp(`pip install pyhwp`)가 hwp5odt 커맨드를 제공한다.

사용법:
    python hwp_convert.py <input.hwp> <output_dir>
"""

import os
import shutil
import subprocess
import sys


def _find_hwp5odt() -> str:
    """pyhwp의 hwp5odt 실행 파일을 찾는다 (pip 스크립트 경로가 PATH에 없을 수 있음)."""
    found = shutil.which("hwp5odt")
    if found:
        return found
    # macOS에서 pip --user 설치 시 흔한 경로
    fallback = os.path.expanduser("~/Library/Python/3.9/bin/hwp5odt")
    if os.path.exists(fallback):
        return fallback
    raise RuntimeError(
        "hwp5odt를 찾을 수 없습니다. `pip install pyhwp`로 설치하거나, "
        "설치된 스크립트 경로를 PATH에 추가하세요."
    )


def convert_hwp_to_docx(input_path: str, output_dir: str, timeout: int = 120) -> str:
    """input_path(.hwp)를 output_dir에 .docx로 변환하고 생성된 파일 경로를 반환한다.

    내부적으로 .hwp -> .odt(pyhwp) -> .docx(LibreOffice) 2단계를 거친다.
    """
    os.makedirs(output_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(input_path))[0]

    odt_path = os.path.join(output_dir, base + ".odt")
    subprocess.run(
        [_find_hwp5odt(), "--output=" + odt_path, input_path],
        check=True,
        timeout=timeout,
        capture_output=True,
    )
    if not os.path.exists(odt_path):
        raise RuntimeError(f"HWP -> ODT 변환 실패: {odt_path}가 생성되지 않았습니다.")

    subprocess.run(
        ["soffice", "--headless", "--norestore", "--convert-to", "docx", "--outdir", output_dir, odt_path],
        check=True,
        timeout=timeout,
        capture_output=True,
    )
    output_path = os.path.join(output_dir, base + ".docx")
    if not os.path.exists(output_path):
        raise RuntimeError(f"ODT -> DOCX 변환 실패: {output_path}가 생성되지 않았습니다.")
    return output_path


def _main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    input_path, output_dir = sys.argv[1], sys.argv[2]
    result = convert_hwp_to_docx(input_path, output_dir)
    print(f"변환됨: {result}")


if __name__ == "__main__":
    _main()
