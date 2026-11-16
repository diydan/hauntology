"""Makes the printable version of the original ghost: print/reference/ghost-original.stl -> print/stl/ghost-original-printable.stl

The original is a cloth draped over a head: a thin open shell with a mesh texture, a hollow inside, a wavy hem and thin tips. That is
hard to print (no solid, no flat bottom, a ceiling inside, thin tips). This script turns it into one smooth solid that stands flat on
the bed and prints with no supports:

  1. Voxelise the cloth, thicken it, close the gaps in the hem and fill the inside (one horizontal slice at a time).
  2. Smooth the solid in 3D. That removes the mesh texture and the wafer-thin tips and keeps the big folds.
  3. Cut off the bottom until the figure stands on one piece of at least BASE_MM2 (the cloth only touches the bed at its tips).
  4. Carve bottom up: a layer keeps only what lies within one voxel sideways of the layer below, which is 45 degrees. The overhang
     under the shoulders becomes a 45-degree chamfer instead of an unprintable ceiling.
  5. Let the skirt grow back down to the bed within FLARE_MM of the carved body (filled columns cannot overhang), for a stable base.
  6. Mesh it, cut it flat, reduce the triangles, and cut two shallow eye dimples. Their upper edge leans less than about 40 degrees
     from vertical, so they print without supports. Paint them black, or pause the print and change filament at the dimple floor.

Needs: pip install numpy scipy scikit-image trimesh manifold3d rtree shapely
Run:   python make-ghost-print.py        (GHOST_OUT=/some/file.stl writes it somewhere else)
"""
import os
import sys

import numpy as np
import trimesh
from scipy import ndimage
from skimage import measure

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(REPO, "print", "reference", "ghost-original.stl")
OUT = os.environ.get("GHOST_OUT") or os.path.join(REPO, "print", "stl", "ghost-original-printable.stl")

PITCH = 0.3           # mm per voxel
PAD_MM = 3.0          # empty space round the figure in the grid
SIMPLIFY_MM = 0.05    # triangle reduction tolerance (50 micrometres: far finer than a 0.4 mm nozzle)
LEVEL = 0.5

SKIN_MM = 0.8         # the cloth is thickened by this much each side before filling (a 1.6 mm wall at the thinnest)
CLOSE_MM = 5.0        # gaps in the hem up to twice this are closed, so the inside can be filled
BLUR_MM = 1.2         # smoothing of the solid (the mesh texture is about 1.5 mm; the big folds are 5 mm and more)
FINAL_BLUR_MM = 0.45  # a light blur after the carve, to round the 0.3 mm layer steps
SLOPE_VOXELS = 1.0    # one voxel sideways per voxel up is 45 degrees
FLARE_MM = 7.0        # the carve leaves a narrow trunk under the shoulders; the skirt may grow this far beyond it, down to the bed
BASE_MM2 = 400.0      # the cloth only touches the bed at its tips, so the figure stands on its lowest slice that is one piece and
                      # at least this big (about a 22 mm circle); everything below that slice is cut off

# eyes: half-width, half-height, depth, spacing between the centres, height as a share of the figure
EYE_HALF_W, EYE_HALF_H, EYE_DEPTH = 3.2, 4.8, 1.6
EYE_SPACING = 13.0
EYE_Z_FRAC = 0.72


# ---------------------------------------------------------------- shared helpers
def to_mesh(f, origin):
    verts, faces, _, _ = measure.marching_cubes(f, LEVEL, spacing=(PITCH, PITCH, PITCH))
    m = trimesh.Trimesh(verts + np.asarray(origin), faces, process=True)
    if m.volume < 0:
        m.invert()                                        # marching cubes winds this one inside out
    return m


def flat_at_bed(m):
    keep = trimesh.creation.box(extents=[400, 400, 400])
    keep.apply_translation([0, 0, 200])                   # everything above z = 0
    return trimesh.boolean.intersection([m, keep], engine="manifold")


def simplify(m, tol):
    """Fewer triangles (the raw surface has about 500,000), keeping every point within tol mm of the smooth surface."""
    import manifold3d
    mf = manifold3d.Manifold(manifold3d.Mesh(vert_properties=np.array(m.vertices, np.float32), tri_verts=np.array(m.faces, np.uint32)))
    out = mf.simplify(tol).to_mesh()
    return trimesh.Trimesh(np.array(out.vert_properties)[:, :3], np.array(out.tri_verts), process=True)


def eye_cutters(m):
    """Two ellipsoids, each pushed into the front surface so that only a shallow oval dimple is left."""
    cx = (m.bounds[0][0] + m.bounds[1][0]) / 2
    zc = m.bounds[1][2] * EYE_Z_FRAC
    cutters = []
    ray = trimesh.ray.ray_triangle.RayMeshIntersector(m)
    C = 3.0                                              # half-depth of the ellipsoid
    h = C - EYE_DEPTH                                    # the centre sits h outside the surface
    t = np.sqrt(1 - (h / C) ** 2)
    for sx in (-1, 1):
        x = cx + sx * EYE_SPACING / 2
        loc, _, tri = ray.intersects_location([[x, m.bounds[0][1] - 5, zc]], [[0, 1, 0]], multiple_hits=False)
        p, n = loc[0], m.face_normals[tri[0]]
        e = trimesh.creation.icosphere(subdivisions=4, radius=1.0)
        e.apply_scale([EYE_HALF_W / t, EYE_HALF_H / t, C])
        zax = n / np.linalg.norm(n)                      # ellipsoid z axis -> the surface normal; its y axis stays vertical
        xax = np.cross([0, 0, 1], zax); xax /= np.linalg.norm(xax)
        yax = np.cross(zax, xax)
        R = np.eye(4); R[:3, 0], R[:3, 1], R[:3, 2] = xax, yax, zax
        R[:3, 3] = p + zax * h
        e.apply_transform(R)
        cutters.append(e)
    return cutters


