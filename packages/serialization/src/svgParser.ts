import { SceneNode, NodeType } from '@monorepo/scene-graph';
import { Matrix3, createMatrix, multiplyMatrix } from '@monorepo/math';

const multiply = (a: Matrix3, b: Matrix3): Matrix3 => multiplyMatrix(createMatrix(), a, b);

let idCounter = 0;
const generateId = () => `node_${idCounter++}`;

export class SvgParser {
  private calculateViewBoxTransform(svgElement: Element): Matrix3 {
    const matrix: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    
    const viewBox = svgElement.getAttribute('viewBox');
    const widthAttr = svgElement.getAttribute('width');
    const heightAttr = svgElement.getAttribute('height');
    
    if (!viewBox) return matrix;
    
    const vbParts = viewBox.split(/[\s,]+/).filter(Boolean).map(parseFloat);
    if (vbParts.length !== 4 || vbParts.some(isNaN)) return matrix;
    
    const [minX, minY, vbWidth, vbHeight] = vbParts;
    if (vbWidth <= 0 || vbHeight <= 0) return matrix;
    
    let w = vbWidth;
    let h = vbHeight;
    
    if (widthAttr && !widthAttr.endsWith('%')) {
      w = parseFloat(widthAttr) || vbWidth;
    }
    if (heightAttr && !heightAttr.endsWith('%')) {
      h = parseFloat(heightAttr) || vbHeight;
    }
    
    const preserveAspectRatio = svgElement.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
    const parts = preserveAspectRatio.trim().split(/[\s]+/);
    const align = parts[0] || 'xMidYMid';
    const meetOrSlice = parts[1] || 'meet';
    
    let scaleX = w / vbWidth;
    let scaleY = h / vbHeight;
    
    if (align !== 'none') {
      const uniformScale = meetOrSlice === 'slice' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
      scaleX = uniformScale;
      scaleY = uniformScale;
    }
    
    let translateX = 0;
    let translateY = 0;
    
    if (align !== 'none') {
      const xAlign = align.includes('xMin') ? 'Min' : align.includes('xMax') ? 'Max' : 'Mid';
      const yAlign = align.includes('yMin') ? 'Min' : align.includes('yMax') ? 'Max' : 'Mid';
      
      const extraWidth = w - vbWidth * scaleX;
      if (xAlign === 'Mid') translateX = extraWidth / 2;
      else if (xAlign === 'Max') translateX = extraWidth;
      
      const extraHeight = h - vbHeight * scaleY;
      if (yAlign === 'Mid') translateY = extraHeight / 2;
      else if (yAlign === 'Max') translateY = extraHeight;
    }
    
    return [
      scaleX, 0, 0,
      0, scaleY, 0,
      translateX - minX * scaleX, translateY - minY * scaleY, 1
    ];
  }

  public parse(svgString: string): SceneNode[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');

    if (doc.querySelector('parsererror')) {
      throw new Error('Invalid SVG string');
    }

    const svgElement = doc.documentElement;
    const rootNodes: SceneNode[] = [];
    const viewportMatrix = this.calculateViewBoxTransform(svgElement);

    let lastOrder = null;
    Array.from(svgElement.children).forEach(child => {
      this.processElement(child, null, rootNodes, viewportMatrix);
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
        matrix = multiply(matrix, localMatrix);
      } else if (type === 'translate' && args.length >= 1) {
        const tx = args[0];
        const ty = args.length > 1 ? args[1] : 0;
        const translateMatrix: Matrix3 = [
          1, 0, 0,
          0, 1, 0,
          tx, ty, 1
        ];
        matrix = multiply(matrix, translateMatrix);
      } else if (type === 'scale' && args.length >= 1) {
        const sx = args[0];
        const sy = args.length > 1 ? args[1] : sx;
        const scaleMatrix: Matrix3 = [
          sx, 0, 0,
          0, sy, 0,
          0, 0, 1
        ];
        matrix = multiply(matrix, scaleMatrix);
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
          rotateMatrix = multiply(tToCenter, multiply(rotateMatrix, tBack));
        }
        matrix = multiply(matrix, rotateMatrix);
      }
    }

    return matrix;
  }

  private extractTransformProperties(matrix: Matrix3) {
    const a = matrix[0], b = matrix[1], c = matrix[3], d = matrix[4], x = matrix[6], y = matrix[7];

    const scaleX = Math.sqrt(a * a + b * b);
    const rotation = Math.atan2(b, a);

    const det = a * d - b * c;
    const signScaleY = det < 0 ? -1 : 1;
    const scaleY = signScaleY * Math.sqrt(c * c + d * d);

    const skewX = Math.atan2(a * c + b * d, scaleX * scaleX);
    const skewY = 0;

    return { x, y, scaleX, scaleY, rotation, skewX, skewY };
  }

  private mapSvgTagToNodeType(tagName: string): NodeType | null {
    switch (tagName.toLowerCase()) {
      case 'g': return 'group';
      case 'rect': return 'rect';
      case 'circle': return 'circle';
      case 'ellipse': return 'ellipse';
      case 'line': return 'line';
      case 'polyline': return 'polyline';
      case 'path': return 'path';
      case 'image': return 'image';
      case 'svg': return 'container';
      default: return null; // Ignore non-visual/unsupported tags like defs, title, etc.
    }
  }

  private processElement(element: Element, parentId: string | null, nodesList: SceneNode[], parentMatrix: Matrix3) {
    const tagName = element.tagName.toLowerCase();
    const type = this.mapSvgTagToNodeType(tagName);

    if (!type) {
      // If it's a defs, symbol, etc., we skip, but if it has children we might still parse?
      // Typically non-visual elements like <style>, <defs> are skipped.
      return;
    }

    const id = element.id || generateId();
    const transformAttr = element.getAttribute('transform') || '';
    const localTransformMatrix = this.parseTransform(transformAttr);

    let xAttr = 0;
    let yAttr = 0;

    if (tagName === 'rect' || tagName === 'image') {
      xAttr = parseFloat(element.getAttribute('x') || '0');
      yAttr = parseFloat(element.getAttribute('y') || '0');
    } else if (tagName === 'circle') {
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

    const localMatrix = multiply(localTransformMatrix, baseMatrix);
    const combinedMatrix = parentId === null 
      ? multiply(parentMatrix, localMatrix) 
      : localMatrix;

    const { x, y, scaleX, scaleY, rotation, skewX, skewY } = this.extractTransformProperties(combinedMatrix);

    const opacityStr = element.getAttribute('opacity');
    const visibilityStr = element.getAttribute('visibility');
    const strokeWidthStr = element.getAttribute('stroke-width');

    const node: Partial<SceneNode> = {
      id,
      name: element.id || type,
      type,
      parentId,
      order: '',
      x,
      y,
      scaleX,
      scaleY,
      rotation,
      skewX,
      skewY,
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

    Array.from(element.children).forEach(child => {
      this.processElement(child, id, nodesList, combinedMatrix);
    });
  }
}
