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
      openProject: () => Promise<{success: boolean, data?: any, error?: string}>;
      saveProject: (payload: string, isSaveAs?: boolean) => Promise<{success: boolean, savedPath?: string, error?: string}>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

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

  const handleSaveState = async (isSaveAs: boolean = false) => {
    if (window.electronAPI) {
      const state = store.getState();
      const nodes = state.nodes;
      const modifiedNodes = state.modifiedNodes;
      const deletedNodes = state.deletedNodes;

      const isFirstSave = !hasSaved;
      const isFullSave = isFirstSave || isSaveAs;

      let payload: any = {};

      if (isFullSave) {
        // Filter out internal state (localMatrix, worldMatrix, isDirty) to create clean export
        const cleanScene: Record<string, any> = {};
        for (const [id, node] of Object.entries(nodes)) {
          const cleanNode = { ...node };
          delete (cleanNode as any).localMatrix;
          delete (cleanNode as any).worldMatrix;
          delete (cleanNode as any).isDirty;
          cleanScene[id] = cleanNode;
        }

        payload = {
          type: 'full',
          data: {
            scene: cleanScene,
            animations: engine.getTracks(),
            metadata: {
              version: "1.0.0",
              duration: engine.getDuration()
            }
          }
        };
      } else {
        const addedOrModified: Record<string, any> = {};
        for (const id of modifiedNodes) {
          const node = nodes[id];
          if (node) {
            const cleanNode = { ...node };
            delete (cleanNode as any).localMatrix;
            delete (cleanNode as any).worldMatrix;
            delete (cleanNode as any).isDirty;
            addedOrModified[id] = cleanNode;
          }
        }

        payload = {
          type: 'delta',
          addedOrModified,
          deleted: Array.from(deletedNodes),
          animations: engine.getTracks(),
          metadata: {
            version: "1.0.0",
            duration: engine.getDuration()
          }
        };
      }

      const t0 = performance.now();
      const res = await window.electronAPI.saveProject(JSON.stringify(payload), isSaveAs);
      const t1 = performance.now();
      console.log(`Save took ${t1 - t0}ms`);
      
      if (res && res.success) {
        setHasSaved(true);
        state.clearSaveDeltas();
      } else if (res && res.error === 'fallback_to_full' && !isFullSave) {
         // Fallback to full save
         await handleSaveState(true);
      }
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

  const handleOpenProject = async () => {
    if (window.electronAPI) {
      const res = await window.electronAPI.openProject();
      if (res && res.success && res.data) {
        const { scene, animations } = res.data;
        let rootId = null;
        for (const [id, node] of Object.entries(scene)) {
          if ((node as any).parentId === null) {
             rootId = id;
             break;
          }
        }
        store.getState().loadProject(scene, rootId);
        store.getState().recalculateMatrices();
        engine.setTracks(animations || []);
        setHasSaved(true);
      }
    } else {
      alert("Electron API not available");
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
          onExport={() => handleSaveState(false)}
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
