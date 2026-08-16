export const OFFSET_X = 0;
export const OFFSET_Y = 1;
export const OFFSET_ROTATION = 2;
export const OFFSET_SCALE_X = 3;
export const OFFSET_SCALE_Y = 4;
export const OFFSET_SKEW_X = 5;
export const OFFSET_SKEW_Y = 6;
export const OFFSET_OPACITY = 7;
export const OFFSET_LOCAL_MATRIX = 8;
export const OFFSET_WORLD_MATRIX = 17;
export const OFFSET_DIRTY = 26;
export const NODE_STRIDE = 27;

export class NodeBuffer {
  public buffer: Float32Array;
  public capacity: number;
  public nodeCount: number;

  constructor(initialCapacity = 1000) {
    this.capacity = initialCapacity;
    this.buffer = new Float32Array(this.capacity * NODE_STRIDE);
    this.nodeCount = 0;
  }

  allocate(): number {
    if (this.nodeCount >= this.capacity) {
      this.capacity *= 2;
      const newBuffer = new Float32Array(this.capacity * NODE_STRIDE);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
    }
    const index = this.nodeCount;
    this.nodeCount++;
    return index * NODE_STRIDE;
  }
}
