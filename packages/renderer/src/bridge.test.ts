import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as PIXI from 'pixi.js';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from './bridge';

vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  return {
    ...actual,
    Application: vi.fn().mockImplementation(function (this: any, options: any) {
      this.view = options?.view;
      this.stage = {
        sortableChildren: true,
        addChild: vi.fn(),
        removeChild: vi.fn(),
      };
      this.ticker = {
        add: vi.fn(),
      };
    }),
  };
});

describe('PixiBridge texture disposal & node purging', () => {
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.spyOn(PIXI.Texture, 'WHITE', 'get').mockReturnValue({
      destroy: vi.fn(),
      valid: true,
      baseTexture: { valid: true, once: vi.fn() },
      on: vi.fn(),
      off: vi.fn(),
    } as any);

    const mockContext2d = {
      fillRect: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
      putImageData: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 0 }),
    };

    mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockContext2d),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      style: {},
      width: 100,
      height: 100,
    } as unknown as HTMLCanvasElement;

    if (typeof globalThis.document === 'undefined') {
      (globalThis as any).document = {
        createElement: vi.fn().mockImplementation((tagName: string) => {
          if (tagName === 'canvas') {
            return {
              getContext: vi.fn().mockReturnValue(mockContext2d),
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
              style: {},
              width: 16,
              height: 16,
            };
          }
          return {
            style: {},
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          };
        }),
      };
    }
  });

  it('disposes old texture when node.src changes on an image node', () => {
    const store = createSceneGraphStore();
    const bridge = new PixiBridge(mockCanvas, store);

    const oldDestroy = vi.fn();
    const mockOldTexture = {
      valid: true,
      baseTexture: { valid: true, once: vi.fn() },
      destroy: oldDestroy,
      on: vi.fn(),
      off: vi.fn(),
    };

    const newTexture = {
      valid: true,
      baseTexture: { valid: true, once: vi.fn() },
      destroy: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const textureFromSpy = vi.spyOn(PIXI.Texture, 'from').mockReturnValue(newTexture as any);

    const nodes = {
      img1: {
        id: 'img1',
        name: 'Image 1',
        type: 'image' as const,
        parentId: null,
        children: [],
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        src: 'data:image/png;base64,new_image_data',
        localMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] as any,
        worldMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] as any,
      },
    };

    // First sync to set up pixiNode
    (bridge as any).syncNodes(nodes);

    const pixiNode = (bridge as any).pixiNodes.get('img1');
    expect(pixiNode).toBeDefined();

    const sprite = pixiNode.children[0] as PIXI.Sprite;
    sprite.texture = mockOldTexture as any;

    // Second sync with updated src
    const updatedNodes = {
      img1: {
        ...nodes.img1,
        src: 'data:image/png;base64,updated_image_data',
      },
    };

    (bridge as any).syncNodes(updatedNodes);

    expect(oldDestroy).toHaveBeenCalledWith(true);
    expect(sprite.texture).toBe(newTexture);

    textureFromSpy.mockRestore();
  });

  it('purges deleted image nodes from pixiNodes and destroys textures', () => {
    const store = createSceneGraphStore();
    const bridge = new PixiBridge(mockCanvas, store);

    const mockTexture = {
      valid: true,
      baseTexture: { valid: true, once: vi.fn() },
      destroy: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const textureFromSpy = vi.spyOn(PIXI.Texture, 'from').mockReturnValue(mockTexture as any);

    const nodes = {
      img1: {
        id: 'img1',
        name: 'Image 1',
        type: 'image' as const,
        parentId: null,
        children: [],
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        src: 'data:image/png;base64,image_data',
        localMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] as any,
        worldMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] as any,
      },
    };

    (bridge as any).syncNodes(nodes);
    expect((bridge as any).pixiNodes.has('img1')).toBe(true);

    const pixiNode = (bridge as any).pixiNodes.get('img1');
    const sprite = pixiNode.children[0] as PIXI.Sprite;
    sprite.texture = mockTexture as any;

    // Sync with empty nodes object (node deleted)
    (bridge as any).syncNodes({});

    expect((bridge as any).pixiNodes.has('img1')).toBe(false);
    expect(mockTexture.destroy).toHaveBeenCalledWith(true);

    textureFromSpy.mockRestore();
  });
});
