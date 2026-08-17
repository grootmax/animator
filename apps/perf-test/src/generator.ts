import { ExportedProject } from '@monorepo/runtime-player';

export function generate100kProject(): ExportedProject {
  const scene: Record<string, any> = {};
  const animations: any[] = [];
  
  // Create root node
  scene['root'] = {
    id: 'root',
    type: 'container',
    parentId: null,
    children: [],
    x: 400,
    y: 300
  };

  const GROUP_COUNT = 10;
  const SUBGROUP_COUNT = 10;
  const LEAF_COUNT = 1000;
  // Total: 1 (root) + 10 (groups) + 100 (subgroups) + 100,000 (leaves) = 100,111 nodes

  let nodeIdCounter = 1;
  const genId = () => `node_${nodeIdCounter++}`;

  for (let i = 0; i < GROUP_COUNT; i++) {
    const groupId = genId();
    scene[groupId] = {
      id: groupId,
      type: 'group',
      parentId: 'root',
      children: [],
      x: (i - GROUP_COUNT / 2) * 10,
      y: 0,
      rotation: 0
    };
    scene['root'].children.push(groupId);

    // Animate the main groups to ensure dirty propagation down the tree
    animations.push({
      nodeId: groupId,
      property: 'rotation',
      keyframes: [
        { time: 0, value: 0 },
        { time: 5000, value: Math.PI * 2 }
      ]
    });

    for (let j = 0; j < SUBGROUP_COUNT; j++) {
      const subgroupId = genId();
      scene[subgroupId] = {
        id: subgroupId,
        type: 'group',
        parentId: groupId,
        children: [],
        x: (j - SUBGROUP_COUNT / 2) * 2,
        y: 0,
        scaleX: 1,
        scaleY: 1
      };
      scene[groupId].children.push(subgroupId);

      // Animate some subgroups
      if (j % 2 === 0) {
        animations.push({
          nodeId: subgroupId,
          property: 'scaleX',
          keyframes: [
            { time: 0, value: 1 },
            { time: 2500, value: 1.5 },
            { time: 5000, value: 1 }
          ]
        });
      }

      for (let k = 0; k < LEAF_COUNT; k++) {
        const leafId = genId();
        scene[leafId] = {
          id: leafId,
          type: 'rect',
          parentId: subgroupId,
          children: [],
          x: (Math.random() - 0.5) * 800,
          y: (Math.random() - 0.5) * 600,
          width: 2,
          height: 2,
          fill: '#ff0000',
          opacity: Math.random()
        };
        scene[subgroupId].children.push(leafId);
      }
    }
  }

  return {
    scene,
    animations,
    metadata: {
      duration: 5000
    }
  };
}
