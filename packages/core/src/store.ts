export interface SceneNode {
  id: string;
  type: string;
  parentId?: string;
  visible?: boolean;
  opacity?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  localMatrix?: number[];
  [key: string]: unknown;
}

export interface Keyframe {
  id?: string;
  time: number; // in milliseconds
  value: unknown;
  easing?: "linear" | "easeInQuad" | "easeOutQuad" | "easeInOutQuad";
}

export interface Track {
  id: string;
  nodeId: string;
  property: string;
  keyframes: Record<string, Keyframe> | Keyframe[];
}

export interface SceneGraphState {
  nodes: Record<string, SceneNode>;
  [key: string]: unknown;
}

export class SceneGraphStore {
  private state: SceneGraphState;
  private listeners: Set<() => void> = new Set();

  constructor(initialNodes: Record<string, SceneNode> = {}) {
    this.state = { nodes: initialNodes };
  }

  public getState(): SceneGraphState {
    return this.state;
  }

  public setState(nextState: Partial<SceneGraphState>): void {
    this.state = { ...this.state, ...nextState };
    this.notify();
  }

  public updateNode(nodeId: string, updates: Partial<SceneNode>): void {
    const node = this.state.nodes[nodeId];
    if (!node) return;
    this.state = {
      ...this.state,
      nodes: {
        ...this.state.nodes,
        [nodeId]: {
          ...node,
          ...updates,
        },
      },
    };
    this.notify();
  }

  public recalculateMatrices(): void {
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function createSceneGraphStore(
  initialNodes: Record<string, SceneNode> = {},
) {
  return new SceneGraphStore(initialNodes);
}
