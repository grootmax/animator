import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as PIXI from 'pixi.js';
import { Viewport } from '../viewport';

vi.mock('pixi.js', () => {
  return {
    Container: vi.fn().mockImplementation(function() {
      return {
        scale: { x: 1, y: 1 },
        x: 0,
        y: 0,
        toLocal: vi.fn((pt) => ({ x: pt.x, y: pt.y }))
      };
    }),
    Graphics: vi.fn().mockImplementation(function() {
      return {
        clear: vi.fn(),
        lineStyle: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn()
      };
    }),
    Point: vi.fn().mockImplementation(function(x, y) {
      return { x, y };
    })
  };
});

describe('Viewport', () => {
  let mockApp: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = {
      stage: {
        addChild: vi.fn()
      },
      view: {
        addEventListener: vi.fn()
      }
    };
    // mock window properties
    global.window = {
      innerWidth: 800,
      innerHeight: 600,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as any;
  });

  it('should initialize and add container and grid to stage', () => {
    const viewport = new Viewport(mockApp as any);
    expect(mockApp.stage.addChild).toHaveBeenCalledTimes(2);
    expect(mockApp.view.addEventListener).toHaveBeenCalled();
  });
});
