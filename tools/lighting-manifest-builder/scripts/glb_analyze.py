#!/usr/bin/env python3
"""Dependency-light GLB analysis worker for the standalone builder."""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path
from typing import Any


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("glb", type=Path)
    parser.add_argument("-o", "--output", type=Path)
    args = parser.parse_args()
    report = analyze_glb(args.glb)
    text = json.dumps(report, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text)


def analyze_glb(path: Path) -> dict[str, Any]:
    gltf, bin_chunk = read_glb(path)
    materials = analyze_materials(gltf.get("materials", []))
    nodes = analyze_nodes(gltf.get("nodes", []))
    meshes = analyze_meshes(gltf, bin_chunk)
    bbox = union_boxes([mesh["boundingBox"] for mesh in meshes if mesh["boundingBox"]])
    model_size = size_of(bbox) if bbox else [0, 0, 0]
    model_center = center_of(bbox) if bbox else [0, 0, 0]
    emissive = emissive_candidates(meshes, materials)
    anchors = [node["name"] for node in nodes if node["isAnchor"]]
    limitations = build_limitations(meshes, materials, anchors, model_size, emissive)
    return {
        "meshCount": len(meshes),
        "materialCount": len(materials),
        "modelSize": model_size,
        "modelCenter": model_center,
        "boundingBox": bbox,
        "boundingSphereRadius": max(model_size) / 2 if model_size else 0,
        "unit": "METER" if likely_meter_scale(model_size) else "UNKNOWN",
        "upAxis": "Y_UP",
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "embeddedLights": analyze_lights(gltf),
        "anchorNodes": anchors,
        "emissiveCandidates": emissive,
        "materialRoleCandidates": material_role_candidates(meshes),
        "assetLimitations": limitations,
        "warnings": [item for item in limitations if item not in {"SINGLE_MESH", "SINGLE_MATERIAL"}],
        "hasAnimations": bool(gltf.get("animations")),
        "hasSkinOrRig": bool(gltf.get("skins")),
    }


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("GLB_PARSE_FAILED")
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError("GLB_PARSE_FAILED")
    offset = 12
    json_chunk = None
    bin_chunk = b""
    while offset + 8 <= len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            json_chunk = chunk
        elif chunk_type == 0x004E4942:
            bin_chunk = chunk
    if json_chunk is None:
        raise ValueError("GLB_PARSE_FAILED")
    return json.loads(json_chunk.decode("utf-8")), bin_chunk


def analyze_nodes(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    parents = {child: idx for idx, node in enumerate(nodes) for child in node.get("children", [])}
    out = []
    for idx, node in enumerate(nodes):
        path = node.get("name") or f"node_{idx}"
        parent = parents.get(idx)
        while parent is not None:
            path = f"{nodes[parent].get('name') or f'node_{parent}'}/{path}"
            parent = parents.get(parent)
        name = node.get("name") or f"node_{idx}"
        out.append({"name": name, "path": path, "depth": path.count("/"), "childCount": len(node.get("children", [])), "isAnchor": is_anchor(name)})
    return out


def analyze_meshes(gltf: dict[str, Any], bin_chunk: bytes) -> list[dict[str, Any]]:
    out = []
    mesh_defs = gltf.get("meshes", [])
    materials = gltf.get("materials", [])
    for node_index, node in enumerate(gltf.get("nodes", [])):
        mesh_index = node.get("mesh")
        if mesh_index is None or mesh_index >= len(mesh_defs):
            continue
        mesh_def = mesh_defs[mesh_index]
        boxes = []
        material_name = None
        for primitive in mesh_def.get("primitives", []):
            accessor_index = primitive.get("attributes", {}).get("POSITION")
            if accessor_index is not None:
                box = accessor_box(gltf, accessor_index, bin_chunk)
                if box:
                    boxes.append(box)
            material_index = primitive.get("material")
            if material_index is not None and material_index < len(materials):
                material_name = materials[material_index].get("name") or f"material_{material_index}"
        bbox = union_boxes(boxes)
        out.append({"name": mesh_def.get("name") or node.get("name") or f"mesh_{len(out)}", "nodeName": node.get("name") or f"node_{node_index}", "materialName": material_name, "boundingBox": bbox, "center": center_of(bbox) if bbox else None, "size": size_of(bbox) if bbox else None})
    return out


def analyze_materials(materials: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for idx, material in enumerate(materials):
        pbr = material.get("pbrMetallicRoughness", {})
        base = pbr.get("baseColorFactor", [1, 1, 1, 1])
        ext = material.get("extensions", {})
        out.append({"name": material.get("name") or f"material_{idx}", "baseColor": base, "emissiveColor": material.get("emissiveFactor", [0, 0, 0]), "emissiveIntensity": ext.get("KHR_materials_emissive_strength", {}).get("emissiveStrength", 1), "alphaMode": material.get("alphaMode", "OPAQUE"), "opacity": base[3] if len(base) > 3 else 1, "transparent": material.get("alphaMode") == "BLEND" or (len(base) > 3 and base[3] < 1), "transmission": ext.get("KHR_materials_transmission", {}).get("transmissionFactor", 0), "doubleSided": bool(material.get("doubleSided", False)), "metallic": pbr.get("metallicFactor"), "roughness": pbr.get("roughnessFactor")})
    return out


def analyze_lights(gltf: dict[str, Any]) -> list[dict[str, Any]]:
    lights = gltf.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])
    out = []
    for node in gltf.get("nodes", []):
        light_index = node.get("extensions", {}).get("KHR_lights_punctual", {}).get("light")
        if light_index is not None and light_index < len(lights):
            light = lights[light_index]
            out.append({"name": node.get("name") or light.get("name") or f"light_{light_index}", "type": str(light.get("type", "UNKNOWN")).upper(), "position": node.get("translation", [0, 0, 0]), "target": None})
    return out


