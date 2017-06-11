/* @flow
 * @format */
import glm from 'gl-matrix';
import type { World, Entity } from 'framework';
import * as Components from 'components';

type CubeOptions = {
  position: Vec3,
};

const CUBE_HULL = [
  glm.vec3.fromValues(-0.5, -0.5, -0.5),
  glm.vec3.fromValues(0.5, -0.5, -0.5),
  glm.vec3.fromValues(-0.5, 0.5, -0.5),
  glm.vec3.fromValues(0.5, 0.5, -0.5),
  glm.vec3.fromValues(-0.5, -0.5, 0.5),
  glm.vec3.fromValues(0.5, -0.5, 0.5),
  glm.vec3.fromValues(-0.5, 0.5, 0.5),
  glm.vec3.fromValues(0.5, 0.5, 0.5),
];

export default function cube(ent: Entity, options: CubeOptions): Entity {
  const orientation = new Components.OrientationComponent();
  orientation.position = glm.vec3.clone(options.position);

  return ent
    .addComponent(new Components.CubeComponent(glm.vec3.fromValues(1, 1, 1)))
    .addComponent(orientation)
    .addComponent(new Components.CollisionComponent(CUBE_HULL))
    .addComponent(new Components.MassComponent(options.position));
}
