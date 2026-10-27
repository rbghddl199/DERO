#!/usr/bin/env bash
#
# GLB 에셋 경량화·검수 자동화.
#
#   asset-pipeline.sh <input.glb> [-o output.glb] [--dry-run] [--keep-temp]
#
# 1. 해부   바운딩박스(mm)·표면적·UV 점유율·맵별 해상도·삼각형 수
# 2. 판정   줌인 상한(화면 폭 25%) 기준 필요 텍스처 해상도 + 크기 구간별 파일 상한
# 3. 경량화 Emit 이 사실상 검정이면 제거 -> gltfpack -cc -tc (color/attrib ETC1S, normal UASTC) + 산출된 -tl
# 4. 검증   파일 상한 / KTX2 밉 체인 / 변 4의 배수 / normal=UASTC 코덱 / glTF-Validator 오류 0건
# 5. 리포트 before-after 크기·해상도·압축비, 실패 항목은 원인과 함께
#
# 규칙 정본: docs/context/asset-pipeline.md
#
# 필요한 것
#   - gltfpack 네이티브 빌드 (BasisU 포함). $GLTFPACK / PATH / scripts/.bin/gltfpack 순으로 찾는다.
#     npm 판(`npx gltfpack`)은 BasisU 가 없어 -tc/-tw/-tl 이 전부 무시된다.
#     https://github.com/zeux/meshoptimizer/releases
#   - python3 + numpy + pillow. 없으면 `uv run --with pillow --with numpy python` 으로 폴백한다.
#     $ASSET_PIPELINE_PYTHON 으로 직접 지정할 수 있다.
#   - (선택) npx — glTF-Validator 검사에만 쓴다. 없으면 건너뛴 사실을 출력한다.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
GLTF_TRANSFORM_PKG="${GLTF_TRANSFORM_PKG:-@gltf-transform/cli@4.4.1}"

die() { printf '\n[에러] %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*"; }

usage() {
  sed -n '3,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# ── 인자 ────────────────────────────────────────────────────────────────────
INPUT=""; OUTPUT=""; DRY_RUN=0; KEEP_TEMP=0
while [ $# -gt 0 ]; do
  case "$1" in
    -o|--output) [ $# -ge 2 ] || die "-o 뒤에 출력 경로가 없다"; OUTPUT="$2"; shift 2 ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --keep-temp) KEEP_TEMP=1; shift ;;
    -h|--help)   usage; exit 0 ;;
    -*)          die "모르는 옵션: $1" ;;
    *)           [ -z "$INPUT" ] || die "입력 파일은 하나만 받는다 (이미 '$INPUT' 을 받았다)"
                 INPUT="$1"; shift ;;
  esac
done

[ -n "$INPUT" ] || { usage >&2; die "입력 GLB 를 지정해라"; }
[ -f "$INPUT" ] || die "입력 파일이 없다: $INPUT"
case "$INPUT" in *.glb) ;; *) die "입력은 .glb 여야 한다: $INPUT" ;; esac
[ -n "$OUTPUT" ] || OUTPUT="${INPUT%.glb}.opt.glb"

# ── python 해석 ─────────────────────────────────────────────────────────────
resolve_python() {
  if [ -n "${ASSET_PIPELINE_PYTHON:-}" ]; then
    PY_CMD=($ASSET_PIPELINE_PYTHON)
    "${PY_CMD[@]}" -c 'import numpy, PIL' >/dev/null 2>&1 \
      || die "\$ASSET_PIPELINE_PYTHON ($ASSET_PIPELINE_PYTHON) 에 numpy/pillow 가 없다"
    return
  fi
  if command -v python3 >/dev/null 2>&1 && python3 -c 'import numpy, PIL' >/dev/null 2>&1; then
    PY_CMD=(python3); return
  fi
  if command -v uv >/dev/null 2>&1; then
    PY_CMD=(uv run --quiet --with pillow --with numpy python)
    note "  (python3 에 numpy/pillow 가 없어 uv 폴백을 쓴다)"
    return
  fi
  die "$(cat <<'EOF'
numpy + pillow 를 쓸 수 있는 python 이 없다. 셋 중 하나로 해결해라:
  1) pip install numpy pillow
  2) uv 설치 후 재실행 (자동으로 `uv run --with pillow --with numpy` 폴백을 쓴다)
  3) ASSET_PIPELINE_PYTHON=/경로/python  으로 직접 지정
EOF
)"
}

# stdlib 만 필요한 헬퍼용 (numpy/pillow 불필요)
PY_STD=(python3)
command -v python3 >/dev/null 2>&1 || die "python3 가 필요하다"

# ── gltfpack 해석 ───────────────────────────────────────────────────────────
GLTFPACK_HELP="$(cat <<'EOF'
gltfpack 네이티브 빌드(BasisU 포함)를 찾지 못했다.
  - https://github.com/zeux/meshoptimizer/releases 에서 gltfpack 을 받아
    PATH 에 두거나 scripts/.bin/gltfpack 에 놓아라 (chmod +x 필수)
  - 또는 GLTFPACK=/경로/gltfpack 으로 지정해라
  - npm 판(`npx gltfpack`)은 BasisU 가 없어 -tc/-tw/-tl 이 전부 무시되므로 쓸 수 없다
