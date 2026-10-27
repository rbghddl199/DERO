#!/usr/bin/env python3
"""경량화 결과 GLB 검증 + before/after 리포트.

    glb_verify.py <output.glb> <plan.json>

검사 항목
  (a) 파일 크기가 구간별 상한 이내인가
  (b) KTX2 밉 체인이 완전한가 (levelCount == log2(max변)+1)
  (c) 모든 텍스처 변이 4의 배수인가 (KTX2 스펙 MUST)
  (n) 클래스별 코덱이 plan 과 일치하는가 (normal=UASTC, color/attrib=ETC1S)
  (s) -tc 를 요청했는데 KTX2 가 하나도 없으면 BasisU 없는 gltfpack 이다

실패가 하나라도 있으면 종료 코드 1. 표준 라이브러리만 쓴다.
(d) glTF-Validator 는 asset-pipeline.sh 가 npx 로 돌린다.
"""
import json
import os
import struct
import sys

KB = 1024
KTX2_ID = b"\xabKTX 20\xbb\r\n\x1a\n"


def human(n):
    return f"{n / KB:,.1f} KB" if n < KB * KB else f"{n / KB / KB:,.2f} MB"


def load(path):
    raw = open(path, "rb").read()
    json_len = struct.unpack("<I", raw[12:16])[0]
    gltf = json.loads(raw[20:20 + json_len])
    bin_start = 20 + json_len
    bin_len = struct.unpack("<I", raw[bin_start:bin_start + 4])[0]
    return gltf, raw[bin_start + 8:bin_start + 8 + bin_len]


# KHR Data Format colorModel (KDFS): BasisU 코덱 판별용
KDF_MODEL_ETC1S = 163
KDF_MODEL_UASTC = 166


def ktx2_codec(buf):
    """KTX2 BasisU 코덱 판별: 'etc1s' | 'uastc' | 'other'.

    supercompressionScheme(offset 44): BasisLZ=1 이면 무조건 ETC1S.
    그 외(0=None, 2=Zstd 등)는 DFD colorModel 바이트로 UASTC(166)/ETC1S(163) 구분.
    """
    if len(buf) < 52:
        return "other"
    scheme = struct.unpack("<I", buf[44:48])[0]
    if scheme == 1:  # BasisLZ -> ETC1S
        return "etc1s"
    dfd_off = struct.unpack("<I", buf[48:52])[0]  # dfdByteOffset
    if dfd_off and dfd_off + 13 <= len(buf):
        # DFD: [dfdTotalSize u32][vendorId/type u32][ver/blockSize u32][colorModel u8 ...]
        model = buf[dfd_off + 12]
        if model == KDF_MODEL_UASTC:
            return "uastc"
        if model == KDF_MODEL_ETC1S:
            return "etc1s"
    return "other"


