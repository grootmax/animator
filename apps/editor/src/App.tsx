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
import // @ts-ignore
AnimationWorker from './workers/animation.worker?worker';

// Create singletons for the app
const store = createSceneGraphStore();

class ProxyEngine {
  private fallbackEngine: AnimationEngine;
  private worker: Worker | null = null;
  
  constructor(store: any) {
    this.fallbackEngine = new AnimationEngine(store);
  }
  
  setWorker(w: Worker) {
    this.worker = w;
  }
  
  getPlayhead() { return this.fallbackEngine.getPlayhead(); }
  getTracks() { return this.fallbackEngine.getTracks(); }
  getIsPlaying() { return this.fallbackEngine.getIsPlaying(); }
  getDuration() { return this.fallbackEngine.getDuration(); }
  setDuration(d: number) { this.fallbackEngine.setDuration(d); }
  
  addTrack(track: any) {
    this.fallbackEngine.addTrack(track);
    if (this.worker) this.worker.postMessage({ type: 'SYNC_TRACKS', payload: { tracks: this.fallbackEngine.getTracks() }});
  }
  
  play() {
    if (this.worker) this.worker.postMessage({ type: 'PLAY' });
    else this.fallbackEngine.play();
  }
  
  pause() {
    if (this.worker) this.worker.postMessage({ type: 'PAUSE' });
    else this.fallbackEngine.pause();
  }
  
  seek(time: number) {
    if (this.worker) this.worker.postMessage({ type: 'SEEK', payload: { time } });
    else this.fallbackEngine.seek(time);
  }
  
  updateState(playhead: number, isPlaying: boolean) {
    (this.fallbackEngine as any).playhead = playhead;
    (this.fallbackEngine as any).isPlaying = isPlaying;
  }
}

