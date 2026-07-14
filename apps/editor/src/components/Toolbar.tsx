import React from 'react';


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
  onZoomOut
}) => {
  const ToolButton = ({ name }: { name: string }) => (
    <button
      className={`p-2 rounded-md hover:bg-gray-700 ${tool === name ? 'bg-blue-600' : ''}`}
      onClick={() => setTool(name)}
      title={name}
    >
      {name}
    </button>
  );

  return (
    <div className="flex items-center gap-2 p-2 bg-gray-800 border-b border-gray-700 text-gray-200">
      <div className="flex gap-1 border-r border-gray-600 pr-2">
        <ToolButton name="select" />
        <ToolButton name="pan" />
      </div>
      <div className="flex gap-1 border-r border-gray-600 pr-2">
        <ToolButton name="rect" />
        <ToolButton name="circle" />
      </div>
      <div className="flex gap-1 border-r border-gray-600 pr-2">
        <button className="p-2 rounded-md hover:bg-gray-700" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? "Pause" : "Play"}
        </button>
      </div>
      <div className="flex gap-1 border-r border-gray-600 pr-2">
        <button className="p-2 rounded-md hover:bg-gray-700" onClick={onZoomOut} title="Zoom Out">
          ZoomOut
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700" onClick={onZoomIn} title="Zoom In">
          ZoomIn
        </button>
      </div>
      <div className="flex gap-1 ml-auto">
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-2" onClick={onImport} title="Import SVG">
          Up <span className="text-sm">Open</span>
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-2" onClick={onExport} title="Save JSON">
          Dn <span className="text-sm">Save</span>
        </button>
        <button className="p-2 rounded-md hover:bg-gray-700 flex items-center gap-2" onClick={onExportSvg} title="Save As">
          Dn <span className="text-sm">Save As</span>
        </button>
      </div>
    </div>
  );
};
