import { StoreApi } from 'zustand/vanilla';
import { SceneNode, SceneGraphState } from './store';
import { Matrix3 } from '@monorepo/math';

export interface PathToken {
  type: string;
  args: number[];
}

function tokenizePath(pathData: string): PathToken[] {
  const commands = pathData.match(/[a-df-z][^a-df-z]*/ig) || [];
  const tokens: PathToken[] = [];

  for (const cmd of commands) {
    const type = cmd[0];
    const argsStr = cmd.slice(1).trim();
    const args = argsStr ? argsStr.split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n)) : [];

    if (args.length > 0) {
      let step = 2;
      switch (type.toUpperCase()) {
        case 'H': case 'V': step = 1; break;
        case 'M': case 'L': case 'T': step = 2; break;
        case 'S': case 'Q': step = 4; break;
        case 'C': step = 6; break;
        case 'A': step = 7; break;
        case 'Z': step = 0; break;
      }

      if (step > 0 && args.length >= step) {
        for (let i = 0; i < args.length; i += step) {
          const typeSub = (i === 0 || type.toUpperCase() !== 'M') ? type : (type === 'm' ? 'l' : 'L');
          tokens.push({ type: typeSub, args: args.slice(i, i + step) });
        }
      } else {
         tokens.push({ type, args });
      }
    } else {
      tokens.push({ type, args: [] });
    }
  }

  return tokens;
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boundsCache = new Map<string, AABB>();

export function clearBoundsCache() {
  boundsCache.clear();
}

export function invalidateBounds(nodeId: string, state: SceneGraphState) {
  let currentId: string | null = nodeId;
  while (currentId) {
    boundsCache.delete(currentId);
    const node: SceneNode | undefined = state.nodes[currentId];
    currentId = node ? node.parentId : null;
  }
}

export function transformPoint(x: number, y: number, m: Matrix3): { x: number, y: number } {
  return {
    x: x * m[0] + y * m[3] + m[6],
    y: x * m[1] + y * m[4] + m[7]
  };
}

export function getBounds(nodeId: string, store: StoreApi<SceneGraphState>): AABB | null {
  let state = store.getState();
  let node = state.nodes[nodeId];
  if (!node) return null;

  // Ensure matrices are up to date before querying bounds
  if (node.isDirty) {
    state.recalculateMatrices();
    state = store.getState();
  }

  return computeBounds(nodeId, store);
}

function computeBounds(nodeId: string, store: StoreApi<SceneGraphState>): AABB | null {
  const state = store.getState();
  const node = state.nodes[nodeId];
  if (!node) return null;

  if (boundsCache.has(nodeId)) {
    return boundsCache.get(nodeId)!;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const addPoint = (x: number, y: number) => {
    const pt = transformPoint(x, y, node.worldMatrix);
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  };

  const addLocalAABB = (lMinX: number, lMinY: number, lMaxX: number, lMaxY: number) => {
    addPoint(lMinX, lMinY);
    addPoint(lMaxX, lMinY);
    addPoint(lMinX, lMaxY);
    addPoint(lMaxX, lMaxY);
  };

  // Specific visual bounds per node type
  if (node.type === 'rect' && node.width !== undefined && node.height !== undefined) {
    const w2 = node.width / 2;
    const h2 = node.height / 2;
    addLocalAABB(-w2, -h2, w2, h2);
  } else if (node.type === 'circle' && node.radius !== undefined) {
    addLocalAABB(-node.radius, -node.radius, node.radius, node.radius);
  } else if (node.type === 'ellipse' && node.rx !== undefined && node.ry !== undefined) {
    addLocalAABB(-node.rx, -node.ry, node.rx, node.ry);
  } else if (node.type === 'line') {
    addPoint(node.x1 || 0, node.y1 || 0);
    addPoint(node.x2 || 0, node.y2 || 0);
  } else if (node.type === 'polyline' && node.points) {
    const pts = node.points.trim().split(/[\s,]+/).map(parseFloat);
    for (let i = 0; i < pts.length; i += 2) {
      if (!isNaN(pts[i]) && !isNaN(pts[i+1])) {
        addPoint(pts[i], pts[i+1]);
      }
    }
  } else if (node.type === 'path' && node.pathData) {
    const tokens = tokenizePath(node.pathData);
    let currX = 0, currY = 0;
    for (const t of tokens) {
      const p = t.args;
      switch (t.type) {
        case 'M': case 'L': case 'T':
          if (p.length >= 2) { currX = p[0]; currY = p[1]; addPoint(currX, currY); }
          break;
        case 'm': case 'l': case 't':
          if (p.length >= 2) { currX += p[0]; currY += p[1]; addPoint(currX, currY); }
          break;
        case 'H':
          if (p.length >= 1) { currX = p[0]; addPoint(currX, currY); }
          break;
        case 'h':
          if (p.length >= 1) { currX += p[0]; addPoint(currX, currY); }
          break;
        case 'V':
          if (p.length >= 1) { currY = p[0]; addPoint(currX, currY); }
          break;
        case 'v':
          if (p.length >= 1) { currY += p[0]; addPoint(currX, currY); }
          break;
        case 'C':
          if (p.length >= 6) { addPoint(p[0], p[1]); addPoint(p[2], p[3]); addPoint(p[4], p[5]); currX = p[4]; currY = p[5]; }
          break;
        case 'c':
          if (p.length >= 6) { addPoint(currX+p[0], currY+p[1]); addPoint(currX+p[2], currY+p[3]); addPoint(currX+p[4], currY+p[5]); currX += p[4]; currY += p[5]; }
          break;
        case 'S': case 'Q':
          if (p.length >= 4) { addPoint(p[0], p[1]); addPoint(p[2], p[3]); currX = p[2]; currY = p[3]; }
          break;
        case 's': case 'q':
          if (p.length >= 4) { addPoint(currX+p[0], currY+p[1]); addPoint(currX+p[2], currY+p[3]); currX += p[2]; currY += p[3]; }
          break;
        case 'A':
          if (p.length >= 7) { currX = p[5]; currY = p[6]; addPoint(currX, currY); }
          break;
        case 'a':
          if (p.length >= 7) { currX += p[5]; currY += p[6]; addPoint(currX, currY); }
          break;
      }
    }
  }

  // Union with children bounds
  for (const childId of node.children) {
    const childBounds = computeBounds(childId, store);
    if (childBounds) {
      if (childBounds.minX < minX) minX = childBounds.minX;
      if (childBounds.minY < minY) minY = childBounds.minY;
      if (childBounds.maxX > maxX) maxX = childBounds.maxX;
      if (childBounds.maxY > maxY) maxY = childBounds.maxY;
    }
  }

  // Handle empty bounds (e.g. empty container)
  // Instead of mapping to 0, if minX is still Infinity, 
  // maybe we should just return a 0 area bounds at the node's origin?
  if (minX === Infinity) {
    const origin = transformPoint(0, 0, node.worldMatrix);
    minX = origin.x;
    minY = origin.y;
    maxX = origin.x;
    maxY = origin.y;
  }

  const result: AABB = { minX, minY, maxX, maxY };
  boundsCache.set(nodeId, result);
  return result;
}
