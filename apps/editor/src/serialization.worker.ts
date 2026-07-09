self.onmessage = (e) => {
  try {
    const { state, animations, duration } = e.data;

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
      animations: animations,
      metadata: {
        version: "1.0.0",
        duration: duration
      }
    };

    const result = JSON.stringify(exportData, null, 2);
    self.postMessage({ type: 'SUCCESS', result });
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
