import type { EaseName } from "./types.js";

export interface CubicBezierHandles {
  o: { x: [number]; y: [number] };
  i: { x: [number]; y: [number] };
}

export function getBezierEasingHandles(
  ease?: EaseName | [number, number, number, number] | "hold",
): CubicBezierHandles {
  let coords: [number, number, number, number] = [0.17, 0.17, 0.83, 0.83];

  if (Array.isArray(ease) && ease.length === 4) {
    coords = ease;
  } else if (typeof ease === "string") {
    switch (ease) {
      case "linear":
        coords = [0.17, 0.17, 0.83, 0.83];
        break;
      case "easeIn":
      case "easeInQuad":
        coords = [0.42, 0, 1, 1];
        break;
      case "easeOut":
      case "easeOutQuad":
        coords = [0, 0, 0.58, 1];
        break;
      case "easeInOut":
      case "easeInOutQuad":
        coords = [0.42, 0, 0.58, 1];
        break;
      case "easeInCubic":
        coords = [0.32, 0, 0.67, 0];
        break;
      case "easeOutCubic":
        coords = [0.33, 1, 0.68, 1];
        break;
      case "easeInOutCubic":
        coords = [0.65, 0, 0.35, 1];
        break;
      case "easeInQuart":
        coords = [0.5, 0, 0.75, 0];
        break;
      case "easeOutQuart":
        coords = [0.25, 1, 0.5, 1];
        break;
      case "easeInOutQuart":
        coords = [0.76, 0, 0.24, 1];
        break;
      case "easeInExpo":
        coords = [0.7, 0, 0.84, 0];
        break;
      case "easeOutExpo":
        coords = [0.16, 1, 0.3, 1];
        break;
      case "easeInOutExpo":
        coords = [0.87, 0, 0.13, 1];
        break;
      case "easeOutBack":
        coords = [0.34, 1.56, 0.64, 1];
        break;
      default:
        coords = [0.17, 0.17, 0.83, 0.83];
        break;
    }
  }

  const [x1, y1, x2, y2] = coords;
  return {
    o: { x: [x1], y: [y1] },
    i: { x: [x2], y: [y2] },
  };
}
