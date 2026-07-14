import { ProjectSerializer } from '@monorepo/serialization';

self.onmessage = (e) => {
  const { type, payload } = e.data;
  
  if (type === 'LOAD_PROJECT') {
    try {
      const buffer = payload;
      self.postMessage({ type: 'PROGRESS', payload: 10 });
      
      const data = ProjectSerializer.deserialize(buffer);
      
      self.postMessage({ type: 'PROGRESS', payload: 100 });
      self.postMessage({ type: 'LOAD_COMPLETE', payload: data });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  }
};
