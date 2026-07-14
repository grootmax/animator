import * as PIXI from 'pixi.js';
import { SceneNode, createSceneGraphStore } from '@monorepo/scene-graph';

export interface CustomNodeHandler {
  type: string;
  create(node: SceneNode, store: ReturnType<typeof createSceneGraphStore>): PIXI.Container | PIXI.DisplayObject;
  update(pixiObject: any, node: SceneNode, store: ReturnType<typeof createSceneGraphStore>): void;
  destroy?(pixiObject: any): void;
}

class Registry {
  private handlers: Map<string, CustomNodeHandler> = new Map();

  register(handler: CustomNodeHandler) {
    this.handlers.set(handler.type, handler);
  }

  getHandler(type: string): CustomNodeHandler | undefined {
    return this.handlers.get(type);
  }

  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }
}

export const NodeRegistry = new Registry();
