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
      projectSaveStart: () => Promise<string | null>;
      projectSaveChunk: (filePath: string, chunk: Uint8Array) => Promise<boolean>;
      projectLoadStart: () => Promise<{filePath: string, size: number} | null>;
      projectLoadChunk: (filePath: string, start: number, length: number) => Promise<Uint8Array>;
      readTextFile: (filePath: string) => Promise<string>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      // Initialize renderer
      const bridge = new PixiBridge(canvasRef.current, store);
      // We keep bridge instance alive
      (window as any).__bridge = bridge;

      // Subscribe to node count for UI
      const unsubscribe = store.subscribe((state: any) => {
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

  const handleOpenProject = async () => {
    if (!window.electronAPI) return alert("Electron API not available");
    const result = await window.electronAPI.projectLoadStart();
    if (!result) return;
    const { filePath, size } = result;

    if (filePath.endsWith('.svg')) {
      const content = await window.electronAPI.readTextFile(filePath);
      const parser = new SvgParser();
      const nodes = parser.parse(content);
      nodes.forEach((node: any) => store.getState().addNode(node));
    } else if (filePath.endsWith('.json')) {
      const content = await window.electronAPI.readTextFile(filePath);
      const data = JSON.parse(content);
      if (data.scene) {
        Object.values(data.scene).forEach((node: any) => store.getState().addNode(node));
      }
      if (data.animations) {
        data.animations.forEach((track: any) => engine.addTrack(track));
      }
    } else {
      // Chunked binary load
      const worker = new Worker(new URL('./workers/load.worker.ts', import.meta.url), { type: 'module' });
      worker.postMessage({ type: 'start' });

      worker.onmessage = (e) => {
        if (e.data.type === 'success') {
          const { scene, animations } = e.data.payload;
          Object.values(scene).forEach((node: any) => store.getState().addNode(node));
          if (animations) {
            animations.forEach((track: any) => engine.addTrack(track));
          }
          worker.terminate();
        } else if (e.data.type === 'error') {
          alert('Error loading project: ' + e.data.error);
          worker.terminate();
        }
      };

      const CHUNK_SIZE = 5 * 1024 * 1024;
      for (let start = 0; start < size; start += CHUNK_SIZE) {
        const chunk = await window.electronAPI.projectLoadChunk(filePath, start, Math.min(CHUNK_SIZE, size - start));
        worker.postMessage({ type: 'chunk', data: chunk }, [chunk.buffer]);
      }
      worker.postMessage({ type: 'done' });
    }
  };

  const handleSaveProject = async () => {
    if (!window.electronAPI) return alert("Electron API not available");
    const filePath = await window.electronAPI.projectSaveStart();
    if (!filePath) return;

    const state = store.getState().nodes;
    const exportData = {
      scene: state,
      animations: engine.getTracks(),
      metadata: { version: "1.0.0", duration: engine.getDuration() }
    };

    if (filePath.endsWith('.json')) {
      const cleanScene: Record<string, any> = {};
      for (const [id, node] of Object.entries(state)) {
        const cleanNode = { ...(node as any) };
        delete cleanNode.localMatrix;
        delete cleanNode.worldMatrix;
        delete cleanNode.isDirty;
        cleanScene[id] = cleanNode;
      }
      exportData.scene = cleanScene;
      
      const content = JSON.stringify(exportData, null, 2);
      const encoder = new TextEncoder();
      const chunk = encoder.encode(content);
      await window.electronAPI.projectSaveChunk(filePath, chunk);
    } else {
      // BINARY FORMAT via WORKER
      const worker = new Worker(new URL('./workers/save.worker.ts', import.meta.url), { type: 'module' });
      worker.postMessage({ action: 'save', payload: exportData });

      worker.onmessage = async (e) => {
        if (e.data.type === 'chunk') {
          await window.electronAPI!.projectSaveChunk(filePath, e.data.data);
        } else if (e.data.type === 'done') {
          worker.terminate();
        }
      };
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
          onImport={handleOpenProject}
          onExport={handleSaveProject}
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
