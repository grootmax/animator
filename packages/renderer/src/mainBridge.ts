import { createSceneGraphStore } from '@monorepo/scene-graph';
// Using Vite worker import syntax
import RendererWorker from './worker?worker';

export class PixiBridge {
  private worker: Worker;
  private canvas: HTMLCanvasElement;
  private store: ReturnType<typeof createSceneGraphStore>;

  constructor(canvas: HTMLCanvasElement, store: ReturnType<typeof createSceneGraphStore>) {
    this.canvas = canvas;
    this.store = store;

    // Use offscreen canvas
    const offscreen = canvas.transferControlToOffscreen();
    
    this.worker = new RendererWorker();
    
    const state = store.getState();
    
    this.worker.postMessage({
      type: 'INIT',
      canvas: offscreen,
      width: canvas.clientWidth || window.innerWidth,
      height: canvas.clientHeight || window.innerHeight,
      resolution: window.devicePixelRatio || 1,
      sharedBuffer: state.sharedBuffer,
    }, [offscreen]);

    this.worker.onmessage = (e) => this.handleMessage(e.data);

    this.setupEvents();

    // Initial sync
    this.syncNodes(store.getState().nodes);

    store.subscribe((state, prevState) => {
      // Sync nodes structure if it changes (shallow check of nodes object)
      if (state.nodes !== prevState?.nodes) {
        this.syncNodes(state.nodes);
      }
      
      // Fallback matrix sync if SharedArrayBuffer is not available
      const isShared = typeof SharedArrayBuffer !== 'undefined' && state.sharedBuffer instanceof SharedArrayBuffer;
      if (!isShared) {
        // Send a copy of the ArrayBuffer
        this.worker.postMessage({ type: 'SYNC_MATRICES', buffer: state.sharedBuffer.slice(0) });
      }
    });
  }

  private syncNodes(nodes: Record<string, any>) {
    // Send stripped nodes payload
    const cleanNodes: Record<string, any> = {};
    for (const [id, node] of Object.entries(nodes)) {
      cleanNodes[id] = {
        id: node.id,
        type: node.type,
        visible: node.visible,
        opacity: node.opacity,
        locked: node.locked,
        fill: node.fill,
        stroke: node.stroke,
        strokeWidth: node.strokeWidth,
        width: node.width,
        height: node.height,
        radius: node.radius,
        rx: node.rx,
        ry: node.ry,
        x1: node.x1,
        y1: node.y1,
        x2: node.x2,
        y2: node.y2,
        points: node.points,
        pathData: node.pathData,
        bufferIndex: node.bufferIndex,
        parentId: node.parentId
      };
    }
    this.worker.postMessage({ type: 'SYNC_NODES', nodes: cleanNodes });
  }

  private handleMessage(msg: any) {
    if (msg.type === 'SELECT_NODE') {
      // Not implemented in React UI currently, but good to have
    } else if (msg.type === 'REQUEST_NODE_STATE') {
      const node = this.store.getState().nodes[msg.id];
      if (node) {
        this.worker.postMessage({ type: 'SET_START_NODE_STATE', state: {
          rotation: node.rotation,
          scaleX: node.scaleX,
          scaleY: node.scaleY
        }});
      }
    } else if (msg.type === 'UPDATE_NODE') {
      this.store.getState().updateNode(msg.id, msg.updates);
      this.store.getState().recalculateMatrices();
    }
  }

  private setupEvents() {
    const handlePointer = (e: PointerEvent) => {
      this.worker.postMessage({
        type: 'EVENT',
        event: {
          type: e.type,
          clientX: e.clientX,
          clientY: e.clientY,
          button: e.button,
          shiftKey: e.shiftKey,
          globalX: e.clientX,
          globalY: e.clientY
        }
      });
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.worker.postMessage({
        type: 'EVENT',
        event: {
          type: e.type,
          clientX: e.clientX,
          clientY: e.clientY,
          deltaY: e.deltaY,
          deltaX: e.deltaX
        }
      });
    };

    this.canvas.addEventListener('pointerdown', handlePointer);
    this.canvas.addEventListener('pointermove', handlePointer);
    window.addEventListener('pointerup', handlePointer);
    this.canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    // Handle resize
    window.addEventListener('resize', () => {
      if (this.canvas.parentElement) {
         this.worker.postMessage({
           type: 'RESIZE',
           width: this.canvas.parentElement.clientWidth,
           height: this.canvas.parentElement.clientHeight,
           resolution: window.devicePixelRatio || 1
         });
      }
    });
  }

  // Fallback methods for React UI actions
  public zoomIn() {
    this.worker.postMessage({ type: 'ZOOM', factor: 1.2 });
  }

  public zoomOut() {
    this.worker.postMessage({ type: 'ZOOM', factor: 1 / 1.2 });
  }
}
