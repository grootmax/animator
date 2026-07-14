export async function* generateSerializedProject(
  nodes: Record<string, any>, 
  animations: any, 
  metadata: any
): AsyncGenerator<{ chunk: string, progress: number }> {
  yield { chunk: `{\n  "scene": {\n`, progress: 0 };
  
  const entries = Object.entries(nodes);
  const total = entries.length;
  let batch: string[] = [];
  let startTime = performance.now();
  let firstBatch = true;
  
  for (let i = 0; i < total; i++) {
    const [id, node] = entries[i];
    
    // Clean node
    const cleanNode: any = {};
    for (const key in node) {
        if (key !== 'localMatrix' && key !== 'worldMatrix' && key !== 'isDirty') {
            cleanNode[key] = node[key];
        }
    }
    
    batch.push(`    "${id}": ${JSON.stringify(cleanNode)}`);
    
    // Yield to the event loop frequently to stay well under 16ms
    if (performance.now() - startTime > 10) {
      const joined = batch.join(',\n');
      const chunk = firstBatch ? joined : ',\n' + joined;
      firstBatch = false;
      
      yield { chunk, progress: i / total };
      
      batch = [];
      await new Promise(resolve => setTimeout(resolve, 0)); // yield to event loop
      startTime = performance.now();
    }
  }
  
  if (batch.length > 0) {
    const joined = batch.join(',\n');
    const chunk = firstBatch ? joined : ',\n' + joined;
    yield { chunk, progress: 1 };
  }
  
  const tail = `\n  },\n  "animations": ${JSON.stringify(animations, null, 2)},\n  "metadata": ${JSON.stringify(metadata, null, 2)}\n}`;
  yield { chunk: tail, progress: 1 };
}
