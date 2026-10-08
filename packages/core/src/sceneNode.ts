export type NodeType =
  | "container"
  | "rect"
  | "circle"
  | "ellipse"
  | "path"
  | "line"
  | "polyline"
  | "text"
  | "group"
  | "image";

export interface FontAsset {
  id: string;
  family: string;
  src: string;
  weight?: string | undefined;
  style?: string | undefined;
  format?: string | undefined;
}

export class FontAssetRegistry {
  private assets = new Map<string, FontAsset>();

  public register(asset: FontAsset): FontAsset {
    this.assets.set(asset.id, asset);
    return asset;
  }

  public get(id: string): FontAsset | undefined {
    return this.assets.get(id);
  }

  public findByFamily(family: string): FontAsset | undefined {
    const cleanFamily = family.replace(/['"]/g, "").trim().toLowerCase();
    for (const asset of this.assets.values()) {
      if (
        asset.family.replace(/['"]/g, "").trim().toLowerCase() === cleanFamily
      ) {
        return asset;
      }
    }
    return undefined;
  }

  public getAll(): FontAsset[] {
    return Array.from(this.assets.values());
  }

  public clear(): void {
    this.assets.clear();
  }
}

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  parentId?: string | null | undefined;
  children?: string[] | undefined;
  x?: number | undefined;
  y?: number | undefined;
  rotation?: number | undefined;
  scaleX?: number | undefined;
  scaleY?: number | undefined;
  skewX?: number | undefined;
  skewY?: number | undefined;
  opacity?: number | undefined;
  visible?: boolean | undefined;
  locked?: boolean | undefined;
  width?: number | undefined;
  height?: number | undefined;
  radius?: number | undefined;
  rx?: number | undefined;
  ry?: number | undefined;
  x1?: number | undefined;
  y1?: number | undefined;
  x2?: number | undefined;
  y2?: number | undefined;
  points?: string | undefined;
  pathData?: string | undefined;
  fill?: string | undefined;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
  order?: string | undefined;
  src?: string | undefined;
  // Text properties
  text?: string | undefined;
  fontAssetId?: string | undefined;
  fontFamily?: string | undefined;
  fontSize?: number | undefined;
  fontWeight?: string | number | undefined;
  fontStyle?: string | undefined;
  textAlign?: string | undefined;
  fontUrl?: string | undefined;
  localMatrix?: number[] | undefined;
}
