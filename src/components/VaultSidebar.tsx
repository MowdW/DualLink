import React, { useState } from 'react';
import { Note, LocalFile } from '../types';
import { 
  Folder, 
  FileText, 
  Plus, 
  Search, 
  Trash, 
  HardDrive, 
  Sparkles,
  ChevronDown,
  ChevronRight,
  FileCode,
  FileAudio,
  FileImage,
  FileDown,
  FileQuestion,
  HelpCircle
} from 'lucide-react';

interface VaultSidebarProps {
  notes: Note[];
  currentNoteId: string;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (title: string, folder: string) => void;
  onDeleteNote: (noteId: string) => void;

  localFiles: LocalFile[];
  onRegisterLocalFile: (file: Omit<LocalFile, 'id' | 'addedAt'>) => void;
  onDeleteLocalFile: (fileId: string) => void;
  onSelectLocalFilePreview: (file: LocalFile) => void;
  selectedPreviewFile: LocalFile | null;

  activeTab: 'vault' | 'system-files' | 'instructions';
  setActiveTab: (tab: 'vault' | 'system-files' | 'instructions') => void;
  onShowConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export default function VaultSidebar({
  notes,
  currentNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  localFiles,
  onRegisterLocalFile,
  onDeleteLocalFile,
  onSelectLocalFilePreview,
  selectedPreviewFile,
  activeTab,
  setActiveTab,
  onShowConfirm
}: VaultSidebarProps) {
  // Folder lists
  const folders = Array.from(new Set(notes.map(n => n.folder)));
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create Note Form state
  const [showCreateNote, setShowCreateNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteFolder, setNewNoteFolder] = useState('项目管理');

  // Register File Form state
  const [showRegisterFile, setShowRegisterFile] = useState(false);
  const [regFileName, setRegFileName] = useState('');
  const [regPath, setRegPath] = useState('');
  const [regType, setRegType] = useState<'pdf' | 'image' | 'video' | 'audio' | 'markdown' | 'code' | 'other'>('pdf');
  const [regSize, setRegSize] = useState('1.5 MB');
  const [regContent, setRegContent] = useState('');

  const toggleFolder = (folder: string) => {
    setCollapsedFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
  };

  const handleCreateNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim()) return;
    onCreateNote(newNoteTitle.trim(), newNoteFolder);
    setNewNoteTitle('');
    setShowCreateNote(false);
  };

  const handleRegisterFileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFileName.trim() || !regPath.trim()) return;
    onRegisterLocalFile({
      name: regFileName.trim(),
      systemPath: regPath.trim(),
      type: regType,
      size: regSize,
      previewContent: regContent.trim() || undefined,
      previewUrl: regType === 'image' ? 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80' : undefined
    });
    // Reset
    setRegFileName('');
    setRegPath('');
    setRegType('pdf');
    setRegSize('1.5 MB');
    setRegContent('');
    setShowRegisterFile(false);
  };

  // Drag simulation helpers
  const handleDragStart = (e: React.DragEvent, file: LocalFile) => {
    const mdLink = `[📄 ${file.name}](local-file://${file.systemPath})`;
    e.dataTransfer.setData('text/plain', mdLink);
    e.dataTransfer.setData('application/json', JSON.stringify(file));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileDown className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'image': return <FileImage className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'code': return <FileCode className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'audio': return <FileAudio className="w-4 h-4 text-sky-400 shrink-0" />;
      case 'markdown': return <FileText className="w-4 h-4 text-purple-400 shrink-0" />;
      default: return <FileQuestion className="w-4 h-4 text-zinc-400 shrink-0" />;
    }
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-80 flex flex-col bg-[#1e1e24] border-r border-[#2d2d34] h-full text-zinc-300 font-sans" id="vault-sidebar">
      {/* Vault Header */}
      <div className="p-4 border-b border-[#2d2d34] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-violet-600/30 rounded-lg border border-violet-500/20">
              <Sparkles className="w-4 h-4 text-violet-400" />
            </div>
            <span className="font-semibold text-white tracking-tight">Obsidian 协同沙箱</span>
          </div>
          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700 font-mono">
            v1.0.0 (开发者视图)
          </span>
        </div>

        {/* Workspace Tab Selectors */}
        <div className="grid grid-cols-3 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
          <button
            onClick={() => setActiveTab('vault')}
            className={`py-1.5 rounded-md transition-all font-medium cursor-pointer ${
              activeTab === 'vault' 
                ? 'bg-[#2d2d34] text-white shadow-sm' 
                : 'text-zinc-400 hover:text-white'
            }`}
            id="tab-vault"
          >
            📂 笔记资源库
          </button>
          <button
            onClick={() => setActiveTab('system-files')}
            className={`py-1.5 rounded-md transition-all font-medium cursor-pointer ${
              activeTab === 'system-files' 
                ? 'bg-[#2d2d34] text-white shadow-sm' 
                : 'text-zinc-400 hover:text-white'
            }`}
            id="tab-system-files"
          >
            🖥️ 虚拟关联磁盘
          </button>
          <button
            onClick={() => setActiveTab('instructions')}
            className={`py-1.5 rounded-md transition-all font-medium cursor-pointer ${
              activeTab === 'instructions' 
                ? 'bg-[#2d2d34] text-white shadow-sm' 
                : 'text-zinc-400 hover:text-white'
            }`}
            id="tab-instructions"
          >
            📦 离线安装指南
          </button>
        </div>
      </div>

      {/* Main Tab Panel */}
      <div className="flex-1 overflow-y-auto min-h-0">
        
        {/* ================= TAB 1: NOTES VAULT ================= */}
        {activeTab === 'vault' && (
          <div className="p-3 flex flex-col gap-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索笔记标题或正文内容..."
                className="w-full bg-zinc-900 border border-zinc-800/80 rounded-md py-2 pl-9 pr-4 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50 transition-colors"
                id="notes-search-input"
              />
            </div>

            {/* Note Creation Header */}
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
              <span>文件夹目录结构</span>
              <button
                onClick={() => setShowCreateNote(!showCreateNote)}
                className="p-1 hover:bg-zinc-800 rounded-md text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
                title="新建 Obsidian 双链笔记"
                id="btn-show-create-note"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Inline Creation Form */}
            {showCreateNote && (
              <form onSubmit={handleCreateNoteSubmit} className="bg-zinc-900 p-3 rounded-lg border border-zinc-800/80 flex flex-col gap-2.5 animate-fadeIn">
                <div>
                  <label className="block text-[11px] text-zinc-400 font-medium mb-1">笔记标题</label>
                  <input
                    type="text"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="例如: 🎯 产品规划大纲"
                    className="w-full bg-[#1e1e24] border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    autoFocus
                    required
                    id="new-note-title"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 font-medium mb-1">存放目标文件夹</label>
                  <select
                    value={newNoteFolder}
                    onChange={(e) => setNewNoteFolder(e.target.value)}
                    className="w-full bg-[#1e1e24] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 cursor-pointer"
                    id="new-note-folder"
                  >
                    <option value="项目管理">📁 项目管理 (Work)</option>
                    <option value="工程技术">📁 工程技术 (Engineering)</option>
                    <option value="产品规划">📁 产品规划 (Product)</option>
                    <option value="个人收件箱">📁 个人收件箱 (Personal)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateNote(false)}
                    className="px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 rounded transition cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs bg-violet-600 hover:bg-violet-500 text-white font-medium rounded transition cursor-pointer"
                    id="submit-new-note"
                  >
                    立刻创建
                  </button>
                </div>
              </form>
            )}

            {/* Folder / Note Tree View */}
            <div className="flex flex-col gap-1">
              {folders.map(folderName => {
                const isCollapsed = collapsedFolders[folderName];
                const folderNotes = filteredNotes.filter(n => n.folder === folderName);

                if (folderNotes.length === 0 && searchQuery) return null;

                return (
                  <div key={folderName} className="flex flex-col">
                    {/* Folder Row */}
                    <div 
                      onClick={() => toggleFolder(folderName)}
                      className="flex items-center gap-1.5 py-1.5 px-2 hover:bg-zinc-800/40 rounded cursor-pointer transition select-none text-xs font-medium text-zinc-400 hover:text-zinc-200"
                    >
                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <Folder className="w-4 h-4 text-violet-500/80 fill-violet-500/10" />
                      <span>{folderName}</span>
                      <span className="ml-auto text-[10px] text-zinc-650 bg-zinc-900/60 px-1.5 py-0.2 rounded-full border border-zinc-850">
                        {folderNotes.length}
                      </span>
                    </div>

                    {/* Folder Notes Children */}
                    {!isCollapsed && (
                      <div className="pl-4 border-l border-zinc-850 ml-3.5 my-1 gap-0.5 flex flex-col">
                        {folderNotes.map(note => {
                          const isCurrent = note.id === currentNoteId;
                          return (
                            <div
                              key={note.id}
                              className={`group flex items-center justify-between py-1.5 px-2.5 rounded cursor-pointer text-xs transition-all ${
                                isCurrent 
                                  ? 'bg-violet-950/40 border border-violet-900/30 text-white font-medium shadow-sm' 
                                  : 'hover:bg-zinc-800/60 text-zinc-300 hover:text-white'
                              }`}
                              onClick={() => onSelectNote(note.id)}
                            >
                              <div className="flex items-center gap-2 overflow-hidden mr-2">
                                <FileText className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-violet-400' : 'text-zinc-500'}`} />
                                <span className="truncate">{note.title}</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onShowConfirm(
                                    "确认删除笔记",
                                    `您确定要彻底删除笔记 "${note.title}" 吗？此操作将使该笔记从保险箱（Vault）中完全抹去，绑定的链接引用可能失效。`,
                                    () => onDeleteNote(note.id)
                                  );
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-700 hover:text-rose-450 rounded text-zinc-500 hover:text-zinc-200 transition shrink-0 cursor-pointer"
                                title="删除此笔记"
                              >
                                <Trash className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredNotes.length === 0 && (
                <div className="text-center py-8 text-xs text-zinc-650">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  未能检索到符合过滤条件的笔记。
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: REGISTERED SYSTEM LOCAL FILES ================= */}
        {activeTab === 'system-files' && (
          <div className="p-3 flex flex-col gap-4 animate-fadeIn">
            {/* Context Notice */}
            <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800 text-[11px] text-zinc-400">
              <div className="flex gap-2 items-start">
                <HardDrive className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-zinc-200">系统绝对路径物理映射</strong>
                  <p className="mt-1 leading-relaxed">
                    这些文件驻留在您的<strong>物理计算机硬盘</strong>中，不受软件沙箱约束。
                  </p>
                  <p className="mt-1 text-violet-400 font-medium">
                    💡 使用方法：用鼠标直接拖拽下方文件块，甩入右侧 Markdown 编辑器中，即可生成契合 Obsidian 桌面原生的本地文件直链！
                  </p>
                </div>
              </div>
            </div>

            {/* Sub-header */}
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
              <span>本地关联磁盘资源</span>
              <button
                onClick={() => setShowRegisterFile(!showRegisterFile)}
                className="p-1 hover:bg-zinc-800 rounded-md text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                title="关联全新的本地物理文件绝对路径"
                id="btn-show-register-file"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Register New File Form */}
            {showRegisterFile && (
              <form onSubmit={handleRegisterFileSubmit} className="bg-zinc-900 p-3 rounded-lg border border-zinc-800/80 flex flex-col gap-2.5 animate-fadeIn">
                <div>
                  <label className="block text-[11px] text-zinc-400 font-medium mb-1">文件名称 (含后缀名)</label>
                  <input
                    type="text"
                    value={regFileName}
                    onChange={(e) => setRegFileName(e.target.value)}
                    placeholder="例如: client_contract_final.pdf"
                    className="w-full bg-[#1e1e24] border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    required
                    id="new-file-name"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 font-medium mb-1">本地硬盘绝对路径 (物理路径)</label>
                  <input
                    type="text"
                    value={regPath}
                    onChange={(e) => setRegPath(e.target.value)}
                    placeholder="例如: /Users/admin/Documents/contract.pdf"
                    className="w-full bg-[#1e1e24] border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono placeholder-zinc-650 focus:outline-none focus:border-violet-500"
                    required
                    id="new-file-path"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-zinc-400 font-medium mb-1">媒介性质 (类型)</label>
                    <select
                      value={regType}
                      onChange={(e) => setRegType(e.target.value as any)}
                      className="w-full bg-[#1e1e24] border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-violet-500 cursor-pointer"
                      id="new-file-type"
                    >
                      <option value="pdf">📄 PDF 文档</option>
                      <option value="image">🖼️ 图片设计稿</option>
                      <option value="code">⚙️ 源码 / JSON</option>
                      <option value="audio">🎵 音频采访</option>
                      <option value="markdown">📝 Markdown 外部件</option>
                      <option value="other">❓ 杂项二进制流</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 font-medium mb-1">名义大小</label>
                    <input
                      type="text"
                      value={regSize}
                      onChange={(e) => setRegSize(e.target.value)}
                      placeholder="e.g. 5.1 MB"
                      className="w-full bg-[#1e1e24] border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      id="new-file-size"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 font-medium mb-1">文件摘要内容 (提供悬浮视口速览)</label>
                  <textarea
                    value={regContent}
                    onChange={(e) => setRegContent(e.target.value)}
                    placeholder="您可以在此处编辑该物理文件的摘要，其将呈现在实时卡片、出链或审查器中..."
                    rows={2}
                    className="w-full bg-[#1e1e24] border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500 resize-none font-mono"
                    id="new-file-content"
                  />
                </div>

                <div className="flex justify-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setShowRegisterFile(false)}
                    className="px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 rounded transition cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded transition cursor-pointer"
                    id="btn-register-file-confirm"
                  >
                    注册外部关联
                  </button>
                </div>
              </form>
            )}

            {/* List of Registered Local Files */}
            <div className="flex flex-col gap-1.5">
              {localFiles.map(file => {
                const isSelected = selectedPreviewFile?.id === file.id;
                return (
                  <div
                    key={file.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, file)}
                    onClick={() => onSelectLocalFilePreview(file)}
                    className={`group relative p-2.5 rounded-lg border cursor-grab active:cursor-grabbing transition-all select-none flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-white shadow-md'
                        : 'bg-zinc-900/60 border-zinc-850 hover:bg-zinc-900 hover:border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {getFileIcon(file.type)}
                        <strong className="text-xs truncate font-medium group-hover:text-white transition-colors">
                          {file.name}
                        </strong>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowConfirm(
                            "确认解绑文件",
                            `您确定要解除外部磁盘绝对路径 "${file.name}" 对当前沙箱的安全绑定吗？此操作不会对您磁盘上的真实物理数据进行任何篡改或修改。`,
                            () => onDeleteLocalFile(file.id)
                          );
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-800 hover:text-rose-450 rounded text-zinc-500 hover:text-zinc-200 transition shrink-0 cursor-pointer"
                        title="解绑本地文件映射"
                      >
                        <Trash className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-[10px] text-zinc-500 font-mono truncate" title={file.systemPath}>
                      {file.systemPath}
                    </div>

                    <div className="flex justify-between items-center mt-1 text-[10px] text-zinc-500">
                      <span>文件大小: {file.size}</span>
                      <span className="text-[9px] bg-zinc-800/80 px-1.5 py-0.2 rounded text-zinc-400 font-sans border border-zinc-850">
                        🔗 拖拽进文档直接生成双链
                      </span>
                    </div>
                  </div>
                );
              })}

              {localFiles.length === 0 && (
                <div className="text-center py-10 text-zinc-650 text-xs">
                  暂未登记外部磁盘绝对路径，请点击上方的 “+” 按钮完成关联绑定。
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: PLUGIN INSTALL INSTRUCTIONS ================= */}
        {activeTab === 'instructions' && (
          <div className="p-4 flex flex-col gap-4 animate-fadeIn text-xs text-zinc-300 leading-relaxed">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1 bg-violet-600/30 rounded border border-violet-500/20 text-violet-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-white text-sm">Obsidian 插件标准开发流程</h3>
            </div>

            <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-3 flex flex-col gap-2.5">
              <span className="font-semibold text-white text-[11px] uppercase tracking-wide text-violet-400">Step 1. 初始化项目</span>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                在本地系统终端，进入您的 Obsidian 测试库，创建专属插件目录并安装官方开发包：
              </p>
              <pre className="bg-zinc-900/90 border border-zinc-850 p-2 rounded text-[10.5px] font-mono text-zinc-300 select-text overflow-x-auto leading-normal">
{`# 1. 进入测试库的插件目录
cd your-vault/.obsidian/plugins/

# 2. 生成插件文件夹并进入
mkdir obsidian-local-file-linker
cd obsidian-local-file-linker

# 3. 初始化 package.json 并安装 SDK
npm init -y
npm install obsidian typescript @types/node tsc --save-dev`}
              </pre>
            </div>

            <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-3 flex flex-col gap-2.5">
              <span className="font-semibold text-white text-[11px] uppercase tracking-wide text-amber-400">Step 2. 核心架构文件</span>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                标准的 Obsidian 插件必须包含以下三个文件在根目录下：
              </p>
              <ul className="flex flex-col gap-2 text-[11px] text-zinc-300">
                <li className="flex gap-1.5 items-start">
                  <span className="text-violet-400 font-bold font-mono">1. manifest.json</span>
                  <span className="text-zinc-450 text-zinc-400">描述插件元数据（ID、名称、版本、是否仅限电脑端等）。</span>
                </li>
                <li className="flex gap-1.5 items-start">
                  <span className="text-emerald-400 font-bold font-mono">2. main.ts</span>
                  <span className="text-zinc-450 text-zinc-400">插件主逻辑入口，继承自 <code className="bg-zinc-900 border border-zinc-850 px-1 py-0.2 rounded font-mono text-[10px] text-pink-400">Plugin</code> 类。</span>
                </li>
                <li className="flex gap-1.5 items-start">
                  <span className="text-rose-400 font-bold font-mono">3. esbuild.config.mjs</span>
                  <span className="text-zinc-450 text-zinc-400">编译构建脚本，将 TypeScript 及其依赖快速打包成单个 main.js 文件。</span>
                </li>
              </ul>
            </div>

            <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-3 flex flex-col gap-2.5">
              <span className="font-semibold text-white text-[11px] uppercase tracking-wide text-emerald-400">Step 3. 编译构建脚本</span>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                创建 <code className="bg-zinc-900 border border-zinc-850 px-1 py-0.2 rounded font-mono text-[10px] text-white">esbuild.config.mjs</code> 配置文件实现热重载监听：
              </p>
              <pre className="bg-zinc-900/90 border border-zinc-850 p-2 rounded text-[10px] font-mono text-zinc-300 select-text overflow-x-auto max-h-48 overflow-y-auto leading-normal">
{`import esbuild from "esbuild";
import process from "process";

const banner = \`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
*/\`;

const isProd = process.argv[2] === "production";

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr"
  ],
  format: "cjs",
  target: "es2020",
  sourcemap: isProd ? false : "inline",
  minify: isProd,
  outfile: "main.js",
});

if (isProd) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}`}
              </pre>
            </div>

            <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-3 flex flex-col gap-2.5">
              <span className="font-semibold text-white text-[11px] uppercase tracking-wide text-rose-400">Step 4. 执行编译与启用</span>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                在 package.json 中配置 scripts 脚本，方便一键构建插件：
              </p>
              <pre className="bg-zinc-900/90 border border-zinc-850 p-2 rounded text-[10.5px] font-mono text-zinc-300 select-text overflow-x-auto leading-normal">
{`"scripts": {
  "dev": "node esbuild.config.mjs",
  "build": "node esbuild.config.mjs production"
}`}
              </pre>
              <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">
                执行开发热重载构建：
              </p>
              <pre className="bg-zinc-900/90 border border-zinc-850 p-2 rounded text-[10.5px] font-mono text-zinc-300 select-text overflow-x-auto leading-normal">
{`npm run dev`}
              </pre>
              <ol className="list-decimal pl-4 flex flex-col gap-1 mt-1 text-zinc-400 text-[11px]">
                <li>编译生成后，文件夹下将包含 <strong className="text-white">main.js</strong> 和 <strong className="text-white">manifest.json</strong>。</li>
                <li>打开 Obsidian 应用，进入 <strong>设置 → 第三方插件</strong> (Community Plugins)。</li>
                <li>关闭安全模式 (Safe Mode)，找到列表中的 <strong className="text-white">DualLink</strong> 并打开它。</li>
              </ol>
            </div>

            <div className="bg-violet-955/20 border border-violet-900/30 rounded-lg p-3 flex flex-col gap-1 text-violet-300 bg-violet-950/20">
              <span className="font-bold text-[11.5px] text-white flex items-center gap-1.5">
                🚨 Electron 平台安全最佳实践
              </span>
              <p className="text-[11px] leading-relaxed text-zinc-300">
                由于 Obsidian 是基于 Electron 壳体运行的，这意味着您的插件可以通过 Node.js 标准原生接口（如 <code className="bg-zinc-950 px-1 py-0.2 rounded font-mono text-[10px] text-violet-400">fs</code> 模块）直接读取系统磁盘上的文件，从而在不将文件移动或导入软件的情况下完成实时预览。
              </p>
              <p className="text-[11px] leading-relaxed text-zinc-300 mt-1">
                1. <strong>转换本地协议路径</strong>：为了让 Obsidian 内置 Chromium 内核安全呈现本地图片，建议使用 <code className="bg-zinc-950 px-1 py-0.2 rounded font-mono text-[10px] text-yellow-400">app.vault.adapter.convertFileToAdulAssetUrl(path)</code> 转换本地路径，阻止 CORS 壁垒。
              </p>
              <p className="text-[11px] leading-relaxed text-zinc-300 mt-1">
                2. <strong>使用安全外壳打开</strong>：调用 <code className="bg-zinc-950 px-1 py-0.2 rounded font-mono text-[10px] text-violet-400">require('electron').shell.openPath(path)</code> 唤醒系统默认应用来打开 PDF / 音频，兼顾效率与沙箱安全。
              </p>
            </div>
          </div>
        )}

      </div>
      
      {/* Help Footer */}
      <div className="p-3 border-t border-[#2d2d34] bg-zinc-900/40 text-[11px] text-zinc-500 flex justify-between items-center">
        <span className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>需要绑定或联通本地绝对路径？</span>
        </span>
        <button 
          onClick={() => setActiveTab('instructions')}
          className="text-violet-400 hover:text-violet-300 font-medium cursor-pointer transition-colors"
        >
          查看接入文档
        </button>
      </div>
    </div>
  );
}
