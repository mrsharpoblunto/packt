/* @flow */
import glm from 'gl-matrix';
import invariant from 'invariant';
import {
  barycentric,
  closestPointLineSegments,
  closestPointOnTriangle
} from 'geometry/helpers';
import * as constants from 'constants';

export type SupportFunc = (outWorld: Vec3, direction: Vec3) => Vec3;

const MAX_ITERATIONS = 75;
const EXIT_THRESHOLD = 0.001;

const _reverse = glm.vec3.create();
const _direction = glm.vec3.create();
const _distance = glm.vec3.create();
const _ab = glm.vec3.create();
const _ac = glm.vec3.create();
const _ad = glm.vec3.create();
const _bd = glm.vec3.create();
const _cd = glm.vec3.create();
const _ao = glm.vec3.create();
const _bc = glm.vec3.create();
const _ca = glm.vec3.create();
const _abc = glm.vec3.create();
const _cross = glm.vec3.create();
const _op = glm.vec3.create();
const _tmp = glm.vec3.create();
const _tmp1 = glm.vec3.create();

export class Simplex {
  length: number;
  closest: ?number;

  constructor() {
    (this: any)[0] = new SupportPoint();
    (this: any)[1] = new SupportPoint();
    (this: any)[2] = new SupportPoint();
    (this: any)[3] = new SupportPoint();
    this.length = 0;
    this.closest = null;
  }

  grow(): SupportPoint {
    return (this: any)[this.length++];
  }

  shrink() {
    --this.length;
  }

  swap(a: number, b: number) {
    const tmp = (this: any)[a];
    (this: any)[a] = (this: any)[b];
    (this: any)[b] = tmp;
  }
}

class SupportPoint {
  localSupports: Array<Vec3>;
  worldSupports: Array<Vec3>;
  v: Vec3;

  constructor() {
    this.localSupports = [glm.vec3.create(), glm.vec3.create()];
    this.worldSupports = [glm.vec3.create(), glm.vec3.create()];
    this.v = glm.vec3.create();
  }
}

// create a GJK support function which can work for an object that is
// rotated and translated into world space
export function createSupport(
  convexHull: Array<Vec3>,
  inverseRotation: Mat4,
  world: Mat4
): SupportFunc {
  const localDirection = glm.vec3.create();
  const worldOut = glm.vec3.create();
  return function(worldOut: Vec3, direction: Vec3): Vec3 {
    glm.vec3.transformMat4(localDirection, direction, inverseRotation);
    let out = convexHull[0];
    let max = glm.vec3.dot(convexHull[0], localDirection);
    for (let i = 1; i < convexHull.length; ++i) {
      const test = glm.vec3.dot(convexHull[i], localDirection);
      if (test > max) {
        out = convexHull[i];
        max = test;
      }
    }

    glm.vec3.transformMat4(worldOut, out, world);
    return worldOut;
  };
}

// gjk as explained here http://mollyrocket.com/849
export function GJKIntersect(
  simplex: Simplex,
  supportA: SupportFunc,
  supportB: SupportFunc
): boolean {
  return GJKDistance(simplex, constants.RIGHT, supportA, supportB) === null;
}

