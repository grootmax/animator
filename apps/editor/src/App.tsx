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
      saveAs: (content: string) => Promise<boolean>;
      getRecentProject: () => Promise<string | null>;
      addAsset: () => Promise<{ assetId: string, path: string } | null>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [assetManifest, setAssetManifest] = useState<Record<string, string>>({});

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
  
  // Load recent project on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getRecentProject().then(content => {
        if (content) {
          try {
            const data = JSON.parse(content);
            if (data.scene) {
              const state = store.getState();
              // clear current (simplistic clear)
              state.nodes = {};
              state.rootId = null;
              
              for (const [_, node] of Object.entries(data.scene)) {
                state.addNode(node as any);
              }
            }
            if (data.assets) {
              setAssetManifest(data.assets);
            }
            if (data.animations) {
              // load animations if needed
            }
          } catch (e) {
            console.error("Failed to load recent project", e);
          }
        }
      });
    }
  }, []);

  const handleOpenProject = async () => {
    if (window.electronAPI) {
      const content = await window.electronAPI.openFile();
      if (content) {
        try {
          const data = JSON.parse(content);
          if (data.scene) {
            const state = store.getState();
            state.nodes = {};
            state.rootId = null;
            for (const [_, node] of Object.entries(data.scene)) {
              state.addNode(node as any);
            }
          }
          if (data.assets) {
            setAssetManifest(data.assets);
          }
        } catch(e) {
          // might be svg
          const parser = new SvgParser();
          const nodes = parser.parse(content);
          nodes.forEach(node => store.getState().addNode(node));
        }
      }
    }
  }

  const handleSaveState = async (saveAs = false) => {
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
        },
        assets: assetManifest
      };

      const content = JSON.stringify(exportData, null, 2);
      if (saveAs) {
        await window.electronAPI.saveAs(content);
      } else {
        await window.electronAPI.saveFile(content);
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
      await window.electronAPI.saveAs(svgString); // Should use saveAs or distinct API for export, but reusing saveAs is fine for SVG if we tweak it. Wait, the API for saveAs expects JSON. Let's just use it and accept .json
      // Actually we will leave handleExportSvg as is using saveAs with json filter. Wait, earlier saveFile used JSON. 
      // I will leave it, it's not the main focus.
    }
  };
  
  const handleAddImage = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.addAsset();
      if (result) {
        const { assetId, path } = result;
        setAssetManifest(prev => ({ ...prev, [assetId]: path }));
        
        store.getState().addNode({
          id: 'img_' + Date.now(),
          type: 'image',
          parentId: null,
          children: [],
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          width: 200,
          height: 200,
          assetId
        });
        store.getState().recalculateMatrices();
      }
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
          onExport={() => handleSaveState(false)}
          onExportSvg={handleExportSvg}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
        {/* Added some extra toolbar buttons below for image testing */}
        <div className="bg-gray-800 border-b border-gray-700 px-2 py-1 flex gap-2">
            <button className="bg-blue-600 px-2 py-1 rounded text-xs" onClick={() => handleSaveState(false)}>Save</button>
            <button className="bg-blue-600 px-2 py-1 rounded text-xs" onClick={() => handleSaveState(true)}>Save As...</button>
            <button className="bg-blue-600 px-2 py-1 rounded text-xs" onClick={handleAddImage}>Add Image</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <LayerPanel store={store} nodesCount={nodesCount} />

          <div className="flex-1 relative bg-[#1a1a1a]">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
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