const engine = new ProxyEngine(store);

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [nodesCount, setNodesCount] = useState(0);
  const [tool, setTool] = useState('select');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let bridge: PixiBridge | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let isWorkerMode = false;

    if (canvasRef.current && wrapperRef.current) {
      const canvas = canvasRef.current;
      const rect = wrapperRef.current.getBoundingClientRect();
      const resolution = window.devicePixelRatio || 1;
      
      const setupWorker = () => {
        try {
          if (!('transferControlToOffscreen' in canvas)) return false;
          const offscreen = canvas.transferControlToOffscreen();
          const worker = new AnimationWorker();
          workerRef.current = worker;
          engine.setWorker(worker);
          isWorkerMode = true;
          
          worker.postMessage({
            type: 'INIT',
            payload: {
              canvas: offscreen,
              width: rect.width || 800,
              height: rect.height || 600,
              resolution,
              nodes: store.getState().nodes
            }
          }, [offscreen]);
          
          let isUpdatingFromWorker = false;
          worker.onmessage = (e: MessageEvent) => {
            if (e.data.type === 'PLAYHEAD_UPDATE') {
              engine.updateState(e.data.playhead, e.data.isPlaying);
              if (e.data.mutatedNodes) {
                isUpdatingFromWorker = true;
                const state = store.getState();
                for (const [id, node] of Object.entries(e.data.mutatedNodes)) {
                  state.updateNode(id, node as any);
                }
                state.recalculateMatrices();
                isUpdatingFromWorker = false;
              }
            }
          };
          
          // Send DOM events to worker
          const proxyEvent = (e: any) => {
            if (e.preventDefault && e.type === 'wheel') e.preventDefault();
            const { clientX, clientY, button, shiftKey, deltaY, type } = e;
            worker.postMessage({
              type: 'POINTER_EVENT',
              payload: { eventName: type, clientX, clientY, button, shiftKey, deltaY }
            });
          };
          
          const wrapper = wrapperRef.current!;
          wrapper.addEventListener('pointerdown', proxyEvent);
          wrapper.addEventListener('pointermove', proxyEvent);
          window.addEventListener('pointerup', proxyEvent);
          wrapper.addEventListener('wheel', proxyEvent, { passive: false });
          
          // Sync scene store changes
          const unsubStore = store.subscribe((state) => {
            if (isUpdatingFromWorker) return; // Prevent echoing back updates from worker
            worker.postMessage({
              type: 'SYNC_SCENE',
              payload: { nodes: state.nodes }
            });
            setNodesCount(Object.keys(state.nodes).length);
          });
          
          resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
              const { width, height } = entry.contentRect;
              worker.postMessage({ type: 'RESIZE', payload: { width, height } });
            }
          });
          resizeObserver.observe(wrapper);
          
          return () => {
            worker.terminate();
            wrapper.removeEventListener('pointerdown', proxyEvent);
            wrapper.removeEventListener('pointermove', proxyEvent);
            window.removeEventListener('pointerup', proxyEvent);
            wrapper.removeEventListener('wheel', proxyEvent);
            resizeObserver?.disconnect();
            unsubStore();
          };
        } catch (err) {
          console.error("Worker initialization failed, falling back to main thread:", err);
          return false;
        }
      };
      
      const cleanupWorker = setupWorker();
      
      if (!isWorkerMode) {
        // Fallback to main thread
        bridge = new PixiBridge({
          canvas,
          store,
          width: rect.width || 800,
          height: rect.height || 600,
          resolution
        });
        (window as any).__bridge = bridge;
        
        resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
              const { width, height } = entry.contentRect;
              bridge!.app.renderer.resize(width, height);
            }
        });
        resizeObserver.observe(wrapperRef.current!);
        
        // Pass mouse events directly to eventBus
        const proxyToEventBus = (e: any) => {
            if (e.preventDefault && e.type === 'wheel') e.preventDefault();
            const ev = new Event(e.type) as any;
            ev.clientX = e.clientX; ev.clientY = e.clientY;
            ev.button = e.button; ev.shiftKey = e.shiftKey;
            ev.deltaY = e.deltaY; ev.globalX = e.clientX; ev.globalY = e.clientY;
            bridge!.eventBus.dispatchEvent(ev);
            
            // Pixi interactions on fallback
            const syntheticEvent = new Event(e.type) as any;
            syntheticEvent.clientX = e.clientX; syntheticEvent.clientY = e.clientY;
            syntheticEvent.button = e.button; syntheticEvent.shiftKey = e.shiftKey;
            syntheticEvent.pointerId = 1; syntheticEvent.pointerType = 'mouse'; syntheticEvent.isPrimary = true;
            (bridge!.app.view as any).dispatchEvent(syntheticEvent);
        };
        
        const wrapper = wrapperRef.current!;
        wrapper.addEventListener('pointerdown', proxyToEventBus);
        wrapper.addEventListener('pointermove', proxyToEventBus);
        window.addEventListener('pointerup', proxyToEventBus);
        wrapper.addEventListener('wheel', proxyToEventBus, { passive: false });
        
        const unsub = store.subscribe((state) => {
          setNodesCount(Object.keys(state.nodes).length);
        });
        
        return () => {
          resizeObserver?.disconnect();
          unsub();
          wrapper.removeEventListener('pointerdown', proxyToEventBus);
          wrapper.removeEventListener('pointermove', proxyToEventBus);
          window.removeEventListener('pointerup', proxyToEventBus);
          wrapper.removeEventListener('wheel', proxyToEventBus);
        };
      }
      
      return cleanupWorker as () => void;
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
    
    if (nodeIds.length === 0) {
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
    
    // Now get the first node
    const firstNodeId = Object.keys(state.nodes)[0];
    
    engine.addTrack({
      nodeId: firstNodeId,
      property: 'rotation',
      keyframes: [
        { time: 0, value: 0, easing: 'linear' },
        { time: 2000, value: Math.PI * 2, easing: 'easeInOutQuad' },
        { time: 4000, value: 0, easing: 'easeInOutQuad' }
      ]
    });
    engine.play();
  };

  const handleTogglePlay = () => {
    if (engine.getIsPlaying()) engine.pause();
    else engine.play();
  };

  const handleZoomIn = () => {
    const ev = new Event('wheel') as any;
    ev.clientX = window.innerWidth / 2;
    ev.clientY = window.innerHeight / 2;
    ev.deltaY = -500;
    if (workerRef.current) {
        workerRef.current.postMessage({
            type: 'POINTER_EVENT',
            payload: { eventName: 'wheel', clientX: ev.clientX, clientY: ev.clientY, deltaY: ev.deltaY }
        });
    } else {
        const bridge = (window as any).__bridge;
        if (bridge) bridge.eventBus.dispatchEvent(ev);
    }
  };

  const handleZoomOut = () => {
    const ev = new Event('wheel') as any;
    ev.clientX = window.innerWidth / 2;
    ev.clientY = window.innerHeight / 2;
    ev.deltaY = 500;
    if (workerRef.current) {
        workerRef.current.postMessage({
            type: 'POINTER_EVENT',
            payload: { eventName: 'wheel', clientX: ev.clientX, clientY: ev.clientY, deltaY: ev.deltaY }
        });
    } else {
        const bridge = (window as any).__bridge;
        if (bridge) bridge.eventBus.dispatchEvent(ev);
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

          <div ref={wrapperRef} className="flex-1 relative bg-[#1a1a1a]">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            <button
               className="absolute top-4 right-4 bg-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-500 shadow"
               onClick={handleTestAnimation}
            >
              Add Test Anim
            </button>
          </div>
        </div>

        <Timeline engine={engine as unknown as AnimationEngine} store={store} />
      </div>
    </DndProvider>
  );
}

export default App;
