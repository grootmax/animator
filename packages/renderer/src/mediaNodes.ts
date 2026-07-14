import * as PIXI from 'pixi.js';
import { NodeRegistry } from './registry';
import { SceneNode, createSceneGraphStore } from '@monorepo/scene-graph';

NodeRegistry.register({
  type: 'video',
  create(node: SceneNode, store: ReturnType<typeof createSceneGraphStore>) {
    const container = new PIXI.Container();
    const sprite = new PIXI.Sprite();
    container.addChild(sprite);
    return container;
  },
  update(pixiObject: PIXI.Container, node: SceneNode, store: ReturnType<typeof createSceneGraphStore>) {
    const sprite = pixiObject.children[0] as PIXI.Sprite;
    
    if (node.assetId) {
      const state = store.getState();
      const asset = state.assets[node.assetId];
      if (asset && asset.element && (typeof HTMLVideoElement !== 'undefined' ? asset.element instanceof HTMLVideoElement : true)) {
        if (!sprite.texture || (sprite.texture.baseTexture.resource as any).source !== asset.element) {
          sprite.texture = PIXI.Texture.from(asset.element);
        }
      }
    }

    if (node.width && node.height && sprite.texture && sprite.texture.width && sprite.texture.height) {
      sprite.width = node.width;
      sprite.height = node.height;
      sprite.x = -node.width / 2;
      sprite.y = -node.height / 2;
    }
  }
});

NodeRegistry.register({
  type: 'image',
  create(node: SceneNode, store: ReturnType<typeof createSceneGraphStore>) {
    const container = new PIXI.Container();
    const sprite = new PIXI.Sprite();
    container.addChild(sprite);
    return container;
  },
  update(pixiObject: PIXI.Container, node: SceneNode, store: ReturnType<typeof createSceneGraphStore>) {
    const sprite = pixiObject.children[0] as PIXI.Sprite;
    
    if (node.assetId) {
      const state = store.getState();
      const asset = state.assets[node.assetId];
      if (asset && asset.element && (typeof HTMLImageElement !== 'undefined' ? asset.element instanceof HTMLImageElement : true)) {
        if (!sprite.texture || (sprite.texture.baseTexture.resource as any).source !== asset.element) {
          sprite.texture = PIXI.Texture.from(asset.element);
        }
      }
    }

    if (node.width && node.height && sprite.texture && sprite.texture.width && sprite.texture.height) {
      sprite.width = node.width;
      sprite.height = node.height;
      sprite.x = -node.width / 2;
      sprite.y = -node.height / 2;
    }
  }
});
