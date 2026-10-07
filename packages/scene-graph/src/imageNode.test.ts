import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSceneGraphStore } from './store';

describe('Scene Graph Image Node Support', () => {
  it('should allow adding image nodes with base64 src, width, and height', () => {
    const store = createSceneGraphStore();
    const sampleSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    store.getState().addNode({
      id: 'img_node_1',
      type: 'image',
      src: sampleSrc,
      x: 150,
      y: 250,
      width: 200,
      height: 100,
      parentId: null
    });

    const node = store.getState().nodes['img_node_1'];
    assert.ok(node);
    assert.equal(node.type, 'image');
    assert.equal(node.src, sampleSrc);
    assert.equal(node.x, 150);
    assert.equal(node.y, 250);
    assert.equal(node.width, 200);
    assert.equal(node.height, 100);
  });

  it('should allow updating image node src and dimensions', () => {
    const store = createSceneGraphStore();
    store.getState().addNode({
      id: 'img_node_2',
      type: 'image',
      src: 'data:image/png;base64,initial',
      x: 0,
      y: 0,
      parentId: null
    });

    store.getState().updateNode('img_node_2', {
      src: 'data:image/png;base64,updated',
      width: 300,
      height: 300,
      x: 50
    });

    const updatedNode = store.getState().nodes['img_node_2'];
    assert.equal(updatedNode.src, 'data:image/png;base64,updated');
    assert.equal(updatedNode.width, 300);
    assert.equal(updatedNode.height, 300);
    assert.equal(updatedNode.x, 50);
  });
});
