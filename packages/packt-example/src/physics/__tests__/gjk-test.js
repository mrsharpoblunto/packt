/* @flow
 * @format */
import glm from 'gl-matrix';
import {
  GJKIntersect,
  GJKDistance,
  GJKClosestPoint,
  EPA,
  Simplex,
  createSupport
} from '../gjk-epa';

const CUBE_BASE = [
  glm.vec3.fromValues(-0.5, -0.5, -0.5),
  glm.vec3.fromValues(0.5, -0.5, -0.5),
  glm.vec3.fromValues(-0.5, 0.5, -0.5),
  glm.vec3.fromValues(0.5, 0.5, -0.5),
  glm.vec3.fromValues(-0.5, -0.5, 0.5),
  glm.vec3.fromValues(0.5, -0.5, 0.5),
  glm.vec3.fromValues(-0.5, 0.5, 0.5),
  glm.vec3.fromValues(0.5, 0.5, 0.5)
];

const IDENTITY = glm.mat4.create();
glm.mat4.identity(IDENTITY);

describe('gjk intersection', () => {
  it('detects translated non-collisions', () => {
    const cube1 = CUBE_BASE.map(v => glm.vec3.clone(v));
    const cube2 = CUBE_BASE.map(v => glm.vec3.clone(v));

    const CUBE_2_OFFSET = glm.vec3.fromValues(0.0, 1.05, 0.0);
    const CUBE_2_TRANSLATION = glm.mat4.create();
    glm.mat4.fromTranslation(CUBE_2_TRANSLATION, CUBE_2_OFFSET);

    const cube1Support = createSupport(cube1, IDENTITY, IDENTITY);
    const cube2Support = createSupport(cube2, IDENTITY, CUBE_2_TRANSLATION);
    const simplex = new Simplex();

    expect(GJKIntersect(simplex, cube1Support, cube2Support)).toBe(false);
  });

  it('detects rotated collisions', () => {
    const cube1 = CUBE_BASE.map(v => glm.vec3.clone(v));
    const cube2 = CUBE_BASE.map(v => glm.vec3.clone(v));

    const CUBE_2_OFFSET = glm.vec3.fromValues(0.0, 1.05, 0.0);
    const CUBE_2_WORLD = glm.mat4.create();
    glm.mat4.fromTranslation(CUBE_2_WORLD, CUBE_2_OFFSET);

    const CUBE_2_AXIS = glm.vec3.fromValues(1, 0, 0);
    const CUBE_2_INV_ROTATION = glm.mat4.create();
    glm.mat4.fromRotation(CUBE_2_INV_ROTATION, Math.PI / 4, CUBE_2_AXIS);

    glm.mat4.multiply(CUBE_2_WORLD, CUBE_2_INV_ROTATION, CUBE_2_WORLD);

    glm.mat4.invert(CUBE_2_INV_ROTATION, CUBE_2_INV_ROTATION);

    const cube1Support = createSupport(cube1, IDENTITY, IDENTITY);
    const cube2Support = createSupport(
      cube2,
      CUBE_2_INV_ROTATION,
      CUBE_2_WORLD
    );
    const simplex = new Simplex();

    expect(GJKIntersect(simplex, cube1Support, cube2Support)).toBe(true);

    const point = glm.vec3.create();
    const normal = glm.vec3.create();
    EPA(point, normal, simplex, cube1Support, cube2Support);
    console.log(point);
    console.log(normal);
  });

  it('detects translated collisions', () => {
    const cube1 = CUBE_BASE.map(v => glm.vec3.clone(v));
    const cube2 = CUBE_BASE.map(v => glm.vec3.clone(v));

    const CUBE_2_OFFSET = glm.vec3.fromValues(0.95, 0.0, 0.0);
    const CUBE_2_TRANSLATION = glm.mat4.create();
    glm.mat4.fromTranslation(CUBE_2_TRANSLATION, CUBE_2_OFFSET);

    const cube1Support = createSupport(cube1, IDENTITY, IDENTITY);
    const cube2Support = createSupport(cube2, IDENTITY, CUBE_2_TRANSLATION);
    const simplex = new Simplex();

    expect(GJKIntersect(simplex, cube1Support, cube2Support)).toBe(true);
  });

  it('detects exact overlap', () => {
    const cube1 = CUBE_BASE.map(v => glm.vec3.clone(v));
    const cube2 = CUBE_BASE.map(v => glm.vec3.clone(v));

    const cube1Support = createSupport(cube1, IDENTITY, IDENTITY);
    const cube2Support = createSupport(cube2, IDENTITY, IDENTITY);
    const simplex = new Simplex();

    expect(GJKIntersect(simplex, cube1Support, cube2Support)).toBe(true);
  });
});

