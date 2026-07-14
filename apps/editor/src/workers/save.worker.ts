export type ValidationCheck = (node: any) => boolean;

const validateNode: ValidationCheck = (node) => {
  if (typeof node.id !== 'string' || node.id === '') return false;
  if (!node.type) return false;
  if (node.parentId !== null && typeof node.parentId !== 'string') return false;
  if (!Array.isArray(node.children) || !node.children.every((c: any) => typeof c === 'string')) return false;

  const numberProps = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'];
  for (const prop of numberProps) {
    if (node[prop] !== undefined) {
      if (typeof node[prop] !== 'number' || Number.isNaN(node[prop])) return false;
    }
  }

  const boolProps = ['visible', 'locked'];
  for (const prop of boolProps) {
    if (node[prop] !== undefined) {
      if (typeof node[prop] !== 'boolean') return false;
    }
  }

  return true;
};

const validateAnimation = (anim: any) => {
  if (typeof anim.nodeId !== 'string') return false;
  if (typeof anim.property !== 'string') return false;
  if (!Array.isArray(anim.keyframes)) return false;
  return true;
};

self.onmessage = (e) => {
  const { nodes, animations, duration } = e.data;

  try {
    const nodeEntries = Object.entries(nodes);
    const totalNodes = nodeEntries.length;
    let processedNodes = 0;

    self.postMessage({ type: 'chunk', chunk: `{\n  "scene": {`, progress: 0 });

    const CHUNK_SIZE = 500;

    for (let i = 0; i < totalNodes; i += CHUNK_SIZE) {
      const batch = nodeEntries.slice(i, i + CHUNK_SIZE);
      let chunkStr = "";

      for (let j = 0; j < batch.length; j++) {
        const [id, node] = batch[j];

        const cleanNode = { ...(node as any) };
        delete cleanNode.localMatrix;
        delete cleanNode.worldMatrix;
        delete cleanNode.isDirty;

        if (!validateNode(cleanNode)) {
          throw new Error(`Invalid node structure for node id: ${id}`);
        }

        const nodeJson = JSON.stringify(cleanNode, null, 2)
          .split('\n')
          .map((line, idx) => (idx === 0 ? line : `    ${line}`))
          .join('\n');
        
        const isLastNode = (i + j) === totalNodes - 1;
        chunkStr += `\n    "${id}": ${nodeJson}${isLastNode ? '' : ','}`;
      }

      processedNodes += batch.length;
      self.postMessage({ type: 'chunk', chunk: chunkStr, progress: (processedNodes / totalNodes) * 50 });
    }

    let animationsChunk = `\n  },\n  "animations": [`;
    if (animations.length > 0) {
      animationsChunk += `\n`;
    }

    for (let i = 0; i < animations.length; i++) {
      const anim = animations[i];
      if (!validateAnimation(anim)) {
        throw new Error(`Invalid animation structure`);
      }

      const animJson = JSON.stringify(anim, null, 2)
        .split('\n')
        .map(line => `    ${line}`)
        .join('\n');
      
      const isLastAnim = i === animations.length - 1;
      animationsChunk += `${animJson}${isLastAnim ? '' : ','}\n`;
    }

    animationsChunk += `  ],\n  "metadata": {\n    "version": "1.0.0",\n    "duration": ${duration}\n  }\n}`;
    self.postMessage({ type: 'chunk', chunk: animationsChunk, progress: 100 });

    self.postMessage({ type: 'complete' });
  } catch (error: any) {
    self.postMessage({ type: 'error', error: error.message });
  }
};
