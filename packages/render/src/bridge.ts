import {
  type FontAsset,
  FontAssetRegistry,
  type SceneNode,
} from "@animator/core";
import { FontAssetLoader } from "./fontLoader.js";
import { PIXI } from "./pixi.js";

export interface PixiBridgeOptions {
  fontRegistry?: FontAssetRegistry;
  fontLoader?: FontAssetLoader;
}

export class PixiBridge {
  public rootContainer = new PIXI.Container();
  public pixiNodes = new Map<string, PIXI.DisplayObject>();
  public fontRegistry: FontAssetRegistry;
  public fontLoader: FontAssetLoader;

  constructor(options?: PixiBridgeOptions) {
    this.fontRegistry = options?.fontRegistry || new FontAssetRegistry();
    this.fontLoader = options?.fontLoader || new FontAssetLoader();

    this.fontLoader.onFontLoaded((fontAsset: FontAsset) => {
      this.onFontLoadedHandler(fontAsset.id, fontAsset.family);
    });
  }

  public syncNodes(nodes: Record<string, SceneNode> | SceneNode[]): void {
    const nodeArray: SceneNode[] = Array.isArray(nodes)
      ? nodes
      : Object.values(nodes);

    for (const node of nodeArray) {
      let pixiNode = this.pixiNodes.get(node.id);

      if (!pixiNode) {
        pixiNode = this.createPixiNode(node);
        this.pixiNodes.set(node.id, pixiNode);
        this.rootContainer.addChild(pixiNode);
        this.triggerFontLoadIfNeeded(node, pixiNode);
      } else {
        this.updatePixiNode(pixiNode, node);
      }
    }
  }

  public getPixiNode(nodeId: string): PIXI.DisplayObject | undefined {
    return this.pixiNodes.get(nodeId);
  }

  private createPixiNode(node: SceneNode): PIXI.DisplayObject {
    if (node.type === "text") {
      const initialFontFamily = node.fontFamily || "sans-serif";

      const pixiText = new PIXI.Text(node.text || "", {
        fontFamily: initialFontFamily,
        fontSize: node.fontSize || 16,
        fontWeight: node.fontWeight || "normal",
        fontStyle: node.fontStyle || "normal",
        fill: node.fill || "#000000",
        align: node.textAlign || "left",
      });

      pixiText.id = node.id;
      pixiText.x = node.x || 0;
      pixiText.y = node.y || 0;
      pixiText.visible = node.visible !== false;
      pixiText.alpha = node.opacity ?? 1;

      return pixiText;
    }
    if (
      node.type === "rect" ||
      node.type === "circle" ||
      node.type === "ellipse" ||
      node.type === "path"
    ) {
      const graphics = new PIXI.Graphics();
      graphics.id = node.id;
      graphics.x = node.x || 0;
      graphics.y = node.y || 0;
      graphics.visible = node.visible !== false;
      graphics.alpha = node.opacity ?? 1;
      return graphics;
    }
    const container = new PIXI.Container();
    container.id = node.id;
    container.x = node.x || 0;
    container.y = node.y || 0;
    container.visible = node.visible !== false;
    container.alpha = node.opacity ?? 1;
    return container;
  }

  private triggerFontLoadIfNeeded(
    node: SceneNode,
    pixiNode: PIXI.DisplayObject,
  ): void {
    if (
      node.type === "text" &&
      pixiNode instanceof PIXI.Text &&
      node.fontAssetId
    ) {
      const fontAsset = this.fontRegistry.get(node.fontAssetId);
      if (fontAsset) {
        if (this.fontLoader.isFontLoaded(fontAsset.id)) {
          pixiNode.setStyle({ fontFamily: fontAsset.family });
        } else {
          this.fontLoader.loadFont(fontAsset);
        }
      }
    }
  }

  private updatePixiNode(pixiNode: PIXI.DisplayObject, node: SceneNode): void {
    pixiNode.x = node.x || 0;
    pixiNode.y = node.y || 0;
    pixiNode.visible = node.visible !== false;
    pixiNode.alpha = node.opacity ?? 1;

    if (node.type === "text" && pixiNode instanceof PIXI.Text) {
      pixiNode.text = node.text || "";

      let targetFontFamily = node.fontFamily || "sans-serif";

      if (node.fontAssetId) {
        const fontAsset = this.fontRegistry.get(node.fontAssetId);
        if (fontAsset) {
          if (this.fontLoader.isFontLoaded(fontAsset.id)) {
            targetFontFamily = fontAsset.family;
          } else {
            this.fontLoader.loadFont(fontAsset);
          }
        }
      }

      pixiNode.setStyle({
        fontFamily: targetFontFamily,
        fontSize: node.fontSize || 16,
        fontWeight: node.fontWeight || "normal",
        fontStyle: node.fontStyle || "normal",
        fill: node.fill || "#000000",
        align: node.textAlign || "left",
      });
    }
  }

  private onFontLoadedHandler(_fontAssetId: string, fontFamily: string): void {
    for (const pixiNode of this.pixiNodes.values()) {
      if (pixiNode instanceof PIXI.Text) {
        pixiNode.setStyle({ fontFamily });
      }
    }
  }
}