def describe(buf):
    """(w, h, levelCount|None, 포맷라벨)."""
    if buf[:12] == KTX2_ID:
        w, h = struct.unpack("<II", buf[20:28])
        levels = struct.unpack("<I", buf[40:44])[0]
        return w, h, levels, "ktx2"
    if buf[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", buf[16:24])
        return w, h, None, "png"
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        if buf[12:16] == b"VP8X":
            w = int.from_bytes(buf[24:27], "little") + 1
            h = int.from_bytes(buf[27:30], "little") + 1
            return w, h, None, "webp"
        if buf[12:16] == b"VP8L":
            bits = int.from_bytes(buf[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1, None, "webp"
        if buf[12:16] == b"VP8 ":
            w, h = struct.unpack("<HH", buf[26:30])
            return w & 0x3FFF, h & 0x3FFF, None, "webp"
        return -1, -1, None, "webp"
    if buf[:2] == b"\xff\xd8":
        return -1, -1, None, "jpeg"
    return -1, -1, None, "unknown"


def main(argv):
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    out_path, plan_path = argv[1], argv[2]
    plan = json.load(open(plan_path, encoding="utf-8"))
    gltf, blob = load(out_path)

    before = {im["name"]: im for im in plan["images"]}
    rows = []
    for i, image in enumerate(gltf.get("images", [])):
        view = gltf["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        buf = blob[start:start + view["byteLength"]]
        w, h, levels, fmt = describe(buf)
        codec = ktx2_codec(buf) if fmt == "ktx2" else None
        rows.append({
            "name": image.get("name") or f"image{i}",
            "w": w, "h": h, "levels": levels, "format": fmt,
            "codec": codec,
            "bytes": view["byteLength"],
        })

    print("── 4. 검증 " + "─" * 56)
    failures = []

    # (a) 파일 상한
    size = os.path.getsize(out_path)
    cap = plan["bucket"]["max_bytes"]
    ok = size <= cap
    print(f"  (a) 파일 크기      {human(size)} / 상한 {human(cap)}  "
          f"{'PASS' if ok else 'FAIL'}")
    if not ok:
        failures.append(
            f"(a) 파일 크기 {human(size)} 가 {plan['bucket']['label']} 구간 상한 "
            f"{human(cap)} 를 {human(size - cap)} 초과")

    # (s) BasisU 미탑재 gltfpack 감지
    ktx2 = [r for r in rows if r["format"] == "ktx2"]
    if rows and not ktx2:
        formats = sorted({r["format"] for r in rows})
        print(f"  (s) KTX2 변환      없음 (실제 {formats})  FAIL")
        failures.append(
            "(s) -tc 를 줬는데 출력에 KTX2 가 하나도 없다 — BasisU 없는 gltfpack "
            "(npm 판)일 가능성이 높다. 네이티브 바이너리를 써라: "
            "https://github.com/zeux/meshoptimizer/releases")
    elif ktx2:
        print(f"  (s) KTX2 변환      {len(ktx2)}/{len(rows)} 이미지  PASS")

    # (b) 밉 체인
    if ktx2:
        bad = []
        for r in ktx2:
            expect = max(r["w"], r["h"]).bit_length()
            if r["levels"] != expect:
                bad.append(f"{r['name']} levelCount={r['levels']} (기대 {expect})")
        print(f"  (b) 밉 체인        {'PASS' if not bad else 'FAIL — ' + '; '.join(bad)}")
        if bad:
            failures.append("(b) 밉 체인 불완전: " + "; ".join(bad)
                            + " — three.js 가 minFilter 를 LinearFilter 로 강등한다")
    else:
        print("  (b) 밉 체인        SKIP (KTX2 없음)")

    # (c) 변 길이 4의 배수
    bad4 = [f"{r['name']} {r['w']}x{r['h']}" for r in rows
            if r["w"] > 0 and (r["w"] % 4 or r["h"] % 4)]
    unknown = [r["name"] for r in rows if r["w"] < 0]
    print(f"  (c) 변 4의 배수    {'PASS' if not bad4 else 'FAIL — ' + '; '.join(bad4)}"
          + (f"  (크기 미확인: {unknown})" if unknown else ""))
    if bad4:
        failures.append("(c) KTX2 스펙 위반(변이 4의 배수 아님): " + "; ".join(bad4))

    # (n) 클래스별 코덱: normal=UASTC, color/attrib=ETC1S (plan.codecs 정본)
    expected_codecs = plan.get("codecs")
    if expected_codecs and ktx2:
        codec_bad = []
        checked = 0
        for r in ktx2:
            b = before.get(r["name"])
            cls = b.get("class") if b else None
            if not cls:  # 미사용/클래스 미상 이미지는 건너뛴다
                continue
            want = expected_codecs.get(cls)
            if not want:
                continue
            checked += 1
            if r["codec"] != want:
                codec_bad.append(f"{r['name']} [{cls}] {r['codec']} (기대 {want})")
        status = "FAIL — " + "; ".join(codec_bad) if codec_bad else f"PASS ({checked} KTX2)"
        print(f"  (n) 클래스별 코덱  {status}")
        if codec_bad:
            failures.append(
                "(n) 코덱 불일치: " + "; ".join(codec_bad)
                + " — normal 은 UASTC(-tu normal), color/attrib 은 ETC1S 여야 한다")
    elif expected_codecs:
        print("  (n) 클래스별 코덱  SKIP (KTX2 없음)")

    print()
    print("── 5. 맵별 해상도 변화 " + "─" * 44)
    print(f"    {'texture':<26} {'before':>16}   {'after':>20}")
    for r in rows:
        b = before.get(r["name"])
        b_txt = f"{b['w']}x{b['h']} {b['format']} {human(b['bytes'])}" if b else "(신규)"
        lv = f" mip={r['levels']}" if r["levels"] is not None else ""
        cd = f"/{r['codec']}" if r.get("codec") else ""
        a_txt = f"{r['w']}x{r['h']} {r['format']}{cd}{lv} {human(r['bytes'])}"
        print(f"    {r['name']:<26} {b_txt:>16}   {a_txt:>20}")
    for name, b in before.items():
        if not any(r["name"] == name for r in rows):
            print(f"    {name:<26} {b['w']}x{b['h']} {b['format']} {human(b['bytes'])}"
                  f"   -> 제거됨")

    if failures:
        print()
        print("  실패 항목")
        for f in failures:
            print(f"    - {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
