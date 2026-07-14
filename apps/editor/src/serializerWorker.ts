let isFirstNode = true;

self.onmessage = (e) => {
  const { type, payload } = e.data;
  
  if (type === 'start') {
    isFirstNode = true;
    let chunk = `{\n  "scene": {\n`;
    self.postMessage({ type: 'chunk', data: chunk });
  } 
  else if (type === 'nodes') {
    const { nodes } = payload;
    let chunk = '';
    
    for (const [id, node] of Object.entries(nodes)) {
      if (!isFirstNode) {
        chunk += `,\n`;
      }
      isFirstNode = false;
      
      const cleanNode = { ...node as any };
      delete cleanNode.localMatrix;
      delete cleanNode.worldMatrix;
      delete cleanNode.isDirty;
      
      const nodeStr = JSON.stringify(cleanNode, null, 2)
        .split('\n')
        .map((line, idx) => idx > 0 ? '    ' + line : line)
        .join('\n');
      chunk += `    "${id}": ${nodeStr}`;
    }
    
    if (chunk) {
      self.postMessage({ type: 'chunk', data: chunk });
    }
  } 
  else if (type === 'end') {
    const { animations, metadata } = payload;
    
    let chunk = `\n  },\n`;
    chunk += `  "animations": ` + JSON.stringify(animations, null, 2)
        .split('\n')
        .map((line, idx) => idx > 0 ? '  ' + line : line)
        .join('\n') + `,\n`;
    chunk += `  "metadata": ` + JSON.stringify(metadata, null, 2)
        .split('\n')
        .map((line, idx) => idx > 0 ? '  ' + line : line)
        .join('\n') + `\n}`;
        
    self.postMessage({ type: 'chunk', data: chunk });
    self.postMessage({ type: 'done' });
  }
};
