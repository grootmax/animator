import { serializeProject, SerializeProjectPayload } from '@monorepo/serialization';

self.onmessage = (e: MessageEvent<SerializeProjectPayload>) => {
  try {
    const result = serializeProject(e.data);
    self.postMessage({ success: true, result });
  } catch (error) {
    self.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
};