def accessor_box(gltf: dict[str, Any], accessor_index: int, bin_chunk: bytes) -> dict[str, list[float]] | None:
    accessors = gltf.get("accessors", [])
    if accessor_index >= len(accessors):
        return None
    accessor = accessors[accessor_index]
    if "min" in accessor and "max" in accessor:
        return {"min": accessor["min"], "max": accessor["max"]}
    if accessor.get("type") != "VEC3" or accessor.get("componentType") != 5126:
        return None
    view = gltf.get("bufferViews", [])[accessor.get("bufferView")]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", 12)
    mins = [math.inf, math.inf, math.inf]
    maxs = [-math.inf, -math.inf, -math.inf]
    for i in range(accessor.get("count", 0)):
        offset = base + i * stride
        if offset + 12 > len(bin_chunk):
            break
        xyz = struct.unpack_from("<fff", bin_chunk, offset)
        for axis, value in enumerate(xyz):
            mins[axis] = min(mins[axis], value)
            maxs[axis] = max(maxs[axis], value)
    return {"min": mins, "max": maxs} if all(math.isfinite(v) for v in mins + maxs) else None


def emissive_candidates(meshes: list[dict[str, Any]], materials: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_name = {m["name"]: m for m in materials}
    out = []
    for mesh in meshes:
        material = by_name.get(mesh.get("materialName"))
        emissive = material.get("emissiveColor", [0, 0, 0]) if material else [0, 0, 0]
        luma = emissive[0] * 0.2126 + emissive[1] * 0.7152 + emissive[2] * 0.0722
        name_hit = has_any(f"{mesh['name']} {mesh['nodeName']} {mesh.get('materialName')}", ["emissive", "led", "light", "glow"])
        confidence = min(0.9, (0.55 if luma > 0.03 else 0) + (0.2 if name_hit else 0))
        if confidence > 0.2:
            out.append({"value": mesh["nodeName"], "confidence": round(confidence, 2), "requiresReview": True, "method": "EMISSIVE_MATERIAL" if luma > 0.03 else "NAME_MATCH", "evidence": ["EMISSIVE_COLOR" if luma > 0.03 else "EMISSIVE_NAME"]})
    return sorted(out, key=lambda item: item["confidence"], reverse=True)


def material_role_candidates(meshes: list[dict[str, Any]]) -> dict[str, Any]:
    terms = {"BULB": ["bulb", "lamp", "led"], "SHADE": ["shade", "hood"], "DIFFUSER": ["diffuser", "glass"], "EMISSIVE_SURFACE": ["emissive", "light", "glow"]}
    out = {}
    for role, needles in terms.items():
        best = {"value": None, "confidence": 0, "requiresReview": True, "method": "NO_CANDIDATE", "evidence": []}
        for mesh in meshes:
            if has_any(f"{mesh['name']} {mesh['nodeName']} {mesh.get('materialName')}", needles):
                best = {"value": mesh["nodeName"], "confidence": 0.48, "requiresReview": True, "method": "NAME_MATCH", "evidence": ["NAME_MATCH"]}
                break
        out[role] = best
    return out


def build_limitations(meshes: list[dict[str, Any]], materials: list[dict[str, Any]], anchors: list[str], model_size: list[float], emissive: list[dict[str, Any]]) -> list[str]:
    out = []
    if not meshes:
        out.append("NO_MESH")
    if not materials:
        out.append("NO_MATERIAL")
    if len(meshes) == 1:
        out.extend(["SINGLE_MESH", "BULB_NOT_SEPARATED", "SHADE_NOT_SEPARATED"])
    if len(materials) == 1:
        out.append("SINGLE_MATERIAL")
    if not anchors:
        out.append("NO_LIGHT_ANCHOR")
    if not emissive:
        out.append("NO_EMISSIVE_MATERIAL")
    if not likely_meter_scale(model_size):
        out.append("UNKNOWN_SCALE")
    return sorted(set(out))


def union_boxes(boxes: list[dict[str, list[float]]]) -> dict[str, list[float]] | None:
    if not boxes:
        return None
    return {"min": [min(box["min"][axis] for box in boxes) for axis in range(3)], "max": [max(box["max"][axis] for box in boxes) for axis in range(3)]}


def center_of(box: dict[str, list[float]]) -> list[float]:
    return [(box["min"][axis] + box["max"][axis]) / 2 for axis in range(3)]


def size_of(box: dict[str, list[float]]) -> list[float]:
    return [box["max"][axis] - box["min"][axis] for axis in range(3)]


def likely_meter_scale(size: list[float]) -> bool:
    max_dim = max(size or [0])
    return 0.01 < max_dim < 8


def is_anchor(name: str) -> bool:
    normalized = name.upper().replace("_", "")
    return any(term in normalized for term in ["LIGHTORIGIN", "LIGHTTARGET", "BULBMESH", "LAMPSHADE", "DIFFUSER", "EMISSIVESURFACE"])


def has_any(value: str, terms: list[str]) -> bool:
    lower = value.lower()
    return any(term in lower for term in terms)


if __name__ == "__main__":
    main()
