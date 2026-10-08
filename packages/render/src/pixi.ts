export namespace PIXI {
  export class DisplayObject {
    public id = "";
    public visible = true;
    public alpha = 1;
    public x = 0;
    public y = 0;
    public parent: Container | null = null;
  }

  export class Container extends DisplayObject {
    public children: DisplayObject[] = [];

    public addChild(child: DisplayObject): DisplayObject {
      child.parent = this;
      this.children.push(child);
      return child;
    }

    public removeChild(child: DisplayObject): DisplayObject {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parent = null;
      }
      return child;
    }
  }

  export class TextStyle {
    public fontFamily: string;
    public fontSize: number;
    public fontWeight: string | number;
    public fontStyle: string;
    public fill: string;
    public align: string;

    constructor(style?: Partial<TextStyle>) {
      this.fontFamily = style?.fontFamily || "sans-serif";
      this.fontSize = style?.fontSize || 16;
      this.fontWeight = style?.fontWeight || "normal";
      this.fontStyle = style?.fontStyle || "normal";
      this.fill = style?.fill || "#000000";
      this.align = style?.align || "left";
    }
  }

  export class Text extends Container {
    public text: string;
    public style: TextStyle;
    public dirty = false;

    constructor(text = "", style?: Partial<TextStyle>) {
      super();
      this.text = text;
      this.style = new TextStyle(style);
    }

    public setStyle(style: Partial<TextStyle>): void {
      Object.assign(this.style, style);
      this.dirty = true;
    }
  }

  export class Graphics extends Container {
    public clear(): void {}
    public beginFill(color: string | number): void {}
    public endFill(): void {}
    public drawRect(x: number, y: number, w: number, h: number): void {}
    public drawCircle(x: number, y: number, r: number): void {}
  }

  export class Sprite extends Container {
    public src = "";
  }
}
