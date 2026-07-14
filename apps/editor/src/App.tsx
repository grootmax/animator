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
import SaveWorker from './workers/save.worker?worker';
import LoadWorker from './workers/load.worker?worker';

// Create singletons for the app
const store = createSceneGraphStore();
const engine = new AnimationEngine(store);

// Instantiate workers
const saveWorker = new SaveWorker();
const loadWorker = new LoadWorker();

// Extend Window interface for Electron IPC
declare global {
  interface Window {
    electronAPI?: {
      openFile: () => Promise<string | null>;
      saveFile: (content: string) => Promise<boolean>;
      openProject: () => Promise<Uint8Array | null>;
      saveProject: (content: Uint8Array) => Promise<boolean>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

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

  const handleOpenProject = async () => {
    if (window.electronAPI) {
      const buffer = await window.electronAPI.openProject();
      if (buffer) {
        setIsProcessing(true);
        setStatusMessage('Loading project...');
        setProgress(0);

        loadWorker.onmessage = (e: any) => {
          if (e.data.type === 'PROGRESS') {
            setProgress(e.data.payload);
          } else if (e.data.type === 'LOAD_COMPLETE') {
            const data = e.data.payload;
            
            // clear the old state and add the new one
            store.setState({ nodes: {}, rootId: null });
            const currentState = store.getState();

            if (data.scene) {
              Object.values(data.scene).forEach((node: any) => {
                currentState.addNode(node);
              });
            }
            currentState.recalculateMatrices();
            setIsProcessing(false);
          } else if (e.data.type === 'ERROR') {
            console.error(e.data.payload);
            alert('Load failed: ' + e.data.payload);
            setIsProcessing(false);
          }
        };

        loadWorker.postMessage({ type: 'LOAD_PROJECT', payload: buffer });
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleSaveProject = async () => {
    if (window.electronAPI) {
      setIsProcessing(true);
      setStatusMessage('Saving project...');
      setProgress(0);

      const state = store.getState().nodes;
      const exportData = {
        scene: state,
        animations: engine.getTracks(),
        metadata: {
          version: "1.0.0",
          duration: engine.getDuration()
        }
      };

      saveWorker.onmessage = async (e: any) => {
        if (e.data.type === 'PROGRESS') {
          setProgress(e.data.payload);
        } else if (e.data.type === 'SAVE_COMPLETE') {
          await window.electronAPI!.saveProject(e.data.payload);
          setIsProcessing(false);
        } else if (e.data.type === 'ERROR') {
          console.error(e.data.payload);
          alert('Save failed: ' + e.data.payload);
          setIsProcessing(false);
        }
      };

      saveWorker.postMessage({ type: 'SAVE_PROJECT', payload: exportData });
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
        {isProcessing && (
          <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-80 text-center border border-gray-700">
              <h3 className="text-xl font-semibold mb-4 text-gray-100">{statusMessage}</h3>
              <div className="w-full bg-gray-700 rounded-full h-3 mb-2 overflow-hidden">
                <div 
                  className="bg-blue-500 h-3 rounded-full transition-all duration-200 ease-out" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-400">{progress}% Complete</p>
            </div>
          </div>
        )}

        <Toolbar
          tool={tool}
          setTool={setTool}
          isPlaying={isPlaying}
          togglePlay={handleTogglePlay}
          onOpenProject={handleOpenProject}
          onSaveProject={handleSaveProject}
          onImport={handleImportSvg}
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
