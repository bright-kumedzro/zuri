"""Compile MakeHuman CC0 data into compact, web-ready Zuri assets.

Usage:
    python -I tools/compile_assets.py <makehuman-data-dir> <system-assets-dir> <out-dir>

Inputs:
    makehuman-data-dir  makehuman/data from github.com/makehumancommunity/makehuman
    system-assets-dir   extracted makehuman_system_assets_cc0.zip

Outputs (all little-endian):
    manifest.json   index of everything below
    base.bin        base mesh: rest positions, body render buffers
    macro.bin       PCA-compressed macro targets (gender/age/ethnicity/muscle/weight/height/proportions/breast)
    targets.bin     sparse detail targets (face shape modifiers, expression units)
    proxies/*.bin   fitted assets (eyes, hair, brows, lashes, teeth, clothes)
    tex/*.webp      textures
"""

import json
import time
import os
import re
import sys

import numpy as np
from PIL import Image

MH, SYS, OUT = (os.path.abspath(p) for p in sys.argv[1:4])
TARGETS = os.path.join(MH, "targets")
os.makedirs(os.path.join(OUT, "proxies"), exist_ok=True)
os.makedirs(os.path.join(OUT, "tex"), exist_ok=True)

FACE_GROUPS = ["head", "forehead", "eyebrows", "neck", "eyes", "nose", "mouth", "ears", "chin", "cheek"]
MACRO_MAX_ERROR = 0.02  # decimeters = 2 mm
TEX_SIZE = 2048


T0 = time.time()


def log(msg):
    print(f"[{time.time() - T0:6.1f}s] {msg}", flush=True)


# ---------------------------------------------------------------- helpers

