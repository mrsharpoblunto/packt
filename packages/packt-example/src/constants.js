import glm from 'gl-matrix';

export var UP = glm.vec3.fromValues(0, 1, 0);
export var DOWN = glm.vec3.fromValues(0, -1, 0);
export var LEFT = glm.vec3.fromValues(-1, 0, 0);
export var RIGHT = glm.vec3.fromValues(1, 0, 0);
export var FORWARD = glm.vec3.fromValues(0, 0, 1);
export var BACK = glm.vec3.fromValues(0, 0, -1);
export var ORIGIN = glm.vec3.fromValues(0, 0, 0);
