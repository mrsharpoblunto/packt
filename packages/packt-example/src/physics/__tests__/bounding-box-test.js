/* @flow */

import glm from 'gl-matrix';
import BoundingBox from 'physics/bounding-box';

describe('bounding box',() => {
    it('can calculate an AABB',() => {
        const box = new BoundingBox(glm.vec3.fromValues(2,4,6));

        expect(box.size).toEqual(glm.vec3.fromValues(2,4,6));

        expect(box.getAACenter()).toEqual(glm.vec3.fromValues(0,0,0));
        let vertices = box.getAAVertices();
        expect(vertices[0]).toEqual(glm.vec3.fromValues(-1,-2,-3));
        expect(vertices[1]).toEqual(glm.vec3.fromValues(1,-2,-3));
        expect(vertices[2]).toEqual(glm.vec3.fromValues(1,-2,3));
        expect(vertices[3]).toEqual(glm.vec3.fromValues(-1,-2,3));
        expect(vertices[4]).toEqual(glm.vec3.fromValues(-1,2,-3));
        expect(vertices[5]).toEqual(glm.vec3.fromValues(1,2,-3));
        expect(vertices[6]).toEqual(glm.vec3.fromValues(1,2,3));
        expect(vertices[7]).toEqual(glm.vec3.fromValues(-1,2,3));

        // now transform the world space position of the bounding box and
        // see if the AABB is updated correctly with it
        const transform = glm.mat4.create();
        glm.mat4.translate(transform,transform,glm.vec3.fromValues(1,0,0));
        glm.mat4.rotateY(transform,transform,Math.PI / 2);
        box.transformMat4(transform);

        expect(box.getAACenter()).toEqual(glm.vec3.fromValues(1,0,0));
        vertices = box.getAAVertices();
        expect(vertices[0]).toEqual(glm.vec3.fromValues(-2,-2,-1));
        expect(vertices[1]).toEqual(glm.vec3.fromValues(4,-2,-1));
        expect(vertices[2]).toEqual(glm.vec3.fromValues(4,-2,1));
        expect(vertices[3]).toEqual(glm.vec3.fromValues(-2,-2,1));
        expect(vertices[4]).toEqual(glm.vec3.fromValues(-2,2,-1));
        expect(vertices[5]).toEqual(glm.vec3.fromValues(4,2,-1));
        expect(vertices[6]).toEqual(glm.vec3.fromValues(4,2,1));
        expect(vertices[7]).toEqual(glm.vec3.fromValues(-2,2,1));
    });

    it('can detect AABB intersection',() => {
        const boxA = new BoundingBox(glm.vec3.fromValues(2,4,6));
        const boxB = new BoundingBox(glm.vec3.fromValues(2,4,6));
        expect(boxA.isAAIntersecting(boxB)).toBe(true);

        const transform = glm.mat4.create();
        glm.mat4.translate(transform,transform,glm.vec3.fromValues(1,0,0));
        boxB.transformMat4(transform);
        expect(boxA.isAAIntersecting(boxB)).toBe(true);

        glm.mat4.translate(transform,transform,glm.vec3.fromValues(1,0,0));
        boxB.transformMat4(transform);
        expect(boxA.isAAIntersecting(boxB)).toBe(false);
    });
});
