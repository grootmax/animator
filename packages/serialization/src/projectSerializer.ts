export interface SerializeProjectPayload {
  scene: Record<string, any>;
  animations: any[];
  metadata: {
    version: string;
    duration: number;
  };
}

export function serializeProject(payload: SerializeProjectPayload): string {
  const cleanScene: Record<string, any> = {};
  for (const [id, node] of Object.entries(payload.scene)) {
    const cleanNode = { ...node };
    delete cleanNode.localMatrix;
    delete cleanNode.worldMatrix;
    delete cleanNode.isDirty;
    cleanScene[id] = cleanNode;
  }

  const exportData = {
    scene: cleanScene,
    animations: payload.animations,
    metadata: payload.metadata
  };

  return JSON.stringify(exportData, null, 2);
}
