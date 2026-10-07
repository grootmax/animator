export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface RectBounds {
  left: number;
  top: number;
}

/**
 * Converts screen event coordinates (clientX, clientY) into canvas world coordinates
 * taking into account the canvas container's bounding client rect and the viewport pan/zoom state.
 */
export function getCanvasRelativeCoords(
  clientX: number,
  clientY: number,
  containerRect: RectBounds,
  viewport?: ViewportTransform
): { x: number; y: number } {
  const canvasX = clientX - containerRect.left;
  const canvasY = clientY - containerRect.top;
  const vpX = viewport?.x ?? 0;
  const vpY = viewport?.y ?? 0;
  const zoom = viewport?.zoom && viewport.zoom !== 0 ? viewport.zoom : 1;

  return {
    x: (canvasX - vpX) / zoom,
    y: (canvasY - vpY) / zoom,
  };
}
