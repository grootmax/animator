export type SaveWorkerPayload = {
  nodes: Record<string, any>;
  tracks: any[];
  duration: number;
};

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'SAVE_PROJECT') {
    try {
      const { nodes, tracks, duration } = payload as SaveWorkerPayload;

      // Clean the nodes by removing transient state
      const cleanScene: Record<string, any> = {};
      for (const [id, node] of Object.entries(nodes)) {
        const cleanNode = { ...node };
        delete (cleanNode as any).localMatrix;
        delete (cleanNode as any).worldMatrix;
        delete (cleanNode as any).isDirty;
        cleanScene[id] = cleanNode;
      }

      const exportData = {
        scene: cleanScene,
        animations: tracks,
        metadata: {
          version: '1.0.0',
          duration: duration
        }
      };

      // Perform stringification on the worker thread
      const serializedData = JSON.stringify(exportData, null, 2);

      self.postMessage({ type: 'SAVE_SUCCESS', payload: serializedData });
    } catch (error) {
      self.postMessage({ type: 'SAVE_ERROR', payload: error instanceof Error ? error.message : String(error) });
    }
  }
};
