import type {
  CanvasKit,
  ManagedSkottieAnimation,
  Surface,
} from "canvaskit-wasm";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getEditorCanvasKit } from "./canvaskit.js";

export interface PlayerHarnessProps {
  lottieJson: Record<string, unknown> | string;
  width?: number | undefined;
  height?: number | undefined;
  background?: string | undefined;
  autoPlay?: boolean | undefined;
}

function hexToColor4f(ck: CanvasKit, hex?: string) {
  if (!hex || !hex.startsWith("#")) return ck.Color4f(0.043, 0.063, 0.125, 1);
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length === 6) {
    const r = Number.parseInt(h.slice(0, 2), 16) / 255;
    const g = Number.parseInt(h.slice(2, 4), 16) / 255;
    const b = Number.parseInt(h.slice(4, 6), 16) / 255;
    return ck.Color4f(r, g, b, 1);
  }
  return ck.Color4f(0.043, 0.063, 0.125, 1);
}

export function PlayerHarness({
  lottieJson,
  width = 600,
  height = 400,
  background = "#0B1020",
  autoPlay = false,
}: PlayerHarnessProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ckRef = useRef<CanvasKit | null>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const animRef = useRef<ManagedSkottieAnimation | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(90);
  const [fps, setFps] = useState(30);
  const [loop, setLoop] = useState(true);

  // Render a specific frame onto the canvas
  const renderCurrentFrame = useCallback(
    (frame: number) => {
      const ck = ckRef.current;
      const surface = surfaceRef.current;
      const anim = animRef.current;

      if (!ck || !surface || !anim) return;

      const canvas = surface.getCanvas();
      canvas.clear(hexToColor4f(ck, background));
      anim.seekFrame(frame);
      anim.render(canvas, ck.LTRBRect(0, 0, width, height));
      surface.flush();
    },
    [background, width, height],
  );

  // Initialize CanvasKit once
  useEffect(() => {
    let active = true;

    async function initCK() {
      try {
        setIsLoading(true);
        const ck = await getEditorCanvasKit();
        if (!active) return;
        ckRef.current = ck;
        setIsLoading(false);
      } catch (err) {
        if (!active) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : "Failed to initialize CanvasKit WASM",
        );
        setIsLoading(false);
      }
    }

    initCK();

    return () => {
      active = false;
    };
  }, []);

  // Initialize or update Surface and Skottie Animation when CanvasKit or lottieJson changes
  useEffect(() => {
    const ck = ckRef.current;
    const canvasEl = canvasRef.current;
    if (!ck || !canvasEl || isLoading) return;

    // Dispose old surface if size changed or first creation
    if (!surfaceRef.current) {
      const surface =
        ck.MakeWebGLCanvasSurface(canvasEl) ?? ck.MakeSWCanvasSurface(canvasEl);
      if (!surface) {
        setLoadError("Failed to create CanvasKit surface on HTML canvas");
        return;
      }
      surfaceRef.current = surface;
    }

    // Dispose previous animation
    if (animRef.current) {
      animRef.current.delete();
      animRef.current = null;
    }

    try {
      const jsonStr =
        typeof lottieJson === "string"
          ? lottieJson
          : JSON.stringify(lottieJson);

      const anim = ck.MakeManagedAnimation(jsonStr);
      if (!anim) {
        setLoadError("Failed to parse Lottie JSON into Skottie animation");
        return;
      }

      animRef.current = anim;
      const animFps = anim.fps() || 30;
      const animDuration = anim.duration() || 1;
      const calculatedFrames = Math.max(1, Math.round(animFps * animDuration));

      setFps(animFps);
      setTotalFrames(calculatedFrames);
      renderCurrentFrame(currentFrame % calculatedFrames);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Error creating Skottie animation",
      );
    }
  }, [isLoading, lottieJson, currentFrame, renderCurrentFrame]);

  // Clean up resources on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (animRef.current) {
        animRef.current.delete();
        animRef.current = null;
      }
      if (surfaceRef.current) {
        surfaceRef.current.delete();
        surfaceRef.current = null;
      }
    };
  }, []);

  // Playback requestAnimationFrame loop
  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const onTick = (now: number) => {
      if (lastTimeRef.current !== null) {
        const deltaSec = (now - lastTimeRef.current) / 1000;
        const framesToAdvance = deltaSec * fps;

        setCurrentFrame((prevFrame) => {
          let nextFrame = prevFrame + framesToAdvance;
          if (nextFrame >= totalFrames) {
            if (loop) {
              nextFrame = nextFrame % totalFrames;
            } else {
              nextFrame = totalFrames - 1;
              setIsPlaying(false);
            }
          }
          renderCurrentFrame(nextFrame);
          return nextFrame;
        });
      }
      lastTimeRef.current = now;
      rafIdRef.current = requestAnimationFrame(onTick);
    };

    rafIdRef.current = requestAnimationFrame(onTick);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying, fps, totalFrames, loop, renderCurrentFrame]);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleScrub = (targetFrame: number) => {
    setIsPlaying(false);
    const clamped = Math.max(0, Math.min(targetFrame, totalFrames - 1));
    setCurrentFrame(clamped);
    renderCurrentFrame(clamped);
  };

  const handleStep = (stepDelta: number) => {
    setIsPlaying(false);
    const target = (currentFrame + stepDelta + totalFrames) % totalFrames;
    setCurrentFrame(target);
    renderCurrentFrame(target);
  };

  const displayFrame = Math.floor(currentFrame);
  const currentTime = displayFrame / fps;
  const totalDuration = totalFrames / fps;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          position: "relative",
          width,
          height,
          backgroundColor: background,
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid #2A324B",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        {isLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(11, 16, 32, 0.85)",
              color: "#FFFFFF",
              fontSize: "14px",
              zIndex: 2,
            }}
          >
            <span>Loading Skottie Engine (CanvasKit WASM)...</span>
          </div>
        )}

        {loadError && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255, 90, 95, 0.2)",
              color: "#FF5A5F",
              padding: "16px",
              fontSize: "14px",
              zIndex: 3,
            }}
          >
            <strong>Error: {loadError}</strong>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />
      </div>

      {/* Interactive Controls Bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          width,
          padding: "12px",
          backgroundColor: "#161B2E",
          borderRadius: "8px",
          border: "1px solid #2A324B",
          color: "#E2E8F0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <input
            type="range"
            aria-label="Timeline scrubber"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={displayFrame}
            onChange={(e) => handleScrub(Number(e.target.value))}
            style={{
              flex: 1,
              accentColor: "#FF5A5F",
              cursor: "pointer",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              aria-label={isPlaying ? "Pause" : "Play"}
              onClick={togglePlay}
              style={{
                backgroundColor: isPlaying ? "#4A5568" : "#FF5A5F",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "4px",
                padding: "6px 14px",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              type="button"
              aria-label="Step backward"
              onClick={() => handleStep(-1)}
              style={{
                backgroundColor: "#2D3748",
                color: "#CBD5E0",
                border: "none",
                borderRadius: "4px",
                padding: "6px 10px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              ⏮ Step -1
            </button>
            <button
              type="button"
              aria-label="Step forward"
              onClick={() => handleStep(1)}
              style={{
                backgroundColor: "#2D3748",
                color: "#CBD5E0",
                border: "none",
                borderRadius: "4px",
                padding: "6px 10px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              ⏭ Step +1
            </button>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                cursor: "pointer",
                color: "#A0AEC0",
              }}
            >
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
              />
              Loop
            </label>
          </div>

          <div
            style={{
              fontSize: "13px",
              fontVariantNumeric: "tabular-nums",
              color: "#A0AEC0",
            }}
          >
            <span>
              Frame {displayFrame} / {totalFrames}
            </span>{" "}
            <span>
              ({currentTime.toFixed(2)}s / {totalDuration.toFixed(2)}s)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
