/* @flow */
import glm from 'gl-matrix';

export function cube(
    out: Mat3,
    mass: number, 
    height: number,
    width: number,
    depth: number,
): Mat3 {
    return glm.mat3.set(
        out,
        (1/12) *  mass * (height * height + depth * depth), 0, 0,
        0, (1/12) * mass * (width * width + depth * depth), 0, 
        0, 0, (1/12) * mass * (width * width + height * height),
    );
}
