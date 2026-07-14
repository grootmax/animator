import { useEffect, useRef, useState, useCallback } from 'react';
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
      openFile: () => Promise<{filePath: string, content: string} | null>;
      saveFile: (content: string, knownPath?: string) => Promise<{success: boolean, filePath?: string}>;
      recoverSession: () => Promise<{filePath: string, content: string} | null>;
      readBinary: (filePath: string) => Promise<Uint8Array | null>;
      writeBinary: (filePath: string, buffer: Uint8Array) => Promise<boolean>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeProjectPath, setActiveProjectPath] = useState<string | undefined>(undefined);

  // Initialize renderer and session recovery
  useEffect(() => {
    if (canvasRef.current) {
      const bridge = new PixiBridge(canvasRef.current, store);
      (window as any).__bridge = bridge;

      const unsubscribe = store.subscribe((state) => {
        setNodesCount(Object.keys(state.nodes).length);
      });

      // Session recovery
      if (window.electronAPI) {
        window.electronAPI.recoverSession().then(result => {
          if (result) {
            setActiveProjectPath(result.filePath);
            try {
              if (result.filePath.endsWith('.json')) {
                const data = JSON.parse(result.content);
                if (data.scene) {
                  Object.values(data.scene).forEach((node: any) => store.getState().addNode(node));
                  store.getState().recalculateMatrices();
                }
              } else if (result.filePath.endsWith('.svg')) {
                const parser = new SvgParser();
                const nodes = parser.parse(result.content);
                nodes.forEach(node => store.getState().addNode(node));
                store.getState().recalculateMatrices();
              }
            } catch (err) {
              console.error("Failed to parse recovered session", err);
            }
          }
        });
      }

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

  // Handle Drag & Drop for High-Resolution Media
  useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files[0];
      if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
        const filePath = (file as any).path; // Electron exposes the absolute path
        if (filePath && window.electronAPI) {
          const type = file.type.startsWith('video/') ? 'video' : 'image';
          store.getState().addNode({
            id: `asset_${Date.now()}`,
            type,
            src: `asset://${encodeURIComponent(filePath)}`,
            parentId: null,
            children: [],
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          });
          store.getState().recalculateMatrices();
        }
      }
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleDragOver);
    return () => {
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, []);

  const handleImportSvg = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.openFile();
      if (result) {
        setActiveProjectPath(result.filePath);
        if (result.filePath.endsWith('.json')) {
          try {
            const data = JSON.parse(result.content);
            if (data.scene) {
              Object.values(data.scene).forEach((node: any) => store.getState().addNode(node));
              store.getState().recalculateMatrices();
            }
          } catch (e) {
            console.error("Error parsing JSON", e);
          }
        } else {
          const parser = new SvgParser();
          const nodes = parser.parse(result.content);
          nodes.forEach(node => store.getState().addNode(node));
          store.getState().recalculateMatrices();
        }
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleSaveState = useCallback(async () => {
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

      const exportData = {
        scene: cleanScene,
        animations: engine.getTracks(),
        metadata: {
          version: "1.0.0",
          duration: engine.getDuration()
        }
      };

      const result = await window.electronAPI.saveFile(JSON.stringify(exportData, null, 2), activeProjectPath);
      if (result && result.success && result.filePath) {
        setActiveProjectPath(result.filePath);
      }
    } else {
      alert("Electron API not available");
    }
  }, [activeProjectPath]);

  const handleExportSvg = async () => {
    if (window.electronAPI) {
      const state = store.getState().nodes;
      const serializer = new SvgSerializer();
      const svgString = serializer.serialize(state);
      // Exporting as SVG should probably prompt for a save, so we omit knownPath
      await window.electronAPI.saveFile(svgString);
    } else {
      alert("Electron API not available");
    }
  };

  // Keyboard shortcut for silent save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveState();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveState]);

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
          onExportSvg={handleExportSvg}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />

        <div className="flex flex-1 overflow-hidden">
          <LayerPanel store={store} nodesCount={nodesCount} />

          <div className="flex-1 relative bg-[#1a1a1a]">
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
      </div>
    </DndProvider>
  );
}

export default App;
