import React, { useState, useEffect } from 'react';
import { Note, LocalFile } from './types';
import { INITIAL_NOTES, INITIAL_LOCAL_FILES } from './data/mockData';
import VaultSidebar from './components/VaultSidebar';
import MarkdownEditor from './components/MarkdownEditor';
import LivePreviewPanel from './components/LivePreviewPanel';
import { 
  Sparkles, 
  Terminal, 
  X, 
  Info, 
  Check, 
  ExternalLink,
  FileText,
  FileImage,
  FileCode,
  FileAudio,
  FileDown,
  PanelLeft,
  PanelRight
} from 'lucide-react';

export default function App() {
  // 1. Core database states
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [currentNoteId, setCurrentNoteId] = useState<string>('note-1');
  const [localFiles, setLocalFiles] = useState<LocalFile[]>(INITIAL_LOCAL_FILES);
  
  // Tab states
  const [activeTab, setActiveTab] = useState<'vault' | 'system-files' | 'instructions'>('vault');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState<boolean>(true);

  // Preview inspectors
  const [activePreviewFile, setActivePreviewFile] = useState<LocalFile | null>(null);

  // 2. Hover Popover coordinates & state
  const [hoveredFile, setHoveredFile] = useState<LocalFile | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isHoverActive, setIsHoverActive] = useState<boolean>(false);

  // 3. User notifications
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // 4. Custom Obsidian Dialog (Confirm & Alert modal) to bypass web iframe constraints
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  } | null>(null);

  const activeNote = notes.find(n => n.id === currentNoteId) || notes[0];

  // Auto-set initial file inspector preview based on what links exist in note-1
  useEffect(() => {
    if (activeNote) {
      // Find the first linked local file in this note and pre-select it
      const regex = /\[[^\]]+\]\((local-file:\/\/[^)]+)\)/;
      const match = regex.exec(activeNote.content);
      if (match) {
        const url = match[1];
        const initialPath = decodeURIComponent(url.replace('local-file://', '').replace(/^\/\/\//, ''));
        const matchedFile = localFiles.find(f => f.systemPath.toLowerCase().endsWith(initialPath.toLowerCase()));
        if (matchedFile) {
          setActivePreviewFile(matchedFile);
        }
      } else {
        setActivePreviewFile(null);
      }
    }
  }, [currentNoteId]);

  // Toast notifier helper
  const triggerNotification = (message: string, type: 'success' | 'info') => {
    setNotification({ message, type });
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Safe global Dialog helpers to replace alert/confirm
  const showAlert = (title: string, message: string) => {
    setModal({
      isOpen: true,
      title,
      message,
      type: 'alert'
    });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModal({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      onConfirm
    });
  };

  // 5. Note Vault CRUD handlers
  const handleSelectNote = (noteId: string) => {
    setCurrentNoteId(noteId);
  };

  const handleCreateNote = (title: string, folder: string) => {
    const newNote: Note = {
      id: `note-${Date.now()}`,
      title,
      folder,
      content: `# ${title}\n\n开始撰写您的高能双链笔记。该笔记将自动激活本地资源链接分析。您可以从左侧“系统文件”列表拖拽任意外部文件到此处，快速生成无缝软链接。\n\n`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setNotes(prev => [newNote, ...prev]);
    setCurrentNoteId(newNote.id);
    triggerNotification(`已在 [${folder}] 目录新建笔记 "${title}"`, 'success');
  };

  const handleDeleteNote = (noteId: string) => {
    if (notes.length <= 1) {
      triggerNotification('无法删除知识库中的最后一篇笔记。', 'info');
      return;
    }
    const idx = notes.findIndex(n => n.id === noteId);
    const updatedNotes = notes.filter(n => n.id !== noteId);
    setNotes(updatedNotes);
    
    // Select another active note
    const fallbackIdx = idx === 0 ? 0 : idx - 1;
    setCurrentNoteId(updatedNotes[fallbackIdx].id);
    triggerNotification('笔记已安全从保险箱删除。', 'info');
  };

  const handleUpdateNoteContent = (newContent: string) => {
    setNotes(prev => prev.map(n => 
      n.id === currentNoteId 
        ? { ...n, content: newContent, updatedAt: new Date().toISOString() } 
        : n
    ));
  };

  // 6. Simulated System Local Files CRUD handlers
  const handleRegisterLocalFile = (fileDetails: Omit<LocalFile, 'id' | 'addedAt'>) => {
    // Prevent duplicate paths
    const exists = localFiles.some(f => f.systemPath.toLowerCase() === fileDetails.systemPath.toLowerCase());
    if (exists) {
      triggerNotification('该绝对路径文件已在虚拟磁盘中注册！', 'info');
      return;
    }

    const newFile: LocalFile = {
      id: `file-${Date.now()}`,
      ...fileDetails,
      addedAt: new Date().toISOString()
    };
    setLocalFiles(prev => [newFile, ...prev]);
    setActivePreviewFile(newFile);
    triggerNotification(`成功关联系统文件 "${newFile.name}" 到宿主磁盘。`, 'success');
  };

  const handleDeleteLocalFile = (fileId: string) => {
    setLocalFiles(prev => prev.filter(f => f.id !== fileId));
    if (activePreviewFile?.id === fileId) {
      setActivePreviewFile(null);
    }
    triggerNotification('已取消关联外部文件的系统绝对路径。', 'info');
  };

  // 7. Interactive Link Routing Callbacks
  const handleTriggerHoverPreview = (filePath: string, anchorRef: HTMLAnchorElement, show: boolean) => {
    if (!show) {
      setIsHoverActive(false);
      return;
    }

    // Clean slashes to handle Windows paths cross-platform
    const normalizedQueryPath = filePath.replace(/\\/g, '/').toLowerCase();

    // Look up local file matching path
    const match = localFiles.find(f => {
      const normalizedFilePath = f.systemPath.replace(/\\/g, '/').toLowerCase();
      // Match absolute path or name
      return normalizedFilePath.endsWith(normalizedQueryPath) || normalizedQueryPath.endsWith(normalizedFilePath);
    });

    if (match) {
      const rect = anchorRef.getBoundingClientRect();
      const popoverWidth = 320;
      
      // Calculate placement intelligently
      let leftCoord = rect.left + window.scrollX;
      if (leftCoord + popoverWidth > window.innerWidth) {
        leftCoord = window.innerWidth - popoverWidth - 16;
      }

      setHoverPosition({
        top: rect.bottom + window.scrollY + 8,
        left: Math.max(16, leftCoord)
      });
      setHoveredFile(match);
      setIsHoverActive(true);
    }
  };

  const handleOpenFileInLivePreview = (filePath: string) => {
    const normalizedQueryPath = filePath.replace(/\\/g, '/').toLowerCase();
    const match = localFiles.find(f => {
      const normalizedFilePath = f.systemPath.replace(/\\/g, '/').toLowerCase();
      return normalizedFilePath.endsWith(normalizedQueryPath) || normalizedQueryPath.endsWith(normalizedFilePath);
    });

    if (match) {
      setActivePreviewFile(match);
      triggerNotification(`已在右侧文件属性面板中加载: ${match.name}`, 'info');
    } else {
      // Create lazy pointer on the fly!
      const name = filePath.split(/[/\\\\]/).pop() || 'Local File';
      const lazyFile: LocalFile = {
        id: `lazy-${Date.now()}`,
        name,
        systemPath: filePath,
        size: '未知大小',
        type: 'other',
        addedAt: new Date().toISOString(),
        previewContent: `文件名称: ${name}\n状态说明: 未在沙箱预注册的外部路径文件。\n磁盘绝对路径寻址结果: ${filePath}\n(该硬链接已被插件扫描器激活)`
      };
      setLocalFiles(prev => [...prev, lazyFile]);
      setActivePreviewFile(lazyFile);
      triggerNotification(`发现未注册的本地绝对路径链接，已建立属性审查通道！`, 'info');
    }
  };

  const handleSelectLocalFilePreview = (file: LocalFile) => {
    setActivePreviewFile(file);
  };

  const getFileIconDetail = (type: string) => {
    switch (type) {
      case 'pdf': return <FileDown className="w-5 h-5 text-rose-450 text-rose-450" />;
      case 'image': return <FileImage className="w-5 h-5 text-emerald-450" />;
      case 'code': return <FileCode className="w-5 h-5 text-amber-450" />;
      case 'audio': return <FileAudio className="w-5 h-5 text-sky-450" />;
      default: return <FileText className="w-5 h-5 text-purple-450" />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#111115] text-zinc-100 font-sans overflow-hidden select-none" id="applet-viewport">
      
      {/* 1. TOP SIMULATED OBSIDIAN DECORATIVE OS HEADER */}
      <div className="h-11 bg-[#1e1e24] border-b border-[#2d2d34] px-4 flex items-center justify-between shrink-0 select-none">
        
        {/* Mock OS Mac Circles */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block border border-rose-600/30" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block border border-amber-600/30" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block border border-emerald-600/30" />
          </div>
          
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <span className="text-violet-40 tracking-wider font-mono text-violet-400">OBSIDIAN 桌端双链 v1.8.4</span>
            <span className="text-zinc-650 text-zinc-600">•</span>
            <span className="text-zinc-400 font-normal">知识库 (Vault): 研发参考沙箱</span>
          </div>
        </div>

        {/* Dynamic center status notice */}
        <div className="hidden md:flex items-center gap-2 bg-[#121216] border border-zinc-800 px-3 py-1 rounded-full text-[11px] text-zinc-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
          </span>
          <span className="font-medium text-zinc-300">Obsidian 本地文件映射插件:</span>
          <span className="text-violet-350 bg-violet-950/40 px-1.5 py-0.2 rounded font-mono font-bold text-[10px] text-violet-300">Electron 原生 Node.js API 进程就绪</span>
        </div>

        {/* Workspace Quick Tag & Sidebar Toggles */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-0.5 rounded-md">
            <button
              onClick={() => {
                setLeftSidebarOpen(!leftSidebarOpen);
                triggerNotification(leftSidebarOpen ? '已收起左侧笔记库' : '已展开左侧笔记库', 'info');
              }}
              className={`p-1 rounded hover:bg-zinc-800 hover:text-white transition cursor-pointer ${
                leftSidebarOpen ? 'text-violet-400 font-semibold text-violet-400' : 'text-zinc-500'
              }`}
              title={leftSidebarOpen ? "收起左侧文件夹" : "展开左侧文件夹"}
              id="btn-toggle-left-sidebar"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setRightSidebarOpen(!rightSidebarOpen);
                triggerNotification(rightSidebarOpen ? '已收起右侧审查面板' : '已展开右侧审查面板', 'info');
              }}
              className={`p-1 rounded hover:bg-zinc-800 hover:text-white transition cursor-pointer ${
                rightSidebarOpen ? 'text-violet-400 font-semibold text-violet-400' : 'text-zinc-500'
              }`}
              title={rightSidebarOpen ? "收起右侧信息栏" : "展开右侧信息栏"}
              id="btn-toggle-right-sidebar"
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="hidden sm:flex text-[11px] text-zinc-500 items-center gap-1 font-mono">
            <Terminal className="w-3.5 h-3.5 text-zinc-500" />
            <span>localhost:3000</span>
          </div>
        </div>
      </div>

      {/* 2. CORE SCREEN SPLIT-PANELS */}
      <div className="flex-1 flex min-h-0 relative">
        
        {/* Left Side Navigation & File Pools */}
        {leftSidebarOpen && (
          <VaultSidebar
            notes={notes}
            currentNoteId={currentNoteId}
            onSelectNote={handleSelectNote}
            onCreateNote={handleCreateNote}
            onDeleteNote={handleDeleteNote}
            localFiles={localFiles}
            onRegisterLocalFile={handleRegisterLocalFile}
            onDeleteLocalFile={handleDeleteLocalFile}
            onSelectLocalFilePreview={handleSelectLocalFilePreview}
            selectedPreviewFile={activePreviewFile}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onShowConfirm={showConfirm}
          />
        )}

        {/* Center Editing Viewport */}
        <MarkdownEditor
          note={activeNote}
          onUpdateNoteContent={handleUpdateNoteContent}
          localFiles={localFiles}
          onTriggerHoverPreview={handleTriggerHoverPreview}
          onOpenFileInLivePreview={handleOpenFileInLivePreview}
          onNotification={triggerNotification}
        />

        {/* Right Preview Inspector Pane */}
        {rightSidebarOpen && (
          <LivePreviewPanel
            activeFile={activePreviewFile}
            activeNote={activeNote}
            localFiles={localFiles}
            onSelectLocalFile={handleSelectLocalFilePreview}
            onNotification={triggerNotification}
            onShowAlert={showAlert}
          />
        )}

      </div>

      {/* 3. FLOATING COMPONENT: PORTAL-STYLE HOVER PREVIEW POPULAR CARD */}
      {isHoverActive && hoveredFile && (
        <div
          style={{
            position: 'absolute',
            top: hoverPosition.top,
            left: hoverPosition.left,
            zIndex: 9999
          }}
          className="w-80 bg-[#1e1e24] rounded-lg border border-violet-500/40 shadow-2xl p-4 text-zinc-350 font-sans animate-fadeIn select-text pointer-events-none"
          id="portal-hover-preview"
        >
          {/* Header */}
          <div className="flex gap-2 items-start justify-between border-b border-zinc-800 pb-2.5 mb-2.5">
            <div className="flex items-center gap-2 overflow-hidden">
              {getFileIconDetail(hoveredFile.type)}
              <strong className="text-white text-xs truncate max-w-[190px] block font-semibold" title={hoveredFile.name}>
                {hoveredFile.name}
              </strong>
            </div>
            <span className="text-[9px] bg-violet-950/80 text-violet-300 border border-violet-800/40 px-1.5 py-0.5 rounded-full font-mono uppercase shrink-0 font-bold tracking-wider">
              实时预览
            </span>
          </div>

          {/* Path info */}
          <div className="text-[10px] text-zinc-500 font-mono mb-2 truncate" title={hoveredFile.systemPath}>
            <strong>路径: </strong> {hoveredFile.systemPath}
          </div>

          {/* Content Excerpt Summary mapping */}
          <div className="bg-[#141418] rounded-md p-2.5 text-[10.5px] leading-relaxed text-zinc-400 font-mono max-h-32 overflow-hidden relative border border-zinc-900 shadow-inner">
            {hoveredFile.type === 'image' ? (
              <div className="flex flex-col items-center justify-center p-1 gap-1">
                <span className="text-[10px] text-zinc-500 font-sans">🖼️ 图片资源轻量视口 (Unsplash托管)</span>
                <img 
                  src={hoveredFile.previewUrl} 
                  alt={hoveredFile.name} 
                  className="max-h-20 object-contain rounded mt-1 opacity-70"
                />
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-all">
                {hoveredFile.previewContent || '数据流映射完成，已在内存段建立只读缓冲区。'}
              </div>
            )}
            {/* Soft bottom masking gradient overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#141418] to-transparent pointer-events-none" />
          </div>

          {/* Help hint */}
          <div className="flex justify-between items-center mt-3 text-[9px] text-zinc-500 border-t border-zinc-850/60 pt-2 font-sans">
            <span>大小: {hoveredFile.size}</span>
            <span className="text-violet-400/80 font-medium">点击链接即刻进入右侧属性面板 →</span>
          </div>
        </div>
      )}

      {/* 4. TOP SLIDING TOAST NOTIFICATIONS */}
      {notification && (
        <div 
          className="absolute top-14 right-6 z-50 bg-[#1e1e24] border border-violet-500/40 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 animate-fadeIn w-85 select-text"
          id="toast-notification"
        >
          <div className={`p-1.5 rounded-lg border shrink-0 ${
            notification.type === 'success' 
              ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' 
              : 'bg-violet-950/20 border-violet-500/20 text-violet-400'
          }`}>
            {notification.type === 'success' ? <Check className="w-4 h-4" /> : <Info className="w-4 h-4" />}
          </div>
          <div className="overflow-hidden flex-1">
            <div className="text-xs font-bold text-white uppercase tracking-wider text-[10px]">
              {notification.type === 'success' ? '⚡ 动作已完成' : '📡 终端系统广播'}
            </div>
            <p className="text-xs text-zinc-300 mt-0.5 leading-normal truncate">{notification.message}</p>
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-200 transition shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 5. CUSTOM SECURE MODAL OVERLAY */}
      {modal && modal.isOpen && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100000] animate-fadeIn" id="custom-modal">
          <div className="bg-[#1e1e24] border border-zinc-800 rounded-xl p-5 w-[90%] max-w-sm shadow-2xl flex flex-col gap-4 text-zinc-300">
            <div className="flex items-center gap-2 text-violet-405 border-b border-zinc-800/80 pb-2.5">
              <div className="p-1 bg-violet-600/30 rounded border border-violet-500/20 text-violet-400">
                <Sparkles className="w-4 h-4 shrink-0" />
              </div>
              <h3 className="font-bold text-white text-sm">{modal.title}</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap select-text">{modal.message}</p>
            <div className="flex justify-end gap-2.5 mt-2">
              {modal.type === 'confirm' && (
                <button
                  onClick={() => setModal(null)}
                  className="px-3.5 py-1.5 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white text-zinc-400 text-xs font-semibold cursor-pointer transition"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  if (modal.type === 'confirm' && modal.onConfirm) {
                    modal.onConfirm();
                  }
                  setModal(null);
                }}
                className="px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold cursor-pointer transition shadow-sm"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
