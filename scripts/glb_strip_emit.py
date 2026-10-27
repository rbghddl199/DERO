#!/usr/bin/env python3
"""사실상 검정인 emissive 텍스처를 GLB 에서 떼어낸다.

    glb_strip_emit.py <input.glb> <output.glb>

gltfpack 은 텍스처를 지우지 못하므로 glTF JSON 을 직접 손본다.
  1. materials[].emissiveTexture 참조 제거 + emissiveFactor 를 [0,0,0] 으로
  2. 참조를 잃은 textures / images 항목 삭제 후 남은 인덱스 리맵
  3. 아무도 안 쓰는 bufferView 를 버리고 BIN 청크를 다시 팩

밝기 판정은 하지 않는다 — 호출 측(glb_probe.py)이 이미 판정했다.
표준 라이브러리만 쓴다.
"""
import json
import os
import struct
import sys

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def load(path):
    raw = open(path, "rb").read()
    if raw[:4] != b"glTF":
        raise SystemExit(f"[emit 제거 실패] {path}: GLB 가 아니다")
    json_len = struct.unpack("<I", raw[12:16])[0]
    gltf = json.loads(raw[20:20 + json_len])
    bin_start = 20 + json_len
    bin_len = struct.unpack("<I", raw[bin_start:bin_start + 4])[0]
    return gltf, bytearray(raw[bin_start + 8:bin_start + 8 + bin_len])


def save(path, gltf, blob):
    jb = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    jb += b" " * ((4 - len(jb) % 4) % 4)
    bb = bytes(blob) + b"\x00" * ((4 - len(blob) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    out = bytearray(b"glTF" + struct.pack("<II", 2, total))
    out += struct.pack("<II", len(jb), JSON_CHUNK) + jb
    out += struct.pack("<II", len(bb), BIN_CHUNK) + bb
    open(path, "wb").write(bytes(out))


def texture_source(gltf, tex_index):
    tex = gltf["textures"][tex_index]
    if "source" in tex:
        return tex["source"]
    for ext in tex.get("extensions", {}).values():
        if isinstance(ext, dict) and "source" in ext:
            return ext["source"]
    return None


def remap_texture_refs(node, tex_map):
    """*Texture 딕셔너리의 index 를 새 번호로 갈아끼운다."""
    if isinstance(node, dict):
        for key, val in node.items():
            if key.endswith("Texture") and isinstance(val, dict) and "index" in val:
                val["index"] = tex_map[val["index"]]
            else:
                remap_texture_refs(val, tex_map)
    elif isinstance(node, list):
        for val in node:
            remap_texture_refs(val, tex_map)


def compact_buffer_views(gltf, blob):
    """참조되는 bufferView 만 남기고 BIN 을 다시 만든다.

    buffer 가 하나(GLB 내장)가 아니거나 meshopt 압축이 걸려 있으면 건너뛴다 —
    그 경우 뒤따르는 gltfpack 이 어차피 전부 다시 팩한다.
    """
    if len(gltf.get("buffers", [])) != 1 or "uri" in gltf["buffers"][0]:
        return blob, "buffer 가 GLB 내장 단일이 아니라 bufferView 정리를 건너뛴다"
    if any("EXT_meshopt_compression" in v.get("extensions", {})
           for v in gltf.get("bufferViews", [])):
        return blob, "meshopt 압축 bufferView 라 정리를 건너뛴다"

    used = set()
    for acc in gltf.get("accessors", []):
        if "bufferView" in acc:
            used.add(acc["bufferView"])
        sparse = acc.get("sparse")
        if sparse:
            used.add(sparse["indices"]["bufferView"])
            used.add(sparse["values"]["bufferView"])
    for img in gltf.get("images", []):
        if "bufferView" in img:
            used.add(img["bufferView"])

    views = gltf.get("bufferViews", [])
    keep = [i for i in range(len(views)) if i in used]
    if len(keep) == len(views):
        return blob, None

    new_blob = bytearray()
    view_map = {}
    new_views = []
    for new_i, old_i in enumerate(keep):
        view = dict(views[old_i])
        start = view.get("byteOffset", 0)
        chunk = blob[start:start + view["byteLength"]]
        pad = (4 - len(new_blob) % 4) % 4
        new_blob += b"\x00" * pad
        view["byteOffset"] = len(new_blob)
        new_blob += chunk
        view_map[old_i] = new_i
        new_views.append(view)

    gltf["bufferViews"] = new_views
    for acc in gltf.get("accessors", []):
        if "bufferView" in acc:
            acc["bufferView"] = view_map[acc["bufferView"]]
        sparse = acc.get("sparse")
        if sparse:
            sparse["indices"]["bufferView"] = view_map[sparse["indices"]["bufferView"]]
            sparse["values"]["bufferView"] = view_map[sparse["values"]["bufferView"]]
    for img in gltf.get("images", []):
        if "bufferView" in img:
            img["bufferView"] = view_map[img["bufferView"]]
    gltf["buffers"][0]["byteLength"] = len(new_blob)
    return new_blob, f"bufferView {len(views)} -> {len(new_views)}"


def main(argv):
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    src, dst = argv[1], argv[2]
    gltf, blob = load(src)

    dropped_tex = set()
    for mat in gltf.get("materials", []):
        ref = mat.pop("emissiveTexture", None)
        if ref is not None:
            dropped_tex.add(ref["index"])
        mat["emissiveFactor"] = [0, 0, 0]

    if not dropped_tex:
        print("  emissiveTexture 가 없다 — 원본을 그대로 복사한다")
        save(dst, gltf, blob)
        return 0

    # 다른 슬롯이 아직 쓰는 텍스처는 지우지 않는다
    still_used = set()

    def collect(node):
        if isinstance(node, dict):
            for key, val in node.items():
                if key.endswith("Texture") and isinstance(val, dict) and "index" in val:
                    still_used.add(val["index"])
                else:
                    collect(val)
        elif isinstance(node, list):
            for val in node:
                collect(val)

    collect(gltf.get("materials", []))
    dropped_tex -= still_used

    keep_tex = [i for i in range(len(gltf.get("textures", []))) if i not in dropped_tex]
    tex_map = {old: new for new, old in enumerate(keep_tex)}

    dropped_img = {texture_source(gltf, t) for t in dropped_tex} - {None}
    survivors = {texture_source(gltf, t) for t in keep_tex} - {None}
    dropped_img -= survivors

    keep_img = [i for i in range(len(gltf.get("images", []))) if i not in dropped_img]
    img_map = {old: new for new, old in enumerate(keep_img)}

    names = [gltf["images"][i].get("name") or f"image{i}" for i in sorted(dropped_img)]
    gltf["textures"] = [gltf["textures"][i] for i in keep_tex]
    for tex in gltf["textures"]:
        if "source" in tex:
            tex["source"] = img_map[tex["source"]]
        for ext in tex.get("extensions", {}).values():
            if isinstance(ext, dict) and "source" in ext:
                ext["source"] = img_map[ext["source"]]
    gltf["images"] = [gltf["images"][i] for i in keep_img]
    remap_texture_refs(gltf.get("materials", []), tex_map)

    blob, note = compact_buffer_views(gltf, blob)
    save(dst, gltf, blob)

    saved = os.path.getsize(src) - os.path.getsize(dst)
    print(f"  Emit 제거: 이미지 {names} 삭제, {saved / 1024:,.1f} KB 감소"
          + (f" ({note})" if note else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
