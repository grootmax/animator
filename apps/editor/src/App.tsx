import { useEffect, useRef, useState, useCallback } from 'react';
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
      exportSvg: (content: string) => Promise<boolean>;
      openFileWithMetadata: () => Promise<{content: string, filePath: string} | null>;
      saveFileDirect: (filePath: string, content: string) => Promise<boolean>;
      saveFileWithDialog: (content: string) => Promise<string | null>;
      openBinaryFile: () => Promise<{buffer: ArrayBuffer, filePath: string} | null>;
      saveBinaryFileDirect: (filePath: string, buffer: ArrayBuffer) => Promise<boolean>;
      saveBinaryFileWithDialog: (buffer: ArrayBuffer) => Promise<string | null>;
      getRecentFiles: () => Promise<string[]>;
      addRecentFile: (filePath: string) => Promise<string[]>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [storeVersion, setStoreVersion] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [saveProgress, setSaveProgress] = useState<number | null>(null);
  const [showSaveProgress, setShowSaveProgress] = useState(false);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const bridge = new PixiBridge(canvasRef.current, store);
      (window as any).__bridge = bridge;

      const unsubscribe = store.subscribe((state) => {
        setNodesCount(Object.keys(state.nodes).length);
        setStoreVersion((state as any).version || 0);
      });

      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if ((engine as any).subscribeUI) {
      return (engine as any).subscribeUI((state: any) => {
        setIsPlaying(state.isPlaying);
      });
    }
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
      const result = await window.electronAPI.openFileWithMetadata();
      if (result) {
        setActiveFilePath(result.filePath);
        const parser = new SvgParser();
        const nodes = parser.parse(result.content);
        if (nodes.length > 0) {
          (store.getState() as any).commitHistory?.();
          nodes.forEach(node => store.getState().addNode(node));
        }
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleSaveState = useCallback(async () => {
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

        const content = JSON.stringify(exportData, null, 2);
        const size = new Blob([content]).size;
        const IS_LARGE = size > 5 * 1024 * 1024; // 5MB

        if (IS_LARGE) {
          const buffer = new TextEncoder().encode(content).buffer;
          if (activeFilePath) {
            await window.electronAPI!.saveBinaryFileDirect(activeFilePath, buffer);
          } else {
            const newPath = await window.electronAPI!.saveBinaryFileWithDialog(buffer);
            if (newPath) setActiveFilePath(newPath);
          }
        } else {
          if (activeFilePath) {
            await window.electronAPI!.saveFileDirect(activeFilePath, content);
          } else {
            const newPath = await window.electronAPI!.saveFileWithDialog(content);
            if (newPath) setActiveFilePath(newPath);
          }
        }
      };
      
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(processBatch);
      } else {
        setTimeout(processBatch, 0);
      }
    } else {
      alert("Electron API not available");
    }
  }, [activeFilePath]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveState();
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

  useEffect(() => {
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const filePath = (file as any).path;
        if (filePath && window.electronAPI) {
          const assetUrl = `asset://${encodeURIComponent(filePath)}`;
          
          store.getState().addNode({
            id: `image_${Date.now()}`,
            type: 'image',
            parentId: null,
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            width: 200,
            height: 200,
            src: assetUrl
          });
          store.getState().recalculateMatrices();
        } else if (file.type === 'image/png' || file.type === 'image/jpeg') {
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
    const handleDragOver = (e: DragEvent) => e.preventDefault();

    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleDragOver);
    return () => {
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, []);

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
          <LayerPanel store={store} nodesCount={nodesCount} version={storeVersion} />

          <div 
            className="flex-1 relative bg-[#1a1a1a]"
          >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            <button
               className="absolute top-4 right-4 bg-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-500 shadow"
               onClick={handleTestAnimation}
            >
              Add Test Anim
            </button>
            {activeFilePath && (
              <div className="absolute top-4 left-4 text-xs text-gray-400">
                Active: {activeFilePath}
              </div>
            )}
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
