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

declare global {
  interface Window {
    electronAPI?: {
      showOpenDialog: () => Promise<string | null>;
      showSaveDialog: (defaultPath?: string) => Promise<string | null>;
      readFile: (filePath: string) => Promise<{ content?: string, filePath?: string, fileName?: string, error?: string }>;
      writeFile: (filePath: string, content: string) => Promise<{ success?: boolean, filePath?: string, fileName?: string, error?: string }>;
      getRecentFiles: () => Promise<string[]>;
      setDirty: (isDirty: boolean) => void;
      onMenuOpen: (callback: () => void) => () => void;
      onMenuSave: (callback: () => void) => () => void;
      onMenuSaveAs: (callback: () => void) => () => void;
      onOpenRecentFile: (callback: (filePath: string) => void) => () => void;
      onRequestSaveAndClose: (callback: () => void) => () => void;
      closeApp: () => void;
      removeAllListeners: (channel: string) => void;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [storeVersion, setStoreVersion] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [saveProgress, _setSaveProgress] = useState<number | null>(null);
  const [showSaveProgress, _setShowSaveProgress] = useState(false);

  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  
  const ignoreDirtyRef = useRef(false);

  useEffect(() => {
    if (canvasRef.current) {
      const bridge = new PixiBridge(canvasRef.current, store);
      (window as any).__bridge = bridge;

      const unsubscribe = store.subscribe((state: any, prevState: any) => {
        setNodesCount(Object.keys(state.nodes).length);
        setStoreVersion(state.version);
        if (!ignoreDirtyRef.current && state.nodes !== prevState.nodes) {
          setIsDirty(true);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (typeof (engine as any).subscribeUI === 'function') {
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

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.setDirty(isDirty);
    }
    const fileNameDisplay = currentFileName ? currentFileName : 'Untitled';
    const dirtyIndicator = isDirty ? '*' : '';
    document.title = `${fileNameDisplay}${dirtyIndicator} - Essential Shell`;
  }, [currentFileName, isDirty]);

  const loadFileContent = useCallback(async (filePath: string) => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.readFile(filePath);
    if (result.error || !result.content) {
      alert(result.error || "Failed to read file");
      return;
    }
    
    ignoreDirtyRef.current = true;
    store.setState({ nodes: {}, rootId: null });
    
    if (filePath.toLowerCase().endsWith('.svg')) {
      const parser = new SvgParser();
      const nodes = parser.parse(result.content);
      nodes.forEach(node => store.getState().addNode(node));
    } else {
      try {
        const data = JSON.parse(result.content);
        const sceneNodes = data.scene || {};
        Object.values(sceneNodes).forEach((node: any) => {
           store.getState().addNode(node);
        });
      } catch (e) {
        console.error("Error parsing JSON", e);
      }
    }
    
    store.getState().recalculateMatrices();
    
    setCurrentFilePath(result.filePath || null);
    setCurrentFileName(result.fileName || null);
    setIsDirty(false);
    
    setTimeout(() => {
       ignoreDirtyRef.current = false;
    }, 50);
  }, []);

  const handleOpen = useCallback(async () => {
    if (!window.electronAPI) return;
    const filePath = await window.electronAPI.showOpenDialog();
    if (filePath) {
      await loadFileContent(filePath);
    }
  }, [loadFileContent]);

  const getSaveContent = (format: 'json' | 'svg'): string => {
    const state = store.getState().nodes;
    if (format === 'svg') {
      const serializer = new SvgSerializer();
      return serializer.serialize(state);
    } else {
      const cleanScene: Record<string, any> = {};
      for (const [id, node] of Object.entries(state)) {
        const cleanNode = { ...(node as any) };
        delete (cleanNode as any).localMatrix;
        delete (cleanNode as any).worldMatrix;
        delete (cleanNode as any).isDirty;
        cleanScene[id] = cleanNode;
      }
      const exportData = {
        scene: cleanScene,
        animations: engine.getTracks(),
        metadata: { version: "1.0.0", duration: engine.getDuration() }
      };
      return JSON.stringify(exportData, null, 2);
    }
  };

  const handleSave = useCallback(async (saveAs: boolean): Promise<boolean> => {
    if (!window.electronAPI) return false;
    
    let targetPath = currentFilePath;
    if (saveAs || !targetPath) {
      const newPath = await window.electronAPI.showSaveDialog(targetPath || undefined);
      if (!newPath) return false;
      targetPath = newPath;
    }
    
    const format = targetPath.toLowerCase().endsWith('.svg') ? 'svg' : 'json';
    const content = getSaveContent(format);
    
    const result = await window.electronAPI.writeFile(targetPath, content);
    if (result.error) {
      alert(result.error);
      return false;
    }
    
    setCurrentFilePath(result.filePath || null);
    setCurrentFileName(result.fileName || null);
    setIsDirty(false);
    return true;
  }, [currentFilePath]);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unOpen = window.electronAPI.onMenuOpen(handleOpen);
    const unSave = window.electronAPI.onMenuSave(() => handleSave(false));
    const unSaveAs = window.electronAPI.onMenuSaveAs(() => handleSave(true));
    const unOpenRecent = window.electronAPI.onOpenRecentFile((path) => loadFileContent(path));
    const unSaveAndClose = window.electronAPI.onRequestSaveAndClose(async () => {
      const saved = await handleSave(false);
      if (saved) {
        window.electronAPI?.closeApp();
      }
    });

    return () => {
      unOpen();
      unSave();
      unSaveAs();
      unOpenRecent();
      unSaveAndClose();
    };
  }, [handleOpen, handleSave, loadFileContent]);

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
          onOpen={handleOpen}
          onSave={() => handleSave(false)}
          onSaveAs={() => handleSave(true)}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          isSaving={showSaveProgress}
          saveProgress={saveProgress ?? 0}
        />

        <div className="flex flex-1 overflow-hidden">
          <LayerPanel store={store} nodesCount={nodesCount} version={storeVersion} />

          <div 
            className="flex-1 relative bg-[#1a1a1a]"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
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
