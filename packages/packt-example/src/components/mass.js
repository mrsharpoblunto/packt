/* @flow
 * @format */
import glm from 'gl-matrix';

export default class MassComponent {
  mass: number;
  inertiaTensor: Mat3;
  centerOfMass: Vec3;

  // calculated properties
  inverseMass: number;
  inverseInertiaTensor: Mat3;

  constructor() {
    this.mass = 0;
    this.inertiaTensor = glm.mat3.create();
    this.inverseMass = 0;
    this.inverseInertiaTensor = glm.mat3.create();
    this.centerOfMass = glm.vec3.create();
  }

  recalculate() {
    this.inverseMass = 1.0 / this.mass;
    glm.mat3.invert(this.inverseInertiaTensor, this.inertiaTensor);
  }
}
