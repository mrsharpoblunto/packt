/* @flow */
import type { World, Entity } from 'framework';
import * as Components from 'components';

type TerrainOptions = {
}

export default function terrain(ent: Entity, options: TerrainOptions): Entity {
    return ent.addComponent(new Components.TerrainComponent(options));
}
