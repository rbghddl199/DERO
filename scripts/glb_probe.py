#!/usr/bin/env python3
"""GLB 해부 + 텍스처 목표 해상도 판정.

사용법:
    glb_probe.py <input.glb> <plan.json>

stdout 에 사람이 읽는 "해부 / 판정" 리포트를 찍고, <plan.json> 에 기계가 읽는
계획(목표 해상도·파일 상한·Emit 제거 여부)을 쓴다.

필요 패키지: numpy, pillow
"""
import io
import json
import math
import os
import struct
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # 4096^2 베이크 텍스처를 폭탄으로 오인하지 않게

# ── 확정 규칙 (승인 완료: docs/context/asset-pipeline.md 파이프라인 절) ──────────
ZOOM_SCREEN_PX = 480          # 줌인 상한 = 뷰포트 1920px 의 25%
RES_MIN, RES_MAX = 512, 2048  # 산출 해상도 하한·상한
ATTRIB_RES = 512              # MetallicRoughness·AO 고정 (실측 40.1dB, 손실 안 보임)
EMIT_BLACK_MAX = 16           # 최대 밝기가 이 값 이하이면 "사실상 검정" -> 제거
KB = 1024

# (최대변 상한 mm, 라벨, 목표 해상도, 파일 상한 bytes)
SIZE_BUCKETS = [
    (150.0, "<=150mm", 1024, 500 * KB),
    (400.0, "150~400mm", 2048, 1024 * KB),
    (math.inf, ">=400mm", 2048, 2560 * KB),
]

COMPONENT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NUM_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
KTX2_ID = b"\xabKTX 20\xbb\r\n\x1a\n"

# 텍스처 슬롯 -> gltfpack 텍스처 클래스 (color / normal / attrib)
SLOT_CLASS = {
    "baseColor": "color",
    "emissive": "color",
    "normal": "normal",
    "metallicRoughness": "attrib",
    "occlusion": "attrib",
}


class ProbeError(Exception):
    pass


# ── GLB 파싱 ────────────────────────────────────────────────────────────────
def load_glb(path):
    raw = open(path, "rb").read()
    if raw[:4] != b"glTF":
        raise ProbeError(f"{path}: glTF 바이너리(GLB)가 아니다 (magic={raw[:4]!r})")
    if struct.unpack("<I", raw[4:8])[0] != 2:
        raise ProbeError(f"{path}: glTF 2.0 이 아니다")
    json_len = struct.unpack("<I", raw[12:16])[0]
    gltf = json.loads(raw[20:20 + json_len])
    bin_start = 20 + json_len
    if len(raw) <= bin_start:
        raise ProbeError(f"{path}: BIN 청크가 없다 — 외부 참조 GLB 는 지원하지 않는다")
    bin_len = struct.unpack("<I", raw[bin_start:bin_start + 4])[0]
    blob = raw[bin_start + 8:bin_start + 8 + bin_len]
    # 이미 경량화된 GLB 는 bufferView 가 압축돼 있어 raw 로 읽으면 쓰레기가 나온다.
    # (막지 않으면 인덱스가 범위를 벗어나며 IndexError 로 죽는다)
    packed = {"EXT_meshopt_compression", "KHR_draco_mesh_compression"} & set(
        gltf.get("extensionsRequired", []) + gltf.get("extensionsUsed", [])
    )
    if packed:
        raise ProbeError(
            f"{path}: 이미 경량화된 GLB 다 ({', '.join(sorted(packed))}) — "
            "파이프라인 입력은 원본(무압축) GLB 여야 한다"
        )
    return gltf, blob


