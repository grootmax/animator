export type SaveWorkerRequest = {
  type: 'serialize_chunk';
  id: string;
  payload: any;
};

export type SaveWorkerResponse = {
  type: 'chunk_serialized';
  id: string;
  buffer: Uint8Array;
};

self.onmessage = (e: MessageEvent<SaveWorkerRequest>) => {
  const { type, payload, id } = e.data;
  
  if (type === 'serialize_chunk') {
    // We convert the payload (array of modified nodes or metadata) into a binary format
    // A simple binary format: Length (4 bytes) + JSON string utf-8 bytes
    const jsonStr = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(jsonStr);
    
    const buffer = new Uint8Array(4 + encoded.length);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, encoded.length, true); // Little endian
    buffer.set(encoded, 4);
    
    const ctx = self as unknown as Worker;
    ctx.postMessage({ type: 'chunk_serialized', id, buffer } as SaveWorkerResponse, [buffer.buffer]);
  }
};