// Finds the minimum distance between two non colliding convex hulls according
// to Ericsons geomatrix interpretation of GJK
export function GJKDistance(
  simplex: Simplex,
  initialDirection: Vec3,
  supportA: SupportFunc,
  supportB: SupportFunc
): ?number {
  // get the first point in the search direction
  support(simplex.grow(), initialDirection, supportA, supportB);
  // then get the second in the opposite direction
  glm.vec3.negate(_direction, initialDirection);
  support(simplex.grow(), _direction, supportA, supportB);
  {
    // then get the third in the direction orthogonal to the first
    // two points and the origin
    const as = (simplex: any)[1].v;
    const bs = (simplex: any)[0].v;
    glm.vec3.negate(_ao, as);
    glm.vec3.sub(_ab, bs, as);
    glm.vec3.cross(_direction, _ab, _ao);
    glm.vec3.cross(_direction, _direction, _ab);
    support(simplex.grow(), _direction, supportA, supportB);
  }

  for (let i = 0; i < MAX_ITERATIONS; ++i) {
    closestMinkowskiDifferenceToOrigin(_distance, simplex);

    // if the closest point is the origin, then
    // we have an intersection.
    if (glm.vec3.equals(_distance, constants.ORIGIN)) {
      return null;
    }

    // search in the direction from the closest point to
    // the origin for a point
    glm.vec3.negate(_direction, _distance);
    support(simplex.grow(), _direction, supportA, supportB);
    simplex.shrink();

    const newPoint = (simplex: any)[3];
    const a = (simplex: any)[2];
    const b = (simplex: any)[1];
    const c = (simplex: any)[0];

    const newDot = glm.vec3.dot(newPoint.v, _distance);
    const aDot = glm.vec3.dot(a.v, _distance);
    const bDot = glm.vec3.dot(b.v, _distance);
    const cDot = glm.vec3.dot(c.v, _distance);
    const existingDot = Math.min(aDot, bDot, cDot);

    const difference = newDot - existingDot;
    // if the new point is further than our current
    // best then we have found the closest point
    if (difference >= 0) {
      simplex.closest = glm.vec3.length(_distance);
      return simplex.closest;
    }

    // otherwise replace the point on the triangle furthest from
    // the origin with the new point and try again
    if (aDot > bDot) {
      if (aDot > cDot) {
        (simplex: any)[2] = newPoint;
        (simplex: any)[3] = a;
      } else {
        (simplex: any)[0] = newPoint;
        (simplex: any)[3] = c;
      }
    } else if (bDot > cDot) {
      (simplex: any)[1] = newPoint;
      (simplex: any)[3] = b;
    } else {
      (simplex: any)[0] = newPoint;
      (simplex: any)[3] = c;
    }
  }

  return null;
}

export function GJKClosestPoint(
  outPoint: Vec3,
  outNormal: Vec3,
  simplex: Simplex
): ?Vec3 {
  if (!simplex.closest) {
    invariant(!simplex.closest, 'Simplex is not complete');
    return null;
  }

  const a1 = (simplex: any)[0].worldSupports[0];
  const a2 = (simplex: any)[0].worldSupports[1];
  const b1 = (simplex: any)[1].worldSupports[0];
  const b2 = (simplex: any)[1].worldSupports[1];
  const c1 = (simplex: any)[2].worldSupports[0];
  const c2 = (simplex: any)[2].worldSupports[1];
  const closest = simplex.closest * simplex.closest;

  // 6 point triangle distance tests
  let d = closestPointOnTriangle(_tmp, a1, a2, b2, c2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.copy(outPoint, a1);
    glm.vec3.sub(outNormal, _tmp, a1);
    return outPoint;
  }

  d = closestPointOnTriangle(_tmp, b1, a2, b2, c2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.copy(outPoint, b1);
    glm.vec3.sub(outNormal, _tmp, b1);
    return outPoint;
  }

  d = closestPointOnTriangle(_tmp, c1, a2, b2, c2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.copy(outPoint, c1);
    glm.vec3.sub(outNormal, _tmp, c1);
    return outPoint;
  }

  d = closestPointOnTriangle(_tmp, a2, a1, b1, c1);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.copy(outPoint, a2);
    glm.vec3.sub(outNormal, _tmp, a2);
    return outPoint;
  }

  d = closestPointOnTriangle(_tmp, b2, a1, b1, c1);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.copy(outPoint, b2);
    glm.vec3.sub(outNormal, _tmp, b2);
    return outPoint;
  }

  d = closestPointOnTriangle(_tmp, c2, a1, b1, c1);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.copy(outPoint, c2);
    glm.vec3.sub(outNormal, _tmp, c2);
    return outPoint;
  }

  // 9 line segment closest point tests
  d = closestPointLineSegments(outPoint, _tmp, a1, b1, a2, b2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.sub(outNormal, _tmp, outPoint);
    return outPoint;
  }
  d = closestPointLineSegments(outPoint, _tmp, a1, b1, a2, c2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.sub(outNormal, _tmp, outPoint);
    return outPoint;
  }
  d = closestPointLineSegments(outPoint, _tmp, a1, b1, b2, c2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.sub(outNormal, _tmp, outPoint);
    return outPoint;
  }

  d = closestPointLineSegments(outPoint, _tmp, a1, c1, a2, b2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.sub(outNormal, _tmp, outPoint);
    return outPoint;
  }
  d = closestPointLineSegments(outPoint, _tmp, a1, c1, a2, c2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.sub(outNormal, _tmp, outPoint);
    return outPoint;
  }
  d = closestPointLineSegments(outPoint, _tmp, a1, c1, b2, c2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.sub(outNormal, _tmp, outPoint);
    return outPoint;
  }

  d = closestPointLineSegments(outPoint, _tmp, b1, c1, a2, b2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.sub(outNormal, _tmp, outPoint);
    return outPoint;
  }
  d = closestPointLineSegments(outPoint, _tmp, b1, c1, a2, c2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.sub(outNormal, _tmp, outPoint);
    return outPoint;
  }
  d = closestPointLineSegments(outPoint, _tmp, b1, c1, b2, c2);
  if (glm.glMatrix.equals(d, closest)) {
    glm.vec3.sub(outNormal, _tmp, outPoint);
    return outPoint;
  }

  return null;
}

