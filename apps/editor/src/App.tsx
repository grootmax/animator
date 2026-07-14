import { useEffect, useRef, useState } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { AnimationEngine } from '@monorepo/animation-engine';
import { SvgParser, SvgSerializer } from '@monorepo/serialization';
import { RuntimePlayer } from '@monorepo/runtime-player';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { Timeline } from './components/Timeline';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Create singletons for the app
const store = createSceneGraphStore();
const engine = new AnimationEngine(store);
// We use the main thread engine just as a state container for the timeline UI.
// Playback and rendering will be handled by the worker via RuntimePlayer.

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

  useEffect(() => {
    if (canvasRef.current) {
      const player = new RuntimePlayer(canvasRef.current);
      (window as any).__player = player;

      // Subscribe to node count for UI
      let lastNodes = {};
      const unsubscribe = store.subscribe((state: any) => {
        setNodesCount(Object.keys(state.nodes).length);
        
        // Very basic sync for edits (in a real app, we'd use fine-grained patches)
        for (const [id, node] of Object.entries(state.nodes)) {
          if ((lastNodes as any)[id] !== node) {
             player.updateNode(id, node as any);
          }
        }
        lastNodes = { ...state.nodes };
      });

      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    let frame: number;
    const checkPlayState = () => {
      // isPlaying state is managed via React state now, but we can poll if needed
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
        nodes.forEach((node: any) => store.getState().addNode(node));
        
        const player = (window as any).__player;
        if (player) {
          player.load({
            scene: store.getState().nodes,
            animations: engine.getTracks(),
            metadata: { duration: engine.getDuration() }
          });
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
    let testNodeId = nodeIds[0];

    if (!testNodeId) {
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
      } as any);
      state.recalculateMatrices();
      testNodeId = 'test_rect';
    }
    
    engine.addTrack({
      nodeId: testNodeId,
      property: 'rotation',
      keyframes: [
        { time: 0, value: 0, easing: 'linear' },
        { time: 2000, value: Math.PI * 2, easing: 'easeInOutQuad' },
        { time: 4000, value: 0, easing: 'easeInOutQuad' }
      ]
    } as any);

    const player = (window as any).__player;
    if (player) {
      player.load({
        scene: store.getState().nodes,
        animations: engine.getTracks(),
        metadata: { duration: engine.getDuration() }
      });
      player.play();
      setIsPlaying(true);
    }
  };

  const handleTogglePlay = () => {
    const player = (window as any).__player;
    if (isPlaying) {
      if (player) player.pause();
      setIsPlaying(false);
    } else {
      if (player) player.play();
      setIsPlaying(true);
    }
  };

  const handleZoomIn = () => {
    // Zoom would need to be passed to player or we trigger a synthetic wheel event
    const player = (window as any).__player;
    if (player && player.worker) {
        // Mock a wheel zoom in
        player.worker.postMessage({
            type: 'DOM_EVENT',
            payload: {
                eventName: 'wheel',
                eventData: { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2, deltaY: -100 }
            }
        });
    }
  };

  const handleZoomOut = () => {
    const player = (window as any).__player;
    if (player && player.worker) {
        // Mock a wheel zoom out
        player.worker.postMessage({
            type: 'DOM_EVENT',
            payload: {
                eventName: 'wheel',
                eventData: { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2, deltaY: 100 }
            }
        });
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
