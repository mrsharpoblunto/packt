/* @flow */
import type { Entity, Input } from 'framework';
import glm from 'gl-matrix';
import * as Components from 'components';

const ROTATION_SPEED = 0.005;
const MOVEMENT_SPEED = 0.1;

export default class CameraSystem {
    _camera: ?Components.CameraComponent;
    _canvas: any;
    _input: Input;

    constructor() {
    }

    systemWillMount(canvas: any,input: Input): void {
        this._canvas = canvas;
        this._input = input;
    }

    systemWillUnmount(canvas: any): void {
        this._canvas = null;
    }

    worldAddingEntity(entity: Entity): void {
        entity.hasComponent(Components.CameraComponent,camera => this._camera = camera);
    }

    worldRemovingEntity(entity: Entity): void {
        entity.hasComponent(Components.CameraComponent,camera => this._camera = null);
    }

    simulate(timestep: number): void {
        if (this._camera == null) return;
        const camera = this._camera;

        if (
            this._input.isKeyDown('w') || 
            this._input.isKeyDown('a') || 
            this._input.isKeyDown('s') || 
            this._input.isKeyDown('d')
        ) {
            const forward = glm.vec3.create();
            glm.vec3.copy(forward,camera.getLookAt());
            glm.vec3.scale(forward,forward,
                           (this._input.isKeyDown('s') ? 1 : 0) 
                           -(this._input.isKeyDown('w') ? 1 : 0));

            const right = glm.vec3.create();
            glm.vec3.copy(right,camera.getRight());
            glm.vec3.scale(right,right,
                           (this._input.isKeyDown('d') ? 1 : 0) 
                          -(this._input.isKeyDown('a') ? 1 : 0));

            const delta = glm.vec3.create();
            glm.vec3.add(
                delta,
                forward,
                right
            );
            glm.vec3.normalize(delta,delta);
            glm.vec3.scale(delta,delta,MOVEMENT_SPEED);
            camera.move(delta);
        }

        const mouseDelta = this._input.getMouseDelta();
        if (mouseDelta[0]) {
            camera.rotYaw(mouseDelta[0] * ROTATION_SPEED);
        }
        if (mouseDelta[1]) {
            camera.rotPitch(mouseDelta[1] * ROTATION_SPEED);
        }
    }
}
