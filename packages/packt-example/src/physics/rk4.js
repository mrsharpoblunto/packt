/* @flow
 * @format */
import glm from 'gl-matrix';
import OrientationComponent from '../components/orientation';
import MassComponent from '../components/mass';

export type ForceAccumulator = (
  outForce: Vec3,
  outTorque: Vec3,
  orientation: OrientationComponent,
  mass: MassComponent,
  dt: number
) => void;

class Derivative {
  velocity: Vec3;
  force: Vec3;
  spin: Quaternion;
  torque: Vec3;

  constructor() {
    this.velocity = glm.vec3.create();
    this.force = glm.vec3.create();
    this.spin = glm.quat.create();
    this.torque = glm.vec3.create();
  }
}

// we statically allocate all vectors to
// prevent allocations later
const a = new Derivative();
const b = new Derivative();
const c = new Derivative();
const d = new Derivative();
const spin = glm.quat.create();
const position = glm.vec3.create();
const momentum = glm.vec3.create();
const _orientation = glm.quat.create();
const angularMomentum = glm.vec3.create();
const tmp = new OrientationComponent();

function evaluate(
  outDerivative: Derivative,
  orientation: OrientationComponent,
  mass: MassComponent,
  dt: number,
  sumForces: ForceAccumulator,
  inDerivative: ?Derivative
) {
  if (inDerivative) {
    glm.vec3.scaleAndAdd(
      tmp.position,
      orientation.position,
      inDerivative.velocity,
      dt
    );
    glm.vec3.scaleAndAdd(
      tmp.momentum,
      orientation.momentum,
      inDerivative.force,
      dt
    );

    // no scaleAndAdd for quaternions
    // so we do it in two steps
    glm.quat.scale(spin, inDerivative.spin, dt);
    glm.quat.add(tmp.orientation, orientation.orientation, spin);
    glm.quat.normalize(tmp.orientation, tmp.orientation);
    glm.vec3.scaleAndAdd(
      tmp.angularMomentum,
      orientation.angularMomentum,
      inDerivative.torque,
      dt
    );
    tmp.recalculate(mass, false);
  }

  glm.vec3.copy(
    outDerivative.velocity,
    inDerivative ? tmp.velocity : orientation.velocity
  );
  glm.quat.copy(outDerivative.spin, inDerivative ? tmp.spin : orientation.spin);

  glm.vec3.set(outDerivative.force, 0, 0, 0);
  glm.vec3.set(outDerivative.torque, 0, 0, 0);
  sumForces(outDerivative.force, outDerivative.torque, tmp, mass, dt);
}

export default function integrate(
  orientation: OrientationComponent,
  mass: MassComponent,
  dt: number,
  sumForces: ForceAccumulator
) {
  evaluate(a, orientation, mass, 0.0, sumForces);
  evaluate(b, orientation, mass, dt * 0.5, sumForces, a);
  evaluate(c, orientation, mass, dt * 0.5, sumForces, b);
  evaluate(d, orientation, mass, dt, sumForces, c);

  glm.vec3.add(position, b.velocity, c.velocity);
  glm.vec3.scale(position, position, 2.0);
  glm.vec3.add(position, position, a.velocity);
  glm.vec3.add(position, position, d.velocity);
  glm.vec3.scale(position, position, 1.0 / 6.0 * dt);
  glm.vec3.add(orientation.position, orientation.position, position);

  glm.vec3.add(momentum, b.force, c.force);
  glm.vec3.scale(momentum, momentum, 2.0);
  glm.vec3.add(momentum, momentum, a.force);
  glm.vec3.add(momentum, momentum, d.force);
  glm.vec3.scale(momentum, momentum, 1.0 / 6.0 * dt);
  glm.vec3.add(orientation.momentum, orientation.momentum, momentum);

  glm.quat.add(_orientation, b.spin, c.spin);
  glm.quat.scale(_orientation, _orientation, 2.0);
  glm.quat.add(_orientation, _orientation, a.spin);
  glm.quat.add(_orientation, _orientation, d.spin);
  glm.quat.scale(_orientation, _orientation, 1.0 / 6.0 * dt);
  glm.quat.add(orientation.orientation, orientation.orientation, _orientation);
  glm.quat.normalize(orientation.orientation, orientation.orientation);

  glm.vec3.add(angularMomentum, b.torque, c.torque);
  glm.vec3.scale(angularMomentum, angularMomentum, 2.0);
  glm.vec3.add(angularMomentum, angularMomentum, a.torque);
  glm.vec3.add(angularMomentum, angularMomentum, d.torque);
  glm.vec3.scale(angularMomentum, angularMomentum, 1.0 / 6.0 * dt);
  glm.vec3.add(
    orientation.angularMomentum,
    orientation.angularMomentum,
    angularMomentum
  );

  orientation.recalculate(mass, true);
}
