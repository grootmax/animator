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
      } else if (type === 'translate' && args.length >= 1) {
        const tx = args[0];
        const ty = args[1] || 0;
        const localMatrix: Matrix3 = [
          1, 0, 0,
          0, 1, 0,
          tx, ty, 1
        ];
        matrix = multiplyMatrix(matrix, localMatrix);
      } else if (type === 'scale' && args.length >= 1) {
        const sx = args[0];
        const sy = args.length > 1 ? args[1] : sx;
        const localMatrix: Matrix3 = [
          sx, 0, 0,
          0, sy, 0,
          0, 0, 1
        ];
        matrix = multiplyMatrix(matrix, localMatrix);
      } else if (type === 'rotate' && args.length >= 1) {
        const angle = args[0] * Math.PI / 180;
        let localMatrix: Matrix3 = [
          Math.cos(angle), Math.sin(angle), 0,
          -Math.sin(angle), Math.cos(angle), 0,
          0, 0, 1
        ];
        if (args.length === 3) {
          const cx = args[1];
          const cy = args[2];
          const t1: Matrix3 = [1, 0, 0, 0, 1, 0, cx, cy, 1];
          const t2: Matrix3 = [1, 0, 0, 0, 1, 0, -cx, -cy, 1];
          localMatrix = multiplyMatrix(t1, multiplyMatrix(localMatrix, t2));
        }
        matrix = multiplyMatrix(matrix, localMatrix);
      } else if (type === 'skewX' && args.length === 1) {
        const angle = args[0] * Math.PI / 180;
        const localMatrix: Matrix3 = [
          1, 0, 0,
          Math.tan(angle), 1, 0,
          0, 0, 1
        ];
        matrix = multiplyMatrix(matrix, localMatrix);
      } else if (type === 'skewY' && args.length === 1) {
        const angle = args[0] * Math.PI / 180;
        const localMatrix: Matrix3 = [
          1, Math.tan(angle), 0,
          0, 1, 0,
          0, 0, 1
        ];
        matrix = multiplyMatrix(matrix, localMatrix);
      }
    }

    return matrix;
  }

  private extractTransformProperties(matrix: Matrix3) {
    const a = matrix[0], b = matrix[1], c = matrix[3], d = matrix[4], x = matrix[6], y = matrix[7];

    const scaleX = Math.sqrt(a * a + b * b);
    const rotation = Math.atan2(b, a);
    
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    
    // Rotate [c, d] back by -rotation
    const cR = c * cosR + d * sinR;
    const dR = -c * sinR + d * cosR;
    
    const scaleY = Math.sqrt(cR * cR + dR * dR) * Math.sign(dR || 1);
    const skewX = Math.atan2(cR, dR);
    const skewY = 0;

    return { x, y, scaleX, scaleY, rotation, skewX, skewY };
  }

  private processElement(element: Element, parentId: string | null, nodesList: SceneNode[], parentMatrix: Matrix3) {
    const id = element.id || generateId();
    let type: NodeType = 'group';

    switch (element.tagName.toLowerCase()) {
      case 'g': 
      case 'svg':
      case 'symbol':
        type = 'group'; 
        break;
      case 'rect': type = 'rect'; break;
      case 'circle': type = 'circle'; break;
      case 'path': type = 'path'; break;
      default: return; // Ignore unsupported
    }

    const transformStr = element.getAttribute('transform') || '';
    const localTransformMatrix = this.parseTransform(transformStr);

    let xAttr = parseFloat(element.getAttribute('x') || '0');
    let yAttr = parseFloat(element.getAttribute('y') || '0');

    if (type === 'circle') {
      xAttr = parseFloat(element.getAttribute('cx') || '0');
      yAttr = parseFloat(element.getAttribute('cy') || '0');
    }

    const baseMatrix: Matrix3 = [
      1, 0, 0,
      0, 1, 0,
      xAttr, yAttr, 1
    ];

    const combinedMatrix = multiplyMatrix(localTransformMatrix, baseMatrix);
    const { x, y, scaleX, scaleY, rotation, skewX, skewY } = this.extractTransformProperties(combinedMatrix);

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
      skewX,
      skewY,
      fill: element.getAttribute('fill') || undefined,
      stroke: element.getAttribute('stroke') || undefined
    };

    if (type === 'rect') {
      node.width = parseFloat(element.getAttribute('width') || '0');
      node.height = parseFloat(element.getAttribute('height') || '0');
    } else if (type === 'circle') {
      node.radius = parseFloat(element.getAttribute('r') || '0');
    } else if (type === 'path') {
      node.pathData = element.getAttribute('d') || '';
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