EOF
)"

resolve_gltfpack() {
  local cand=""
  if [ -n "${GLTFPACK:-}" ]; then
    cand="$GLTFPACK"
    [ -x "$cand" ] || die "GLTFPACK=$cand 을 실행할 수 없다"
  elif command -v gltfpack >/dev/null 2>&1; then
    cand="$(command -v gltfpack)"
  elif [ -x "$SCRIPT_DIR/.bin/gltfpack" ]; then
    cand="$SCRIPT_DIR/.bin/gltfpack"
  else
    die "$GLTFPACK_HELP"
  fi
  GP="$cand"
  # 네이티브 바이너리인지 거칠게 확인 (npm 판은 node 셔뱅 스크립트다)
  # ELF / Mach-O(64 LE·BE) / universal fat
  local magic
  magic="$(head -c 4 "$GP" | od -An -tx1 | tr -d ' \n')"
  case "$magic" in
    7f454c46|cffaedfe|feedfacf|cafebabe|bebafeca) ;;
    *)
      note "  ! 경고: $GP 가 네이티브 바이너리로 보이지 않는다 (npm 판이면 KTX2 변환이 조용히 실패한다)."
      note "          검증 (s) 항목이 실제 결과로 판정한다."
      ;;
  esac
}

# ── 준비 ────────────────────────────────────────────────────────────────────
printf '══ asset-pipeline ══ %s\n\n' "$(basename "$INPUT")"
resolve_python
resolve_gltfpack

TMPDIR_RUN="$(mktemp -d)"
cleanup() {
  if [ "$KEEP_TEMP" -eq 1 ]; then
    note "임시 파일 보존: $TMPDIR_RUN"
  else
    rm -rf "$TMPDIR_RUN"
  fi
}
trap cleanup EXIT

PLAN="$TMPDIR_RUN/plan.json"

# ── 1~2. 해부 + 판정 ────────────────────────────────────────────────────────
"${PY_CMD[@]}" "$SCRIPT_DIR/glb_probe.py" "$INPUT" "$PLAN" \
  || die "해부·판정 단계에서 멈췄다 (위 메시지 참조)"

eval "$("${PY_STD[@]}" - "$PLAN" <<'PYEOF'
import json, sys
p = json.load(open(sys.argv[1], encoding="utf-8"))
print(f"P_COLOR={p['targets']['color']}")
print(f"P_NORMAL={p['targets']['normal']}")
print(f"P_ATTRIB={p['targets']['attrib']}")
print(f"P_STRIP_EMIT={int(p['strip_emit'])}")
print(f"P_NEEDS_TP={int(p['needs_tp'])}")
print(f"P_MAX_BYTES={p['bucket']['max_bytes']}")
print(f"P_INPUT_BYTES={p['input_bytes']}")
# UASTC 로 인코딩할 클래스 목록 (나머지는 ETC1S). 지금은 normal 만.
uastc = [cls for cls, codec in p.get("codecs", {}).items() if codec == "uastc"]
print(f"P_UASTC_CLASSES={' '.join(uastc)}")
PYEOF
)"

JOBS="$(command -v nproc >/dev/null 2>&1 && nproc || echo 4)"
# ETC1S 기본(-tc) + 품질 8. UASTC 클래스는 -tu 로 덮어쓴다 (normal: 실측상 ETC1S 손실 100%).
# -ke: extras 보존 — 발광 세그먼트 GLB의 emitterSurface 플래그(glTF extras)가 압축에서
#      살아남아야 런타임 발광면 스코핑이 동작한다. gltfpack 기본은 extras 폐기 (DERO-163).
# -kn: 노드 이름 보존 — 조명 GLB 의 light_origin 빈 노드(광원 좌표)와 part-seg 리그의
#      파트 이름이 압축에서 살아남아야 한다. -ke 와 같은 계열의 조용한 죽음이다:
#      -kn 없이 -cc -ke 만 주면 출력 노드가 이름 없는 하나로 뭉개진다(실측). 대가는
#      실제 에셋 5.1MB 에서 +40 B(+0.001%) (DERO-228).
GP_ARGS=(-cc -tc -tq 8 -ke -kn)
for cls in $P_UASTC_CLASSES; do GP_ARGS+=(-tu "$cls"); done
GP_ARGS+=(-tl color "$P_COLOR"
          -tl normal "$P_NORMAL"
          -tl attrib "$P_ATTRIB"
          -tj "$JOBS")
if [ "$P_NEEDS_TP" -eq 1 ]; then GP_ARGS+=(-tp); fi

