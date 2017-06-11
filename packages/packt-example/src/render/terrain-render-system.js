/* @flow
 * @format */
import twgl from 'twgl.js';
import glm from 'gl-matrix';
import type { Entity } from 'framework';
import diffuseSpecularFrag from 'shaders/diffuse-specular-frag.glsl';
import positionNormalVert from 'shaders/position-normal-vert.glsl';
import * as Components from 'components';

export default class TerrainRenderSystem {
  _terrain: ?Components.TerrainComponent;
  _camera: ?Components.CameraComponent;
  _programInfo: any;
  _bufferInfo: any;

  constructor(gl: any) {
    this._programInfo = twgl.createProgramInfo(gl, [
      positionNormalVert,
      diffuseSpecularFrag
    ]);
    this._bufferInfo = twgl.primitives.createPlaneBufferInfo(
      gl,
      100,
      100,
      10,
      10
    );
  }

  worldAddingEntity(entity: Entity): void {
    entity.hasComponent(
      Components.TerrainComponent,
      terrain => (this._terrain = terrain)
    );
    entity.hasComponent(
      Components.CameraComponent,
      camera => (this._camera = camera)
    );
  }

  worldRemovingEntity(entity: Entity): void {
    entity.hasComponent(
      Components.TerrainComponent,
      terrain => (this._terrain = null)
    );
    entity.hasComponent(
      Components.CameraComponent,
      camera => (this._camera = null)
    );
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

    const world = glm.mat4.create();
    const invTransposeWorld = glm.mat4.create();

    glm.mat4.mul(worldViewProjection, viewProjection, world);
    glm.mat4.invert(
      invTransposeWorld,
      glm.mat4.transpose(invTransposeWorld, world)
    );

    gl.useProgram(this._programInfo.program);
    twgl.setBuffersAndAttributes(gl, this._programInfo, this._bufferInfo);
    twgl.setUniforms(this._programInfo, {
      u_lightWorld: lightDirection,
      u_lightColor: [1, 0.8, 0.8, 1],
      u_ambient: [0.2, 0.2, 0.2, 1],
      u_specular: [1, 1, 1, 1],
      u_shininess: 50,
      u_specularFactor: 1.0,
      u_diffuse: [0.5, 0.5, 0.5, 1],
      u_world: world,
      u_worldInverseTranspose: invTransposeWorld,
      u_worldViewProjection: worldViewProjection,
      u_worldViewPos: cameraPosition
    });
    twgl.drawBufferInfo(gl, gl.TRIANGLES, this._bufferInfo);
  }
}