def read_accessor(gltf, blob, idx):
    acc = gltf["accessors"][idx]
    if "sparse" in acc:
        raise ProbeError("sparse accessor 는 지원하지 않는다")
    if "bufferView" not in acc:
        raise ProbeError("bufferView 없는 accessor 는 지원하지 않는다")
    view = gltf["bufferViews"][acc["bufferView"]]
    fmt = COMPONENT[acc["componentType"]]
    ncomp = NUM_COMPONENTS[acc["type"]]
    itemsize = np.dtype(fmt).itemsize * ncomp
    stride = view.get("byteStride") or itemsize
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    raw = np.frombuffer(blob, dtype=np.uint8,
                        count=stride * (count - 1) + itemsize, offset=base)
    rows = np.arange(count)[:, None] * stride + np.arange(itemsize)[None, :]
    return raw[rows].copy().view(fmt).reshape(count, ncomp)


def node_matrix(node):
    """노드의 로컬 변환 4x4 (열벡터 규약: v' = M @ v)."""
    if "matrix" in node:  # glTF matrix 는 column-major
        return np.array(node["matrix"], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if "scale" in node:
        m = np.diag(list(node["scale"]) + [1.0]) @ m
    if "rotation" in node:
        x, y, z, w = node["rotation"]
        rot = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1],
        ], dtype=np.float64)
        m = rot @ m
    if "translation" in node:
        t = np.eye(4)
        t[:3, 3] = node["translation"]
        m = t @ m
    return m


def walk_scene(gltf):
    """(노드, 월드행렬) 목록. scene 이 없으면 모든 노드를 루트로 본다."""
    nodes = gltf.get("nodes", [])
    scene_idx = gltf.get("scene", 0)
    scenes = gltf.get("scenes")
    roots = scenes[scene_idx]["nodes"] if scenes else range(len(nodes))
    out = []
    stack = [(i, np.eye(4)) for i in roots]
    seen = set()
    while stack:
        idx, parent = stack.pop()
        if idx in seen:  # 순환 방어
            continue
        seen.add(idx)
        node = nodes[idx]
        world = parent @ node_matrix(node)
        out.append((node, world))
        for child in node.get("children", []):
            stack.append((child, world))
    return out


def tri_area_3d(p, tri):
    a, b, c = p[tri[:, 0]], p[tri[:, 1]], p[tri[:, 2]]
    return 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)


def tri_area_2d(p, tri):
    a, b, c = p[tri[:, 0]], p[tri[:, 1]], p[tri[:, 2]]
    u, v = b - a, c - a
    return 0.5 * np.abs(u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0])


def measure_geometry(gltf, blob):
    """씬 전체의 바운딩박스(mm)·표면적(mm^2)·UV 점유율·삼각형 수."""
    lo = np.full(3, np.inf)
    hi = np.full(3, -np.inf)
    surface_m2 = 0.0
    uv_frac = 0.0
    tris = 0
    prims_without_uv = 0
    seen_prim = False

    for node, world in walk_scene(gltf):
        if "mesh" not in node:
            continue
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            if prim.get("mode", 4) != 4:  # TRIANGLES 만 면적 계산
                continue
            seen_prim = True
            pos = read_accessor(gltf, blob, prim["attributes"]["POSITION"]).astype(np.float64)
            pos = (world[:3, :3] @ pos.T).T + world[:3, 3]
            if "indices" in prim:
                idx = read_accessor(gltf, blob, prim["indices"]).reshape(-1, 3)
            else:
                idx = np.arange(len(pos)).reshape(-1, 3)
            lo = np.minimum(lo, pos.min(axis=0))
            hi = np.maximum(hi, pos.max(axis=0))
            surface_m2 += float(tri_area_3d(pos, idx).sum())
            tris += len(idx)
            if "TEXCOORD_0" in prim["attributes"]:
                uv = read_accessor(gltf, blob, prim["attributes"]["TEXCOORD_0"]).astype(np.float64)
                uv_frac += float(tri_area_2d(uv, idx).sum())
            else:
                prims_without_uv += 1

    if not seen_prim:
        raise ProbeError("삼각형 프리미티브가 하나도 없다 — 해부할 지오메트리가 없다")

    return {
        "bbox_mm": [float(v) for v in (hi - lo) * 1000.0],
        "surface_mm2": surface_m2 * 1e6,
        "uv_frac": uv_frac,
        "triangles": tris,
        "prims_without_uv": prims_without_uv,
    }


