/* @flow
 * @format */
import glm from 'gl-matrix';

export default class InputHandler {
  _canvas: any;
  _keysDown: Map<string, boolean>;
  _keysPressed: Map<string, boolean>;
  _mouseDelta: Vec2;
  _mousePosition: Vec2;
  _mouseWheel: Vec3;
  _mouseDown: Map<number, boolean>;
  _mousePressed: Map<number, boolean>;

  constructor(canvas: any) {
    this._canvas = canvas;
    this._keysDown = new Map();
    this._keysPressed = new Map();
    this._mouseDown = new Map();
    this._mousePressed = new Map();
    this._mouseDelta = glm.vec2.create();
    this._mouseWheel = glm.vec3.create();
    this._mousePosition = glm.vec2.create();

    canvas.addEventListener('click', this._handleMouseClick, { passive: true });
    canvas.addEventListener('mousedown', this._handleMouseDown, {
      passive: true
    });
    canvas.addEventListener('mouseup', this._handleMouseUp, { passive: true });
    canvas.addEventListener('mousemove', this._handleMouseMove, {
      passive: true
    });
    canvas.addEventListener('wheel', this._handleMouseWheel, { passive: true });

    window.addEventListener('keydown', this._handleKeyDown, { passive: true });
    window.addEventListener('keyup', this._handleKeyUp, { passive: true });
    window.addEventListener('keypress', this._handleKeyPress, {
      passive: true
    });
  }

  _handleMouseClick = (e: MouseEvent) => {
    if (this._canvas && (document: any).pointerLockElement !== this._canvas) {
      this._canvas.requestPointerLock();
    }
    this._mousePressed.set(e.button, true);
  };

  _handleMouseDown = (e: MouseEvent) => {
    this._mouseDown.set(e.button, true);
  };

  _handleMouseUp = (e: MouseEvent) => {
    this._mouseDown.set(e.button, false);
  };

  _handleMouseMove = (e: MouseEvent) => {
    this._mouseDelta[0] += e.movementX;
    this._mouseDelta[1] += e.movementY;
    this._mousePosition[0] = e.clientX;
    this._mousePosition[1] = e.clientY;
  };

  _handleMouseWheel = (e: WheelEvent) => {
    this._mouseWheel[0] += e.deltaX;
    this._mouseWheel[1] += e.deltaY;
    this._mouseWheel[2] += e.deltaZ;
  };

  _handleKeyDown = (e: KeyboardEvent) => {
    this._keysDown.set(e.key, true);
  };

  _handleKeyUp = (e: KeyboardEvent) => {
    this._keysDown.set(e.key, false);
  };

  _handleKeyPress = (e: KeyboardEvent) => {
    this._keysPressed.set(e.key, true);
  };

  isKeyDown(key: string): boolean {
    return !!this._keysDown.get(key);
  }

  isKeyPressed(key: string): boolean {
    return !!this._keysPressed.get(key);
  }

  isMouseDown(button: number): boolean {
    return !!this._mouseDown.get(button);
  }

  isMousePressed(button: number): boolean {
    return !!this._mousePressed.get(button);
  }

  getMouseDelta(): Vec2 {
    return this._mouseDelta;
  }

  getMouseWheel(): Vec3 {
    return this._mouseWheel;
  }

  getMousePosition(): Vec2 {
    return this._mousePosition;
  }

  reset() {
    this._keysPressed.clear();
    this._mousePressed.clear();
    glm.vec3.set(this._mouseWheel, 0, 0, 0);
    glm.vec2.set(this._mouseDelta, 0, 0, 0);
  }
}
