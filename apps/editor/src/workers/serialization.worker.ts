self.onmessage = (e: MessageEvent) => {
  try {
    const { state, animations, duration } = e.data;

    // Filter out internal state (localMatrix, worldMatrix, isDirty) to create clean export
    const cleanScene: Record<string, any> = {};
    for (const [id, node] of Object.entries(state)) {
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

    const jsonString = JSON.stringify(exportData, null, 2);

    self.postMessage({ result: jsonString });
  } catch (error: any) {
    self.postMessage({ error: error.message || 'Serialization failed' });
  }
};
