import React, { useEffect, useState } from 'react';
import { createSceneGraphStore } from '@monorepo/scene-graph';
import { Folder, Image as ImageIcon, FileImage, Plus } from 'lucide-react';

interface Asset {
  name: string;
  path: string;
  url: string;
}

interface WorkspaceManifest {
  assets: Asset[];
  scene?: any;
}

interface WorkspacePanelProps {
  store: ReturnType<typeof createSceneGraphStore>;
}

export const WorkspacePanel: React.FC<WorkspacePanelProps> = ({ store }) => {
  const [workspace, setWorkspace] = useState<{ path: string, manifest: WorkspaceManifest } | null>(null);

  const loadSceneFromManifest = (manifest: any) => {
    if (manifest && manifest.scene && manifest.scene.scene) {
      // Clear existing nodes first (simple approach)
      Object.values(manifest.scene.scene).forEach((node: any) => {
        store.getState().addNode(node);
      });
      store.getState().recalculateMatrices();
    }
  };

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getLastActiveWorkspace().then((res: any) => {
        if (res) {
          setWorkspace({ path: res.workspacePath, manifest: res.manifest });
          loadSceneFromManifest(res.manifest);
        }
      });

      window.electronAPI.onWorkspaceUpdated((manifest: any) => {
        setWorkspace(prev => prev ? { ...prev, manifest } : null);
      });
    }
  }, []);

  const handleOpenWorkspace = async () => {
    if (window.electronAPI) {
      // Auto-save current scene before switching
      if (workspace) {
        const state = store.getState().nodes;
        const cleanScene: Record<string, any> = {};
        for (const [id, node] of Object.entries(state)) {
          const cleanNode = { ...node };
          delete (cleanNode as any).localMatrix;
          delete (cleanNode as any).worldMatrix;
          delete (cleanNode as any).isDirty;
          cleanScene[id] = cleanNode;
        }
        await window.electronAPI.saveWorkspaceScene({ scene: cleanScene });
      }

      const res = await window.electronAPI.openWorkspace();
      if (res) {
        setWorkspace({ path: res.workspacePath, manifest: res.manifest });
        loadSceneFromManifest(res.manifest);
      }
    }
  };

  const handleAddAssetToScene = (asset: Asset) => {
    const ext = asset.name.split('.').pop()?.toLowerCase();
    
    // Simplistic integration to add the image to the scene graph
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
      store.getState().addNode({
        id: `img_${Date.now()}`,
        type: 'image',
        name: asset.name,
        src: asset.url,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      store.getState().recalculateMatrices();
    }
  };

  return (
    <div className="flex flex-col h-1/3 bg-gray-800 border-r border-t border-gray-700 w-full select-none">
      <div className="p-2 border-b border-gray-700 font-semibold text-gray-200 flex justify-between items-center">
        <span>Workspace</span>
        <button onClick={handleOpenWorkspace} className="p-1 hover:bg-gray-700 rounded" title="Open Workspace">
          <Folder size={14} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {!workspace ? (
          <div className="text-gray-500 text-sm text-center mt-4">
            No workspace open
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {workspace.manifest.assets.map(asset => {
              const isImage = asset.name.match(/\.(png|jpg|jpeg)$/i);
              return (
                <div key={asset.url} className="flex items-center gap-2 p-1 hover:bg-gray-700 rounded cursor-pointer group" onDoubleClick={() => handleAddAssetToScene(asset)}>
                  {isImage ? <ImageIcon size={14} className="text-blue-400" /> : <FileImage size={14} />}
                  <span className="text-sm truncate flex-1" title={asset.name}>{asset.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleAddAssetToScene(asset); }} className="opacity-0 group-hover:opacity-100 hover:text-white p-1">
                     <Plus size={14} />
                  </button>
                </div>
              );
            })}
            {workspace.manifest.assets.length === 0 && (
              <div className="text-gray-500 text-sm mt-2 text-center">Empty workspace</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
