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
      openProject: () => Promise<{ path: string, content: string } | null>;
      saveProject: (content: string) => Promise<string | null>;
      saveFile: (content: string) => Promise<boolean>;
      path: {
        relative: (from: string, to: string) => Promise<string>;
        resolve: (...paths: string[]) => Promise<string>;
        dirname: (p: string) => Promise<string>;
        isAbsolute: (p: string) => Promise<boolean>;
      }
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);

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

  const handleOpenProject = async () => {
    if (window.electronAPI) {
      const res = await window.electronAPI.openProject();
      if (res) {
        setProjectPath(res.path);
        const data = JSON.parse(res.content);
        const dir = await window.electronAPI.path.dirname(res.path);
        
        for (const node of Object.values(data.scene) as any[]) {
          if (node.type === 'resource' && node.pathType === 'relative' && node.sourceUri) {
            node.sourceUri = await window.electronAPI.path.resolve(dir, node.sourceUri);
          }
          store.getState().addNode(node);
        }
        store.getState().recalculateMatrices();
      }
    }
  };

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

      const pPath = projectPath || await window.electronAPI.saveProject('{}');
      if (!pPath) return; // Canceled
      
      setProjectPath(pPath);
      const dir = await window.electronAPI.path.dirname(pPath);

      // Filter out internal state (localMatrix, worldMatrix, isDirty) to create clean export
      const cleanScene: Record<string, any> = {};
      for (const [id, node] of Object.entries(state)) {
        const cleanNode = { ...node };
        delete (cleanNode as any).localMatrix;
        delete (cleanNode as any).worldMatrix;
        delete (cleanNode as any).isDirty;
        
        if (cleanNode.type === 'resource' && cleanNode.pathType === 'relative' && cleanNode.sourceUri) {
          cleanNode.sourceUri = await window.electronAPI.path.relative(dir, cleanNode.sourceUri);
        }
        
        cleanScene[id] = cleanNode;
      }

      const exportData = {
        scene: cleanScene,
        animations: engine.getTracks(),
        metadata: {
          version: "1.0.0",
          duration: engine.getDuration()
        }
      };

      await window.electronAPI.saveProject(JSON.stringify(exportData, null, 2));
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        const filePath = (file as any).path;
        if (filePath) {
           const url = `asset://${encodeURIComponent(filePath)}`;
           let assetWidth = 100;
           let assetHeight = 100;
           let duration = undefined;

           try {
             if (file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|ogg)$/i)) {
               const metadata = await new Promise<any>((resolve, reject) => {
                 const video = document.createElement('video');
                 video.preload = 'metadata';
                 video.onloadedmetadata = () => {
                   resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
                 };
                 video.onerror = reject;
                 video.src = url;
               });
               assetWidth = metadata.width;
               assetHeight = metadata.height;
               duration = metadata.duration;
             } else if (file.type.startsWith('image/') || file.name.match(/\.(png|jpe?g|gif|webp)$/i)) {
               const metadata = await new Promise<any>((resolve, reject) => {
                 const img = new Image();
                 img.onload = () => {
                   resolve({ width: img.width, height: img.height });
                 };
                 img.onerror = reject;
                 img.src = url;
               });
               assetWidth = metadata.width;
               assetHeight = metadata.height;
             }
           } catch (err) {
             console.error("Failed to load metadata", err);
           }

           const state = store.getState();
           state.addNode({
             id: `res_${Date.now()}_${i}`,
             type: 'resource',
             name: file.name,
             sourceUri: filePath,
             pathType: 'absolute',
             assetWidth,
             assetHeight,
             duration,
             x: window.innerWidth / 2,
             y: window.innerHeight / 2,
             scaleX: 1,
             scaleY: 1,
             rotation: 0
           });
           state.recalculateMatrices();
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
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
          onOpenProject={handleOpenProject}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />

        <div className="flex flex-1 overflow-hidden">
          <LayerPanel store={store} nodesCount={nodesCount} />

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
