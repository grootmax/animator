import { useEffect, useRef, useState } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { SvgParser, SvgSerializer } from '@monorepo/serialization';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { Timeline } from './components/Timeline';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { EngineProxy } from './engineProxy';

// Create singletons for the app
const store = createSceneGraphStore();

// Extend Window interface for Electron IPC
declare global {
  interface Window {
    electronAPI?: {
      openFile: () => Promise<string | null>;
      saveFile: (content: string) => Promise<boolean>;
    }
  }
}

let worker: Worker;
let engineProxy: EngineProxy;

// Intercept store updates to forward to worker
const originalAddNode = store.getState().addNode;
const originalUpdateNode = store.getState().updateNode;
const originalReorderNode = store.getState().reorderNode;

store.getState().addNode = (node) => {
  originalAddNode(node);
  if (worker) worker.postMessage({ type: 'ADD_NODE', node });
};

store.getState().updateNode = (id, updates) => {
  originalUpdateNode(id, updates);
  if (worker) worker.postMessage({ type: 'UPDATE_NODE', id, updates });
};

store.getState().reorderNode = (id, newParentId, index) => {
  originalReorderNode(id, newParentId, index);
  if (worker) worker.postMessage({ type: 'REORDER_NODE', id, newParentId, index });
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (canvasRef.current && !worker) {
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      engineProxy = new EngineProxy(worker);

      const offscreen = canvasRef.current.transferControlToOffscreen();
      worker.postMessage({ type: 'INIT', canvas: offscreen }, [offscreen]);

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'PLAYHEAD_SYNC' || msg.type === 'ENGINE_STATE') {
          engineProxy.syncState(msg.isPlaying !== undefined ? msg.isPlaying : engineProxy.getIsPlaying(), msg.playhead);
        }
      };

      // Forward resize
      const handleResize = () => {
        worker.postMessage({ type: 'RESIZE', width: window.innerWidth, height: window.innerHeight });
      };
      window.addEventListener('resize', handleResize);
      handleResize();

      // Forward pointer events to the worker
      const forwardEvent = (e: Event) => {
        const pe = e as any;
        worker.postMessage({
           type: 'DOM_EVENT',
           event: {
              type: pe.type,
              pointerId: pe.pointerId,
              pointerType: pe.pointerType,
              clientX: pe.clientX,
              clientY: pe.clientY,
              globalX: pe.clientX,
              globalY: pe.clientY,
              button: pe.button,
              buttons: pe.buttons,
              shiftKey: pe.shiftKey,
              deltaY: pe.deltaY,
              isPrimary: pe.isPrimary
           }
        });
      };
      
      const c = canvasRef.current;
      c.addEventListener('pointerdown', forwardEvent);
      c.addEventListener('pointermove', forwardEvent);
      c.addEventListener('pointerup', forwardEvent);
      c.addEventListener('pointerleave', forwardEvent);
      c.addEventListener('wheel', forwardEvent, { passive: false });
      
      // Global pointer up for dragging outside
      window.addEventListener('pointerup', forwardEvent);

      // Subscribe to node count for UI
      const unsubscribe = store.subscribe((state) => {
        setNodesCount(Object.keys(state.nodes).length);
      });

      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    let frame: number;
    const checkPlayState = () => {
      if (engineProxy) setIsPlaying(engineProxy.getIsPlaying());
      frame = requestAnimationFrame(checkPlayState);
    };
    frame = requestAnimationFrame(checkPlayState);
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleImportSvg = async () => {
    if (window.electronAPI) {
      const svgContent = await window.electronAPI.openFile();
      if (svgContent) {
        const parser = new SvgParser();
        const nodes = parser.parse(svgContent);
        // Batch ADD_NODE for performance
        if (worker) {
            const updates = nodes.map(n => ({ type: 'ADD', node: n }));
            worker.postMessage({ type: 'BATCH_UPDATE', updates });
        }
        nodes.forEach(node => originalAddNode(node));
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleSaveState = async () => {
    if (window.electronAPI) {
      const state = store.getState().nodes;

      // Filter out internal state (localMatrix, worldMatrix, isDirty) to create clean export
      const cleanScene: Record<string, any> = {};
      for (const [id, node] of Object.entries(state)) {
        const cleanNode = { ...node };
        delete (cleanNode as any).localMatrix;
        delete (cleanNode as any).worldMatrix;
        delete (cleanNode as any).isDirty;
        cleanScene[id] = cleanNode;
      }

      const exportData = {
        scene: cleanScene,
        animations: engineProxy.getTracks(),
        metadata: {
          version: "1.0.0",
          duration: engineProxy.getDuration()
        }
      };

      await window.electronAPI.saveFile(JSON.stringify(exportData, null, 2));
    } else {
      alert("Electron API not available");
    }
  };

  const handleExportSvg = async () => {
    if (window.electronAPI) {
      const state = store.getState().nodes;
      const serializer = new SvgSerializer();
      const svgString = serializer.serialize(state);
      await window.electronAPI.saveFile(svgString);
    } else {
      alert("Electron API not available");
    }
  };

  const handleTestAnimation = () => {
    const state = store.getState();
    const nodeIds = Object.keys(state.nodes);
    if (nodeIds.length > 0) {
      const testNodeId = nodeIds[0];
      engineProxy.addTrack({
        nodeId: testNodeId,
        property: 'rotation',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 2000, value: Math.PI * 2, easing: 'easeInOutQuad' },
          { time: 4000, value: 0, easing: 'easeInOutQuad' }
        ]
      });
      engineProxy.play();
    } else {
      // Create a test node if none exist
      state.addNode({
        id: 'test_rect',
        type: 'rect',
        parentId: null,
        children: [],
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        width: 100,
        height: 100,
        fill: '#ff0000'
      });
    }
  };

  const handleTogglePlay = () => {
    if (engineProxy.getIsPlaying()) engineProxy.pause();
    else engineProxy.play();
  };

  const handleZoomIn = () => {
    if (worker) worker.postMessage({ type: 'ZOOM', factor: 1.2 });
  };

  const handleZoomOut = () => {
    if (worker) worker.postMessage({ type: 'ZOOM', factor: 1 / 1.2 });
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex flex-col h-screen w-screen bg-gray-900 text-gray-200 overflow-hidden">
        <Toolbar
          tool={tool}
          setTool={setTool}
          isPlaying={isPlaying}
          togglePlay={handleTogglePlay}
          onImport={handleImportSvg}
          onExport={handleSaveState}
          onExportSvg={handleExportSvg}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />

        <div className="flex flex-1 overflow-hidden">
          <LayerPanel store={store} nodesCount={nodesCount} />

          <div className="flex-1 relative bg-[#1a1a1a]">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {/* Overlay a subtle test animation button for quick testing */}
            <button
               className="absolute top-4 right-4 bg-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-500 shadow"
               onClick={handleTestAnimation}
            >
              Add Test Anim
            </button>
          </div>
        </div>

        {engineProxy && <Timeline engine={engineProxy as any} store={store} />}
      </div>
    </DndProvider>
  );
}

export default App;
