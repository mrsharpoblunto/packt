/* @flow
 * @format */
import twgl from 'twgl.js';
import glm from 'gl-matrix';
import type { Entity } from 'framework';
import * as Components from 'components';
import createWireframeCubeBufferInfo from 'geometry/wireframe-cube';
import BoundingBox from 'physics/bounding-box';

import flatFrag from 'shaders/flat-frag.glsl';
import diffuseSpecularFrag from 'shaders/diffuse-specular-frag.glsl';
import positionNormalVert from 'shaders/position-normal-vert.glsl';
import positionVert from 'shaders/position-vert.glsl';

type SystemComponents = {
  cube: Components.CubeComponent,
  orientation: Components.OrientationComponent,
};

const IDENTITY_QUAT = glm.quat.create();

export default class CubeRenderSystem {
  _cubes: Map<Components.CubeComponent, SystemComponents>;
  _camera: ?Components.CameraComponent;
  _cubeProgramInfo: any;
  _wireframeProgramInfo: any;
  _cubeBufferInfo: any;
  _wireBufferInfo: any;
  _boundingBox: BoundingBox;

  constructor(gl: any) {
    this._cubes = new Map();

    this._cubeProgramInfo = twgl.createProgramInfo(gl, [
      positionNormalVert,
      diffuseSpecularFrag,
    ]);
    this._wireframeProgramInfo = twgl.createProgramInfo(gl, [
      positionVert,
      flatFrag,
    ]);
    this._cubeBufferInfo = twgl.primitives.createCubeBufferInfo(gl, 2);
    this._wireBufferInfo = createWireframeCubeBufferInfo(gl);
    this._boundingBox = new BoundingBox(glm.vec3.fromValues(2, 2, 2));
  }

  worldAddingEntity(entity: Entity): void {
    entity.hasComponents(
      {
        cube: Components.CubeComponent,
        orientation: Components.OrientationComponent,
      },
      renderable => {
        this._cubes.set(renderable.cube, renderable);
      },
    );
    entity.hasComponent(Components.CameraComponent, camera => {
      this._camera = camera;
    });
  }

  worldRemovingEntity(entity: Entity): void {
    entity.hasComponent(Components.CubeComponent, cube => {
      this._cubes.delete(cube);
    });
    entity.hasComponent(Components.CameraComponent, camera => {
      this._camera = null;
    });
  }

  render(gl: any, alpha: number): void {
    if (!this._camera) return;
    const camera = this._camera;

    const view = camera.getViewMatrix();
    const invView = glm.mat4.create();
    const viewProjection = glm.mat4.create();
    const worldViewProjection = glm.mat4.create();

    const cameraPosition = camera.getPosition();
    const lightDirection = camera.getLookAt();

    glm.mat4.invert(invView, view);
    glm.mat4.mul(viewProjection, camera.getProjectionMatrix(), view);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    for (const pair of this._cubes) {
      const cube = pair[1];
      const world = glm.mat4.create();
      const invTransposeWorld = glm.mat4.create();

      glm.mat4.fromRotationTranslation(
        world,
        cube.orientation.orientation,
        cube.orientation.position,
      );

      glm.mat4.mul(worldViewProjection, viewProjection, world);
      glm.mat4.invert(
        invTransposeWorld,
        glm.mat4.transpose(invTransposeWorld, world),
      );

      gl.useProgram(this._cubeProgramInfo.program);
      twgl.setBuffersAndAttributes(
        gl,
        this._cubeProgramInfo,
        this._cubeBufferInfo,
      );
      twgl.setUniforms(this._cubeProgramInfo, {
        u_lightWorld: lightDirection,
        u_lightColor: [1, 0.8, 0.8, 1],
        u_ambient: [0.2, 0.2, 0.2, 1],
        u_specular: [1, 1, 1, 1],
        u_shininess: 50,
        u_specularFactor: 1,
        u_diffuse: [1, 0.5, 0.5, 1],
        u_world: world,
        u_worldInverseTranspose: invTransposeWorld,
        u_worldViewProjection: worldViewProjection,
        u_worldViewPos: cameraPosition,
      });
      twgl.drawBufferInfo(gl, gl.TRIANGLES, this._cubeBufferInfo);

      this._boundingBox.transformMat4(world);
      glm.mat4.fromRotationTranslationScale(
        world,
        IDENTITY_QUAT,
        cube.orientation.position,
        this._boundingBox.getAASize(),
      );

      glm.mat4.mul(worldViewProjection, viewProjection, world);

      gl.useProgram(this._wireframeProgramInfo.program);
      twgl.setBuffersAndAttributes(
        gl,
        this._wireframeProgramInfo,
        this._wireBufferInfo,
      );
      twgl.setUniforms(this._wireframeProgramInfo, {
        u_diffuse: [1, 1, 1, 1],
        u_worldViewProjection: worldViewProjection,
      });
      twgl.drawBufferInfo(gl, gl.LINES, this._wireBufferInfo);
    }
  }
}
