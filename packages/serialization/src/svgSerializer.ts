import { SceneNode } from '@monorepo/scene-graph';

export class SvgSerializer {
  public serialize(nodes: Record<string, SceneNode>, rootId: string | null, width: number = 800, height: number = 600): string {
    let svgElements: string[] = [];

    const traverse = (nodeId: string) => {
      const node = nodes[nodeId];
      if (!node) return;
      if (!node.visible) return;

      if (node.type === 'rect' || node.type === 'circle' || node.type === 'path') {
        const matrix = node.worldMatrix;
        // matrix array represents [a, b, 0, c, d, 0, e, f, 1]
        // SVG matrix expects: a, b, c, d, e, f
        const a = matrix[0];
        const b = matrix[1];
        const c = matrix[3];
        const d = matrix[4];
        const e = matrix[6];
        const f = matrix[7];
        
        // We only write transform if it's not identity, but here we can just always write it 
        // to ensure correctness. Or we can optimize. For safety, always write it.
        const transformStr = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
        
        let elementStr = '';

        const fillAttr = node.fill ? `fill="${node.fill}"` : '';
        const strokeAttr = node.stroke ? `stroke="${node.stroke}"` : '';
        const opacityAttr = node.opacity !== undefined && node.opacity < 1 ? `opacity="${node.opacity}"` : '';

        const attrs = [transformStr ? `transform="${transformStr}"` : '', fillAttr, strokeAttr, opacityAttr].filter(Boolean).join(' ');

        if (node.type === 'rect') {
          elementStr = `<rect width="${node.width || 0}" height="${node.height || 0}" ${attrs} />`;
        } else if (node.type === 'circle') {
          elementStr = `<circle cx="0" cy="0" r="${node.radius || 0}" ${attrs} />`;
        } else if (node.type === 'path') {
          elementStr = `<path d="${node.pathData || ''}" ${attrs} />`;
        }

        if (elementStr) {
          svgElements.push(elementStr);
        }
      }

      for (const childId of node.children) {
        traverse(childId);
      }
    };

    if (rootId) {
      traverse(rootId);
    } else {
      // Find all top-level nodes if rootId is not provided
      const rootNodes = Object.values(nodes).filter(n => !n.parentId);
      for (const root of rootNodes) {
        traverse(root.id);
      }
    }

    const svgString = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n  ${svgElements.join('\n  ')}\n</svg>`;
    return svgString;
  }
}