def finish(m):
    m = simplify(m, SIMPLIFY_MM)
    body = m
    for c in eye_cutters(m):
        body = trimesh.boolean.difference([body, c], engine="manifold")
    body.apply_translation([-body.bounds[0][0], -body.bounds[0][1], 0])
    # Snap to a micrometre like tools/build-print.mjs does, and drop the triangles that collapse when it does, so the check passes.
    snapped = trimesh.Trimesh(np.round(np.asarray(body.vertices, np.float64), 3), body.faces, process=False)
    snapped.merge_vertices()
    f = snapped.faces
    snapped.update_faces((f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 2] != f[:, 0]))   # only the ones whose corners merged
    snapped.remove_unreferenced_vertices()
    snapped.fix_normals()
    return snapped


# ---------------------------------------------------------------- the solid
def shell_voxels(src):
    """The cloth as a thin set of voxels (also works on an open mesh)."""
    from trimesh.voxel import creation
    vg = creation.voxelize_subdivide(src, PITCH)
    shell = np.asarray(vg.matrix, bool)
    origin = np.asarray(vg.transform)[:3, 3]
    return shell, origin


def closed_solid(shell):
    """Thicken the cloth, close the gaps in the hem, fill the inside, one horizontal slice at a time."""
    pad = int(np.ceil((CLOSE_MM + SKIN_MM + PAD_MM) / PITCH))
    shell = np.pad(shell, ((pad, pad), (pad, pad), (0, 0)))
    skin_v, close_v = SKIN_MM / PITCH, CLOSE_MM / PITCH
    T = np.zeros_like(shell)
    for k in range(shell.shape[2]):
        a = shell[:, :, k]
        if not a.any():
            continue
        thick = ndimage.distance_transform_edt(~a) <= skin_v
        grown = ndimage.distance_transform_edt(~thick) <= close_v
        closed = ndimage.distance_transform_edt(grown) > close_v
        T[:, :, k] = ndimage.binary_fill_holes(closed | thick)
    return T, pad


def carve_45(T):
    """Bottom up: a layer may only keep what lies within SLOPE_VOXELS of the layer below it (which is 45 degrees)."""
    yy, xx = np.mgrid[-2:3, -2:3]
    disc = (xx ** 2 + yy ** 2) <= SLOPE_VOXELS ** 2 + 1e-6
    S = np.zeros_like(T)
    S[:, :, 0] = T[:, :, 0]
    for k in range(1, T.shape[2]):
        S[:, :, k] = T[:, :, k] & ndimage.binary_dilation(S[:, :, k - 1], structure=disc)
    return S


def solid_carve(src):
    shell, origin = shell_voxels(src)
    T, pad = closed_solid(shell)
    area = T.sum((0, 1)) * PITCH ** 2
    k0 = next(k for k in range(T.shape[2]) if area[k] >= BASE_MM2 and ndimage.label(T[:, :, k])[1] == 1)
    T = T[:, :, k0:]                                                                 # the new bed is this slice
    Tf = ndimage.gaussian_filter(T.astype(np.float32), BLUR_MM / PITCH) > LEVEL     # smooth the closed solid
    S = carve_45(Tf)                                                                 # carve it to 45 degrees
    if FLARE_MM > 0:
        # Fill straight down under every overhang (nothing can overhang a filled column), but only within FLARE_MM of the carved
        # body. The edge of that zone is a copy of the 45-degree carve edge moved outward, so it is still support-free.
        fill = np.flip(np.maximum.accumulate(np.flip(Tf, 2), axis=2), 2)
        near = ndimage.distance_transform_edt(~S) <= FLARE_MM / PITCH
        S = S | (fill & near)
    lab, n = ndimage.label(S)                                                        # keep only the piece that sits on the bed
    if n > 1:
        S = np.isin(lab, np.unique(lab[:, :, 0][lab[:, :, 0] > 0]))
    below = int(np.ceil(4 * FINAL_BLUR_MM / PITCH)) + 2
    Sp = np.concatenate([np.repeat(S[:, :, :1], below, axis=2), S], axis=2)         # the bed edge stays square after the blur
    Sp = np.pad(Sp, ((2, 2), (2, 2), (2, 2)))
    f = ndimage.gaussian_filter(Sp.astype(np.float32), FINAL_BLUR_MM / PITCH)       # round the layer steps
    org = np.array([origin[0] - pad * PITCH - 2 * PITCH, origin[1] - pad * PITCH - 2 * PITCH, origin[2] + k0 * PITCH - (below + 2) * PITCH])
    m = to_mesh(f, org)
    trimesh.smoothing.filter_taubin(m, lamb=0.5, nu=-0.53, iterations=20)         # evens out the faint creases; keeps the volume
    bed_z = origin[2] + k0 * PITCH - 0.5 * PITCH          # the underside of the lowest kept slice
    m.apply_translation([0, 0, -bed_z])                   # so the bed is z = 0 and the extra layers added above are cut off flat
    return m


# ---------------------------------------------------------------- main
def make():
    return finish(flat_at_bed(solid_carve(trimesh.load(SRC, force="mesh"))))


if __name__ == "__main__":
    mesh = make()
    mesh.export(OUT)
    print("wrote %s  tris %d  watertight %s  volume %.1f cm3  size %s" % (OUT, len(mesh.faces), mesh.is_watertight, mesh.volume / 1000, mesh.extents.round(1).tolist()))
