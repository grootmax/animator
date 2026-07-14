self.onmessage = (e: MessageEvent) => {
  const { nodes, animations, duration } = e.data;
  
  try {
    const cleanScene: Record<string, any> = {};
    for (const [id, node] of Object.entries(nodes)) {
      const cleanNode = { ...(node as any) };
      delete cleanNode.localMatrix;
      delete cleanNode.worldMatrix;
      delete cleanNode.isDirty;
      cleanScene[id] = cleanNode;
    }

    const exportData = {
      scene: cleanScene,
      animations,
      metadata: {
        version: "1.0.0",
        duration
      }
    };

    // Serialize synchronously within the worker
    const jsonString = JSON.stringify(exportData, null, 2);

    // Chunk size: 5 million characters (approx 5MB-10MB depending on encoding)
    const chunkSize = 5 * 1024 * 1024; 
    
    let cursor = 0;
    const chunks = [];
    while (cursor < jsonString.length) {
      let end = cursor + chunkSize;
      if (end < jsonString.length) {
        const code = jsonString.charCodeAt(end - 1);
        if (code >= 0xD800 && code <= 0xDBFF) {
          end--; // Do not split surrogate pair
        }
      }
      chunks.push(jsonString.slice(cursor, end));
      cursor = end;
    }

    if (chunks.length === 0) {
      self.postMessage({ type: 'chunk', chunk: "", progress: 100 });
    } else {
      for (let i = 0; i < chunks.length; i++) {
        const progress = Math.round(((i + 1) / chunks.length) * 100);
        self.postMessage({ type: 'chunk', chunk: chunks[i], progress });
      }
    }

    self.postMessage({ type: 'done' });
  } catch (error: any) {
    self.postMessage({ type: 'error', error: error.message });
  }
};
