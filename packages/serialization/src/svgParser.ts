import { SceneNode, NodeType } from '@monorepo/scene-graph';
import { Matrix3, createMatrix, multiplyMatrix } from '@monorepo/math';

let idCounter = 0;
const generateId = () => `node_${idCounter++}`;

export class SvgParser {
  public parse(svgString: string): SceneNode[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');

    if (doc.querySelector('parsererror')) {
      throw new Error('Invalid SVG string');
    }

    const svgElement = doc.documentElement;
    const rootNodes: SceneNode[] = [];

    Array.from(svgElement.children).forEach(child => {
      this.processElement(child, null, rootNodes, createMatrix());
    });

    return rootNodes;
  }

  private parseTransform(transformStr: string): Matrix3 {
    let matrix = createMatrix();
    if (!transformStr) return matrix;

    const transforms = transformStr.match(/(\w+)\(([^)]+)\)/g) || [];

    for (const transform of transforms) {
      const match = transform.match(/(\w+)\(([^)]+)\)/);
      if (!match) continue;

      const type = match[1];
      const args = match[2].split(/[ ,]+/).map(parseFloat);

      if (type === 'matrix' && args.length === 6) {
        // [a, b, c, d, e, f] to Matrix3
        const [a, b, c, d, e, f] = args;
        const localMatrix: Matrix3 = [
          a, b, 0,
          c, d, 0,
          e, f, 1
        ];
        matrix = multiplyMatrix(matrix, localMatrix);
      }
    }

    return matrix;
  }

  private extractTransformProperties(matrix: Matrix3) {
    const x = matrix[6];
    const y = matrix[7];
    const scaleX = Math.hypot(matrix[0], matrix[1]);
    const scaleY = Math.hypot(matrix[3], matrix[4]);
    const rotation = Math.atan2(matrix[1], matrix[0]);

    return { x, y, scaleX, scaleY, rotation };
  }

  private processElement(element: Element, parentId: string | null, nodesList: SceneNode[], parentMatrix: Matrix3) {
    const id = element.id || generateId();
    let type: NodeType = 'group';

    const tagName = element.tagName.toLowerCase();
    switch (tagName) {
      case 'g': type = 'group'; break;
      case 'rect': type = 'rect'; break;
      case 'circle': type = 'circle'; break;
      case 'path': type = 'path'; break;
      case 'ellipse': type = 'path'; break;
      case 'line': type = 'path'; break;
      default: return; // Ignore unsupported
    }

    const transformStr = element.getAttribute('transform') || '';
    const localTransformMatrix = this.parseTransform(transformStr);

    let xAttr = parseFloat(element.getAttribute('x') || '0');
    let yAttr = parseFloat(element.getAttribute('y') || '0');

    if (tagName === 'circle') {
      xAttr = parseFloat(element.getAttribute('cx') || '0');
      yAttr = parseFloat(element.getAttribute('cy') || '0');
    } else if (tagName === 'ellipse') {
      xAttr = parseFloat(element.getAttribute('cx') || '0');
      yAttr = parseFloat(element.getAttribute('cy') || '0');
    } else if (tagName === 'line') {
      xAttr = 0;
      yAttr = 0;
    }

    const baseMatrix: Matrix3 = [
      1, 0, 0,
      0, 1, 0,
      xAttr, yAttr, 1
    ];

    const combinedMatrix = multiplyMatrix(localTransformMatrix, baseMatrix);
    const { x, y, scaleX, scaleY, rotation } = this.extractTransformProperties(combinedMatrix);

    const node: Partial<SceneNode> = {
      id,
      type,
      parentId,
      children: [],
      x,
      y,
      scaleX,
      scaleY,
      rotation,
      fill: element.getAttribute('fill') || undefined,
      stroke: element.getAttribute('stroke') || undefined
    };

    if (type === 'rect') {
      node.width = parseFloat(element.getAttribute('width') || '0');
      node.height = parseFloat(element.getAttribute('height') || '0');
    } else if (type === 'circle') {
      node.radius = parseFloat(element.getAttribute('r') || '0');
    } else if (type === 'path') {
      if (tagName === 'path') {
        node.pathData = element.getAttribute('d') || '';
      } else if (tagName === 'ellipse') {
        const rx = parseFloat(element.getAttribute('rx') || '0');
        const ry = parseFloat(element.getAttribute('ry') || '0');
        node.pathData = `M ${-rx},0 a ${rx},${ry} 0 1,0 ${2 * rx},0 a ${rx},${ry} 0 1,0 ${-2 * rx},0`;
      } else if (tagName === 'line') {
        const x1 = parseFloat(element.getAttribute('x1') || '0');
        const y1 = parseFloat(element.getAttribute('y1') || '0');
        const x2 = parseFloat(element.getAttribute('x2') || '0');
        const y2 = parseFloat(element.getAttribute('y2') || '0');
        node.pathData = `M ${x1},${y1} L ${x2},${y2}`;
      }
    }

    const sceneNode = node as SceneNode;
    nodesList.push(sceneNode);

    if (parentId) {
      const parent = nodesList.find(n => n.id === parentId);
      if (parent) {
        parent.children.push(id);
      }
    }

    Array.from(element.children).forEach(child => {
      this.processElement(child, id, nodesList, combinedMatrix);
    });
  }
}