echo
note "── 3. 경량화 ────────────────────────────────────────────────────────────"
SRC="$INPUT"
if [ "$P_STRIP_EMIT" -eq 1 ]; then
  note "  Emit 사전 제거 (gltfpack 은 텍스처를 지우지 못한다)"
  if [ "$DRY_RUN" -eq 0 ]; then
    SRC="$TMPDIR_RUN/stripped.glb"
    "${PY_STD[@]}" "$SCRIPT_DIR/glb_strip_emit.py" "$INPUT" "$SRC" \
      || die "Emit 제거 실패"
  else
    note "  (dry-run: 실행하지 않음)"
  fi
fi

note "  \$ $GP -i <입력> -o <출력> ${GP_ARGS[*]}"

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  note "── dry-run 종료 — 출력 파일을 만들지 않았다 ─────────────────────────────"
  exit 0
fi

GP_LOG="$TMPDIR_RUN/gltfpack.log"
GP_RC=0
"$GP" -i "$SRC" -o "$OUTPUT" "${GP_ARGS[@]}" >"$GP_LOG" 2>&1 || GP_RC=$?
if [ "$GP_RC" -ne 0 ]; then
  sed 's/^/    /' "$GP_LOG" >&2
  die "gltfpack 실패 (종료 코드 $GP_RC)"
fi
sed 's/^/    /' "$GP_LOG"
[ -f "$OUTPUT" ] || die "gltfpack 이 출력 파일을 만들지 않았다: $OUTPUT"

# ── 4~5. 검증 + 리포트 ──────────────────────────────────────────────────────
echo
FAILED=0
"${PY_STD[@]}" "$SCRIPT_DIR/glb_verify.py" "$OUTPUT" "$PLAN" || FAILED=1

# (d) glTF-Validator
echo
VALIDATOR_STATUS="SKIP"
if ! command -v npx >/dev/null 2>&1; then
  note "  (d) glTF-Validator  SKIP — npx 가 없다. 등록 전 수동 검증이 필요하다"
else
  VLOG="$TMPDIR_RUN/validate.csv"
  # 오류가 있으면 종료 코드 1 로 나온다 — 실행 실패와 구분해야 하므로 CSV 헤더 유무로 판단한다
  npx -y "$GLTF_TRANSFORM_PKG" validate "$OUTPUT" --format csv \
    >"$VLOG" 2>"$TMPDIR_RUN/validate.err" || true
  if head -1 "$VLOG" 2>/dev/null | grep -q '^code,message,severity'; then
    ERRS="$(awk -F, 'NR>1 && NF>=3 && $(NF-1)==0' "$VLOG" | wc -l | tr -d ' ')"
    WARNS="$(awk -F, 'NR>1 && NF>=3 && $(NF-1)==1' "$VLOG" | wc -l | tr -d ' ')"
    if [ "$ERRS" -eq 0 ]; then
      VALIDATOR_STATUS="PASS"
      note "  (d) glTF-Validator  오류 0건 / 경고 ${WARNS}건  PASS"
    else
      VALIDATOR_STATUS="FAIL"
      FAILED=1
      note "  (d) glTF-Validator  오류 ${ERRS}건  FAIL"
      awk -F, 'NR>1 && NF>=3 && $(NF-1)==0' "$VLOG" | sed 's/^/        /'
    fi
    if [ "$WARNS" -gt 0 ]; then
      awk -F, 'NR>1 && NF>=3 && $(NF-1)==1 {print "        warn: " $1}' "$VLOG"
    fi
  else
    note "  (d) glTF-Validator  SKIP — npx $GLTF_TRANSFORM_PKG 실행 실패 (오프라인?)"
    sed 's/^/        /' "$TMPDIR_RUN/validate.err" | head -5
  fi
fi

# ── 최종 요약 ───────────────────────────────────────────────────────────────
OUT_BYTES="$(wc -c <"$OUTPUT" | tr -d ' ')"
echo
note "── 요약 ────────────────────────────────────────────────────────────────"
"${PY_STD[@]}" - "$P_INPUT_BYTES" "$OUT_BYTES" "$P_MAX_BYTES" "$OUTPUT" <<'PYEOF'
import sys
KB = 1024
def human(n):
    return f"{n/KB:,.1f} KB" if n < KB*KB else f"{n/KB/KB:,.2f} MB"
before, after, cap, path = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
print(f"  출력       {path}")
print(f"  크기       {human(before)}  ->  {human(after)}   "
      f"({before/after:.1f}x 압축, 원본의 {after/before*100:.1f}%)")
print(f"  예산       상한 {human(cap)} 대비 {after/cap*100:.0f}% 사용 "
      f"({'여유 ' + human(cap-after) if after <= cap else '초과 ' + human(after-cap)})")
PYEOF

echo
if [ "$FAILED" -eq 0 ]; then
  note "  판정: PASS — 등록 가능 (glTF-Validator: $VALIDATOR_STATUS)"
else
  note "  판정: FAIL — 위 실패 항목을 해결해야 등록할 수 있다"
fi
exit "$FAILED"
