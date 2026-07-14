import { SceneNode, createSceneGraphStore } from '@monorepo/scene-graph';

export class PixiBridge {
  private worker: Worker;
  private store: ReturnType<typeof createSceneGraphStore>;
  private lastNodesState: Record<string, SceneNode> = {};

  constructor(canvas: HTMLCanvasElement, store: ReturnType<typeof createSceneGraphStore>) {
    this.store = store;

    // Use Vite's worker syntax or fallback
    this.worker = new Worker(new URL('./renderer.worker.js', import.meta.url), { type: 'module' });

    const offscreen = canvas.transferControlToOffscreen();
    
    this.worker.postMessage({
      type: 'INIT',
      payload: {
        canvas: offscreen,
        width: canvas.clientWidth || window.innerWidth,
        height: canvas.clientHeight || window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      }
    }, [offscreen]);

    window.addEventListener('resize', () => {
      this.worker.postMessage({
        type: 'RESIZE',
        payload: {
          width: canvas.clientWidth || window.innerWidth,
          height: canvas.clientHeight || window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        }
      });
    });

    const forwardEvent = (e: PointerEvent | WheelEvent) => {
      let eventName = e.type;
      
      const data = {
        clientX: (e as PointerEvent).clientX,
        clientY: (e as PointerEvent).clientY,
        pageX: (e as PointerEvent).pageX,
        pageY: (e as PointerEvent).pageY,
        pointerId: (e as PointerEvent).pointerId || 1,
        pointerType: (e as PointerEvent).pointerType || 'mouse',
        button: (e as MouseEvent).button,
        buttons: (e as MouseEvent).buttons,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        deltaY: (e as WheelEvent).deltaY || 0,
        deltaX: (e as WheelEvent).deltaX || 0,
        type: e.type,
        globalX: (e as PointerEvent).clientX,
        globalY: (e as PointerEvent).clientY,
      };

      this.worker.postMessage({
        type: 'EVENT',
        payload: { eventName, data }
      });
    };

    canvas.addEventListener('pointerdown', forwardEvent);
    canvas.addEventListener('pointermove', forwardEvent);
    window.addEventListener('pointerup', forwardEvent);
    window.addEventListener('pointermove', (e) => {
        // Only forward window pointer moves if they aren't on canvas, to handle drag outside
        if (e.target !== canvas) {
            forwardEvent(e);
        }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      forwardEvent(e);
    }, { passive: false });

    // Listen for messages from worker
    this.worker.addEventListener('message', (msg) => {
      const { type, payload } = msg.data;
      if (type === 'SELECT_NODE') {
        // Usually you'd have an action for this, but maybe UI just uses active tool.
        // Actually, store doesn't track selection natively right now?
        // Wait, selection logic might be in App or handles. 
        // We can just keep it.
      } else if (type === 'UPDATE_NODE') {
        const { id, updates } = payload;
        this.store.getState().updateNode(id, updates);
        this.store.getState().recalculateMatrices();
      }
    });

    // Sub to store for delta sync
    this.store.subscribe((state) => {
      this.syncNodesDelta(state.nodes);
    });
  }

  public zoomIn() {
    this.worker.postMessage({ type: 'ACTION', payload: { action: 'ZOOM_IN' }});
  }

  public zoomOut() {
    this.worker.postMessage({ type: 'ACTION', payload: { action: 'ZOOM_OUT' }});
  }

  private syncNodesDelta(currentNodes: Record<string, SceneNode>) {
    const updated: Record<string, SceneNode> = {};
    const deleted: string[] = [];

    // Find updated or new nodes
    for (const [id, node] of Object.entries(currentNodes)) {
      if (this.lastNodesState[id] !== node) {
        updated[id] = node;
      }
    }

    // Find deleted nodes
    for (const id of Object.keys(this.lastNodesState)) {
      if (!currentNodes[id]) {
        deleted.push(id);
      }
    }

    if (Object.keys(updated).length > 0 || deleted.length > 0) {
      this.worker.postMessage({
        type: 'SYNC_NODES_DELTA',
        payload: { updated, deleted }
      });
    }

    this.lastNodesState = { ...currentNodes };
  }
}
