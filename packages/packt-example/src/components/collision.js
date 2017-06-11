import glm from 'gl-matrix';
import BoundingBox from 'physics/bounding-box';
import { createSupport } from 'physics/gjk-epa';
import type { SupportFunc } from 'physics/gjk-epa';
import * as constants from 'constants';

export default class CollisionComponent {
  convexHull: Array<Vec3>;
  boundingBox: BoundingBox;
  support: SupportFunc;

  _toWorld: Mat4;
  _toLocal: Mat4;

  constructor(convexHull: Array<Vec3>) {
    this._toWorld = glm.mat4.create();
    this._toLocal = glm.mat4.create();
    this.convexHull = convexHull;
    this.support = createSupport(this.convexHull, this._toLocal, this._toWorld);

    const tmp = glm.vec3.create();
    const top = this.support(tmp, constants.UP)[1];
    const bottom = this.support(tmp, constants.DOWN)[1];
    const left = this.support(tmp, constants.LEFT)[0];
    const right = this.support(tmp, constants.RIGHT)[0];
    const front = this.support(tmp, constants.FORWARD)[2];
    const back = this.support(tmp, constants.BACK)[2];

    this.boundingBox = new BoundingBox(
      glm.vec3.fromValues(top - bottom, right - left, front - back),
    );
  }

  recalculate(orientation: OrientationComponent) {
    glm.mat4.fromQuat(this._toLocal, orientation.orientation);
    glm.mat4.invert(this._toLocal, this._toLocal);
    glm.mat4.fromRotationTranslation(
      this._toWorld,
      orientation.orientation,
      orientation.position,
    );
  }
}
