/* @flow
 * @format */
import CubeComponent from 'components/cube';
import CameraComponent from 'components/camera';
import TerrainComponent from 'components/terrain';
import MassComponent from 'components/mass';
import OrientationComponent from 'components/orientation';
import CollisionComponent from 'components/collision';

export {
  CubeComponent,
  CameraComponent,
  TerrainComponent,
  MassComponent,
  OrientationComponent,
  CollisionComponent
};

if (__DEV__) {
  // don't do any hot reloading of components themselves as they are
  // inherently stateful and changing them mid simulation will cause
  // unpredictable outcomes
  module = (module: any);
  if (module.hot) {
    module.hot.decline();
  }
}
