import { useEffect, useRef, useState } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { SvgParser, SvgSerializer } from '@monorepo/serialization';
import { RuntimePlayer } from '@monorepo/runtime-player';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { Timeline } from './components/Timeline';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Create read-only UI store mirror
const store = createSceneGraphStore();

// Extend Window interface for Electron IPC
declare global {
  interface Window {
    electronAPI?: {
      openFile: () => Promise<string | null>;
      saveFile: (content: string) => Promise<boolean>;
    }
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [player, setPlayer] = useState<RuntimePlayer | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const rp = new RuntimePlayer(canvasRef.current);
      setPlayer(rp);
      (window as any).__player = rp;

      const unsub = rp.subscribe((nodes) => {
        // Update read-only mirror
        store.setState({ nodes });
      });

      const unsubStore = store.subscribe((state) => {
        setNodesCount(Object.keys(state.nodes).length);
      });

      return () => {
        unsub();
        unsubStore();
        rp.terminate();
      };
    }
  }, []);

  useEffect(() => {
    if (!player) return;
    let frame: number;
    const checkPlayState = () => {
      setIsPlaying(player.getIsPlaying());
      frame = requestAnimationFrame(checkPlayState);
    };
    frame = requestAnimationFrame(checkPlayState);
    return () => cancelAnimationFrame(frame);
  }, [player]);

  // Hook into node updates from UI (LayerPanel)
  // Wait, LayerPanel mutates `store` directly using store.getState().updateNode?
  // If we only have read-only mirror, how does LayerPanel update it?
  // We should proxy store updates to player.
  useEffect(() => {
    // Intercept store updateNode and addNode
    const originalUpdate = store.getState().updateNode;
    const originalAdd = store.getState().addNode;
    
    store.getState().updateNode = (id, updates) => {
      // Send to worker
      if ((window as any).__player) {
         (window as any).__player.updateNode(id, updates);
      }
    };

    store.getState().addNode = (node) => {
      if ((window as any).__player) {
         (window as any).__player.addNode(node);
      }
    };
    
    return () => {
      store.getState().updateNode = originalUpdate;
      store.getState().addNode = originalAdd;
    };
  }, []);

  const handleImportSvg = async () => {
    if (window.electronAPI && player) {
      const svgContent = await window.electronAPI.openFile();
      if (svgContent) {
        const parser = new SvgParser();
        const nodes = parser.parse(svgContent);
        nodes.forEach(node => player.addNode(node));
      }
    } else {
      alert("Electron API not available");
    }
  };

  const handleSaveState = async () => {
    if (window.electronAPI && player) {
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
        animations: player.getTracks(),
        metadata: {
          version: "1.0.0",
          duration: player.getDuration()
        }
      };

      await window.electronAPI.saveFile(JSON.stringify(exportData, null, 2));
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
    if (!player) return;
    const state = store.getState();
    const nodeIds = Object.keys(state.nodes);
    if (nodeIds.length > 0) {
      const testNodeId = nodeIds[0];
      player.addTrack({
        nodeId: testNodeId,
        property: 'rotation',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 2000, value: Math.PI * 2, easing: 'easeInOutQuad' },
          { time: 4000, value: 0, easing: 'easeInOutQuad' }
        ]
      });
      player.play();
    } else {
      player.addNode({
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
    }
  };

  const handleTogglePlay = () => {
    if (!player) return;
    if (player.getIsPlaying()) player.pause();
    else player.play();
  };

  const handleZoomIn = () => {
    // Zoom disabled in isolated runtime for now
  };

  const handleZoomOut = () => {
    // Zoom disabled in isolated runtime for now
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

        {player && <Timeline engine={player as any} store={store} />}
      </div>
    </DndProvider>
  );
}

export default App;