function closestMinkowskiDifferenceToOrigin(out: Vec3, simplex: Simplex): Vec3 {
  closestPointOnTriangle(
    out,
    constants.ORIGIN,
    (simplex: any)[2].v,
    (simplex: any)[1].v,
    (simplex: any)[0].v
  );
  return out;
}

function support(
  out: SupportPoint,
  direction: Vec3,
  supportA: SupportFunc,
  supportB: SupportFunc
): Vec3 {
  glm.vec3.negate(_reverse, direction);
  const a = supportA(out.worldSupports[0], direction);
  const b = supportB(out.worldSupports[1], _reverse);
  glm.vec3.sub(out.v, a, b);
  return out.v;
}

class Triangle {
  points: Array<SupportPoint>;
  normal: Vec3;

  constructor(a: SupportPoint, b: SupportPoint, c: SupportPoint) {
    this.points = [a, b, c];
    glm.vec3.sub(_ab, b.v, a.v);
    glm.vec3.sub(_ac, c.v, a.v);
    this.normal = glm.vec3.create();
    glm.vec3.cross(this.normal, _ab, _ac);
    glm.vec3.normalize(this.normal, this.normal);
  }
}

type Edge = Array<SupportPoint>;

// process the specified edge, if another edge with the same points in the
// opposite order exists then it is removed and the new point is also not added
// this ensures only the outermost ring edges of a cluster of triangles remain
// in the list
function addEdge(edges: Array<Edge>, a: SupportPoint, b: SupportPoint) {
  for (let i = 0; i < edges.length; ++i) {
    if (
      glm.vec3.equals(edges[i][0].v, b.v) &&
      glm.vec3.equals(edges[i][1].v, a.v)
    ) {
      edges.splice(i, 1);
      return;
    }
  }
  edges.push([a, b]);
}

