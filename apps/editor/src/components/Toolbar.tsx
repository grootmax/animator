import React from 'react';
import { MousePointer2, Hand, Square, Circle, Play, Pause, ZoomIn, ZoomOut, Upload, Download, PackageOpen, PackageCheck, ImagePlus } from 'lucide-react';

interface ToolbarProps {
  tool: string;
  setTool: (tool: string) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  onImport: () => void;
  onExport: () => void;
  onExportSvg: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSaveBundle: () => void;
  onOpenBundle: () => void;
  onImportAsset: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  tool,
  setTool,
  isPlaying,
  togglePlay,
  onImport,
  onExport,
  onExportSvg,
  onZoomIn,
  onZoomOut,
  onSaveBundle,
  onOpenBundle,
  onImportAsset
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
    <div className="flex items-center gap-2 p-2 bg-gray-800 border-b border-gray-700 text-gray-200">
      <div className="flex gap-1 border-r border-gray-600 pr-2">
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
      <div className="flex gap-1 border-r border-gray-600 pr-2 ml-auto">
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-2 text-indigo-400" onClick={onOpenBundle} title="Open Bundle">
          <PackageOpen size={20} /> <span className="text-sm">Open Bundle</span>
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-2 text-indigo-400" onClick={onSaveBundle} title="Save Bundle">
          <PackageCheck size={20} /> <span className="text-sm">Save Bundle</span>
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-2 text-indigo-400" onClick={onImportAsset} title="Import Asset">
          <ImagePlus size={20} /> <span className="text-sm">Import Asset</span>
        </button>
      </div>
      <div className="flex gap-1">
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-2" onClick={onImport} title="Import SVG">
          <Upload size={20} /> <span className="text-sm">SVG In</span>
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-2" onClick={onExport} title="Export JSON">
          <Download size={20} /> <span className="text-sm">JSON Out</span>
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-2" onClick={onExportSvg} title="Export SVG">
          <Download size={20} /> <span className="text-sm">SVG Out</span>
        </button>
      </div>
    </div>
  );
};
