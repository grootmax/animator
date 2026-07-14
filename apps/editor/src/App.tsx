import { useEffect, useRef, useState } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine } from '@monorepo/animation-engine';
import { SvgParser, SvgSerializer } from '@monorepo/serialization';
import { createAssetRegistry, Asset } from '@monorepo/asset-registry';
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
const assetRegistry = createAssetRegistry();

// Extend Window interface for Electron IPC
declare global {
  interface Window {
    electronAPI?: {
      openFile: () => Promise<{ content: string, filePath: string } | null>;
      openAsset: () => Promise<{ path: string, timestamp: number } | null>;
      openDirectory: () => Promise<string | null>;
      findFileRecursively: (dirPath: string, fileName: string) => Promise<string | null>;
      readFileBinary: (filePath: string) => Promise<Uint8Array | null>;
      watchFile: (filePath: string) => Promise<void>;
      unwatchFile: (filePath: string) => Promise<void>;
      resolveRelative: (baseDir: string, relPath: string) => Promise<string>;
      dirname: (filePath: string) => Promise<string>;
      relative: (from: string, to: string) => Promise<string>;
      onFileChanged: (callback: (filePath: string) => void) => void;
      saveProject: (exportData: any) => Promise<string | null>;
      saveFile: (content: string) => Promise<boolean>;
      exportSvg: (content: string) => Promise<boolean>;
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
  const [showMissingAssets, setShowMissingAssets] = useState(false);
  const [assets, setAssets] = useState<Record<string, Asset>>({});
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      // Initialize renderer
      const bridge = new PixiBridge(canvasRef.current, store, (assetId) => {
        const asset = assetRegistry.getState().assets[assetId];
        return asset ? asset.url : undefined;
      });
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (typeof (store.getState() as any).undo === 'function') {
          (store.getState() as any).undo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (typeof (store.getState() as any).redo === 'function') {
          (store.getState() as any).redo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (typeof (store.getState() as any).redo === 'function') {
          (store.getState() as any).redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    return assetRegistry.subscribe((state) => {
      setAssets(state.assets);
    });
  }, []);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onFileChanged(async (filePath) => {
        const state = assetRegistry.getState();
        const asset = Object.values(state.assets).find(a => a.path === filePath);
        if (asset) {
          // File changed, re-read
          const data = await window.electronAPI!.readFileBinary(filePath);
          if (data) {
            const blob = new Blob([new Uint8Array(data)]);
            const url = URL.createObjectURL(blob);
            if (asset.url) URL.revokeObjectURL(asset.url);
            assetRegistry.getState().updateAsset(asset.id, { url, status: 'linked', timestamp: Date.now() });
            
            // Mark node dirty to force re-render
            const nodes = store.getState().nodes;
            for (const [id, node] of Object.entries(nodes)) {
              if (node.assetId === asset.id) {
                store.getState().markDirty(id);
              }
            }
          } else {
            assetRegistry.getState().markMissing(asset.id);
          }
        }
      });
    }
  }, []);

  const handleRelink = async (assetId: string) => {
    if (!window.electronAPI) return;
    const asset = assets[assetId];
    if (!asset) return;

    const dirPath = await window.electronAPI.openDirectory();
    if (!dirPath) return;

    const fileName = asset.path.split(/[\/\\]/).pop();
    if (!fileName) return;

    const newPath = await window.electronAPI.findFileRecursively(dirPath, fileName);
    if (newPath) {
      const data = await window.electronAPI.readFileBinary(newPath);
      if (data) {
        const blob = new Blob([new Uint8Array(data)]);
        const url = URL.createObjectURL(blob);
        if (asset.url) URL.revokeObjectURL(asset.url);
        
        assetRegistry.getState().updateAsset(assetId, { 
          path: newPath, 
          url, 
          status: 'linked', 
          timestamp: Date.now() 
        });

        window.electronAPI.watchFile(newPath);

        const nodes = store.getState().nodes;
        for (const [id, node] of Object.entries(nodes)) {
          if (node.assetId === assetId) {
            store.getState().markDirty(id);
          }
        }
      }
    } else {
      alert("Asset not found in selected directory.");
    }
  };

  const handleImportAsset = async () => {
    if (window.electronAPI) {
      const assetData = await window.electronAPI.openAsset();
      if (assetData) {
        const data = await window.electronAPI.readFileBinary(assetData.path);
        if (data) {
          const blob = new Blob([new Uint8Array(data)]);
          const url = URL.createObjectURL(blob);
          const id = 'asset_' + Date.now();
          const ext = assetData.path.split('.').pop()?.toLowerCase();
          const type = (ext === 'mp4' || ext === 'mov') ? 'video' : 'image';
          
          assetRegistry.getState().registerAsset({
            id,
            path: assetData.path,
            timestamp: assetData.timestamp,
            type,
            url
          });

          window.electronAPI.watchFile(assetData.path);

          store.getState().addNode({
            id: 'node_' + Date.now(),
            type: type === 'video' ? 'videoReference' : 'imageReference',
            parentId: null,
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            assetId: id
          });
          store.getState().recalculateMatrices();
        }
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleImportSvg = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.openFile();
      if (result) {
        const parser = new SvgParser();
        const nodes = parser.parse(result.content);
        if (nodes.length > 0) {
          if (typeof (store.getState() as any).commitHistory === 'function') {
            (store.getState() as any).commitHistory();
          }
          nodes.forEach(node => store.getState().addNode(node));
        }
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleOpenProject = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.openFile();
      if (result) {
        setCurrentProjectPath(result.filePath);
        try {
          const data = JSON.parse(result.content);
          const projectDir = await window.electronAPI.dirname(result.filePath);
          
          if (data.assets) {
            for (const [id, asset] of Object.entries<any>(data.assets)) {
               let assetPath = asset.path;
               // Try to load absolute path first
               let fileData = await window.electronAPI.readFileBinary(assetPath);
               
               // If failed, try relative path if it exists
               if (!fileData && asset.relativePath) {
                  const resolvedPath = await window.electronAPI.resolveRelative(projectDir, asset.relativePath);
                  fileData = await window.electronAPI.readFileBinary(resolvedPath);
                  if (fileData) assetPath = resolvedPath;
               }

               if (fileData) {
                 const blob = new Blob([new Uint8Array(fileData)]);
                 const url = URL.createObjectURL(blob);
                 assetRegistry.getState().registerAsset({
                   id,
                   path: assetPath,
                   timestamp: asset.timestamp || Date.now(),
                   type: asset.type,
                   url
                 });
                 window.electronAPI.watchFile(assetPath);
               } else {
                 assetRegistry.getState().registerAsset({
                   id,
                   path: asset.path,
                   timestamp: asset.timestamp || Date.now(),
                   type: asset.type
                 });
                 assetRegistry.getState().markMissing(id);
               }
            }
          }

          if (data.scene) {
            for (const node of Object.values<any>(data.scene)) {
              store.getState().addNode(node);
            }
            store.getState().recalculateMatrices();
          }
        } catch (e) {
          console.error(e);
        }
      }
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

        setSaveProgress(totalNodes > 0 ? Math.floor((currentIndex / totalNodes) * 100) : 100);

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

        const rawAssets = assetRegistry.getState().assets;
        const cleanAssets: Record<string, any> = {};
        for (const [id, asset] of Object.entries(rawAssets)) {
          const cleanAsset = { ...asset };
          delete (cleanAsset as any).url;
          cleanAssets[id] = cleanAsset;
        }

        const exportData = {
          scene: cleanScene,
          animations: engine.getTracks(),
          assets: cleanAssets,
          metadata: {
            version: "1.0.0",
            duration: engine.getDuration()
          }
        };

        const savedPath = typeof window.electronAPI!.saveProject === 'function' 
          ? await window.electronAPI!.saveProject(exportData)
          : await window.electronAPI!.saveFile(JSON.stringify(exportData, null, 2));

        if (savedPath && typeof savedPath === 'string') {
          setCurrentProjectPath(savedPath);
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
        keyframes: [
          { id: 'a', time: 0, value: 0, easing: 'linear' },
          { id: 'b', time: 2000, value: Math.PI * 2, easing: 'easeInOutQuad' },
          { id: 'c', time: 4000, value: 0, easing: 'easeInOutQuad' }
        ]
      });
      engine.play();
      setIsPlaying(true);
    } else {
      if (typeof (store.getState() as any).commitHistory === 'function') {
        (store.getState() as any).commitHistory();
      }
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
          onImportAsset={handleImportAsset}
          onOpenProject={handleOpenProject}
          onExport={handleSaveState}
          onExportSvg={handleExportSvg}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />

        <div className="flex flex-1 overflow-hidden">
          <LayerPanel store={store} nodesCount={nodesCount} version={storeVersion} />

          <div 
            className="flex-1 relative bg-[#1a1a1a]"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {currentProjectPath && (
              <div className="absolute top-4 left-4 bg-gray-800/80 px-3 py-1 rounded text-xs text-gray-300 pointer-events-none">
                {currentProjectPath}
              </div>
            )}
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                 className="bg-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-500 shadow"
                 onClick={handleTestAnimation}
              >
                Add Test Anim
              </button>
              <button
                 className="bg-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-600 shadow"
                 onClick={() => setShowMissingAssets(!showMissingAssets)}
              >
                Assets ({Object.keys(assets).length})
              </button>
            </div>
            {showMissingAssets && (
               <div className="absolute top-16 right-4 w-80 bg-gray-800 border border-gray-700 shadow-lg rounded p-4">
                 <h3 className="font-bold mb-2">Linked Assets</h3>
                 {Object.values(assets).length === 0 && <p className="text-gray-400 text-sm">No assets linked.</p>}
                 <ul>
                   {Object.values(assets).map(a => (
                     <li key={a.id} className="text-sm border-b border-gray-700 py-2 flex items-center justify-between">
                       <span className="truncate max-w-[150px]" title={a.path}>{a.path.split(/[\/\\]/).pop()}</span>
                       <div className="flex items-center gap-2">
                         {a.status === 'missing' ? (
                           <span className="text-red-400 font-bold">Missing</span>
                         ) : (
                           <span className="text-green-400">Linked</span>
                         )}
                         <button 
                           className="bg-gray-600 px-2 py-1 rounded text-xs hover:bg-gray-500"
                           onClick={() => handleRelink(a.id)}
                         >
                           Relink
                         </button>
                       </div>
                     </li>
                   ))}
                 </ul>
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
