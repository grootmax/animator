import { createSceneGraphStore } from '@monorepo/scene-graph';
import { PixiBridge } from '@monorepo/renderer';
import { AnimationEngine } from '@monorepo/animation-engine';

let store: ReturnType<typeof createSceneGraphStore>;
let engine: AnimationEngine;
let bridge: any;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'INIT') {
    store = createSceneGraphStore();
    engine = new AnimationEngine(store);
    
    // We send back playhead info every 30ms
    setInterval(() => {
        if (engine && engine.getIsPlaying()) {
            self.postMessage({
                type: 'PLAYHEAD_SYNC',
                playhead: engine.getPlayhead()
            });
        }
    }, 33);
    
    bridge = new PixiBridge(msg.canvas, store, true);
  } else if (msg.type === 'RESIZE') {
    if (bridge) bridge['app'].renderer.resize(msg.width, msg.height);
  } else if (msg.type === 'ADD_NODE') {
    store.getState().addNode(msg.node);
  } else if (msg.type === 'UPDATE_NODE') {
    store.getState().updateNode(msg.id, msg.updates);
    store.getState().recalculateMatrices();
  } else if (msg.type === 'REORDER_NODE') {
    store.getState().reorderNode(msg.id, msg.newParentId, msg.index);
    store.getState().recalculateMatrices();
  } else if (msg.type === 'BATCH_UPDATE') {
    msg.updates.forEach((u: any) => {
       if (u.type === 'ADD') store.getState().addNode(u.node);
       if (u.type === 'UPDATE') store.getState().updateNode(u.id, u.updates);
    });
    store.getState().recalculateMatrices();
  } else if (msg.type === 'ENGINE_CMD') {
    if (msg.cmd === 'play') engine.play();
    if (msg.cmd === 'pause') engine.pause();
    if (msg.cmd === 'seek') {
       engine.seek(msg.time);
       store.getState().recalculateMatrices();
    }
    if (msg.cmd === 'addTrack') engine.addTrack(msg.track);
    
    self.postMessage({ type: 'ENGINE_STATE', isPlaying: engine.getIsPlaying(), playhead: engine.getPlayhead() });
  } else if (msg.type === 'DOM_EVENT') {
    const rawEvent = msg.event;
    rawEvent.preventDefault = () => {};
    rawEvent.stopPropagation = () => {};
    
    if (bridge && bridge['app']) {
        const events = bridge['app'].renderer.events;
        if (rawEvent.type === 'pointerdown') events.onPointerDown(rawEvent);
        else if (rawEvent.type === 'pointermove') events.onPointerMove(rawEvent);
        else if (rawEvent.type === 'pointerup' || rawEvent.type === 'pointerleave') events.onPointerUp(rawEvent);
        else if (rawEvent.type === 'wheel') {
           // PIXI 7 EventSystem doesn't have onWheel natively exposed easily in the same way, 
           // but we can emit it directly to the stage!
           // Wait, mapEvent maps it. Let's just emit to stage.
           const mapped = new (bridge as any).app.renderer.events.EventConstructor();
           // populate mapped event
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
