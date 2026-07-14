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
      projectOpen: () => Promise<{ filePath: string, content: Uint8Array } | null>;
      projectSave: (content: Uint8Array, filePath?: string) => Promise<{ success: boolean, filePath?: string }>;
      readBinary: (filePath: string) => Promise<Uint8Array | null>;
      writeBinary: (filePath: string, data: Uint8Array) => Promise<boolean>;
      authorizeDir: (dir: string) => Promise<boolean>;
      pathRelative: (from: string, to: string) => string;
      pathResolve: (base: string, rel: string) => string;
      pathDirname: (p: string) => string;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeProjectPath, setActiveProjectPath] = useState<string | null>(null);
  const [assetManifest, setAssetManifest] = useState<Record<string, { relativePath: string, mimeType: string }>>({});

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
      const result = await window.electronAPI.projectOpen();
      if (result) {
        setActiveProjectPath(result.filePath);
        if (result.filePath.endsWith('.svg')) {
          const decoder = new TextDecoder();
          const contentStr = decoder.decode(result.content);
          const parser = new SvgParser();
          const nodes = parser.parse(contentStr);
          // clear existing nodes?
          nodes.forEach(node => store.getState().addNode(node));
        } else if (result.filePath.endsWith('.json')) {
          const decoder = new TextDecoder();
          const contentStr = decoder.decode(result.content);
          const data = JSON.parse(contentStr);
          
          if (data.manifest && data.manifest.assets) {
             setAssetManifest(data.manifest.assets);
          }
          
          const nodes = data.scene;
          const rootDir = window.electronAPI.pathDirname(result.filePath);
          
          Object.values(nodes).forEach((node: any) => {
            if (node.type === 'image' && node.assetId && data.manifest.assets[node.assetId]) {
               // resolve relative path to absolute for asset:// rendering
               const relPath = data.manifest.assets[node.assetId].relativePath;
               node.assetId = window.electronAPI!.pathResolve(rootDir, relPath);
            }
            store.getState().addNode(node);
          });
          
          if (data.animations) {
             data.animations.forEach((anim: any) => engine.addTrack(anim));
          }
        }
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleSaveState = async () => {
    if (window.electronAPI) {
      const state = store.getState().nodes;

      // Filter out internal state (localMatrix, worldMatrix, isDirty) to create clean export
      const cleanScene: Record<string, any> = {};
      const newManifest: Record<string, { relativePath: string, mimeType: string }> = { ...assetManifest };

      // We need to resolve absolute assetIds back to relative for saving
      // If we don't have activeProjectPath, it will be assigned after save, but we need it now to compute relative paths.
      // Wait, if activeProjectPath is null, we must prompt for save first, then we can resolve.
      let currentProjectPath = activeProjectPath;
      if (!currentProjectPath) {
         // Perform a save to get the path
         const emptyBuffer = new TextEncoder().encode('{}');
         const tempResult = await window.electronAPI.projectSave(emptyBuffer, undefined);
         if (!tempResult.success || !tempResult.filePath) return;
         currentProjectPath = tempResult.filePath;
         setActiveProjectPath(currentProjectPath);
      }
      
      const projectDir = window.electronAPI.pathDirname(currentProjectPath);

      for (const [id, node] of Object.entries(state)) {
        const cleanNode = { ...node };
        delete (cleanNode as any).localMatrix;
        delete (cleanNode as any).worldMatrix;
        delete (cleanNode as any).isDirty;
        
        if (cleanNode.type === 'image' && cleanNode.assetId) {
           const absPath = cleanNode.assetId;
           // If it's absolute, compute relative
           const relPath = window.electronAPI.pathRelative(projectDir, absPath);
           const manifestId = `asset-${id}`; // or hash it
           newManifest[manifestId] = { relativePath: relPath, mimeType: 'image/png' };
           cleanNode.assetId = manifestId;
        }
        
        cleanScene[id] = cleanNode;
      }
      
      setAssetManifest(newManifest);

      const exportData = {
        scene: cleanScene,
        animations: engine.getTracks(),
        metadata: {
          version: "1.0.0",
          duration: engine.getDuration()
        },
        manifest: {
          assets: newManifest
        }
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(jsonStr);

      await window.electronAPI.projectSave(uint8Array, currentProjectPath);
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
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && window.electronAPI) {
      const file = e.dataTransfer.files[0];
      const filePath = (file as any).path;
      if (filePath && (file.type.startsWith('image/') || file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg'))) {
        
        await window.electronAPI.authorizeDir(window.electronAPI.pathDirname(filePath));

        // Let's create an image node. 
        // Note: the node.assetId needs to be absolute for the renderer to load it via asset://<absolutePath>
        const id = 'image_' + Date.now();
        store.getState().addNode({
          id,
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
          assetId: filePath
        } as any);
        store.getState().recalculateMatrices();
      }
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
          onExport={handleSaveState}
          onExportSvg={handleExportSvg}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />

        <div className="flex flex-1 overflow-hidden">
          <LayerPanel store={store} nodesCount={nodesCount} />

          <div 
             className="flex-1 relative bg-[#1a1a1a]" 
             onDragOver={handleDragOver} 
             onDrop={handleDrop}
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
