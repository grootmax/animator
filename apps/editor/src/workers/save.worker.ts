import { ProjectSerializer } from '@monorepo/serialization';

self.onmessage = (e) => {
  const { type, payload } = e.data;
  
  if (type === 'SAVE_PROJECT') {
    try {
      const { scene, animations, metadata } = payload;
      
      self.postMessage({ type: 'PROGRESS', payload: 10 });
      
      const cleanScene: Record<string, any> = {};
      const entries = Object.entries(scene);
      const total = entries.length;
      
      let processed = 0;
      let nextProgressUpdate = 0;
      
      for (const [id, node] of entries) {
        const cleanNode = { ...node as any };
        delete cleanNode.localMatrix;
        delete cleanNode.worldMatrix;
        delete cleanNode.isDirty;
        cleanScene[id] = cleanNode;
        
        processed++;
        const progress = 10 + Math.floor((processed / total) * 40); // 10% to 50%
        if (progress > nextProgressUpdate) {
          self.postMessage({ type: 'PROGRESS', payload: progress });
          nextProgressUpdate = progress;
        }
      }
      
      self.postMessage({ type: 'PROGRESS', payload: 50 });
      
      const exportData = {
        scene: cleanScene,
        animations,
        metadata
      };
      
      const binaryData = ProjectSerializer.serializeBinary(exportData);
      
      self.postMessage({ type: 'PROGRESS', payload: 100 });
      self.postMessage({ type: 'SAVE_COMPLETE', payload: binaryData });
      
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  }
};
