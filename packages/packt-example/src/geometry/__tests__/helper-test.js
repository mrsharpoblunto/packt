import glm from 'gl-matrix';
import {
  closestPointLineSegments,
  closestPointOnTriangle
} from 'geometry/helpers';

describe('closest point on triangle', () => {
  it('finds the closest point to a triangle', () => {
    const out = glm.vec3.create();
    const p = glm.vec3.fromValues(0, 1, 0);
    const a = glm.vec3.fromValues(1, 0, 1);
    const b = glm.vec3.fromValues(-1, 0, 1);
    const c = glm.vec3.fromValues(0, 0, -1);
    expect([closestPointOnTriangle(out, p, a, b, c), out]).toMatchSnapshot();
  });

  it('finds the closest point to a triangle edge', () => {
    const out = glm.vec3.create();
    const p = glm.vec3.fromValues(0, 0, 2);
    const a = glm.vec3.fromValues(1, 0, 1);
    const b = glm.vec3.fromValues(-1, 0, 1);
    const c = glm.vec3.fromValues(0, 0, -1);
    expect([closestPointOnTriangle(out, p, a, b, c), out]).toMatchSnapshot();
  });

  it('finds the closest point touching a triangle', () => {
    const out = glm.vec3.create();
    const p = glm.vec3.fromValues(0, 0, -0.5);
    const a = glm.vec3.fromValues(1, 0, 1);
    const b = glm.vec3.fromValues(-1, 0, 1);
    const c = glm.vec3.fromValues(0, 0, -1);
    expect([closestPointOnTriangle(out, p, a, b, c), out]).toMatchSnapshot();
  });
});

describe('closest point between line segments', () => {
  it('finds the closest point between two points', () => {
    const outA = glm.vec3.create();
    const outB = glm.vec3.create();

    const a1 = glm.vec3.fromValues(0.5, 0, 0);
    const a2 = glm.vec3.fromValues(0.5, 0, 0);
    const b1 = glm.vec3.fromValues(0, 0.5, 0);
    const b2 = glm.vec3.fromValues(0, 0.5, 0);

    expect([
      // the value returned is the distance squared
      closestPointLineSegments(outA, outB, a1, a2, b1, b2),
      outA,
      outB
    ]).toMatchSnapshot();
  });

  it('finds the closest point between two touching segments', () => {
    const outA = glm.vec3.create();
    const outB = glm.vec3.create();

    const a1 = glm.vec3.fromValues(0.5, 0, 0);
    const a2 = glm.vec3.fromValues(2, 1, 0);
    const b1 = glm.vec3.fromValues(0, 0.5, 0);
    const b2 = glm.vec3.fromValues(2, 1, 0);

    expect([
      closestPointLineSegments(outA, outB, a1, a2, b1, b2),
      outA,
      outB
    ]).toMatchSnapshot();
  });

  it('finds the closest point between two intersecting segments', () => {
    const outA = glm.vec3.create();
    const outB = glm.vec3.create();

    const a1 = glm.vec3.fromValues(0.5, 0, 0);
    const a2 = glm.vec3.fromValues(2, 1, 0);
    const b1 = glm.vec3.fromValues(0, 0.5, 0);
    const b2 = glm.vec3.fromValues(2, 0.5, 0);

    expect([
      closestPointLineSegments(outA, outB, a1, a2, b1, b2),
      outA,
      outB
    ]).toMatchSnapshot();
  });

  it('finds the closest point between non-intersecting segments', () => {
    const outA = glm.vec3.create();
    const outB = glm.vec3.create();

    const a1 = glm.vec3.fromValues(0, 0, 0);
    const a2 = glm.vec3.fromValues(2, 1, 0);
    const b1 = glm.vec3.fromValues(1, 0, 0);
    const b2 = glm.vec3.fromValues(1.5, 0.5, 0);

    expect([
      closestPointLineSegments(outA, outB, a1, a2, b1, b2),
      outA,
      outB
    ]).toMatchSnapshot();
  });
});
