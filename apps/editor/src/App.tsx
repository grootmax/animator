import { useEffect, useRef, useState, useCallback } from 'react';
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
      openFile: (options?: { filePath?: string; useBinary?: boolean; returnDetails?: boolean }) => Promise<any>;
      saveFile: (content: string | Uint8Array, options?: { filePath?: string; showDialog?: boolean }) => Promise<string | null>;
      getLastOpenedPath: () => Promise<string | null>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePath, setActivePath] = useState<string | null>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getLastOpenedPath().then(path => {
        if (path) {
          setActivePath(path);
          window.electronAPI!.openFile({ filePath: path, returnDetails: true, useBinary: true }).then(result => {
             if (result && result.content) {
                let contentString = result.content;
                if (contentString instanceof Uint8Array || (typeof contentString === 'object' && contentString.buffer)) {
                  contentString = new TextDecoder().decode(contentString);
                }
        
                if (result.filePath.endsWith('.json')) {
                  try {
                    const parsed = JSON.parse(contentString);
                    if (parsed.scene) {
                      Object.values(parsed.scene).forEach((node: any) => store.getState().addNode(node));
                    }
                  } catch (e) {
                    console.error("Failed to parse JSON", e);
                  }
                } else {
                  const parser = new SvgParser();
                  const nodes = parser.parse(contentString);
                  nodes.forEach(node => store.getState().addNode(node));
                }
             }
          }).catch(err => {
             console.error("Failed to load active file", err);
          });
        }
      });
    }
  }, []);

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
      const result = await window.electronAPI.openFile({ returnDetails: true, useBinary: true });
      if (result && result.content) {
        setActivePath(result.filePath);
        
        let contentString = result.content;
        if (contentString instanceof Uint8Array || (typeof contentString === 'object' && contentString.buffer)) {
          contentString = new TextDecoder().decode(contentString);
        }

        if (result.filePath.endsWith('.json')) {
          try {
            const parsed = JSON.parse(contentString);
            if (parsed.scene) {
              Object.values(parsed.scene).forEach((node: any) => store.getState().addNode(node));
            }
          } catch (e) {
            console.error("Failed to parse JSON", e);
          }
        } else {
          const parser = new SvgParser();
          const nodes = parser.parse(contentString);
          nodes.forEach(node => store.getState().addNode(node));
        }
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleSaveState = useCallback(async (forceDialog = false) => {
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

      const jsonString = JSON.stringify(exportData, null, 2);
      const binaryData = new TextEncoder().encode(jsonString);

      const savedPath = await window.electronAPI.saveFile(binaryData, {
        filePath: activePath || undefined,
        showDialog: forceDialog || !activePath
      });
      
      if (savedPath) {
        setActivePath(savedPath);
      }
    } else {
      alert("Electron API not available");
    }
  }, [activePath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveState(e.shiftKey);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveState]);

  const handleExportSvg = async () => {
    if (window.electronAPI) {
      const state = store.getState().nodes;
      const serializer = new SvgSerializer();
      const svgString = serializer.serialize(state);
      const savedPath = await window.electronAPI.saveFile(svgString, {
        filePath: activePath && activePath.endsWith('.svg') ? activePath : undefined,
        showDialog: !activePath || !activePath.endsWith('.svg')
      });
      if (savedPath) {
        setActivePath(savedPath);
      }
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
          onExport={() => handleSaveState(false)}
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
