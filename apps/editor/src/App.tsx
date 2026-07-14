import { useEffect, useRef, useState } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine } from '@monorepo/animation-engine';
import { SvgParser, SvgSerializer } from '@monorepo/serialization';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { Timeline } from './components/Timeline';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Create singletons for the app
const store = createSceneGraphStore();
const engine = new AnimationEngine(store);

// Extend Window interface for Electron IPC
declare global {
  interface Window {
    electronAPI?: {
      openFile: () => Promise<string | null>;
      saveFile: (content: string) => Promise<boolean>;
      saveProjectBegin: () => Promise<string | null>;
      saveProjectAppend: (chunk: Uint8Array) => Promise<boolean>;
      openProject: () => Promise<Uint8Array | null>;
    }
  }
}

import type { SaveWorkerRequest, SaveWorkerResponse } from './workers/saveWorker';

const saveWorker = new Worker(new URL('./workers/saveWorker.ts', import.meta.url), { type: 'module' });

let workerMessageId = 0;
const workerCallbacks = new Map<string, (buffer: Uint8Array) => void>();

saveWorker.onmessage = (e: MessageEvent<SaveWorkerResponse>) => {
  if (e.data.type === 'chunk_serialized') {
    const cb = workerCallbacks.get(e.data.id);
    if (cb) {
      cb(e.data.buffer);
      workerCallbacks.delete(e.data.id);
    }
  }
};

