import React, { useState, useRef } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { Eye, EyeOff, Lock, Unlock, ChevronRight, ChevronDown } from 'lucide-react';
import { useDrag, useDrop } from 'react-dnd';

interface LayerPanelProps {
  store: ReturnType<typeof createSceneGraphStore>;
  nodesCount: number;
}

interface DragItem {
  id: string;
  type: string;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({ store, nodesCount: _nodesCount }) => {
  const state = store.getState();
  const nodes = state.nodes;

  const LayerNode = ({ id, depth }: { id: string, depth: number }) => {
    const node = nodes[id];
    if (!node) return null;

    const [expanded, setExpanded] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(node.name);

    const hasChildren = node.children && node.children.length > 0;

    const toggleVisible = (e: React.MouseEvent) => {
      e.stopPropagation();
      store.getState().updateNode(id, { visible: !node.visible });
    };

    const toggleLock = (e: React.MouseEvent) => {
      e.stopPropagation();
      store.getState().updateNode(id, { locked: !node.locked });
    };

    const handleRename = () => {
      if (editName.trim()) {
        store.getState().updateNode(id, { name: editName });
      }
      setIsEditing(false);
    };

    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag] = useDrag({
      type: 'LAYER',
      item: { id, type: 'LAYER' },
      collect: monitor => ({
        isDragging: monitor.isDragging(),
      }),
    });

    const [, drop] = useDrop({
      accept: 'LAYER',
      hover(item: DragItem) {
        if (!ref.current) return;
        const dragId = item.id;
        const dropId = id;
        if (dragId === dropId) return;

        // basic drop logic to reorder / reparent - for now we just handle drop
      },
      drop(item: DragItem) {
         if (item.id === id) return;
         // move item.id into 'id' group, or reorder.
         // For a simple implementation, let's just make it a child of the drop target if it's a group
         // or place it after the drop target
         const dragNode = store.getState().nodes[item.id];
         const dropNode = store.getState().nodes[id];
         if (!dragNode || !dropNode) return;

         // Check if dropNode is a child of dragNode (prevent cycles)
         let curr = dropNode.parentId;
         while (curr) {
            if (curr === item.id) return;
            curr = store.getState().nodes[curr]?.parentId || null;
         }

         if (dropNode.type === 'group' || dropNode.type === 'container') {
             store.getState().reorderNode(item.id, id, store.getState().nodes[id].children.length);
         } else {
             const parentId = dropNode.parentId;
             const siblings = parentId ? store.getState().nodes[parentId].children : Object.values(store.getState().nodes).filter((n: any) => !n.parentId).map((n: any) => n.id);
             const dropIndex = siblings.indexOf(id);
             store.getState().reorderNode(item.id, parentId, dropIndex + 1);
         }
      }
    });

    drag(drop(ref));

    return (
      <div className="flex flex-col text-sm text-gray-300">
        <div
          ref={ref}
          className={`flex items-center gap-2 py-1 px-2 hover:bg-gray-700 cursor-pointer group ${isDragging ? 'opacity-50' : 'opacity-100'}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <div className="w-4 h-4 flex items-center justify-center cursor-pointer" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
          </div>

          {isEditing ? (
            <input
              autoFocus
              className="flex-1 bg-gray-900 text-white px-1 outline-none border border-blue-500 rounded"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
            />
          ) : (
            <span className="flex-1 truncate select-none" onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
              {node.name || node.type}
            </span>
          )}

          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={toggleLock} className="p-1 hover:text-white" title={node.locked ? "Unlock" : "Lock"}>
              {node.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
            <button onClick={toggleVisible} className="p-1 hover:text-white" title={node.visible ? "Hide" : "Show"}>
              {node.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>

          {!node.visible && (
            <div className="absolute right-8"><EyeOff size={14} className="text-gray-500" /></div>
          )}
          {node.locked && (
            <div className="absolute right-2"><Lock size={14} className="text-gray-500" /></div>
          )}
        </div>

        {expanded && hasChildren && (
          <div className="flex flex-col">
            {node.children.map((childId: any) => (
              <LayerNode key={childId} id={childId} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const rootNodes = Object.values(nodes).filter((n: any) => !n.parentId).map((n: any) => n.id);

  return (
    <div className="flex flex-col h-full bg-gray-800 border-r border-gray-700 w-64 select-none">
      <div className="p-2 border-b border-gray-700 font-semibold text-gray-200">
        Layers
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2">
        {rootNodes.map(id => (
          <LayerNode key={id} id={id} depth={0} />
        ))}
        {rootNodes.length === 0 && (
          <div className="p-4 text-center text-gray-500 text-sm">
            No layers yet
          </div>
        )}
      </div>
    </div>
  );
};
