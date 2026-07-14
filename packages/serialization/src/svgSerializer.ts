import { SceneNode, transientState } from '@monorepo/scene-graph';

export class SvgSerializer {
  public serialize(nodes: Record<string, SceneNode>): string {
    let svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">\n`;
    
    // Process all root level nodes
    const rootNodes = Object.values(nodes).filter(node => node.parentId === null);
    
    for (const rootNode of rootNodes) {
      svgString += this.serializeNode(rootNode.id, nodes, 1);
    }

    svgString += `</svg>`;
    return svgString;
  }

  private serializeNode(id: string, nodes: Record<string, SceneNode>, indentLevel: number): string {
    const node = nodes[id];
    const tNode = transientState[id];
    if (!node || node.visible === false || !tNode) return '';

    const indent = '  '.repeat(indentLevel);
    let elementStr = '';

    const transforms: string[] = [];
    if (tNode.x !== 0 || tNode.y !== 0) transforms.push(`translate(${tNode.x}, ${tNode.y})`);
    if (tNode.rotation !== 0) transforms.push(`rotate(${tNode.rotation * 180 / Math.PI})`);
    if (tNode.scaleX !== 1 || tNode.scaleY !== 1) transforms.push(`scale(${tNode.scaleX}, ${tNode.scaleY})`);
    
    const transformAttr = transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : '';
    const opacityAttr = tNode.opacity !== undefined && tNode.opacity !== 1 ? ` opacity="${tNode.opacity}"` : '';
    const fillAttr = node.fill ? ` fill="${node.fill}"` : '';
    const strokeAttr = node.stroke ? ` stroke="${node.stroke}"` : '';
    const strokeWidthAttr = node.strokeWidth !== undefined ? ` stroke-width="${node.strokeWidth}"` : '';
    
    const commonAttrs = `id="${node.id}"${transformAttr}${opacityAttr}${fillAttr}${strokeAttr}${strokeWidthAttr}`;

    switch (node.type) {
      case 'group':
      case 'container':
        elementStr += `${indent}<g ${commonAttrs}>\n`;
        for (const childId of node.children) {
          elementStr += this.serializeNode(childId, nodes, indentLevel + 1);
        }
        elementStr += `${indent}</g>\n`;
        break;
      case 'rect':
        elementStr += `${indent}<rect ${commonAttrs} width="${node.width || 0}" height="${node.height || 0}" />\n`;
        break;
      case 'circle':
        elementStr += `${indent}<circle ${commonAttrs} r="${node.radius || 0}" />\n`;
        break;
      case 'ellipse':
        elementStr += `${indent}<ellipse ${commonAttrs} rx="${node.rx || 0}" ry="${node.ry || 0}" />\n`;
        break;
      case 'line':
        elementStr += `${indent}<line ${commonAttrs} x1="${node.x1 || 0}" y1="${node.y1 || 0}" x2="${node.x2 || 0}" y2="${node.y2 || 0}" />\n`;
        break;
      case 'polyline':
        elementStr += `${indent}<polyline ${commonAttrs} points="${node.points || ''}" />\n`;
        break;
      case 'path':
        elementStr += `${indent}<path ${commonAttrs} d="${node.pathData || ''}" />\n`;
        break;
    }

    return elementStr;
  }
}
