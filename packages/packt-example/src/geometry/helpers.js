import glm from 'gl-matrix';

const _ab = glm.vec3.create();
const _ac = glm.vec3.create();
const _ap = glm.vec3.create();
const _bp = glm.vec3.create();
const _cp = glm.vec3.create();
const _da = glm.vec3.create();
const _db = glm.vec3.create();
const _d1 = glm.vec3.create();

export function closestPointOnTriangle(
  out: Vec3,
  p: Vec3,
  a: vec3,
  b: Vec3,
  c: Vec3,
): number {
  glm.vec3.sub(_ab, b, a);
  glm.vec3.sub(_ac, c, a);
  glm.vec3.sub(_ap, p, a);

  // check if p in vertex region outside of a
  const d1 = glm.vec3.dot(_ab, _ap);
  const d2 = glm.vec3.dot(_ac, _ap);
  if (d1 <= 0 && d2 <= 0) {
    // barycentric coordinates (1,0,0)
    glm.vec3.copy(out, a);
    return glm.vec3.sqrDist(out, p);
  }

  // check if p in vertex region outside of b
  glm.vec3.sub(_bp, p, b);
  const d3 = glm.vec3.dot(_ab, _bp);
  const d4 = glm.vec3.dot(_ac, _bp);
  if (d3 >= 0 && d4 <= d3) {
    // barycentric coordinates (0,1,0)
    glm.vec3.copy(out, b);
    return glm.vec3.sqrDist(out, p);
  }

  // check if p in edge region of ab, and if so, return projection
  // of p onto ab
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    // barycentric coordinates (1-v,v,0)
    const v = d1 / (d1 - d3);
    glm.vec3.scaleAndAdd(out, a, _ab, v);
    return glm.vec3.sqrDist(out, p);
  }

  // check if p in vertex region outside c
  glm.vec3.sub(_cp, p, c);
  const d5 = glm.vec3.dot(_ab, _cp);
  const d6 = glm.vec3.dot(_ac, _cp);
  if (d6 >= 0 && d5 <= d6) {
    // barycentric coordinates (0,0,1)
    glm.vec3.copy(out, c);
    return glm.vec3.sqrDist(out, p);
  }

  // check if p in edge region of ac, if so return projection
  // of p onto ac
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    // barycentric coordinates (1-w,0,w)
    const w = d2 / (d2 - d6);
    glm.vec3.scaleAndAdd(out, a, _ac, w);
    return glm.vec3.sqrDist(out, p);
  }

  // check if p in edge region of bc, if so return projection
  // of p onto bc
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    // barycentric coordinates (0,1-w,w)
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    glm.vec3.sub(out, c, b);
    glm.vec3.scale(out, out, w);
    glm.vec3.add(out, out, b);
    return glm.vec3.sqrDist(out, p);
  }

  // p inside face region compute q through barycentric coordinates
  // (u,v,w)
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  glm.vec3.scaleAndAdd(out, a, _ab, v);
  glm.vec3.scaleAndAdd(out, out, _ac, w);
  return glm.vec3.sqrDist(out, p);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function closestPointLineSegments(
  outA: Vec3,
  outB: Vec3,
  a1: Vec3,
  a2: Vec3,
  b1: Vec3,
  b2: Vec3,
): number {
  glm.vec3.sub(_da, a2, a1);
  glm.vec3.sub(_db, b2, b1);

  glm.vec3.sub(_d1, a1, b1);

  const sa = glm.vec3.sqrLen(_da);
  const sb = glm.vec3.sqrLen(_db);
  let fa = 0;
  let fb = 0;

  // check if either of both segments degenerate into points
  if (sa <= glm.glMatrix.EPSILON && sb <= glm.glMatrix.EPSILON) {
    glm.vec3.copy(outA, a1);
    glm.vec3.copy(outB, b1);
    return glm.vec3.sqrLen(_d1);
  }

  const dbDotD1 = glm.vec3.dot(_db, _d1);
  if (sa <= glm.glMatrix.EPSILON) {
    // first segment degenerates into a point
    fb = clamp(dbDotD1 / sb, 0, 1);
  } else {
    const daDotD1 = glm.vec3.dot(_da, _d1);
    if (sb <= glm.glMatrix.EPSILON) {
      // the second segment degenerates into a point
      fa = clamp(-daDotD1 / sa, 0, 1);
    } else {
      // neither segment degenerates into a point
      const daDotDb = glm.vec3.dot(_da, _db);
      const denom = sa * sb - daDotDb * daDotDb;

      // if segments not parallel, compute closest point
      // and clamp to segment a.
      if (denom != 0) {
        fa = clamp((daDotDb * dbDotD1 - daDotD1 * sb) / denom, 0, 1);
      }

      const tnom = daDotDb * fa + dbDotD1;
      if (tnom < 0) {
        fa = clamp(-daDotD1 / sa, 0, 1);
      } else if (tnom > sb) {
        fa = clamp((daDotDb - daDotD1) / sa, 0, 1);
        fb = 1;
      } else {
        fb = tnom / sb;
      }
    }
  }
  glm.vec3.scaleAndAdd(outA, a1, _da, fa);
  glm.vec3.scaleAndAdd(outB, b1, _db, fb);
  return glm.vec3.sqrDist(outA, outB);
}

export function barycentric(out: Vec3, up: Vec3, a: Vec3, b: Vec3, c: Vec3) {
  glm.vec3.sub(_ab, b, a);
  glm.vec3.sub(_ac, c, a);
  glm.vec3.sub(_ap, up, a);
  const d00 = glm.vec3.dot(_ab, _ab);
  const d01 = glm.vec3.dot(_ab, _ac);
  const d11 = glm.vec3.dot(_ac, _ac);
  const d20 = glm.vec3.dot(_ap, _ab);
  const d21 = glm.vec3.dot(_ap, _ac);
  const denom = d00 * d11 - d01 * d01;
  out[1] = (d11 * d20 - d01 * d21) / denom;
  out[2] = (d00 * d21 - d01 * d20) / denom;
  out[0] = 1 - out[1] - out[2];
}
