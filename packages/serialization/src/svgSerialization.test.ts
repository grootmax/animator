import { describe, it, expect } from 'vitest';
import { SvgSerializer } from './svgSerializer';
import { SvgParser } from './svgParser';
import { validateAndSerializeProject } from './projectSchema';
import { SceneNode } from '@monorepo/scene-graph';

describe('Image primitive serialization & parsing', () => {
  it('should validate and serialize project containing image node', () => {
    const project = {
      scene: {
        img1: {
          id: 'img1',
          name: 'Image 1',
          type: 'image',
          parentId: null,
          x: 100,
          y: 200,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          width: 300,
          height: 200,
          imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }
      },
      animations: [],
      metadata: {
        version: '1.0.0',
        duration: 5000
      }
    };

    const serialized = validateAndSerializeProject(project);
    const parsed = JSON.parse(serialized);
    expect(parsed.scene.img1.type).toBe('image');
    expect(parsed.scene.img1.imageData).toContain('data:image/png;base64');
  });

  it('should serialize image node to SVG <image> tag', () => {
    const serializer = new SvgSerializer();
    const nodes: Record<string, SceneNode> = {
      img1: {
        id: 'img1',
        name: 'Image Node',
        type: 'image',
        parentId: null,
        order: 'a0',
        x: 50,
        y: 60,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        opacity: 1,
        visible: true,
        locked: false,
        width: 100,
        height: 80,
        imageData: 'data:image/png;base64,abc123test',
        localMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        worldMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        isDirty: false
      }
    };

    const svg = serializer.serialize(nodes);
    expect(svg).toContain('<image id="img1"');
    expect(svg).toContain('href="data:image/png;base64,abc123test"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="80"');
  });

  it('should parse SVG containing <image> element', () => {
    const parser = new SvgParser();
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
      <image id="test_img" x="10" y="20" width="200" height="150" href="data:image/png;base64,xyz789" />
    </svg>`;

    const nodes = parser.parse(svgContent);
    expect(nodes.length).toBe(1);

    const imgNode = nodes[0];
    expect(imgNode.id).toBe('test_img');
    expect(imgNode.type).toBe('image');
    expect(imgNode.width).toBe(200);
    expect(imgNode.height).toBe(150);
    expect(imgNode.imageData).toBe('data:image/png;base64,xyz789');
  });
});