const serializeChunkAsync = (payload: any): Promise<Uint8Array> => {
  return new Promise((resolve) => {
    const id = (++workerMessageId).toString();
    workerCallbacks.set(id, resolve);
    saveWorker.postMessage({ type: 'serialize_chunk', id, payload } as SaveWorkerRequest);
  });
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasBinarySaveFile, setHasBinarySaveFile] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      // Initialize renderer
      const bridge = new PixiBridge(canvasRef.current, store);
      // We keep bridge instance alive
      (window as any).__bridge = bridge;

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
      setIsPlaying(engine.getIsPlaying());
      frame = requestAnimationFrame(checkPlayState);
    };
    frame = requestAnimationFrame(checkPlayState);
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleSaveProject = async () => {
    if (!window.electronAPI) {
      alert("Electron API not available");
      return;
    }

    const state = store.getState();
    const isFirstSave = !hasBinarySaveFile;

    if (isFirstSave) {
      const filePath = await window.electronAPI.saveProjectBegin();
      if (!filePath) return;
      setHasBinarySaveFile(true);
    }

    const cleanNodeForSave = (node: any) => {
      const cleanNode = { ...node };
      delete cleanNode.localMatrix;
      delete cleanNode.worldMatrix;
      delete cleanNode.isDirty;
      return cleanNode;
    };

    let nodesArray: [string, any][] = [];
    if (isFirstSave) {
      nodesArray = Object.entries(state.nodes);
    } else {
      if (state.modifiedNodes.size === 0) {
        console.log("No modified nodes to save.");
        return;
      }
      for (const id of state.modifiedNodes) {
        if (state.nodes[id]) {
          nodesArray.push([id, state.nodes[id]]);
        }
      }
    }

    const CHUNK_SIZE = 5000;
    let allSuccess = true;

    if (nodesArray.length === 0) {
      // Nothing to save (e.g. empty project on first save)
      const payload = {
        type: isFirstSave ? 'FULL_SYNC' : 'INCREMENTAL',
        nodes: {},
        metadata: isFirstSave ? { version: "1.0.0", duration: engine.getDuration() } : undefined
      };
      const buffer = await serializeChunkAsync(payload);
      allSuccess = await window.electronAPI.saveProjectAppend(buffer);
    } else {
      for (let i = 0; i < nodesArray.length; i += CHUNK_SIZE) {
        const chunk = nodesArray.slice(i, i + CHUNK_SIZE);
        const nodesToSave: Record<string, any> = {};
        for (const [id, node] of chunk) {
          nodesToSave[id] = cleanNodeForSave(node);
        }
        
        const payload = {
          type: isFirstSave ? 'FULL_SYNC' : 'INCREMENTAL',
          nodes: nodesToSave,
          metadata: (isFirstSave && i === 0) ? { version: "1.0.0", duration: engine.getDuration() } : undefined
        };
        
        const buffer = await serializeChunkAsync(payload);
        const success = await window.electronAPI.saveProjectAppend(buffer);
        if (!success) {
          allSuccess = false;
          break;
        }
      }
    }

    if (allSuccess) {
      store.getState().clearModifiedNodes();
    }
  };

  const handleOpenProject = async () => {
    if (!window.electronAPI) return;
    const rawBuffer = await window.electronAPI.openProject();
    if (!rawBuffer) return;

    const buffer = new Uint8Array(rawBuffer);

    // Read BINPROJ1
    const magicStr = new TextDecoder().decode(buffer.slice(0, 8));
    if (magicStr !== "BINPROJ1") {
      alert("Invalid binary project file");
      return;
    }

    let offset = 8;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const decoder = new TextDecoder();
    
    // We clear all existing nodes first (optional depending on UX, but usually opening a project clears current state)
    // Actually, store doesn't have clearNodes. Let's just override or add.
    // For simplicity, we just add nodes.
    
    while (offset < buffer.byteLength) {
      if (offset + 4 > buffer.byteLength) break;
      const length = view.getUint32(offset, true);
      offset += 4;
      
      if (offset + length > buffer.byteLength) break;
      const chunkBytes = buffer.slice(offset, offset + length);
      offset += length;
      
      const jsonStr = decoder.decode(chunkBytes);
      try {
        const payload = JSON.parse(jsonStr);
        if (payload.nodes) {
          for (const [id, nodeData] of Object.entries(payload.nodes)) {
            // Check if exists
            if (store.getState().nodes[id]) {
               store.getState().updateNode(id, nodeData as any);
            } else {
               store.getState().addNode(nodeData as any);
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse chunk", e);
      }
    }
    
    store.getState().recalculateMatrices();
    store.getState().clearModifiedNodes();
    setHasBinarySaveFile(true);
  };

  const handleImportSvg = async () => {
    if (window.electronAPI) {
      const svgContent = await window.electronAPI.openFile();
      if (svgContent) {
        const parser = new SvgParser();
        const nodes = parser.parse(svgContent);
        nodes.forEach(node => store.getState().addNode(node));
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
        animations: engine.getTracks(),
        metadata: {
          version: "1.0.0",
          duration: engine.getDuration()
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
      engine.addTrack({
        nodeId: testNodeId,
        property: 'rotation',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 2000, value: Math.PI * 2, easing: 'easeInOutQuad' },
          { time: 4000, value: 0, easing: 'easeInOutQuad' }
        ]
      });
      engine.play();
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
      state.recalculateMatrices();
    }
  };

  const handleTogglePlay = () => {
    if (engine.getIsPlaying()) engine.pause();
    else engine.play();
  };

  const handleZoomIn = () => {
    const bridge = (window as any).__bridge;
    if (bridge && bridge.viewport) {
      bridge.viewport.container.scale.x *= 1.2;
      bridge.viewport.container.scale.y *= 1.2;
      bridge.viewport.drawGrid();
    }
  };

  const handleZoomOut = () => {
    const bridge = (window as any).__bridge;
    if (bridge && bridge.viewport) {
      bridge.viewport.container.scale.x /= 1.2;
      bridge.viewport.container.scale.y /= 1.2;
      bridge.viewport.drawGrid();
    }
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
          onSaveProject={handleSaveProject}
          onOpenProject={handleOpenProject}
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

        <Timeline engine={engine} store={store} />
      </div>
    </DndProvider>
  );
}

export default App;
