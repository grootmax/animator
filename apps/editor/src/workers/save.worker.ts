const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

let chunkBuffer = new Uint8Array(CHUNK_SIZE);
let chunkOffset = 0;

function flushChunk() {
  if (chunkOffset > 0) {
    const chunk = chunkBuffer.subarray(0, chunkOffset);
    // Copy the slice so we don't transfer the whole 5MB if we don't need to,
    // actually, we can just transfer a newly created ArrayBuffer from the slice.
    const transferBuffer = chunk.slice().buffer;
    self.postMessage({ type: 'chunk', data: new Uint8Array(transferBuffer) }, { transfer: [transferBuffer] });
    chunkBuffer = new Uint8Array(CHUNK_SIZE);
    chunkOffset = 0;
  }
}

function writeData(data: Uint8Array) {
  let dataOffset = 0;
  while (dataOffset < data.length) {
    const space = CHUNK_SIZE - chunkOffset;
    const writeLen = Math.min(space, data.length - dataOffset);
    chunkBuffer.set(data.subarray(dataOffset, dataOffset + writeLen), chunkOffset);
    chunkOffset += writeLen;
    dataOffset += writeLen;

    if (chunkOffset === CHUNK_SIZE) {
      flushChunk();
    }
  }
}

function writeUint32(val: number) {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, val, true); // little-endian
  writeData(buf);
}

function writeString(str: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  writeUint32(bytes.length);
  writeData(bytes);
}

self.onmessage = async (e) => {
  const { action } = e.data;
  
  if (action === 'save') {
    const { scene, animations, metadata } = e.data.payload;
    
    chunkBuffer = new Uint8Array(CHUNK_SIZE);
    chunkOffset = 0;

    const encoder = new TextEncoder();

    // 1. Magic
    writeData(encoder.encode('BSPF'));
    
    // 2. Version
    writeUint32(1);

    // 3. Metadata
    writeString(JSON.stringify(metadata || {}));

    // 4. Animations
    writeString(JSON.stringify(animations || []));

    // 5. Nodes Count
    const nodeIds = Object.keys(scene);
    writeUint32(nodeIds.length);

    // 6. Nodes
    for (const id of nodeIds) {
      const node = scene[id];
      // strip runtime properties
      const cleanNode = { ...node };
      delete cleanNode.localMatrix;
      delete cleanNode.worldMatrix;
      delete cleanNode.isDirty;

      writeString(id);
      writeString(JSON.stringify(cleanNode));
    }

    // flush remaining
    flushChunk();

    self.postMessage({ type: 'done' });
  }
};
