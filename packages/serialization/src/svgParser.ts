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
        const ty = args.length > 1 ? args[1] : 0;
        const translateMatrix: Matrix3 = [
          1, 0, 0,
          0, 1, 0,
          tx, ty, 1
        ];
        matrix = multiplyMatrix(matrix, translateMatrix);
      } else if (type === 'scale' && args.length >= 1) {
        const sx = args[0];
        const sy = args.length > 1 ? args[1] : sx;
        const scaleMatrix: Matrix3 = [
          sx, 0, 0,
          0, sy, 0,
          0, 0, 1
        ];
        matrix = multiplyMatrix(matrix, scaleMatrix);
      } else if (type === 'rotate' && args.length >= 1) {
        const angle = args[0] * Math.PI / 180;
        const cx = args.length === 3 ? args[1] : 0;
        const cy = args.length === 3 ? args[2] : 0;
        let rotateMatrix: Matrix3 = [
          Math.cos(angle), Math.sin(angle), 0,
          -Math.sin(angle), Math.cos(angle), 0,
          0, 0, 1
        ];
        if (cx !== 0 || cy !== 0) {
          const tToCenter: Matrix3 = [1, 0, 0, 0, 1, 0, cx, cy, 1];
          const tBack: Matrix3 = [1, 0, 0, 0, 1, 0, -cx, -cy, 1];
          rotateMatrix = multiplyMatrix(tToCenter, multiplyMatrix(rotateMatrix, tBack));
        }
        matrix = multiplyMatrix(matrix, rotateMatrix);
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

    switch (element.tagName.toLowerCase()) {
      case 'g': type = 'group'; break;
      case 'rect': type = 'rect'; break;
      case 'circle': type = 'circle'; break;
      case 'ellipse': type = 'ellipse'; break;
      case 'line': type = 'line'; break;
      case 'polyline': type = 'polyline'; break;
      case 'path': type = 'path'; break;
      default: return; // Ignore unsupported
    }

    const transformStr = element.getAttribute('transform') || '';
    const localTransformMatrix = this.parseTransform(transformStr);

    let xAttr = parseFloat(element.getAttribute('x') || '0');
    let yAttr = parseFloat(element.getAttribute('y') || '0');

    if (type === 'circle' || type === 'ellipse') {
      xAttr = parseFloat(element.getAttribute('cx') || '0');
      yAttr = parseFloat(element.getAttribute('cy') || '0');
    }

    const baseMatrix: Matrix3 = [
      1, 0, 0,
      0, 1, 0,
      xAttr, yAttr, 1
    ];

    const combinedMatrix = multiplyMatrix(localTransformMatrix, baseMatrix);
    const { x, y, scaleX, scaleY, rotation } = this.extractTransformProperties(combinedMatrix);

    const opacityStr = element.getAttribute('opacity');
    const visibilityStr = element.getAttribute('visibility');
    const strokeWidthStr = element.getAttribute('stroke-width');

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
      stroke: element.getAttribute('stroke') || undefined,
      opacity: opacityStr !== null ? parseFloat(opacityStr) : 1,
      visible: visibilityStr !== 'hidden',
      strokeWidth: strokeWidthStr !== null ? parseFloat(strokeWidthStr) : undefined
    };

    if (type === 'rect') {
      node.width = parseFloat(element.getAttribute('width') || '0');
      node.height = parseFloat(element.getAttribute('height') || '0');
    } else if (type === 'circle') {
      node.radius = parseFloat(element.getAttribute('r') || '0');
    } else if (type === 'ellipse') {
      node.rx = parseFloat(element.getAttribute('rx') || '0');
      node.ry = parseFloat(element.getAttribute('ry') || '0');
    } else if (type === 'line') {
      node.x1 = parseFloat(element.getAttribute('x1') || '0');
      node.y1 = parseFloat(element.getAttribute('y1') || '0');
      node.x2 = parseFloat(element.getAttribute('x2') || '0');
      node.y2 = parseFloat(element.getAttribute('y2') || '0');
    } else if (type === 'polyline') {
      node.points = element.getAttribute('points') || '';
    } else if (type === 'path') {
      node.pathData = element.getAttribute('d') || '';
    }

    const sceneNode = node as SceneNode;
    nodesList.push(sceneNode);

    Array.from(element.children).forEach(child => {
      this.processElement(child, id, nodesList, combinedMatrix);
    });
  }
}