export function EPA(
  outPoint: Vec3,
  outNormal: Vec3,
  simplex: Simplex,
  supportA: SupportFunc,
  supportB: SupportFunc
): ?Vec3 {
  invariant(simplex.length === 3, 'Expected simplex length of 3');

  // expand the simplex to 4 by taking the triangle normal as the search
  // direction
  glm.vec3.sub(_ab, (simplex: any)[1].v, (simplex: any)[0].v);
  glm.vec3.sub(_ac, (simplex: any)[2].v, (simplex: any)[0].v);
  glm.vec3.cross(_direction, _ab, _ac);
  support((simplex: any).grow(), _direction, supportA, supportB);
  // if the search direction was no good, try the opposite direction
  if (glm.vec3.sqrLen((simplex: any)[3]) <= glm.glMatrix.EPSILON) {
    glm.vec3.negate(_direction, _direction);
    support((simplex: any)[3], _direction, supportA, supportB);
  }

  invariant(simplex.length === 4, 'Expected simplex length of 4');

  // fix tetrahedron winding so that simplex[0] - 1 - 2 is CCW
  glm.vec3.sub(_ad, (simplex: any)[0], (simplex: any)[3]);
  glm.vec3.sub(_bd, (simplex: any)[1], (simplex: any)[3]);
  glm.vec3.sub(_cd, (simplex: any)[1], (simplex: any)[3]);
  glm.vec3.cross(_cross, _bd, _cd);
  const determinant = glm.vec3.dot(_ad, _cross);
  if (determinant > 0) {
    simplex.swap(0, 1);
  }

  const triangles: Array<Triangle> = [];
  let edges: Array<Edge> = [];

  triangles.push(
    new Triangle((simplex: any)[3], (simplex: any)[2], (simplex: any)[1])
  );
  triangles.push(
    new Triangle((simplex: any)[3], (simplex: any)[1], (simplex: any)[0])
  );
  triangles.push(
    new Triangle((simplex: any)[3], (simplex: any)[0], (simplex: any)[2])
  );
  triangles.push(
    new Triangle((simplex: any)[2], (simplex: any)[0], (simplex: any)[1])
  );

  for (let i = 0; i < MAX_ITERATIONS; ++i) {
    // find closest triangle to the origin
    let currentDistance: number = 0;
    let currentTriangle: ?Triangle;
    for (let tri of triangles) {
      const distance = Math.abs(glm.vec3.dot(tri.normal, tri.points[0].v));
      if (!currentTriangle || distance < currentDistance) {
        currentTriangle = tri;
        currentDistance = distance;
      }
    }

    if (!currentTriangle) return null;

    // get next support point in front of the triangle
    const currentSupport = new SupportPoint();
    support(currentSupport, currentTriangle.normal, supportA, supportB);

    // check how much further this new point will take us from the origin
    // if its is not far enough, then we assume we have found the closest
    if (
      glm.vec3.dot(currentTriangle.normal, currentSupport.v) - currentDistance <
      glm.glMatrix.EPSILON
    ) {
      // calculate the barycentric coordinates of the closest triangle with respect to
      // the projection of the origin onto the triangle
      barycentric(
        _tmp,
        glm.vec3.scale(_tmp1, currentTriangle.normal, currentDistance),
        currentTriangle.points[0].v,
        currentTriangle.points[1].v,
        currentTriangle.points[2].v
      );

      if (
        Math.abs(_tmp[0]) > 1 ||
        Math.abs(_tmp[1]) > 1 ||
        Math.abs(_tmp[2]) > 1
      ) {
        return null;
      }

      glm.vec3.scale(
        outPoint,
        currentTriangle.points[0].worldSupports[0],
        _tmp[0]
      );
      glm.vec3.scaleAndAdd(
        outPoint,
        outPoint,
        currentTriangle.points[1].worldSupports[0],
        _tmp[1]
      );
      glm.vec3.scaleAndAdd(
        outPoint,
        outPoint,
        currentTriangle.points[2].worldSupports[0],
        _tmp[2]
      );
      glm.vec3.negate(outNormal, currentTriangle.normal);
      return outPoint;
    }

    for (let i = 0; i < triangles.length; ) {
      // can this face be 'seen' by currentSupport
      if (
        glm.vec3.dot(
          triangles[i].normal,
          glm.vec3.sub(_tmp, currentSupport.v, triangles[i].points[0].v)
        ) > 0
      ) {
        addEdge(edges, triangles[i].points[0], triangles[i].points[1]);
        addEdge(edges, triangles[i].points[1], triangles[i].points[2]);
        addEdge(edges, triangles[i].points[2], triangles[i].points[0]);
        triangles.splice(i, 1);
        continue;
      }
      ++i;
    }

    // create new triangles from the edges in the edge list
    for (const edge of edges) {
      triangles.push(new Triangle(currentSupport, edge[0], edge[1]));
    }
    edges = [];
  }
  return null;
}
