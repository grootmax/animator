import { useEffect, useRef, useState } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine } from '@monorepo/animation-engine';
import { SvgParser } from '@monorepo/serialization';
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
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
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

  const handleSaveState = async () => {
    if (window.electronAPI) {
      const state = store.getState().nodes;

      // Filter out internal state (localMatrix, worldMatrix, isDirty) to create clean export
      const cleanScene: Record<string, any> = {};
      for (const [id, node] of Object.entries(state)) {
        const cleanNode = { ...node };
        delete (cleanNode as any).localMatrix;
        delete (cleanNode as any).worldMatrix;
        delete (cleanNode as any).isDirty;
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

      await window.electronAPI.saveFile(JSON.stringify(exportData, null, 2));
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
      <div className="flex flex-col h-screen w-screen bg-gray-900 text-gray-200 overflow-hidden">
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
