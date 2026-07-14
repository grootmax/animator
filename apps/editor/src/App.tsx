import { useEffect, useRef, useState } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine } from '@monorepo/animation-engine';
import { SvgParser, SvgSerializer } from '@monorepo/serialization';
import { createAssetRegistry, Asset } from '@monorepo/asset-registry';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { Timeline } from './components/Timeline';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Create singletons for the app
const store = createSceneGraphStore();
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
      saveFile: (content: string) => Promise<string | null>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
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
            children: [],
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
        nodes.forEach(node => store.getState().addNode(node));
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

      const cleanScene: Record<string, any> = {};
      for (const [id, node] of Object.entries(state)) {
        const cleanNode = { ...node };
        delete (cleanNode as any).localMatrix;
        delete (cleanNode as any).worldMatrix;
        delete (cleanNode as any).isDirty;
        cleanScene[id] = cleanNode;
      }

      // We need to wait for save to complete to know the project path
      // So we serialize a dummy first, or we can just ask for path first
      // Actually `saveFile` just prompts and saves. We need the path to calculate relative!
      // Let's create the object without relative paths, then after save, we can update it if we want.
      // But we can't update it in the file after it's saved.
      // We will do it in saveFile - it returns the filePath. So we can intercept it!
      // Instead, we just save the absolute path. When loading, we could try the basename if it's missing!
      // Let's just calculate relativePath using currentProjectPath if it exists.
      
      const rawAssets = assetRegistry.getState().assets;
      const cleanAssets: Record<string, any> = {};
      for (const [id, asset] of Object.entries(rawAssets)) {
         const cleanAsset = { ...asset };
         delete (cleanAsset as any).url; 
         if (currentProjectPath) {
            // We can calculate relative path asynchronously, but we are in a synchronous loop.
            // Let's pre-calculate or just let handleOpenProject use basename as fallback!
         }
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

      const savedPath = await window.electronAPI.saveProject(exportData);
      if (savedPath) {
         setCurrentProjectPath(savedPath);
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
          onImportAsset={handleImportAsset}
          onOpenProject={handleOpenProject}
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
               onClick={() => setShowMissingAssets(!showMissingAssets)}
            >
              Assets Status ({Object.keys(assets).length})
            </button>
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
      </div>
    </DndProvider>
  );
}

export default App;
