self.onmessage = (e: MessageEvent) => {
  try {
    const { nodes, animations, metadata } = e.data;

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
      metadata
    };

    const jsonString = JSON.stringify(exportData, null, 2);

    self.postMessage({ success: true, data: jsonString });
  } catch (error) {
    self.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
};
