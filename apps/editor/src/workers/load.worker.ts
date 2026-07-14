class AsyncBufferReader {
  private chunks: Uint8Array[] = [];
  private offset = 0;
  private totalAvailable = 0;
  private waiters: Array<{ resolve: () => void, target: number }> = [];
  private isDone = false;

  push(chunk: Uint8Array) {
    this.chunks.push(chunk);
    this.totalAvailable += chunk.length;
    this.checkWaiters();
  }

  setDone() {
    this.isDone = true;
    this.checkWaiters();
  }

  private checkWaiters() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters[0];
      if (this.totalAvailable >= waiter.target || this.isDone) {
        this.waiters.shift();
        waiter.resolve();
      } else {
        break;
      }
    }
  }

  async ensure(length: number) {
    if (this.totalAvailable >= length) return;
    if (this.isDone) throw new Error("Unexpected end of file");
    return new Promise<void>(resolve => {
      this.waiters.push({ resolve, target: length });
    });
  }

  async read(length: number): Promise<Uint8Array> {
    await this.ensure(length);
    if (this.totalAvailable < length) throw new Error("Unexpected end of file");

    const result = new Uint8Array(length);
    let resultOffset = 0;
    while (resultOffset < length) {
      const chunk = this.chunks[0];
      const remainingChunk = chunk.length - this.offset;
      const needed = length - resultOffset;
      if (remainingChunk <= needed) {
        result.set(chunk.subarray(this.offset), resultOffset);
        resultOffset += remainingChunk;
        this.chunks.shift();
        this.offset = 0;
      } else {
        result.set(chunk.subarray(this.offset, this.offset + needed), resultOffset);
        resultOffset += needed;
        this.offset += needed;
      }
    }
    this.totalAvailable -= length;
    return result;
  }

  async readUint32(): Promise<number> {
    const bytes = await this.read(4);
    return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
  }

  async readString(): Promise<string> {
    const len = await this.readUint32();
    const bytes = await this.read(len);
    return new TextDecoder().decode(bytes);
  }
}

const reader = new AsyncBufferReader();

self.onmessage = (e) => {
  const { type } = e.data;
  if (type === 'chunk') {
    reader.push(e.data.data);
  } else if (type === 'done') {
    reader.setDone();
  } else if (type === 'start') {
    parseFile();
  }
};

async function parseFile() {
  try {
    const magicBytes = await reader.read(4);
    const magic = new TextDecoder().decode(magicBytes);
    if (magic !== 'BSPF') {
      throw new Error("Invalid magic bytes. Not a BSPF project.");
    }

    const version = await reader.readUint32();
    if (version !== 1) {
      throw new Error(`Unsupported BSPF version: ${version}`);
    }

    const metadataStr = await reader.readString();
    const metadata = JSON.parse(metadataStr);

    const animationsStr = await reader.readString();
    const animations = JSON.parse(animationsStr);

    const nodesCount = await reader.readUint32();
    const scene: Record<string, any> = {};

    for (let i = 0; i < nodesCount; i++) {
      const id = await reader.readString();
      const nodeStr = await reader.readString();
      scene[id] = JSON.parse(nodeStr);
      
      // Optional: Report progress back if large
      if (i % 10000 === 0 && i > 0) {
        self.postMessage({ type: 'progress', progress: i / nodesCount });
      }
    }

    self.postMessage({ type: 'success', payload: { scene, animations, metadata } });
  } catch (error: any) {
    self.postMessage({ type: 'error', error: error.message });
  }
}
