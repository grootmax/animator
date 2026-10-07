import { describe, it, expect, beforeAll } from 'vitest';
import { SvgSerializer } from './svgSerializer';
import { SvgParser } from './svgParser';
import { SceneNode } from '@monorepo/scene-graph';
import { DOMParser } from '@xmldom/xmldom';

beforeAll(() => {
  if (typeof globalThis.DOMParser === 'undefined') {
    (globalThis as any).DOMParser = DOMParser;
  }
});

describe('SVG Image Serialization and Parsing', () => {
  it('should serialize image node with href and dimensions to SVG', () => {
    const serializer = new SvgSerializer();
    const nodes: Record<string, SceneNode> = {
      img1: {
        id: 'img1',
        name: 'img1',
        type: 'image',
        parentId: null,
        order: 'a0',
        x: 100,
        y: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        width: 200,
        height: 150,
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        localMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        worldMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        isDirty: false
      }
    };

    const svg = serializer.serialize(nodes);
    expect(svg).toContain('<image');
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="150"');
  });

  it('should parse SVG image tag into SceneNode', () => {
    const parser = new SvgParser();
    const base64Data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const svgInput = `<svg xmlns="http://www.w3.org/2000/svg">
      <image id="test_image" href="${base64Data}" width="300" height="200" x="50" y="50" />
    </svg>`;

    const nodes = parser.parse(svgInput);
    expect(nodes.length).toBeGreaterThan(0);
    const imageNode = nodes.find(n => n.type === 'image');
    expect(imageNode).toBeDefined();
    expect(imageNode?.src).toBe(base64Data);
    expect(imageNode?.width).toBe(300);
    expect(imageNode?.height).toBe(200);
  });
});
