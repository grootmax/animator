import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCanvasRelativeCoords } from './dropCoordinates';

describe('getCanvasRelativeCoords', () => {
  it('should correctly convert screen coords to canvas coords at default viewport', () => {
    const containerRect = { left: 200, top: 100 };
    const viewport = { x: 0, y: 0, zoom: 1 };
    
    // Dropping at client (250, 150) -> canvas relative (50, 50)
    const result = getCanvasRelativeCoords(250, 150, containerRect, viewport);
    assert.deepEqual(result, { x: 50, y: 50 });
  });

  it('should handle viewport panning (offset)', () => {
    const containerRect = { left: 200, top: 100 };
    const viewport = { x: 50, y: 20, zoom: 1 };
    
    // Canvas relative (50, 50), with viewport pan (50, 20) -> world (0, 30)
    const result = getCanvasRelativeCoords(250, 150, containerRect, viewport);
    assert.deepEqual(result, { x: 0, y: 30 });
  });

  it('should handle viewport zoom', () => {
    const containerRect = { left: 200, top: 100 };
    const viewport = { x: 0, y: 0, zoom: 2 };
    
    // Canvas relative (100, 100), with 2x zoom -> world (50, 50)
    const result = getCanvasRelativeCoords(300, 200, containerRect, viewport);
    assert.deepEqual(result, { x: 50, y: 50 });
  });

  it('should handle combined panning, zooming, and container offsets', () => {
    const containerRect = { left: 250, top: 60 };
    const viewport = { x: 100, y: 50, zoom: 0.5 };
    
    // Client (450, 260) -> Canvas relative (200, 200) -> world ((200 - 100) / 0.5, (200 - 50) / 0.5) = (200, 300)
    const result = getCanvasRelativeCoords(450, 260, containerRect, viewport);
    assert.deepEqual(result, { x: 200, y: 300 });
  });

  it('should default missing viewport gracefully', () => {
    const containerRect = { left: 100, top: 100 };
    const result = getCanvasRelativeCoords(150, 150, containerRect, undefined);
    assert.deepEqual(result, { x: 50, y: 50 });
  });
});