describe('gjk distance', () => {
  it('computes non-colliding object distance', () => {
    const cube1 = CUBE_BASE.map(v => glm.vec3.clone(v));
    const cube2 = CUBE_BASE.map(v => glm.vec3.clone(v));

    const CUBE_2_OFFSET = glm.vec3.fromValues(0.0, 1.05, 0.0);
    const CUBE_2_TRANSLATION = glm.mat4.create();
    glm.mat4.fromTranslation(CUBE_2_TRANSLATION, CUBE_2_OFFSET);

    const cube1Support = createSupport(cube1, IDENTITY, IDENTITY);
    const cube2Support = createSupport(cube2, IDENTITY, CUBE_2_TRANSLATION);
    const simplex = new Simplex();

    const distance = GJKDistance(
      simplex,
      CUBE_2_OFFSET,
      cube1Support,
      cube2Support
    );

    expect(distance).not.toBe(null);

    if (!distance) return;

    const expected = 0.05;
    expect(glm.glMatrix.equals(distance, expected)).toBe(true);

    const point = glm.vec3.create();
    const normal = glm.vec3.create();

    GJKClosestPoint(point, normal, simplex);
    expect(glm.glMatrix.equals(glm.vec3.length(normal), expected)).toBe(true);
  });

  it('detects non-colliding rotated object distance', () => {
    const cube1 = CUBE_BASE.map(v => glm.vec3.clone(v));
    const cube2 = CUBE_BASE.map(v => glm.vec3.clone(v));

    const CUBE_2_OFFSET = glm.vec3.fromValues(0.0, 1.75, 0.0);
    const CUBE_2_WORLD = glm.mat4.create();
    glm.mat4.fromTranslation(CUBE_2_WORLD, CUBE_2_OFFSET);

    const CUBE_2_X_AXIS = glm.vec3.fromValues(1, 0, 0);
    const CUBE_2_ROTATION_X = glm.mat4.create();
    const CUBE_2_INV_ROTATION = glm.mat4.create();
    glm.mat4.fromRotation(CUBE_2_ROTATION_X, Math.PI / 4, CUBE_2_X_AXIS);
    glm.mat4.multiply(CUBE_2_WORLD, CUBE_2_ROTATION_X, CUBE_2_WORLD);

    glm.mat4.invert(CUBE_2_INV_ROTATION, CUBE_2_ROTATION_X);

    const cube1Support = createSupport(cube1, IDENTITY, IDENTITY);
    const cube2Support = createSupport(
      cube2,
      CUBE_2_INV_ROTATION,
      CUBE_2_WORLD
    );
    const simplex = new Simplex();

    const distance = GJKDistance(
      simplex,
      CUBE_2_OFFSET,
      cube1Support,
      cube2Support
    );

    expect(distance).not.toBe(null);

    if (!distance) return;
    const expected = CUBE_2_OFFSET[1] - 0.5 - Math.sqrt(2) / 2;
    expect(glm.glMatrix.equals(expected, distance)).toBe(true);

    const point = glm.vec3.create();
    const normal = glm.vec3.create();

    GJKClosestPoint(point, normal, simplex);
    expect(glm.glMatrix.equals(glm.vec3.length(normal), expected)).toBe(true);
  });

  it('detects exact overlap', () => {
    const cube1 = CUBE_BASE.map(v => glm.vec3.clone(v));
    const cube2 = CUBE_BASE.map(v => glm.vec3.clone(v));

    const CUBE_2_OFFSET = glm.vec3.fromValues(0.0, 0.05, 0.0);
    const CUBE_2_TRANSLATION = glm.mat4.create();
    glm.mat4.fromTranslation(CUBE_2_TRANSLATION, CUBE_2_OFFSET);

    const cube1Support = createSupport(cube1, IDENTITY, IDENTITY);
    const cube2Support = createSupport(cube2, IDENTITY, CUBE_2_TRANSLATION);
    const simplex = new Simplex();

    expect(
      GJKDistance(simplex, CUBE_2_OFFSET, cube1Support, cube2Support)
    ).toBe(null);
  });
});
