import { StateCreator } from 'zustand/vanilla';
import { SceneGraphState } from './store';
import { z } from 'zod';

export const syncNodeTypeSchema = z.enum([
  'container',
  'rect',
  'circle',
  'path',
  'group',
  'ellipse',
  'line',
  'polyline',
  'image',
]);

export const syncAddNodePayloadSchema = z.object({
  id: z.string(),
  type: syncNodeTypeSchema,
  name: z.string().optional(),
  parentId: z.string().nullable().optional(),
  order: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  rotation: z.number().optional(),
  scaleX: z.number().optional(),
  scaleY: z.number().optional(),
  skewX: z.number().optional(),
  skewY: z.number().optional(),
  opacity: z.number().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  radius: z.number().optional(),
  pathData: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  rx: z.number().optional(),
  ry: z.number().optional(),
  x1: z.number().optional(),
  y1: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  points: z.string().optional(),
  src: z.string().optional(),
}).passthrough();

export const syncUpdateNodePayloadSchema = z.object({
  id: z.string(),
  updates: z.record(z.string(), z.any()),
});

export const syncReorderNodePayloadSchema = z.object({
  id: z.string(),
  newParentId: z.string().nullable(),
  index: z.number(),
});

export type SyncMessage = {
  type: string;
  payload: any;
};

export interface SyncMiddleware {
  isRemote: boolean;
  broadcast: (msg: SyncMessage) => void;
  applyRemote: (msg: SyncMessage) => void;
}

export const syncMiddleware = (
  config: StateCreator<SceneGraphState, [], []>,
  broadcastCb: (msg: SyncMessage) => void
): StateCreator<SceneGraphState, [], []> => (set, get, api) => {
  const wrappedSet = (partial: any, replace?: boolean, action?: any) => {
    const isRemote = (api as any).__isRemote;
    set(partial, replace);
    
    if (!isRemote && action) {
      broadcastCb(action);
    }
  };

  (api as any).applyRemote = (msg: SyncMessage) => {
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      console.warn('Invalid sync message ignored:', msg);
      return;
    }

    (api as any).__isRemote = true;
    try {
      const state = get();
      if (msg.type === 'addNode') {
        const validatedPayload = syncAddNodePayloadSchema.parse(msg.payload);
        state.addNode(validatedPayload as any);
      } else if (msg.type === 'updateNode') {
        const validatedPayload = syncUpdateNodePayloadSchema.parse(msg.payload);
        state.updateNode(validatedPayload.id, validatedPayload.updates);
      } else if (msg.type === 'reorderNode') {
        const validatedPayload = syncReorderNodePayloadSchema.parse(msg.payload);
        state.reorderNode(validatedPayload.id, validatedPayload.newParentId, validatedPayload.index);
      }
    } catch (err) {
      console.error('Remote sync payload validation failed:', err);
    } finally {
      (api as any).__isRemote = false;
    }
  };

  return config(wrappedSet as any, get, api);
};
