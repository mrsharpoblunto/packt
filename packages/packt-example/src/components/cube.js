/* @flow */
import glm from 'gl-matrix';

export default class CubeComponent {
    size: Vec3;

    constructor(size: Vec3) {
        this.size = glm.vec3.clone(size);
    }
}
