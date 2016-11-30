/* @flow */
import glm from 'gl-matrix';

const IDENTITY = glm.mat4.identity(glm.mat4.create());
const CUBE_VERTEX_COUNT = 8;

const min = glm.vec3.create();

export default class BoundingBox {
    size: Vec3;

    _vertices: Array<Vec3>;
    _transformedVertices: Array<Vec3>;
    _aaCenter: Vec3;
    _aaHalfSize: Vec3;
    _aaSize: Vec3;
    _aaVertices: Array<Vec3>;


    constructor(size: Vec3) {
        this.size = glm.vec3.create();
        this._aaCenter = glm.vec3.create();
        this._aaHalfSize = glm.vec3.create();
        this._aaSize = glm.vec3.create();
        this._vertices = [];
        this._transformedVertices = [];
        this._aaVertices = [];

        for (let i = 0;i < CUBE_VERTEX_COUNT; ++i) {
            this._vertices.push(glm.vec3.create()); 
            this._transformedVertices.push(glm.vec3.create()); 
            this._aaVertices.push(glm.vec3.create());
        }

        glm.vec3.copy(this.size,size);
        glm.vec3.set(this._vertices[0],size[0] * -0.5,size[1] * -0.5,size[2] * -0.5);
        glm.vec3.set(this._vertices[1],size[0] * 0.5,size[1] * -0.5,size[2] * -0.5);
        glm.vec3.set(this._vertices[2],size[0] * 0.5,size[1] * -0.5,size[2] * 0.5);
        glm.vec3.set(this._vertices[3],size[0] * -0.5,size[1] * -0.5,size[2] * 0.5);
        glm.vec3.set(this._vertices[4],size[0] * -0.5,size[1] * 0.5,size[2] * -0.5);
        glm.vec3.set(this._vertices[5],size[0] * 0.5,size[1] * 0.5,size[2] * -0.5);
        glm.vec3.set(this._vertices[6],size[0] * 0.5,size[1] * 0.5,size[2] * 0.5);
        glm.vec3.set(this._vertices[7],size[0] * -0.5,size[1] * 0.5,size[2] * 0.5);
        this.transformMat4(IDENTITY);
    }

    transformMat4(worldTransform: Mat4) {
        glm.vec3.transformMat4(
            this._transformedVertices[0],
            this._vertices[0],
            worldTransform,
        );

        let yMin = this._transformedVertices[0][1];
        let yMax = this._transformedVertices[0][1];
        let xMin = this._transformedVertices[0][0];
        let xMax = this._transformedVertices[0][0];
        let zMin = this._transformedVertices[0][2];
        let zMax = this._transformedVertices[0][2];

        for (let i = 1; i < CUBE_VERTEX_COUNT;++i) {
            const v = this._transformedVertices[i];
            glm.vec3.transformMat4(
                v,
                this._vertices[i],
                worldTransform,
            );
            if (v[0] < xMin) {
                xMin = v[0];
            }
            if (v[0] > xMax) {
                xMax = v[0];
            }
            if (v[1] < yMin) {
                yMin = v[1];
            }
            if (v[1] > yMax) {
                yMax = v[1];
            }
            if (v[2] < zMin) {
                zMin = v[2];
            }
            if (v[2] > zMax) {
                zMax = v[2];
            }
        }

        glm.vec3.set(this._aaVertices[0],xMin,yMin,zMin);
        glm.vec3.set(this._aaVertices[1],xMax,yMin,zMin);
        glm.vec3.set(this._aaVertices[2],xMax,yMin,zMax);
        glm.vec3.set(this._aaVertices[3],xMin,yMin,zMax);
        glm.vec3.set(this._aaVertices[4],xMin,yMax,zMin);
        glm.vec3.set(this._aaVertices[5],xMax,yMax,zMin);
        glm.vec3.set(this._aaVertices[6],xMax,yMax,zMax);
        glm.vec3.set(this._aaVertices[7],xMin,yMax,zMax);

        glm.vec3.set(
            this._aaHalfSize,
            (xMax - xMin) * 0.5,
            (yMax - yMin) * 0.5,
            (zMax - zMin) * 0.5,
        );
        glm.vec3.set(
            this._aaSize,
            (xMax - xMin),
            (yMax - yMin),
            (zMax - zMin),
        );
        glm.vec3.copy(this._aaCenter,this._aaHalfSize);
        this._aaCenter[0] += xMin;
        this._aaCenter[1] += yMin;
        this._aaCenter[2] += zMin;
    }

    getTransformedVertices(): Array<Vec3> {
        return this._transformedVertices;
    }

    getAAVertices(): Array<Vec3> {
        return this._aaVertices;
    }

    getAACenter(): Vec3 {
        return this._aaCenter;
    }

    getAASize(): Vec3 {
        return this._aaSize;
    }

    isAAIntersecting(other: BoundingBox): bool {
        return  ( 
            (
                Math.abs(this._aaCenter[0] - other._aaCenter[0]) <
                this._aaHalfSize[0] + other._aaHalfSize[0]
            ) &&
            (
                Math.abs(this._aaCenter[1] - other._aaCenter[1]) <
                this._aaHalfSize[1] + other._aaHalfSize[1]
            ) &&
            (
                Math.abs(this._aaCenter[2] - other._aaCenter[2]) <
                this._aaHalfSize[2] + other._aaHalfSize[2]
            )
        );
    }
}
