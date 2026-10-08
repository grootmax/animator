import { describe, it, expect } from 'vitest';
import { SvgParser } from './svgParser';
import { SvgSerializer } from './svgSerializer';
import { convertTextToPath } from './textToPath';
import { tokenizePath } from './pathTokenizer';

describe('Text to Vector Path Engine', () => {
  it('converts SVG <text> elements into scene nodes with type "path" and valid pathData', () => {
    const parser = new SvgParser();
    const svgString = `<svg width="500" height="500">
      <text id="text-node" x="20" y="50" font-size="24" fill="#ff0000">Hello Vector</text>
    </svg>`;

    const nodes = parser.parse(svgString);
    expect(nodes.length).toBeGreaterThan(0);

    const textNode = nodes.find(n => n.id === 'text-node');
    expect(textNode).toBeDefined();
    expect(textNode?.type).toBe('path');
    expect(textNode?.pathData).toBeDefined();
    expect(textNode?.pathData).toContain('M');
    expect(textNode?.fill).toBe('#ff0000');
  });

  it('converts text strings to deterministic vector path data without canvas or font dependencies', () => {
    const pathData = convertTextToPath('ABC 123', 20, 10, 40);
    expect(typeof pathData).toBe('string');
    expect(pathData.length).toBeGreaterThan(0);
    expect(pathData).toContain('M');

    // Tokenizing path should succeed and yield valid drawing tokens
    const tokens = tokenizePath(pathData);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].type).toBe('M');
  });

  it('serializes converted text path nodes as standard <path> elements in SvgSerializer', () => {
    const parser = new SvgParser();
    const serializer = new SvgSerializer();
    const svgInput = `<svg width="200" height="200">
      <text id="myText" x="10" y="30" font-size="16">Vector Text</text>
    </svg>`;

    const nodesList = parser.parse(svgInput);
    const nodesMap: Record<string, any> = {};
    for (const node of nodesList) {
      nodesMap[node.id] = node;
    }

    const outputSvg = serializer.serialize(nodesMap);
    expect(outputSvg).toContain('<path id="myText"');
    expect(outputSvg).toContain('d="M');
  });

  it('preserves element attributes and explicit pathData if pre-outlined', () => {
    const parser = new SvgParser();
    const svgInput = `<svg width="200" height="200">
      <text id="outlined" d="M 0 0 L 10 10 Z" fill="#00ff00">Pre-outlined</text>
    </svg>`;

    const nodes = parser.parse(svgInput);
    const outlinedNode = nodes.find(n => n.id === 'outlined');
    expect(outlinedNode).toBeDefined();
    expect(outlinedNode?.type).toBe('path');
    expect(outlinedNode?.pathData).toBe('M 0 0 L 10 10 Z');
    expect(outlinedNode?.fill).toBe('#00ff00');
  });
});
