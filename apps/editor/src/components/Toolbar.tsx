import React from 'react';
import { MousePointer2, Hand, Square, Circle, Play, Pause, ZoomIn, ZoomOut, Upload, Download, FolderPlus, FolderOpen, Save, Image as ImageIcon } from 'lucide-react';

interface ToolbarProps {
  tool: string;
  setTool: (tool: string) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  onImport: () => void;
  onExport: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onProjectCreate: () => void;
  onProjectOpen: () => void;
  onProjectSave: () => void;
  onImportMedia: () => void;
  hasProject: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  tool,
  setTool,
  isPlaying,
  togglePlay,
  onImport,
  onExport,
  onZoomIn,
  onZoomOut,
  onProjectCreate,
  onProjectOpen,
  onProjectSave,
  onImportMedia,
  hasProject
}) => {
  const ToolButton = ({ name, icon: Icon }: { name: string, icon: any }) => (
    <button
      className={`p-2 rounded-md hover:bg-gray-700 ${tool === name ? 'bg-blue-600' : ''}`}
      onClick={() => setTool(name)}
      title={name}
    >
      <Icon size={20} />
    </button>
  );

  return (
    <div className="flex items-center gap-2 p-2 bg-gray-800 border-b border-gray-700 text-gray-200 overflow-x-auto">
      <div className="flex gap-1 border-r border-gray-600 pr-2">
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-1" onClick={onProjectCreate} title="New Project">
          <FolderPlus size={16} /> <span className="text-xs hidden sm:inline">New</span>
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-1" onClick={onProjectOpen} title="Open Project">
          <FolderOpen size={16} /> <span className="text-xs hidden sm:inline">Open</span>
        </button>
        <button className={`p-2 rounded-md flex items-center gap-1 ${hasProject ? 'hover:bg-gray-700' : 'opacity-50 cursor-not-allowed'}`} onClick={hasProject ? onProjectSave : undefined} title="Save Project">
          <Save size={16} /> <span className="text-xs hidden sm:inline">Save</span>
        </button>
      </div>
      <div className="flex gap-1 border-r border-gray-600 pr-2 pl-1">
        <ToolButton name="select" icon={MousePointer2} />
        <ToolButton name="pan" icon={Hand} />
      </div>
      <div className="flex gap-1 border-r border-gray-600 pr-2">
        <ToolButton name="rect" icon={Square} />
        <ToolButton name="circle" icon={Circle} />
      </div>
      <div className="flex gap-1 border-r border-gray-600 pr-2">
        <button className="p-2 rounded-md hover:bg-gray-700" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
      </div>
      <div className="flex gap-1 border-r border-gray-600 pr-2">
        <button className="p-2 rounded-md hover:bg-gray-700" onClick={onZoomOut} title="Zoom Out">
          <ZoomOut size={20} />
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700" onClick={onZoomIn} title="Zoom In">
          <ZoomIn size={20} />
        </button>
      </div>
      <div className="flex gap-1 border-r border-gray-600 pr-2 pl-1">
        <button className={`p-2 rounded-md flex items-center gap-1 ${hasProject ? 'hover:bg-gray-700' : 'opacity-50 cursor-not-allowed'}`} onClick={hasProject ? onImportMedia : undefined} title="Import Media (Image/Video)">
          <ImageIcon size={16} /> <span className="text-xs">Import Media</span>
        </button>
      </div>
      <div className="flex gap-1 ml-auto">
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-1" onClick={onImport} title="Import SVG (Legacy)">
          <Upload size={16} /> <span className="text-xs">SVG</span>
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-1" onClick={onExport} title="Export JSON (Legacy)">
          <Download size={16} /> <span className="text-xs">JSON</span>
        </button>
      </div>
    </div>
  );
};
