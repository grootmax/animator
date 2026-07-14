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
      exportSvg: (content: string) => Promise<boolean>;
      projectCreate: () => Promise<any>;
      projectOpen: () => Promise<any>;
      projectSave: (manifest: any) => Promise<boolean>;
      projectImportAsset: () => Promise<any>;
      projectGetLastActive: () => Promise<any>;
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
  const [projectDir, setProjectDir] = useState<string | null>(null);

  useEffect(() => {
    // Attempt to resume last active project
    const loadLastProject = async () => {
      if (window.electronAPI?.projectGetLastActive) {
        const lastProject = await window.electronAPI.projectGetLastActive();
        if (lastProject) {
          setProjectDir(lastProject.projectDir);
          loadProjectManifest(lastProject.manifest);
        }
      }
    };
    loadLastProject();
  }, []);

  const loadProjectManifest = (manifest: any) => {
    store.getState().clear();
    
    // Load Nodes
    if (manifest.scene && manifest.scene.nodes) {
      Object.values(manifest.scene.nodes).forEach((node: any) => {
        store.getState().addNode(node);
      });
    }
    
    // Load Assets
    if (manifest.assets) {
      store.getState().setAssets(manifest.assets);
    }
  };

  const getCleanManifest = () => {
    const state = store.getState().nodes;
    const cleanScene: Record<string, any> = {};
    for (const [id, node] of Object.entries(state)) {
      const cleanNode = { ...node };
      delete (cleanNode as any).localMatrix;
      delete (cleanNode as any).worldMatrix;
      delete (cleanNode as any).isDirty;
      cleanScene[id] = cleanNode;
    }

    return {
      version: "2.0.0",
      name: projectDir ? projectDir.split(/[/\\]/).pop() : "Untitled",
      scene: {
        nodes: cleanScene,
        rootId: 'root'
      },
      assets: store.getState().assets,
      animations: engine.getTracks(),
      metadata: { duration: engine.getDuration() }
    };
  };

  const handleProjectCreate = async () => {
    if (window.electronAPI?.projectCreate) {
      const result = await window.electronAPI.projectCreate();
      if (result) {
        setProjectDir(result.projectDir);
        loadProjectManifest(result.manifest);
      }
    }
  };

  const handleProjectOpen = async () => {
    if (window.electronAPI?.projectOpen) {
      const result = await window.electronAPI.projectOpen();
      if (result) {
        setProjectDir(result.projectDir);
        loadProjectManifest(result.manifest);
      }
    }
  };

  const handleProjectSave = async () => {
    if (window.electronAPI?.projectSave && projectDir) {
      const success = await window.electronAPI.projectSave(getCleanManifest());
      if (success) {
        // Could show a toast
      }
    }
  };

  const handleImportMedia = async () => {
    if (window.electronAPI?.projectImportAsset && projectDir) {
      const asset = await window.electronAPI.projectImportAsset();
      if (asset) {
        store.getState().addAsset(asset);
        
        // Auto-add to scene graph
        store.getState().addNode({
          id: asset.id,
          type: asset.type,
          parentId: 'root',
          src: `asset://${asset.relativePath}`,
          assetId: asset.id,
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          width: asset.type === 'video' ? 640 : 300, // Reasonable defaults
          height: asset.type === 'video' ? 360 : 300,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1
        });
      }
    }
  };

  useEffect(() => {
    if (canvasRef.current) {
      // Initialize renderer
      const bridge = new PixiBridge(canvasRef.current, store);
      // We keep bridge instance alive
      (window as any).__bridge = bridge;

      // Subscribe to node count for UI
      const unsubscribe = store.subscribe((state) => {
        setNodesCount(Object.keys(state.nodes).length);
        setStoreVersion(state.version);
      });

      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    return engine.subscribeUI((state) => {
      setIsPlaying(state.isPlaying);
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        store.getState().undo();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        store.getState().redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.getState().redo();
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
          store.getState().commitHistory();
          nodes.forEach(node => store.getState().addNode(node));
        }
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
        keyframes: {
          'a': { id: 'a', time: 0, value: 0, easing: 'linear' },
          'b': { id: 'b', time: 2000, value: Math.PI * 2, easing: 'easeInOutQuad' },
          'c': { id: 'c', time: 4000, value: 0, easing: 'easeInOutQuad' }
        }
      });
      engine.play();
    } else {
      store.getState().commitHistory();
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
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onProjectCreate={handleProjectCreate}
          onProjectOpen={handleProjectOpen}
          onProjectSave={handleProjectSave}
          onImportMedia={handleImportMedia}
          hasProject={!!projectDir}
        />

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