# ── 이미지 ─────────────────────────────────────────────────────────────────
def image_bytes(gltf, blob, image):
    if "bufferView" not in image:
        raise ProbeError(f"이미지 '{image.get('name')}' 가 외부 URI 참조다 — GLB 내장만 지원한다")
    view = gltf["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return blob[start:start + view["byteLength"]]


def image_dims(buf):
    if buf[:12] == KTX2_ID:
        w, h = struct.unpack("<II", buf[20:28])
        return w, h, "ktx2"
    try:
        with Image.open(io.BytesIO(buf)) as im:
            return im.width, im.height, (im.format or "?").lower()
    except Exception as exc:  # noqa: BLE001 — 포맷 판별 실패는 그대로 보고한다
        raise ProbeError(f"이미지 디코드 실패: {exc}") from exc


def texture_slots(gltf):
    """이미지 인덱스 -> 사용 슬롯 집합."""
    slots = {}

    def mark(tex_ref, slot):
        if not isinstance(tex_ref, dict) or "index" not in tex_ref:
            return
        tex = gltf["textures"][tex_ref["index"]]
        src = tex.get("source")
        if src is None:  # KHR_texture_basisu 등 확장 소스
            for ext in tex.get("extensions", {}).values():
                if isinstance(ext, dict) and "source" in ext:
                    src = ext["source"]
                    break
        if src is not None:
            slots.setdefault(src, set()).add(slot)

    for mat in gltf.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        mark(pbr.get("baseColorTexture"), "baseColor")
        mark(pbr.get("metallicRoughnessTexture"), "metallicRoughness")
        mark(mat.get("normalTexture"), "normal")
        mark(mat.get("occlusionTexture"), "occlusion")
        mark(mat.get("emissiveTexture"), "emissive")
    return slots


def max_luma(buf):
    """RGB 최대 채널값 (0~255). 디코드 못 하면 None."""
    try:
        with Image.open(io.BytesIO(buf)) as im:
            return int(np.asarray(im.convert("RGB")).max())
    except Exception:  # noqa: BLE001
        return None


# ── 판정 ───────────────────────────────────────────────────────────────────
def pow2_ceil(x):
    return 1 << max(0, math.ceil(math.log2(max(x, 1.0))))


def required_side(max_dim_mm, surface_mm2, uv_frac):
    """필요 텍스처 변 길이(px, 반올림 전).

        화면px/mm     = 480 / 물체폭mm
        필요 텍스처 변 = sqrt( (화면px/mm)^2 * 표면적mm^2 / UV점유율 )
    """
    px_per_mm = ZOOM_SCREEN_PX / max_dim_mm
    return math.sqrt(px_per_mm ** 2 * surface_mm2 / uv_frac)


def bucket_for(max_dim_mm):
    for limit, label, target, cap in SIZE_BUCKETS:
        if max_dim_mm <= limit:
            return {"label": label, "target_res": target, "max_bytes": cap}
    raise AssertionError("unreachable")


def predicted_dims(w, h, limit):
    """gltfpack -tl N 적용 후 예상 픽셀 크기 (긴 변을 N 으로 맞추고 비율 유지)."""
    longest = max(w, h)
    if longest <= limit:
        return w, h
    scale = limit / longest
    return max(1, round(w * scale)), max(1, round(h * scale))


def build_plan(path, gltf, blob):
    geo = measure_geometry(gltf, blob)
    max_dim = max(geo["bbox_mm"])
    if max_dim <= 0:
        raise ProbeError("바운딩박스가 0 이다 — 지오메트리를 읽지 못했다")
    if geo["uv_frac"] <= 0:
        raise ProbeError(
            "UV 점유율이 0 이다 — TEXCOORD_0 가 없거나 UV 가 축퇴됐다. "
            "필요 해상도 공식을 적용할 수 없다"
        )

    slots = texture_slots(gltf)
    notes = []
    images = []
    for i, image in enumerate(gltf.get("images", [])):
        buf = image_bytes(gltf, blob, image)
        w, h, fmt = image_dims(buf)
        img_slots = sorted(slots.get(i, []))
        classes = {SLOT_CLASS[s] for s in img_slots if s in SLOT_CLASS}
        # 한 이미지가 여러 클래스에 쓰이면 gltfpack 은 더 보수적인 쪽을 못 고른다
        cls = "color" if "color" in classes else (
            "normal" if "normal" in classes else ("attrib" if classes else None))
        entry = {
            "index": i,
            "name": image.get("name") or f"image{i}",
            "w": w, "h": h, "format": fmt,
            "bytes": len(buf),
            "slots": img_slots,
            "class": cls,
            "max_luma": None,
        }
        if img_slots == ["emissive"]:
            entry["max_luma"] = max_luma(buf)
        if not img_slots:
            notes.append(f"이미지 '{entry['name']}' 가 어떤 머티리얼에서도 안 쓰인다 (gltfpack 이 버린다)")
        images.append(entry)

    needed = required_side(max_dim, geo["surface_mm2"], geo["uv_frac"])
    formula_res = min(RES_MAX, max(RES_MIN, pow2_ceil(needed)))
    bucket = bucket_for(max_dim)

    target = min(formula_res, bucket["target_res"])
    if formula_res > bucket["target_res"]:
        notes.append(
            f"공식 산출 {formula_res}px 가 {bucket['label']} 구간 목표 {bucket['target_res']}px 를 "
            f"넘어 구간 예산으로 낮춘다"
        )

    # normal 은 UASTC 로 손실을 없애되 해상도는 color 목표의 절반(하한 512)으로 예산을 되찾는다.
    # 실측: 전 텍스처 ETC1S 일 때 normal 맵이 렌더 PSNR 손실의 100% (40dB->30dB) 였다.
    # target 은 이미 2의 거듭제곱이므로 //2 도 2의 거듭제곱 -> pow2_ceil 재적용 불필요.
    targets = {"color": target, "normal": max(RES_MIN, target // 2), "attrib": ATTRIB_RES}
    codecs = {"color": "etc1s", "normal": "uastc", "attrib": "etc1s"}

    # Emit 판정: emissive 전용 이미지가 사실상 검정이면 제거
    strip_emit = False
    emit_reason = "emissive 텍스처 없음"
    emit_imgs = [im for im in images if im["slots"] == ["emissive"]]
    if emit_imgs:
        undecodable = [im for im in emit_imgs if im["max_luma"] is None]
        if undecodable:
            emit_reason = "emissive 디코드 실패 — 안전하게 유지한다"
            notes.append(f"emissive 이미지 {[im['name'] for im in undecodable]} 를 디코드하지 못했다")
        else:
            peak = max(im["max_luma"] for im in emit_imgs)
            if peak <= EMIT_BLACK_MAX:
                strip_emit = True
                emit_reason = f"최대 밝기 {peak}/255 <= {EMIT_BLACK_MAX} -> 제거"
            else:
                emit_reason = f"최대 밝기 {peak}/255 > {EMIT_BLACK_MAX} -> 유지(color 클래스 공식 적용)"
    shared_emit = [im for im in images if "emissive" in im["slots"] and im["slots"] != ["emissive"]]
    if shared_emit:
        notes.append(
            f"emissive 가 다른 슬롯과 이미지를 공유한다 {[im['name'] for im in shared_emit]} — 제거하지 않는다")

    # KTX2 는 변 길이가 4의 배수여야 한다 (스펙 MUST). 예상 출력이 어긋나면 -tp 로 2의 거듭제곱 강제
    needs_tp = False
    for im in images:
        if im["class"] is None:
            continue
        if strip_emit and im["slots"] == ["emissive"]:
            continue
        pw, ph = predicted_dims(im["w"], im["h"], targets[im["class"]])
        im["predicted"] = [pw, ph]
        if pw % 4 or ph % 4:
            needs_tp = True
            notes.append(
                f"'{im['name']}' 예상 출력 {pw}x{ph} 가 4의 배수가 아니다 -> gltfpack -tp 로 2의 거듭제곱 강제")

    return {
        "input": os.path.abspath(path),
        "input_bytes": os.path.getsize(path),
        "bbox_mm": geo["bbox_mm"],
        "max_dim_mm": max_dim,
        "surface_mm2": geo["surface_mm2"],
        "uv_frac": geo["uv_frac"],
        "triangles": geo["triangles"],
        "images": images,
        "needed_side_px": needed,
        "formula_res": formula_res,
        "bucket": bucket,
        "targets": targets,
        "codecs": codecs,
        "strip_emit": strip_emit,
        "emit_reason": emit_reason,
        "needs_tp": needs_tp,
        "notes": notes,
    }


# ── 리포트 ─────────────────────────────────────────────────────────────────
def human(n):
    return f"{n / KB:,.1f} KB" if n < KB * KB else f"{n / KB / KB:,.2f} MB"


def print_report(plan):
    bb = plan["bbox_mm"]
    print("── 1. 해부 " + "─" * 56)
    print(f"  입력           {plan['input']}  ({human(plan['input_bytes'])})")
    print(f"  바운딩박스     {bb[0]:.0f} x {bb[1]:.0f} x {bb[2]:.0f} mm   (최대변 {plan['max_dim_mm']:.0f} mm)")
    print(f"  표면적         {plan['surface_mm2']:,.0f} mm^2")
    print(f"  UV 점유율      {plan['uv_frac'] * 100:.1f} %")
    print(f"  삼각형         {plan['triangles']:,}")
    print("  텍스처")
    for im in plan["images"]:
        slots = ",".join(im["slots"]) or "(미사용)"
        luma = f"  최대밝기 {im['max_luma']}/255" if im["max_luma"] is not None else ""
        print(f"    {im['name']:<26} {im['w']}x{im['h']} {im['format']:<5} "
              f"{human(im['bytes']):>10}  [{im['class'] or '-'}/{slots}]{luma}")

    print()
    print("── 2. 판정 " + "─" * 56)
    px_per_mm = ZOOM_SCREEN_PX / plan["max_dim_mm"]
    print(f"  화면px/mm      {ZOOM_SCREEN_PX} / {plan['max_dim_mm']:.0f}mm = {px_per_mm:.4f}")
    print(f"  필요 텍스처 변  sqrt({px_per_mm:.4f}^2 * {plan['surface_mm2']:,.0f} / "
          f"{plan['uv_frac']:.3f}) = {plan['needed_side_px']:.0f} px")
    print(f"  2의 거듭제곱   {plan['formula_res']} px  (하한 {RES_MIN} / 상한 {RES_MAX})")
    b = plan["bucket"]
    print(f"  크기 구간      {b['label']}  목표 {b['target_res']}^2  파일 상한 {human(b['max_bytes'])}")
    t = plan["targets"]
    c = plan["codecs"]
    print(f"  목표 해상도    color={t['color']}({c['color'].upper()})  "
          f"normal={t['normal']}({c['normal'].upper()}, color÷2)  "
          f"attrib={t['attrib']}({c['attrib'].upper()}, 고정)")
    print(f"  Emit           {plan['emit_reason']}")
    if plan["needs_tp"]:
        print("  -tp            필요 (4의 배수 위반 예상)")
    for note in plan["notes"]:
        print(f"  ! {note}")


def main(argv):
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    src, out_json = argv[1], argv[2]
    try:
        gltf, blob = load_glb(src)
        plan = build_plan(src, gltf, blob)
    except ProbeError as exc:
        print(f"[해부 실패] {exc}", file=sys.stderr)
        return 1
    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump(plan, fh, ensure_ascii=False, indent=2)
    print_report(plan)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
