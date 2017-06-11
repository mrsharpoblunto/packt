/* @flow */
import glm from 'gl-matrix';
import MassComponent from './mass';

const rotationInverseInertiaTensor = glm.mat3.create();
const angularVelocityQuat = glm.quat.create();

export default class OrientationComponent {
  position: Vec3;
  momentum: Vec3;
  orientation: Quaternion;
  angularMomentum: Vec3;

  // calculated properties
  velocity: Vec3;
  spin: Quaternion;
  angularVelocity: Vec3;

  constructor() {
    this.position = glm.vec3.create();
    this.momentum = glm.vec3.create();
    this.orientation = glm.quat.create();
    this.angularMomentum = glm.vec3.create();

    this.velocity = glm.vec3.create();
    this.spin = glm.quat.create();
    this.angularVelocity = glm.vec3.create();
  }

  recalculate(mass: MassComponent, updateMatrices: boolean) {
    glm.vec3.scale(this.velocity, this.momentum, mass.inverseMass);

    // convert the body space inverse inertia
    // tensor to rotation space before calculating
    // angular velocity
    glm.mat3.fromQuat(rotationInverseInertiaTensor, this.orientation);
    glm.mat3.mul(
      rotationInverseInertiaTensor,
      mass.inverseInertiaTensor,
      rotationInverseInertiaTensor
    );

    glm.vec3.transformMat3(
      this.angularVelocity,
      this.angularMomentum,
      rotationInverseInertiaTensor
    );

    glm.quat.set(
      angularVelocityQuat,
      this.angularVelocity[0],
      this.angularVelocity[1],
      this.angularVelocity[2],
      0
    );
    glm.quat.mul(angularVelocityQuat, angularVelocityQuat, this.orientation);
    glm.quat.scale(this.spin, angularVelocityQuat, 0.5);
  }
}
