/// <reference lib="webworker" />

self.onmessage = (e: MessageEvent) => {
  const { state, animations, duration } = e.data;

  // Perform data cleaning by removing internal and computed properties
  const cleanScene: Record<string, any> = {};
  if (state && typeof state === 'object') {
    for (const [id, node] of Object.entries(state as Record<string, any>)) {
      if (node && typeof node === 'object') {
        const { localMatrix, worldMatrix, isDirty, ...cleanNode } = node;
        cleanScene[id] = cleanNode;
      }
    }
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
