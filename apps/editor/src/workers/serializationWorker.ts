/// <reference lib="webworker" />

self.onmessage = (e: MessageEvent) => {
  const { state, animations, duration } = e.data;

  // Perform data cleaning by removing internal and computed properties
  const cleanScene: Record<string, any> = {};
  for (const [id, node] of Object.entries(state)) {
    delete (node as any).localMatrix;
    delete (node as any).worldMatrix;
    delete (node as any).isDirty;
    cleanScene[id] = node;
  }

  const exportData = {
    scene: cleanScene,
    animations,
    metadata: {
      version: "1.0.0",
      duration
    }
  };

  // JSON serialization of the cleaned project state
  const jsonString = JSON.stringify(exportData, null, 2);

  // Send back the final string
  self.postMessage({ jsonString });
};
