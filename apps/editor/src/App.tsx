import { useEffect, useRef, useState, useMemo } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { SvgParser, SvgSerializer } from '@monorepo/serialization';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { Timeline } from './components/Timeline';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { WorkerEngineProxy } from './WorkerEngineProxy';

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

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [saveProgress, setSaveProgress] = useState<number | null>(null);
  const [showSaveProgress, setShowSaveProgress] = useState(false);

  // Initialize Worker and Proxy once
  const { worker, engine } = useMemo(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const engine = new WorkerEngineProxy(store, worker);
    return { worker, engine };
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const offscreen = canvas.transferControlToOffscreen();
      
      worker.postMessage({
        type: 'init',
        payload: {
          canvas: offscreen,
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          pixelRatio: window.devicePixelRatio || 1,
        }
      }, [offscreen]);

      const handleResize = () => {
        worker.postMessage({
          type: 'resize',
          payload: {
            width: canvas.clientWidth,
            height: canvas.clientHeight,
          }
        });
      };
      window.addEventListener('resize', handleResize);

      // Proxy pointer events
      const proxyEvent = (eventType: string) => (e: any) => {
        worker.postMessage({
          type: 'event',
          payload: {
            eventType,
            eventData: {
              clientX: e.clientX,
              clientY: e.clientY,
              button: e.button,
              shiftKey: e.shiftKey,
              deltaY: e.deltaY,
            }
          }
        });
      };

      canvas.addEventListener('pointerdown', proxyEvent('pointerdown'));
      canvas.addEventListener('pointermove', proxyEvent('pointermove'));
      window.addEventListener('pointerup', proxyEvent('pointerup'));
      canvas.addEventListener('wheel', proxyEvent('wheel'), { passive: false });

      // Subscribe to worker state syncs
      const handleWorkerMessage = (e: MessageEvent) => {
        if (e.data.type === 'state-sync') {
          // Worker sends full state (or could be diffs, but for now full nodes)
          // Update local store silently (avoiding triggering the ui-update loop)
          store.setState({ nodes: e.data.nodes });
        }
      };
      worker.addEventListener('message', handleWorkerMessage);

      // Subscribe to local store to send delta updates to worker
      const unsubscribe = store.subscribe((state, prevState) => {
        setNodesCount(Object.keys(state.nodes).length);
        
        // Find nodes modified by UI (marked dirty on main thread)
        const dirtyNodes: any = {};
        for (const [id, node] of Object.entries(state.nodes)) {
            // Worker recalculates matrices and sets isDirty to false,
            // so any node with isDirty=true here was mutated by main thread UI.
            if (node.isDirty && node !== prevState.nodes[id]) {
                dirtyNodes[id] = node;
            }
        }
        if (Object.keys(dirtyNodes).length > 0) {
            worker.postMessage({ type: 'ui-update', payload: { nodes: dirtyNodes } });
        }
      });

      return () => {
        window.removeEventListener('resize', handleResize);
        worker.removeEventListener('message', handleWorkerMessage);
        unsubscribe();
      };
    }
  }, [worker]);

  useEffect(() => {
    let frame: number;
    const checkPlayState = () => {
      setIsPlaying(engine.getIsPlaying());
      frame = requestAnimationFrame(checkPlayState);
    };
    frame = requestAnimationFrame(checkPlayState);
    return () => cancelAnimationFrame(frame);
  }, [engine]);

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
    worker.postMessage({
      type: 'zoom-in',
      payload: { width: window.innerWidth, height: window.innerHeight }
    });
  };

  const handleZoomOut = () => {
    worker.postMessage({
      type: 'zoom-out',
      payload: { width: window.innerWidth, height: window.innerHeight }
    });
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
