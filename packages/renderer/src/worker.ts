import { PixiBridge } from './bridge';

let bridge: PixiBridge;

self.onmessage = (e) => {
  const msg = e.data;
  
  if (msg.type === 'INIT') {
    bridge = new PixiBridge({
      canvas: msg.canvas,
      width: msg.width,
      height: msg.height,
      resolution: msg.resolution,
      sharedBuffer: msg.sharedBuffer,
      dispatch: (outgoingMsg: any) => {
        postMessage(outgoingMsg);
      }
    });
  } else if (msg.type === 'RESIZE') {
    if (bridge) {
      bridge.resize(msg.width, msg.height, msg.resolution);
    }
  } else if (msg.type === 'EVENT') {
    if (bridge) {
      bridge.dispatchEvent(msg.event);
    }
  } else if (msg.type === 'SYNC_NODES') {
    if (bridge) {
      bridge.syncNodes(msg.nodes);
    }
  } else if (msg.type === 'SET_START_NODE_STATE') {
    if (bridge) {
      bridge.handles.setStartNodeState(msg.state);
    }
  } else if (msg.type === 'ZOOM') {
    if (bridge) {
      bridge.viewport.container.scale.x *= msg.factor;
      bridge.viewport.container.scale.y *= msg.factor;
      bridge.viewport.drawGrid();
    }
  } else if (msg.type === 'SYNC_MATRICES') {
    if (bridge) {
      bridge.setSharedBuffer(msg.buffer);
    }
  }
};
