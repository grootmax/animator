import type { AnimationEngine, MotionState } from "@animator/core";
import type React from "react";
import { useEffect, useState } from "react";

export interface TimelineProps {
  engine: AnimationEngine;
  onScrub?: (time: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ engine, onScrub }) => {
  const [state, setState] = useState<MotionState>(() => engine.getState());

  useEffect(() => {
    // Reactively subscribe to store updates from AnimationEngine
    // No independent requestAnimationFrame loop is used
    const unsubscribe = engine.subscribe((newState: MotionState) => {
      setState(newState);
    });

    return () => {
      unsubscribe();
    };
  }, [engine]);

  const duration = state.doc.canvas?.duration || 10;
  const playhead = state.playhead;
  const isPlaying = state.isPlaying;

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number.parseFloat(e.target.value);
    engine.seek(time);
    if (onScrub) {
      onScrub(time);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
  };

  return (
    <div className="timeline-container" data-testid="timeline">
      <div className="timeline-controls">
        <button
          type="button"
          onClick={togglePlayPause}
          data-testid="play-pause-btn"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span data-testid="time-display">
          {playhead.toFixed(2)}s / {duration.toFixed(2)}s
        </span>
      </div>
      <div className="timeline-scrubber">
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={playhead}
          onChange={handleScrub}
          data-testid="timeline-slider"
        />
      </div>
    </div>
  );
};
