/* @flow */
import twgl from 'twgl.js';

const ARRAYS = {
  position: [
    -0.5,
    -0.5,
    -0.5,
    0.5,
    -0.5,
    -0.5,
    -0.5,
    0.5,
    -0.5,
    0.5,
    0.5,
    -0.5,
    -0.5,
    -0.5,
    0.5,
    0.5,
    -0.5,
    0.5,
    -0.5,
    0.5,
    0.5,
    0.5,
    0.5,
    0.5
  ],
  indices: {
    numComponents: 2,
    data: [
      0,
      1,
      1,
      3,
      3,
      2,
      2,
      0,
      4,
      5,
      5,
      7,
      7,
      6,
      6,
      4,
      0,
      4,
      1,
      5,
      2,
      6,
      3,
      7
    ]
  }
};

export default function createBufferInfo(gl: any, scale: ?number): any {
  if (!scale || scale === 1) {
    return twgl.createBufferInfoFromArrays(gl, ARRAYS);
  } else {
    const arrays = {
      position: ARRAYS.position.slice(0),
      indices: ARRAYS.indices
    };
    for (let i = 0; i < arrays.position.length; ++i) {
      arrays.position[i] *= scale;
    }
    return twgl.createBufferInfoFromArrays(gl, arrays);
  }
}
