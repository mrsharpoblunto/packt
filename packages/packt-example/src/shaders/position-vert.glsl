uniform mat4 u_worldViewProjection;

attribute vec4 a_position;

varying vec4 v_position;

void main() {
    v_position = (u_worldViewProjection * a_position);
    gl_Position = v_position;
}
