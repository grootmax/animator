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
      openImageFile: () => Promise<string | null>;
      saveFile: (content: string) => Promise<boolean>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [saveProgress, setSaveProgress] = useState<number | null>(null);
  const [showSaveProgress, setShowSaveProgress] = useState(false);

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

  const handleImportImage = async () => {
    if (window.electronAPI) {
      const imagePath = await window.electronAPI.openImageFile();
      if (imagePath) {
        store.getState().addNode({
          id: `image_${Date.now()}`,
          type: 'image',
          parentId: null,
          children: [],
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          visible: true,
          locked: false,
          src: imagePath,
        });
        store.getState().recalculateMatrices();
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleSaveState = async () => {
    if (window.electronAPI) {
      const state = store.getState().nodes;
      const nodeKeys = Object.keys(state);
      const totalNodes = nodeKeys.length;
      
      const cleanScene: Record<string, any> = {};
      
      let currentIndex = 0;
      
      const showProgressTimeout = setTimeout(() => {
        setShowSaveProgress(true);
      }, 500);

      const processBatch = (deadline?: any) => {
        const startTime = performance.now();
        
        while (currentIndex < totalNodes) {
          if (deadline && deadline.timeRemaining) {
            if (deadline.timeRemaining() < 2) break;
          } else {
            if (performance.now() - startTime > 10) break;
          }
          
          const id = nodeKeys[currentIndex];
          const node = state[id];
          const cleanNode = { ...node };
          delete (cleanNode as any).localMatrix;
          delete (cleanNode as any).worldMatrix;
          delete (cleanNode as any).isDirty;
          cleanScene[id] = cleanNode;
          
          currentIndex++;
        }
        
        setSaveProgress(Math.floor((currentIndex / totalNodes) * 100));

        if (currentIndex < totalNodes) {
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(processBatch);
          } else {
            setTimeout(processBatch, 0);
          }
        } else {
          finishSave();
        }
      };

      const finishSave = async () => {
        clearTimeout(showProgressTimeout);
        setShowSaveProgress(false);
        setSaveProgress(null);
        
        const exportData = {
          scene: cleanScene,
          animations: engine.getTracks(),
          metadata: {
            version: "1.0.0",
            duration: engine.getDuration()
          }
        };

        await window.electronAPI!.saveFile(JSON.stringify(exportData, null, 2));
      };
      
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(processBatch);
      } else {
        setTimeout(processBatch, 0);
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
      <div className="flex flex-col h-screen w-screen bg-gray-900 text-gray-200 overflow-hidden relative">
        <Toolbar
          tool={tool}
          setTool={setTool}
          isPlaying={isPlaying}
          togglePlay={handleTogglePlay}
          onImport={handleImportSvg}
          onImportImage={handleImportImage}
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

        <Timeline engine={engine} store={store} />

        {showSaveProgress && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <div className="text-sm font-medium">Saving Project...</div>
              <div className="text-xs text-gray-400">{saveProgress}%</div>
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  );
}

export default App;
