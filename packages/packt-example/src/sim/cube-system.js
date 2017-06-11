/* @flow
 * @format */
import type { Entity, Input } from 'framework';
import * as Components from 'components';
import * as constants from 'constants';
import glm from 'gl-matrix';
import rk4 from 'physics/rk4';
import { GJKIntersect, GJKDistance, Simplex } from 'physics/gjk-epa';
import type { SupportFunc } from 'physics/gjk-epa';

const ROTATION_TORQUE = 0.00001;

const TORQUE_Y = glm.vec3.create();
glm.vec3.scale(TORQUE_Y, constants.UP, ROTATION_TORQUE);
const TORQUE_X = glm.vec3.create();
glm.vec3.scale(TORQUE_X, constants.RIGHT, ROTATION_TORQUE);

type SystemComponents = {
  cube: Components.CubeComponent,
  orientation: Components.OrientationComponent,
  collision: Components.CollisionComponent,
  mass: Components.MassComponent,
};

export default class CubeSystem {
  _cubes: Map<Components.CubeComponent, SystemComponents>;
  _input: Input;

  constructor() {
    this._cubes = new Map();
  }

  systemWillMount(canvas: any, input: Input): void {
    this._input = input;
  }

  systemWillUnmount(canvas: any): void {}

  worldAddingEntity(entity: Entity): void {
    entity.hasComponents(
      {
        cube: Components.CubeComponent,
        orientation: Components.OrientationComponent,
        collision: Components.CollisionComponent,
        mass: Components.MassComponent,
      },
      sim => {
        this._cubes.set(sim.cube, sim);
      },
    );
  }

  worldRemovingEntity(entity: Entity): void {
    entity.hasComponent(Components.CubeComponent, cube =>
      this._cubes.delete(cube),
    );
  }

  simulate(timestep: number): void {
    for (const pair of this._cubes) {
      const cube = pair[1];
      rk4(
        cube.orientation,
        cube.mass,
        timestep,
        (outForce, outTorque, orientation, mass, timestep) => {
          if (this._input.isKeyDown('ArrowLeft')) {
            glm.vec3.add(outTorque, outTorque, TORQUE_Y);
          }
          if (this._input.isKeyDown('ArrowRight')) {
            glm.vec3.sub(outTorque, outTorque, TORQUE_Y);
          }
          if (this._input.isKeyDown('ArrowUp')) {
            glm.vec3.add(outTorque, outTorque, TORQUE_X);
          }
          if (this._input.isKeyDown('ArrowDown')) {
            glm.vec3.sub(outTorque, outTorque, TORQUE_X);
          }
        },
      );
      cube.collision.recalculate(cube.orientation);
    }
  }
}
