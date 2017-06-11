/* @flow
 * @format */
import type { RenderSystem } from 'framework';
import CameraRenderSystem from 'render/camera-render-system';
import CubeRenderSystem from 'render/cube-render-system';
import TerrainRenderSystem from 'render/terrain-render-system';

export default function(glContext: any): Array<RenderSystem> {
  return [
    new CameraRenderSystem(glContext),
    new CubeRenderSystem(glContext),
    new TerrainRenderSystem(glContext)
  ];
}
