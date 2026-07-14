import { useEffect, useRef, useState } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine } from '@monorepo/animation-engine';
import { SvgParser, SvgSerializer } from '@monorepo/serialization';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { Timeline } from './components/Timeline';
// @ts-ignore
import { DndProvider } from 'react-dnd';
// @ts-ignore
import { HTML5Backend } from 'react-dnd-html5-backend';

// Create singletons for the app
const channel = new BroadcastChannel('scene-graph-sync');
const store = createSceneGraphStore((msg) => {
  channel.postMessage(msg);
});
channel.onmessage = (event) => {
  if (event.data && typeof (store as any).applyRemote === 'function') {
    (store as any).applyRemote(event.data);
  }
};
const engine = new AnimationEngine(store);

// Extend Window interface for Electron IPC
declare global {
  interface Window {
    electronAPI?: {
      openFile: () => Promise<string | null>;
      saveFile: (content: string) => Promise<boolean>;
      exportSvg?: (content: string) => Promise<boolean>;
      startSave: () => Promise<string | null>;
      writeChunk: (saveId: string, chunk: string) => Promise<boolean>;
      endSave: (saveId: string, success: boolean) => Promise<boolean>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [storeVersion, setStoreVersion] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveErrorMessage, setSaveErrorMessage] = useState('');

  useEffect(() => {
    if (canvasRef.current) {
      // Initialize renderer
      const bridge = new PixiBridge(canvasRef.current, store);
      // We keep bridge instance alive
      (window as any).__bridge = bridge;

      // Subscribe to node count for UI
      const unsubscribe = store.subscribe((state) => {
        setNodesCount(Object.keys(state.nodes).length);
        setStoreVersion((state as any).version || 0);
      });

      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    return (engine as any).subscribeUI?.((state: any) => {
      setIsPlaying(state.isPlaying);
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        (store.getState() as any).undo?.();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        (store.getState() as any).redo?.();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        (store.getState() as any).redo?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleImportSvg = async () => {
    if (window.electronAPI) {
      const svgContent = await window.electronAPI.openFile();
      if (svgContent) {
        const parser = new SvgParser();
        const nodes = parser.parse(svgContent);
        if (nodes.length > 0) {
          (store.getState() as any).commitHistory?.();
          nodes.forEach(node => store.getState().addNode(node));
        }
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleSaveState = async () => {
    if (saveStatus === 'saving') return;
    if (window.electronAPI && window.electronAPI.startSave) {
      const saveId = await window.electronAPI.startSave();
      if (!saveId) return;

      setSaveStatus('saving');
      setSaveProgress(0);
      setSaveErrorMessage('');

      const worker = new Worker(new URL('./workers/save.worker.ts', import.meta.url), { type: 'module' });
      
      worker.onmessage = async (e) => {
        const { type, chunk, progress, error } = e.data;
        if (type === 'chunk') {
          setSaveProgress(progress);
          const success = await window.electronAPI!.writeChunk(saveId, chunk);
          if (!success) {
            worker.terminate();
            await window.electronAPI!.endSave(saveId, false);
            setSaveStatus('error');
            setSaveErrorMessage('Failed to write chunk to disk');
          }
        } else if (type === 'complete') {
          await window.electronAPI!.endSave(saveId, true);
          setSaveStatus('success');
          setTimeout(() => setSaveStatus('idle'), 3000);
          worker.terminate();
        } else if (type === 'error') {
          await window.electronAPI!.endSave(saveId, false);
          setSaveStatus('error');
          setSaveErrorMessage(error || 'Unknown error occurred');
          worker.terminate();
        }
      };

      worker.onerror = async (err) => {
        await window.electronAPI!.endSave(saveId, false);
        setSaveStatus('error');
        setSaveErrorMessage(err.message || 'Worker error');
        worker.terminate();
      };

      const state = store.getState().nodes;
      const animations = engine.getTracks();
      const duration = engine.getDuration();

      worker.postMessage({ nodes: state, animations, duration });
    } else {
      alert("Electron API not available");
    }
  };

  const handleExportSvg = async () => {
    if (window.electronAPI && window.electronAPI.exportSvg) {
      const state = store.getState().nodes;
      const serializer = new SvgSerializer();
      const svgString = serializer.serialize(state);
      await window.electronAPI.exportSvg(svgString);
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
          { id: 'a', time: 0, value: 0, easing: 'linear' },
          { id: 'b', time: 2000, value: Math.PI * 2, easing: 'easeInOutQuad' },
          { id: 'c', time: 4000, value: 0, easing: 'easeInOutQuad' }
        ]
      });
      engine.play();
    } else {
      (store.getState() as any).commitHistory?.();
      // Create a test node if none exist
      state.addNode({
        id: 'test_rect',
        type: 'rect',
        parentId: null,
        
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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'image/png' || file.type === 'image/jpeg') {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64Src = ev.target?.result as string;
          const img = new Image();
          img.onload = () => {
            const state = store.getState();
            state.addNode({
              id: `image_${Date.now()}`,
              type: 'image',
              src: base64Src,
              x: e.clientX,
              y: e.clientY,
              width: img.width,
              height: img.height,
              parentId: null
            });
            state.recalculateMatrices();
          };
          img.src = base64Src;
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
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

        {saveStatus !== 'idle' && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50 bg-gray-800 text-white px-6 py-3 rounded shadow-lg flex flex-col items-center border border-gray-700">
            {saveStatus === 'saving' && (
              <>
                <div className="text-sm font-semibold mb-2">Saving Project...</div>
                <div className="w-48 h-2 bg-gray-600 rounded overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300" 
                    style={{ width: `${Math.max(0, Math.min(100, saveProgress))}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">{Math.round(saveProgress)}%</div>
              </>
            )}
            {saveStatus === 'success' && (
              <div className="text-sm font-semibold text-green-400">Save Complete!</div>
            )}
            {saveStatus === 'error' && (
              <div className="text-sm font-semibold text-red-400">
                Save Failed: {saveErrorMessage}
                <button className="ml-4 text-xs underline" onClick={() => setSaveStatus('idle')}>Dismiss</button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <LayerPanel store={store} nodesCount={nodesCount} version={storeVersion} />

          <div 
            className="flex-1 relative bg-[#1a1a1a]"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
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
