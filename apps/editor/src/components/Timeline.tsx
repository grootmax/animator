import React, { useState, useEffect, useRef } from 'react';
import { AnimationEngine, Track } from '@monorepo/animation-engine';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { Play, Pause, SkipBack } from 'lucide-react';

interface TimelineProps {
  engine: AnimationEngine;
  store: ReturnType<typeof createSceneGraphStore>;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (time: number) => void;
  isPlayingProp?: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({ engine, store, onPlay, onPause, onSeek, isPlayingProp }) => {
  const [, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const duration = engine.getDuration();
  const tracks = engine.getTracks();
  const state = store.getState();

  const rulerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [clientHeight, setClientHeight] = useState(0);

  useEffect(() => {
    setIsPlaying(!!isPlayingProp);
  }, [isPlayingProp]);

  useEffect(() => {
    let frame: number;
    let lastTime = performance.now();
    
    const update = () => {
      const now = performance.now();
      const dt = now - lastTime;
      lastTime = now;
      
      let currentPlayhead = 0;
      if (isPlayingProp && !isScrubbing) {
        setPlayhead(p => {
          let next = p + dt;
          if (next > duration) next = engine.loop ? (next % duration) : duration;
          currentPlayhead = next;
          return next;
        });
      } else {
        currentPlayhead = engine.getPlayhead();
        setPlayhead(currentPlayhead);
      }

      if (playheadRef.current) {
        playheadRef.current.style.left = `${(currentPlayhead / duration) * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${(currentPlayhead / 1000).toFixed(2)}s`;
      }

      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, isPlayingProp, isScrubbing, duration]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll);
    setScrollTop(container.scrollTop);
    setClientHeight(container.clientHeight);

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setClientHeight(entry.contentRect.height);
      }
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const togglePlay = () => {
    if (isPlayingProp) {
        if (onPause) onPause();
    } else {
        if (onPlay) onPlay();
    }
  };

  const handleSeek = (e: React.MouseEvent | PointerEvent) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const time = (x / rect.width) * duration;
    engine.seek(time);

    setPlayhead(time);
    if (playheadRef.current) {
      playheadRef.current.style.left = `${(time / duration) * 100}%`;
    }
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = `${(time / 1000).toFixed(2)}s`;
    }
    if (onSeek) onSeek(time);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsScrubbing(true);
    handleSeek(e);
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isScrubbing) {
         if (!rulerRef.current) return;
         const rect = rulerRef.current.getBoundingClientRect();
         const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
         const time = (x / rect.width) * duration;
         engine.seek(time);
         
         setPlayhead(time);
         if (playheadRef.current) {
           playheadRef.current.style.left = `${(time / duration) * 100}%`;
         }
         if (timeDisplayRef.current) {
           timeDisplayRef.current.textContent = `${(time / 1000).toFixed(2)}s`;
         }
         if (onSeek) onSeek(time);
      }
    };
    const handlePointerUp = () => setIsScrubbing(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isScrubbing, duration, engine]);

  // Group tracks by node
  const tracksByNode: Record<string, Track[]> = {};
  tracks.forEach(t => {
    if (!tracksByNode[t.nodeId]) tracksByNode[t.nodeId] = [];
    tracksByNode[t.nodeId].push(t);
  });

  // Calculate rows for virtualization
  const rows: Array<{ nodeId: string; nodeTracks: Track[]; top: number; height: number }> = [];
  let currentTop = 0;
  const entries = Object.entries(tracksByNode);
  for (const [nodeId, nodeTracks] of entries) {
    const height = nodeTracks.length * 32;
    rows.push({
      nodeId,
      nodeTracks,
      top: currentTop,
      height,
    });
    currentTop += height;
  }
  const totalHeight = currentTop;

  // Filter visible rows
  const BUFFER = 256;
  const visibleRows = rows.filter(row => {
    const bottom = row.top + row.height;
    return bottom >= scrollTop - BUFFER && row.top <= scrollTop + clientHeight + BUFFER;
  });

  return (
    <div className="h-64 bg-gray-800 border-t border-gray-700 flex flex-col text-sm text-gray-300 select-none">
      <div className="flex border-b border-gray-700 bg-gray-900 p-1">
        <div className="w-64 border-r border-gray-700 flex items-center px-2 gap-2">
           <button className="p-1 hover:text-white" onClick={() => { engine.seek(0); if (onSeek) onSeek(0); }} title="Reset">
              <SkipBack size={16} />
           </button>
           <button className="p-1 hover:text-white" onClick={togglePlay}>
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
           </button>
           <span className="font-mono text-xs ml-auto" ref={timeDisplayRef}>{(engine.getPlayhead()/1000).toFixed(2)}s</span>
        </div>
        <div className="flex-1 relative cursor-pointer" ref={rulerRef} onPointerDown={handlePointerDown}>
           {/* Timeline Ruler */}
           <div className="absolute inset-0 border-b border-gray-600 opacity-50">
              {Array.from({length: 11}).map((_, i) => (
                <div key={i} className="absolute top-0 bottom-0 border-l border-gray-500 text-[10px] pl-1" style={{ left: `${(i/10)*100}%` }}>
                  {((duration/1000) * (i/10)).toFixed(1)}s
                </div>
              ))}
           </div>
           {/* Playhead */}
           <div className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-10 pointer-events-none" ref={playheadRef} style={{ left: `${(engine.getPlayhead()/duration)*100}%` }}>
             <div className="w-3 h-3 bg-red-500 -ml-[5px] rotate-45 transform -translate-y-1/2"></div>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col" ref={scrollContainerRef}>
         <div style={{ position: 'relative', height: totalHeight }}>
           {visibleRows.map((row) => {
              const { nodeId, nodeTracks, top, height } = row;
              const node = state.nodes[nodeId];
              return (
                <div key={nodeId} style={{ position: 'absolute', top: top, left: 0, right: 0, height: height }} className="flex border-b border-gray-700 bg-gray-800">
                   <div className="w-64 border-r border-gray-700 px-2 py-1 font-semibold truncate bg-gray-800 z-10" style={{ height: height }}>
                      {node ? node.name : nodeId}
                   </div>
                   <div className="flex-1 relative">
                      {nodeTracks.map((track, i) => (
                         <div key={i} className="absolute left-0 right-0 h-8 flex items-center" style={{ top: i * 32 }}>
                            {/* We don't render a visual label here, just the keyframes */}
                            <div className="absolute left-0 -ml-60 text-xs text-gray-500 pointer-events-none">{track.property}</div>
                            {(Array.isArray(track.keyframes) ? track.keyframes : Object.values(track.keyframes || {})).map((kf: any, j: number) => (
                              <div key={j} className="absolute w-3 h-3 bg-blue-500 rotate-45 rounded-sm transform -translate-x-1/2 cursor-pointer hover:bg-blue-400 hover:scale-125 transition-transform" style={{ left: `${(kf.time/duration)*100}%` }} title={`${track.property}: ${kf.value}`}></div>
                            ))}
                         </div>
                      ))}
                   </div>
                </div>
              );
           })}
         </div>
         {tracks.length === 0 && (
           <div className="p-4 text-center text-gray-500">No animations yet. Add a track to begin.</div>
         )}
      </div>
    </div>
  );
};
