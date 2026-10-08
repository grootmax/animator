import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine } from '@monorepo/animation-engine';
import {
  addNodePayloadSchema,
  updateNodePayloadSchema,
  reorderNodePayloadSchema,
  sceneNodeSchema,
} from '@monorepo/serialization';
import { z } from 'zod';

let store: ReturnType<typeof createSceneGraphStore>;
let engine: AnimationEngine;
let bridge: any;

export const handleWorkerMessage = (e: { data: any }) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'INIT') {
    store = createSceneGraphStore();
    engine = new AnimationEngine(store);
    
    // We send back playhead info every 30ms
    setInterval(() => {
        if (engine && engine.getIsPlaying()) {
            if (typeof self !== 'undefined' && self.postMessage) {
              self.postMessage({
                  type: 'PLAYHEAD_SYNC',
                  playhead: engine.getPlayhead()
              });
            }
        }
    }, 33);
    
    bridge = new PixiBridge(msg.canvas, store, true);
  } else if (msg.type === 'RESIZE') {
    if (bridge) bridge['app'].renderer.resize(msg.width, msg.height);
  } else if (msg.type === 'ADD_NODE') {
    try {
      const validatedNode = addNodePayloadSchema.parse(msg.node);
      store.getState().addNode(validatedNode as any);
    } catch (err) {
      console.error('Worker message validation failed for ADD_NODE:', err);
    }
  } else if (msg.type === 'UPDATE_NODE') {
    try {
      const validated = updateNodePayloadSchema.parse({ id: msg.id, updates: msg.updates });
      store.getState().updateNode(validated.id, validated.updates as any);
      store.getState().recalculateMatrices();
    } catch (err) {
      console.error('Worker message validation failed for UPDATE_NODE:', err);
    }
  } else if (msg.type === 'REORDER_NODE') {
    try {
      const validated = reorderNodePayloadSchema.parse({
        id: msg.id,
        newParentId: msg.newParentId,
        index: msg.index,
      });
      store.getState().reorderNode(validated.id, validated.newParentId, validated.index);
      store.getState().recalculateMatrices();
    } catch (err) {
      console.error('Worker message validation failed for REORDER_NODE:', err);
    }
  } else if (msg.type === 'BATCH_UPDATE') {
    try {
      const batchItemSchema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('ADD'), node: addNodePayloadSchema }),
        z.object({ type: z.literal('UPDATE'), id: z.string(), updates: sceneNodeSchema.partial() }),
      ]);
      const validatedUpdates = z.array(batchItemSchema).parse(msg.updates);
      validatedUpdates.forEach((u) => {
        if (u.type === 'ADD') store.getState().addNode(u.node as any);
        if (u.type === 'UPDATE') store.getState().updateNode(u.id, u.updates as any);
      });
      store.getState().recalculateMatrices();
    } catch (err) {
      console.error('Worker message validation failed for BATCH_UPDATE:', err);
    }
  } else if (msg.type === 'ENGINE_CMD') {
    if (msg.cmd === 'play') engine.play();
    if (msg.cmd === 'pause') engine.pause();
    if (msg.cmd === 'seek') {
       engine.seek(msg.time);
       store.getState().recalculateMatrices();
    }
    if (msg.cmd === 'addTrack') engine.addTrack(msg.track);
    
    if (typeof self !== 'undefined' && self.postMessage) {
      self.postMessage({ type: 'ENGINE_STATE', isPlaying: engine.getIsPlaying(), playhead: engine.getPlayhead() });
    }
  } else if (msg.type === 'DOM_EVENT') {
    const rawEvent = msg.event;
    if (rawEvent) {
      rawEvent.preventDefault = () => {};
      rawEvent.stopPropagation = () => {};
    }
    
    if (bridge && bridge['app']) {
        const events = bridge['app'].renderer.events;
        if (rawEvent.type === 'pointerdown') events.onPointerDown(rawEvent);
        else if (rawEvent.type === 'pointermove') events.onPointerMove(rawEvent);
        else if (rawEvent.type === 'pointerup' || rawEvent.type === 'pointerleave') events.onPointerUp(rawEvent);
        else if (rawEvent.type === 'wheel') {
           const mapped = new (bridge as any).app.renderer.events.EventConstructor();
           Object.assign(mapped, rawEvent);
           mapped.globalX = rawEvent.clientX;
           mapped.globalY = rawEvent.clientY;
           bridge['app'].stage.emit('wheel', mapped);
        }
    }
  } else if (msg.type === 'ZOOM') {
    if (bridge && bridge['viewport']) {
      bridge['viewport'].container.scale.x *= msg.factor;
      bridge['viewport'].container.scale.y *= msg.factor;
      bridge['viewport'].drawGrid();
    }
  }
};

if (typeof self !== 'undefined') {
  self.onmessage = handleWorkerMessage;
}
