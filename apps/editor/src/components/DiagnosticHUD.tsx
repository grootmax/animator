import React, { useEffect, useState, useRef } from 'react';
import { telemetry, Subsystem } from '@monorepo/telemetry';

export const DiagnosticHUD: React.FC = () => {
  const [fps, setFps] = useState(0);
  const [frameTime, setFrameTime] = useState(0);
  const [memory, setMemory] = useState<string>('N/A');
  const [metrics, setMetrics] = useState<Record<Subsystem, number>>({
    math: 0,
    rendering: 0,
    animation: 0,
    total: 0,
  });
  
  const [visible, setVisible] = useState(true);
  
  const [toggles, setToggles] = useState<Record<Subsystem, boolean>>({
    math: true,
    rendering: true,
    animation: true,
    total: true,
  });

  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const rafId = useRef<number>();

  useEffect(() => {
    // Sync toggles with telemetry framework
    telemetry.isEnabled = toggles;
  }, [toggles]);

  useEffect(() => {
    const unsubscribe = telemetry.subscribe(() => {
      // Accumulate metrics or just set them?
      // Since it fires multiple times per frame, we might want to just set it periodically.
    });
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    const loop = () => {
      const now = performance.now();
      frameCount.current++;
      
      const delta = now - lastTime.current;
      
      if (delta >= 500) { // Update every 500ms to stay lightweight (<2% budget)
        setFps(Math.round((frameCount.current * 1000) / delta));
        setFrameTime(Math.round((delta / frameCount.current) * 10) / 10);
        frameCount.current = 0;
        lastTime.current = now;
        
        // Memory
        if ((performance as any).memory) {
          const usedJSHeapSize = (performance as any).memory.usedJSHeapSize;
          setMemory(`${(usedJSHeapSize / (1024 * 1024)).toFixed(1)} MB`);
        }
        
        // Update metrics
        setMetrics(telemetry.getMeasurements());
      }
      
      rafId.current = requestAnimationFrame(loop);
    };
    
    rafId.current = requestAnimationFrame(loop);
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  if (!visible) {
    return (
      <button 
        className="fixed top-2 right-2 bg-gray-800 text-white p-2 rounded text-xs z-50"
        onClick={() => setVisible(true)}
      >
        Show HUD
      </button>
    );
  }

  return (
    <div className="fixed top-2 right-2 bg-black/80 text-green-400 p-4 rounded text-xs font-mono z-50 w-64 shadow-lg border border-gray-700 pointer-events-auto">
      <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
        <h3 className="font-bold text-white">Diagnostic HUD</h3>
        <button className="text-gray-400 hover:text-white" onClick={() => setVisible(false)}>✕</button>
      </div>
      
      <div className="space-y-1 mb-4">
        <div className="flex justify-between"><span>FPS:</span> <span>{fps}</span></div>
        <div className="flex justify-between"><span>Frame Time:</span> <span>{frameTime} ms</span></div>
        <div className="flex justify-between"><span>Memory:</span> <span>{memory}</span></div>
      </div>
      
      <div className="border-t border-gray-700 pt-2">
        <h4 className="text-white font-semibold mb-2">Subsystem Telemetry</h4>
        {(['math', 'rendering', 'animation'] as Subsystem[]).map((sys) => (
          <div key={sys} className="flex justify-between items-center space-y-1">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={toggles[sys]}
                onChange={(e) => setToggles(prev => ({ ...prev, [sys]: e.target.checked }))}
                className="rounded bg-gray-900 border-gray-600"
              />
              <span className="capitalize">{sys}</span>
            </label>
            <span>{toggles[sys] ? `${metrics[sys].toFixed(2)} ms` : 'OFF'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
