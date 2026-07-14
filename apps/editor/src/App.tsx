import { useEffect, useRef, useState } from 'react';
import { RuntimePlayer } from '@monorepo/runtime-player';
import { SvgParser, SvgSerializer } from '@monorepo/serialization';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { Timeline } from './components/Timeline';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [player, setPlayer] = useState<RuntimePlayer | null>(null);

  // We need to keep a store ref since other components use it directly
  const store = player?.getStore();
  const engine = player?.engine;

  useEffect(() => {
    if (canvasRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newPlayer = new RuntimePlayer({
        canvas: canvasRef.current,
        width: rect.width,
        height: rect.height,
        resolution: window.devicePixelRatio || 1,
      });
      
      setPlayer(newPlayer);
      
      const unsubscribe = newPlayer.getStore().subscribe((state) => {
        setNodesCount(Object.keys(state.nodes).length);
      });

      const onResize = () => {
        if (containerRef.current) {
          const newRect = containerRef.current.getBoundingClientRect();
          newPlayer.resize(newRect.width, newRect.height, window.devicePixelRatio || 1);
        }
      };
      
      window.addEventListener('resize', onResize);

      return () => {
        unsubscribe();
        window.removeEventListener('resize', onResize);
        newPlayer.destroy();
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

  const handleImportSvg = async () => {
    if (window.electronAPI && store) {
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
    if (window.electronAPI && store && player) {
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
    if (window.electronAPI && store) {
      const state = store.getState().nodes;
      const serializer = new SvgSerializer();
      const svgString = serializer.serialize(state);
      await window.electronAPI.saveFile(svgString);
    } else {
      alert("Electron API not available");
    }
  };

  const handleTestAnimation = () => {
    if (!player || !store) return;
    const state = store.getState();
    const nodeIds = Object.keys(state.nodes);
    if (nodeIds.length > 0) {
      const testNodeId = nodeIds[0];
      player.setTracks([...player.getTracks(), {
        nodeId: testNodeId,
        property: 'rotation',
        keyframes: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 2000, value: Math.PI * 2, easing: 'easeInOutQuad' },
          { time: 4000, value: 0, easing: 'easeInOutQuad' }
        ]
      }]);
      player.play();
    } else {
      state.addNode({
        id: 'test_rect',
        type: 'rect',
        parentId: null,
        children: [],
        x: window.innerWidth / 2, // OK in app code, not engine code
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
    if (!player) return;
    if (player.getIsPlaying()) player.pause();
    else player.play();
  };

  const handleZoomIn = () => {
    if (player) {
      player.renderer.viewport.container.scale.x *= 1.2;
      player.renderer.viewport.container.scale.y *= 1.2;
      player.renderer.viewport.drawGrid();
    }
  };

  const handleZoomOut = () => {
    if (player) {
      player.renderer.viewport.container.scale.x /= 1.2;
      player.renderer.viewport.container.scale.y /= 1.2;
      player.renderer.viewport.drawGrid();
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
          {store && <LayerPanel store={store} nodesCount={nodesCount} />}

          <div 
            ref={containerRef} 
            className="flex-1 relative bg-[#1a1a1a]"
            onPointerDown={(e) => player?.emitPointerDown(e.nativeEvent)}
            onPointerMove={(e) => player?.emitPointerMove(e.nativeEvent)}
            onPointerUp={(e) => player?.emitPointerUp(e.nativeEvent)}
            onPointerLeave={(e) => player?.emitPointerUp(e.nativeEvent)}
            onWheel={(e) => player?.emitWheel(e.nativeEvent)}
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

        {engine && store && <Timeline engine={engine} store={store} />}
      </div>
    </DndProvider>
  );
}

export default App;