def read_lines(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                yield line


def parse_obj(path, group=None):
    """Return (positions[N,3], uvs[M,2], faces[list of [(v, vt), ...]])."""
    pos, uv, faces = [], [], []
    current = None
    for line in read_lines(path):
        parts = line.split()
        tag = parts[0]
        if tag == "v":
            pos.append([float(x) for x in parts[1:4]])
        elif tag == "vt":
            uv.append([float(x) for x in parts[1:3]])
        elif tag == "g":
            current = parts[1] if len(parts) > 1 else None
        elif tag == "f" and (group is None or current == group):
            corners = []
            for c in parts[1:]:
                idx = c.split("/")
                v = int(idx[0]) - 1
                t = int(idx[1]) - 1 if len(idx) > 1 and idx[1] else v
                corners.append((v, t))
            faces.append(corners)
    return np.array(pos, np.float32), np.array(uv, np.float32), faces


def build_render(faces, uvs, keep_vertex=None):
    """Split (v, vt) pairs into render vertices and triangulate.

    Returns map (render vert -> source vert), uv per render vert, triangle indices.
    Faces touching a vertex where keep_vertex is False are dropped.
    """
    lookup, vmap, ruv, index = {}, [], [], []
    for face in faces:
        if keep_vertex is not None and not all(keep_vertex[v] for v, _ in face):
            continue
        ids = []
        for v, t in face:
            key = (v, t)
            if key not in lookup:
                lookup[key] = len(vmap)
                vmap.append(v)
                ruv.append(uvs[t] if len(uvs) else (0.0, 0.0))
            ids.append(lookup[key])
        for i in range(1, len(ids) - 1):
            index += [ids[0], ids[i], ids[i + 1]]
    return (np.array(vmap, np.uint32), np.array(ruv, np.float32).reshape(-1, 2), np.array(index, np.uint32))


def read_target(path, n):
    """Dense delta array [n,3] from a .target file."""
    d = np.zeros((n, 3), np.float32)
    for line in read_lines(path):
        p = line.split()
        d[int(p[0])] = (float(p[1]), float(p[2]), float(p[3]))
    return d


class Blob:
    """Append-only binary file with 4-byte aligned sections."""

    def __init__(self):
        self.parts, self.size = [], 0

    def add(self, arr):
        b = np.ascontiguousarray(arr).tobytes()
        pad = (-self.size) % 4
        if pad:
            self.parts.append(b"\0" * pad)
            self.size += pad
        off = self.size
        self.parts.append(b)
        self.size += len(b)
        return {"offset": off, "length": int(np.asarray(arr).size), "type": str(np.asarray(arr).dtype)}

    def write(self, path):
        with open(path, "wb") as f:
            for p in self.parts:
                f.write(p)
        return self.size


def has_alpha(src):
    im = Image.open(src)
    return "A" in im.getbands() and im.getchannel("A").getextrema()[0] < 250


def mean_color(src):
    """Average sRGB color (0..1) of the opaque texels; used to recolor hair."""
    im = Image.open(src).convert("RGBA").resize((128, 128))
    a = np.asarray(im, np.float32) / 255.0
    mask = a[..., 3] > 0.5
    return [round(float(c), 4) for c in a[..., :3][mask].mean(axis=0)] if mask.any() else [1.0, 1.0, 1.0]


def save_texture(src, name, alpha=False, size=TEX_SIZE):
    """Opaque textures -> JPEG, textures with alpha -> WebP."""
    alpha = alpha or has_alpha(src)
    ext = ".webp" if alpha else ".jpg"
    out = os.path.join(OUT, "tex", name + ext)
    if not os.path.exists(out) or os.path.getsize(out) == 0:
        im = Image.open(src)
        im = im.convert("RGBA" if alpha else "RGB")
        if max(im.size) > size:
            im = im.resize((size, size), Image.LANCZOS)
        if alpha:
            im.save(out, "WEBP", quality=88, method=4)
        else:
            im.save(out, "JPEG", quality=90, optimize=True)
    return "tex/" + name + ext


def parse_mhmat(path):
    mat = {}
    for line in read_lines(path):
        if line.startswith("//"):
            continue
        p = line.split(None, 1)
        if len(p) == 2:
            mat[p[0]] = p[1].strip()
    return mat


# ---------------------------------------------------------------- base mesh

log("base mesh ...")
base_pos, base_uv, body_faces = parse_obj(os.path.join(MH, "3dobjs", "base.obj"), group="body")
N = len(base_pos)
body_map, body_uv, body_index = build_render(body_faces, base_uv)
body_face_verts = sorted({v for f in body_faces for v, _ in f})

base_blob = Blob()
manifest = {
    "version": 1,
    "units": "decimeter",
    "vertexCount": N,
    "base": {
        "positions": base_blob.add(base_pos),
        "body": {
            "map": base_blob.add(body_map),
            "uv": base_blob.add(body_uv),
            "index": base_blob.add(body_index),
        },
    },
}
log(f"  {N} verts, {len(body_map)} body render verts, {len(body_index) // 3} tris")

# ---------------------------------------------------------------- macro targets (PCA)

log("macro targets ...")
macro_files = []
for root, _, files in os.walk(os.path.join(TARGETS, "macrodetails")):
    for fn in files:
        if fn.endswith(".target"):
            macro_files.append(os.path.join(root, fn))
for fn in os.listdir(os.path.join(TARGETS, "breast")):
    if fn.startswith(("female-", "male-")) and fn.endswith(".target"):
        macro_files.append(os.path.join(TARGETS, "breast", fn))
# Adults only for now: baby/child shapes are extreme and would triple the compressed size.
macro_files = sorted(f for f in macro_files if "-baby" not in f and "-child" not in f)


def macro_factors(path):
    rel = os.path.relpath(path, TARGETS).replace("\\", "/")
    name = os.path.basename(path)[: -len(".target")]
    parts = name.split("-")
    if parts[0] == "universal":
        parts = parts[1:]
    return rel, parts


D = np.zeros((len(macro_files), N * 3), np.float32)
macro_entries = []
for i, path in enumerate(macro_files):
    rel, factors = macro_factors(path)
    D[i] = read_target(path, N).reshape(-1)
    macro_entries.append({"name": rel, "factors": factors})

log(f"  {len(macro_files)} targets, PCA ...")
# Thin SVD via the T x T Gram matrix (T << 3N), far faster than a direct SVD.
D64 = D.astype(np.float64)
evals, evecs = np.linalg.eigh(D64 @ D64.T)
order = np.argsort(evals)[::-1]
evals, U = np.clip(evals[order], 0, None), evecs[:, order]
S_all = np.sqrt(evals)
coeffs_all = U * S_all  # T x T


def pca_error(k):
    b = (U[:, :k].T @ D64) / S_all[:k, None]
    sc = np.abs(b).max(axis=1) / 32767.0
    q = np.round(b / sc[:, None]).astype(np.int16)
    recon = coeffs_all[:, :k] @ (q.astype(np.float64) * sc[:, None])
    e = np.linalg.norm((recon - D64).reshape(len(D64), N, 3), axis=2).max()
    return e, q, sc


# Smallest K whose worst-case vertex error over every target is under MACRO_MAX_ERROR.
for K in list(range(32, len(D), 16)) + [len(D)]:
    err, q, scales = pca_error(K)
    log(f"  K={K:<4} max vertex error {err * 100:.2f} mm")
    if err < MACRO_MAX_ERROR:
        break
coeffs = coeffs_all[:, :K].astype(np.float32)
scales = scales.astype(np.float32)
log(f"  kept {K} components ({K * N * 3 * 2 / 1e6:.1f} MB)")

macro_blob = Blob()
manifest["macro"] = {
    "components": K,
    "targets": macro_entries,
    "coeffs": macro_blob.add(coeffs),
    "scales": macro_blob.add(scales.astype(np.float32)),
    "basis": macro_blob.add(q),
}

# ---------------------------------------------------------------- detail targets (sparse)

log("detail targets ...")
tgt_blob = Blob()
detail = []
detail_index = {}


def add_sparse(rel):
    if rel in detail_index:
        return detail_index[rel]
    path = os.path.join(TARGETS, rel)
    if not os.path.exists(path):
        return None
    idx, xyz = [], []
    for line in read_lines(path):
        p = line.split()
        idx.append(int(p[0]))
        xyz.append([float(x) for x in p[1:4]])
    idx = np.array(idx, np.uint32)
    xyz = np.array(xyz, np.float32).reshape(-1, 3)
    scale = float(np.abs(xyz).max() / 32767.0) if len(xyz) else 1.0
    entry = {
        "name": rel,
        "scale": scale or 1.0,
        "indices": tgt_blob.add(idx),
        "deltas": tgt_blob.add(np.round(xyz / (scale or 1.0)).astype(np.int16)),
    }
    detail_index[rel] = len(detail)
    detail.append(entry)
    return detail_index[rel]


modifiers = []
mods = json.load(open(os.path.join(MH, "modifiers", "modeling_modifiers.json")))
for g in mods:
    if g["group"] not in FACE_GROUPS:
        continue
    for m in g["modifiers"]:
        if "target" not in m:
            continue
        t = m["target"]
        if "min" in m:
            lo = add_sparse(f"{g['group']}/{t}-{m['min']}.target")
            hi = add_sparse(f"{g['group']}/{t}-{m['max']}.target")
            mid = f"{g['group']}/{t}-{m['min']}|{m['max']}"
        else:
            lo, hi = None, add_sparse(f"{g['group']}/{t}.target")
            mid = f"{g['group']}/{t}"
        if lo is None and hi is None:
            continue
        modifiers.append({"id": mid, "group": g["group"], "min": lo, "max": hi})

expressions = {}
units_dir = os.path.join(TARGETS, "expression", "units")
for eth in sorted(os.listdir(units_dir)):
    for fn in sorted(os.listdir(os.path.join(units_dir, eth))):
        if fn.endswith(".target"):
            unit = fn[: -len(".target")]
            expressions.setdefault(unit, {})[eth] = add_sparse(f"expression/units/{eth}/{fn}")

manifest["detail"] = {"targets": detail, "modifiers": modifiers, "expressions": expressions}
log(f"  {len(detail)} sparse targets, {len(modifiers)} face modifiers, {len(expressions)} expression units")

# ---------------------------------------------------------------- proxies


def parse_mhclo(path):
    data = {"refs": [], "weights": [], "offsets": [], "scale": [None, None, None], "delete": set(), "zDepth": 50}
    status = None
    v0 = None
    for line in read_lines(path):
        words = line.split()
        key = words[0]
        if key == "verts":
            status = "verts"
            continue
        if key == "delete_verts":
            status = "delete"
            continue
        if key == "weights":
            status = "weights"
            continue
        if key in ("x_scale", "y_scale", "z_scale"):
            data["scale"]["xyz".index(key[0])] = (int(words[1]), int(words[2]), float(words[3]))
            continue
        if key in ("name", "obj_file", "material", "z_depth", "uuid", "basemesh", "tag", "max_pole", "license",
                   "author", "homepage", "version", "special_pose", "vertexboneweights_file", "offset_scale"):
            if key == "z_depth":
                data["zDepth"] = int(words[1])
            elif key in ("name", "obj_file", "material"):
                data[key] = line.split(None, 1)[1]
            continue
        if status == "verts":
            if len(words) == 1:
                v = int(words[0])
                data["refs"].append((v, v, v))
                data["weights"].append((1.0, 0.0, 0.0))
                data["offsets"].append((0.0, 0.0, 0.0))
            else:
                data["refs"].append(tuple(int(x) for x in words[0:3]))
                data["weights"].append(tuple(float(x) for x in words[3:6]))
                data["offsets"].append(tuple(float(x) for x in words[6:9]) if len(words) >= 9 else (0.0, 0.0, 0.0))
        elif status == "delete":
            seq = False
            for w in words:
                if w == "-":
                    seq = True
                    continue
                v1 = int(w)
                if seq:
                    data["delete"].update(range(v0, v1 + 1))
                    seq = False
                else:
                    data["delete"].add(v1)
                v0 = v1
    return data


def compile_proxy(kind, folder, name, material_override=None, alpha=False):
    d = os.path.join(SYS, folder)
    mhclo = next(f for f in os.listdir(d) if f.endswith(".mhclo"))
    clo = parse_mhclo(os.path.join(d, mhclo))
    _, uv, faces = parse_obj(os.path.join(d, clo["obj_file"]))
    vmap, ruv, index = build_render(faces, uv)
    sx = clo["scale"]
    scale = [s or sx[0] for s in sx] if sx[0] else None

    blob = Blob()
    entry = {
        "id": name,
        "kind": kind,
        "zDepth": clo["zDepth"],
        "file": f"proxies/{name}.bin",
        "vertexCount": len(clo["refs"]),
        "scale": scale,
        "refs": blob.add(np.array(clo["refs"], np.uint32)),
        "weights": blob.add(np.array(clo["weights"], np.float32)),
        "offsets": blob.add(np.array(clo["offsets"], np.float32)),
        "map": blob.add(vmap),
        "uv": blob.add(ruv),
        "index": blob.add(index),
        "deleteVerts": blob.add(np.array(sorted(clo["delete"]), np.uint32)),
    }
    blob.write(os.path.join(OUT, "proxies", f"{name}.bin"))

    mat_path = os.path.normpath(os.path.join(d, material_override or clo["material"]))
    mat = parse_mhmat(mat_path)
    mdir = os.path.dirname(mat_path)
    out_mat = {"transparent": mat.get("transparent", "False").lower() == "true" or alpha,
               "doubleSided": mat.get("backfaceCull", "True").lower() == "false"}
    for key, slot in (("diffuseTexture", "map"), ("normalmapTexture", "normalMap"), ("aomapTexture", "aoMap")):
        if key in mat:
            src = os.path.join(mdir, mat[key])
            if os.path.exists(src):
                if slot == "map":
                    out_mat["transparent"] = out_mat["transparent"] or has_alpha(src)
                    if kind in ("hair", "eyebrows"):
                        out_mat["meanColor"] = mean_color(src)
                out_mat[slot] = save_texture(src, f"{name}_{slot}", alpha=(slot == "map" and out_mat["transparent"]))
    entry["material"] = out_mat
    return entry


log("proxies ...")
proxies = []
for kind, root in (("eyebrows", "eyebrows"), ("eyelashes", "eyelashes"), ("hair", "hair")):
    for name in sorted(os.listdir(os.path.join(SYS, root))):
        if os.path.isdir(os.path.join(SYS, root, name)):
            proxies.append(compile_proxy(kind, f"{root}/{name}", name, alpha=True))
proxies.append(compile_proxy("eyes", "eyes/high-poly", "eyes"))
proxies.append(compile_proxy("teeth", "teeth/teeth_base", "teeth"))
for name in sorted(os.listdir(os.path.join(SYS, "clothes"))):
    if os.path.isdir(os.path.join(SYS, "clothes", name)):
        kind = "shoes" if name.startswith("shoes") else "hat" if name.startswith("fedora") else "outfit"
        proxies.append(compile_proxy(kind, f"clothes/{name}", name))
for p in proxies:
    log(f"  {p['kind']:<10} {p['id']:<26} {p['vertexCount']:>6} verts")
manifest["proxies"] = proxies

# ---------------------------------------------------------------- skins & eye colors

log("textures ...")
skins = []
for name in sorted(os.listdir(os.path.join(SYS, "skins"))):
    m = re.fullmatch(r"(young|middleage|old)_(african|asian|caucasian)_(male|female)", name)
    if not m:
        continue
    d = os.path.join(SYS, "skins", name)
    mat = parse_mhmat(os.path.join(d, f"{name}.mhmat"))
    skins.append({"id": name, "age": m[1], "ethnicity": m[2], "gender": m[3],
                  "map": save_texture(os.path.join(d, mat["diffuseTexture"]), f"skin_{name}")})
manifest["skins"] = skins

eye_colors = []
mdir = os.path.join(SYS, "eyes", "materials")
for fn in sorted(os.listdir(mdir)):
    if fn.endswith(".mhmat"):
        mat = parse_mhmat(os.path.join(mdir, fn))
        cid = fn[: -len(".mhmat")]
        eye_colors.append({"id": cid, "map": save_texture(os.path.join(mdir, mat["diffuseTexture"]), f"eye_{cid}", alpha=True, size=1024)})
manifest["eyeColors"] = eye_colors

size = base_blob.write(os.path.join(OUT, "base.bin"))
size += macro_blob.write(os.path.join(OUT, "macro.bin"))
size += tgt_blob.write(os.path.join(OUT, "targets.bin"))
with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, separators=(",", ":"))
log(f"done: core binaries {size / 1e6:.1f} MB")
