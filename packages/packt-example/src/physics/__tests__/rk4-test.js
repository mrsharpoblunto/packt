/* @flow
 * @format */

import integrate from 'physics/rk4';
import { cube } from 'physics/inertia-tensors';
import OrientationComponent from 'components/orientation';
import MassComponent from 'components/mass';
import glm from 'gl-matrix';

describe('rk4', () => {
  it('integrates linear forces', () => {
    const orientation = new OrientationComponent();
    const mass = new MassComponent();
    mass.mass = 1.0;
    mass.recalculate();

    for (let i = 0; i < 10; ++i) {
      integrate(
        orientation,
        mass,
        1.0,
        (outputForce, outputTorque, orientation, mass, dt) => {
          glm.vec3.set(outputForce, 10.0, 0.0, 0.0);
          glm.vec3.set(outputTorque, 0.0, 0.0, 0.0);
        }
      );
      // the analytical solution using d = ut + 1/2at^2
      const expected = 0.5 * 10.0 * Math.pow(i + 1, 2);
      // should match the numerical solution (for these
      // nice rounded values at least anyway)
      expect(orientation.momentum[0]).toEqual((i + 1) * 10);
      expect(orientation.position[0]).toEqual(expected);
    }
  });

  it('integrates rotational forces', () => {
    const orientation = new OrientationComponent();
    const mass = new MassComponent();
    mass.mass = 1.0;
    cube(mass.inertiaTensor, 1.0, 1.0, 1.0, 1.0);
    mass.recalculate();

    for (let i = 0; i < 10; ++i) {
      integrate(
        orientation,
        mass,
        1.0,
        (outputForce, outputTorque, orientation, mass, dt) => {
          glm.vec3.set(outputForce, 0.0, 0.0, 0.0);
          glm.vec3.set(outputTorque, 1.0, 0.0, 0.0);
        }
      );
      expect(orientation.angularMomentum[0]).toEqual(i + 1);
      expect(orientation.angularVelocity[0]).toEqual((i + 1) * 6);
    }
  });
});
