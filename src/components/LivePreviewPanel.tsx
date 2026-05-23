import React, { useState, useEffect } from 'react';
import { LocalFile, Note } from '../types';
import { 
  FileText, 
  Copy,
  Check,
  Cpu,
  Layers,
  FileDown,
  FileImage,
  FileCode,
  FileAudio,
  Info,
  Calendar,
  FolderOpen,
  Play,
  Pause
} from 'lucide-react';
import MANIFEST_JSON from '../../manifest.json?raw';
import MAIN_TS from '../../main.ts?raw';

interface LivePreviewPanelProps {
  activeFile: LocalFile | null;
  activeNote: Note;
  localFiles: LocalFile[];
  onSelectLocalFile: (file: LocalFile) => void;
  onNotification: (msg: string, type: 'success' | 'info') => void;
  onShowAlert: (title: string, message: string) => void;
}

export default function LivePreviewPanel({
  activeFile,
  activeNote,
  localFiles,
  onSelectLocalFile,
  onNotification,
  onShowAlert
}: LivePreviewPanelProps) {
  const [copiedManifest, setCopiedManifest] = useState(false);
  const [copiedMain, setCopiedMain] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  
  // Tab within inspector
  const [panelMode, setPanelMode] = useState<'preview' | 'outgoing' | 'source'>('preview');

  // Automatically switch panel view mode back to Link Preview when a new file is clicked/selected
  useEffect(() => {
    if (activeFile) {
      setPanelMode('preview');
    }
  }, [activeFile]);

  // Parse outgoing links in current active note
  const getLinkedLocalPaths = (content: string): string[] => {
    const regex = /\[[^\]]+\]\((local-file:\/\/[^)]+)\)/g;
    const paths: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      const url = match[1];
      const parsedPath = decodeURIComponent(url.replace('local-file://', '').replace(/^\/\/\//, ''));
      if (!paths.includes(parsedPath)) {
        paths.push(parsedPath);
      }
    }
    return paths;
  };

  const linkedPaths = getLinkedLocalPaths(activeNote.content);
  const outgoingFiles = localFiles.filter(f => 
    linkedPaths.some(p => p.toLowerCase() === f.systemPath.toLowerCase())
  );

  const handleCopyText = (text: string, type: 'manifest' | 'main' | 'path') => {
    navigator.clipboard.writeText(text);
    onNotification('已成功复制文本到系统剪贴板！', 'success');
    if (type === 'manifest') {
      setCopiedManifest(true);
      setTimeout(() => setCopiedManifest(false), 2000);
    } else if (type === 'main') {
      setCopiedMain(true);
      setTimeout(() => setCopiedMain(false), 2000);
    } else {
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileDown className="w-5 h-5 text-rose-400 shrink-0" />;
      case 'image': return <FileImage className="w-5 h-5 text-emerald-400 shrink-0" />;
      case 'code': return <FileCode className="w-5 h-5 text-amber-400 shrink-0" />;
      case 'audio': return <FileAudio className="w-5 h-5 text-sky-400 shrink-0" />;
      default: return <FileText className="w-5 h-5 text-purple-400 shrink-0" />;
    }
  };

  return (
    <div className="w-[360px] xl:w-[420px] flex flex-col bg-[#111115] border-l border-[#2d2d34] h-full text-zinc-300 font-sans" id="live-preview-panel">
      
      {/* Panel Selector Navbar */}
      <div className="flex border-b border-[#2d2d34] bg-[#1a1a20] shrink-0 select-none">
        <button
          onClick={() => setPanelMode('preview')}
          className={`flex-1 py-3 text-xs font-semibold tracking-wide border-b-2 transition cursor-pointer ${
            panelMode === 'preview'
              ? 'border-violet-500 text-white bg-[#1e1e24]/40'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          id="btn-inspector-preview"
        >
          🔍 属性审查 (Preview)
        </button>
        <button
          onClick={() => setPanelMode('outgoing')}
          className={`flex-1 py-3 text-xs font-semibold tracking-wide border-b-2 transition relative cursor-pointer ${
            panelMode === 'outgoing'
              ? 'border-violet-500 text-white bg-[#1e1e24]/40'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          id="btn-inspector-outgoing"
        >
          ⛓️ 当前出链 ({outgoingFiles.length})
        </button>
        <button
          onClick={() => setPanelMode('source')}
          className={`flex-1 py-3 text-xs font-semibold tracking-wide border-b-2 transition cursor-pointer ${
            panelMode === 'source'
              ? 'border-violet-500 text-white bg-[#1e1e24]/40'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          id="btn-inspector-source"
        >
          💻 插件核心源码
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        
        {/* ================= MODE 1: FILE PREVIEW ================= */}
        {panelMode === 'preview' && (
          <div className="p-4 flex flex-col gap-4 animate-fadeIn">
            {activeFile ? (
              <div className="flex flex-col gap-4">
                {/* Header info */}
                <div className="bg-[#1e1e24] p-3.5 rounded-xl border border-zinc-800 flex flex-col gap-2">
                  <div className="flex gap-2.5 items-start">
                    <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-850">
                      {getFileIcon(activeFile.type)}
                    </div>
                    <div className="overflow-hidden flex-1">
                      <h3 className="font-bold text-white text-xs md:text-sm truncate" title={activeFile.name}>
                        {activeFile.name}
                      </h3>
                      <div className="text-[10px] text-zinc-500 truncate" title={activeFile.systemPath}>
                        {activeFile.systemPath}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-850/60 pt-2.5 mt-1 text-[11px] text-zinc-550 text-zinc-400">
                    <span className="bg-zinc-900 px-2 py-0.5 rounded font-mono text-[10px] uppercase text-zinc-400">
                      .{activeFile.name.split('.').pop() || 'tmp'} 协议格式
                    </span>
                    <span>文件大小: {activeFile.size}</span>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleCopyText(activeFile.systemPath, 'path')}
                      className="flex-1 py-1.5 px-3 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded text-[11px] text-zinc-300 font-medium transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedPath ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                      <span>复制绝对路径</span>
                    </button>
                    <button
                      onClick={() => {
                        onNotification(`正在向系统发起唤醒进程指令...`, 'info');
                        onShowAlert(
                          "系统原生程序挂载 (桌面模拟)",
                          `【Electron 操作系统桥接】\n我们成功向桌端底层接口发送安全寻址信号：\n\nrequire('electron').shell.openPath("${activeFile.systemPath}")\n\n该操作将调取操作系统底层默认程序(例如 Adobe Acrobat, 系统播放器等) 直接唤现打开此本地磁盘文件！`
                        );
                      }}
                      className="flex-1 py-1.5 px-3 bg-violet-600 hover:bg-violet-500 text-white rounded text-[11px] font-semibold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-white/90 shrink-0" />
                      <span>唤起系统打开</span>
                    </button>
                  </div>
                </div>

                {/* Simulated Viewer Area matching main.ts output exactly */}
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-1 mt-1 select-none">
                  🎯 悬停卡片真实渲染效果 (Plugin Hover Preview)
                </h4>

                <div 
                  className="local-preview-popover" 
                  style={{
                    background: 'var(--background-secondary, #1e1e24)',
                    border: '1px solid var(--border-color, #2d2d34)',
                    borderRadius: '8px',
                    padding: '12px',
                    width: '320px',
                    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
                    color: 'var(--text-normal, #e4e4e7)',
                    position: 'relative',
                    alignSelf: 'center',
                    marginTop: '8px'
                  }}
                >
                  {/* Image Format */}
                  {activeFile.type === 'image' && (
                    <>
                      <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '11px', opacity: 0.8, color: '#a78bfa' }}>🖼️ 高清图片预览 (Image Viewport)</div>
                      <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeFile.name}</div>
                      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '4px', display: 'flex', justifyContent: 'center' }}>
                        <img src={activeFile.previewUrl || ''} style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: '4px' }} />
                      </div>
                    </>
                  )}

                  {/* PDF Format */}
                  {activeFile.type === 'pdf' && (
                    <>
                      <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '11px', opacity: 0.8, color: '#fb7185' }}>📄 PDF 文档阅读器</div>
                      <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeFile.name}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '110px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '11px', border: '1px dashed rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: '24px', marginBottom: '8px' }}>📕</span>
                        <span style={{ fontWeight: 'bold' }}>Adobe PDF 电子文书格式</span>
                        <span style={{ fontSize: '9px', opacity: 0.5, marginTop: '4px' }}>由于沙箱限制，请点击外部链接直接调用本地阅读器打开</span>
                      </div>
                    </>
                  )}

                  {/* Audio Format */}
                  {activeFile.type === 'audio' && (
                    <>
                      <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '11px', opacity: 0.8, color: '#38bdf8' }}>🎵 音频播放器 (Audio Player)</div>
                      <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeFile.name}</div>
                      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '8px' }}>
                        <audio controls controlsList="nodownload" src={activeFile.previewUrl || ''} style={{ width: '100%', height: '32px', outline: 'none', borderRadius: '4px', opacity: 0.9 }}></audio>
                      </div>
                    </>
                  )}

                  {/* Code / Markdown / Text Format */}
                  {(activeFile.type === 'code' || activeFile.type === 'markdown' || activeFile.type === 'other') && (
                    <>
                      <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '11px', opacity: 0.8, color: '#f59e0b' }}>⚙️ 文本 / 代码摘要 (Text Summary)</div>
                      <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeFile.name}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '10px', maxHeight: '120px', overflowY: 'auto', background: '#141418', borderRadius: '6px', padding: '8px', wordBreak: 'break-all', whiteSpace: 'pre-wrap', border: '1px solid rgba(255,255,255,0.05)', color: '#34d399' }}>
                        {activeFile.previewContent || '正在利用 Node.js 物理缓冲区扫描磁盘特征并载入摘要...'}
                      </div>
                    </>
                  )}
                </div>
                
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-4 px-6 select-none">
                <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/60 text-zinc-500 relative">
                  <Cpu className="w-10 h-10 text-violet-500/40 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-xs md:text-sm tracking-wide">悬停快速预览就绪</h3>
                  <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                    在左侧笔记编辑器内，将光标<strong>悬停</strong>在任意含有紫色后缀的 <strong className="text-violet-400 font-semibold">local-file://</strong> 协议链上，或直接在左侧文件库管理页面中双击、点击外部关联资源，便能立刻在此调取硬盘沙箱的只读多态预监。
                  </p>
                </div>
                <div className="bg-zinc-900/40 border border-zinc-850 p-2.5 rounded-lg text-[10.5px] text-zinc-500 text-left flex gap-2 w-full mt-2">
                  <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                  <p>提示：本插件采用安全无侵入的只读指针在 Electron 进程层面注册外部操作系统 API，不会给主程序性能带来冗余拖慢！</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= MODE 2: CURRENT NOTE OUTGOING LINKS ================= */}
        {panelMode === 'outgoing' && (
          <div className="p-4 flex flex-col gap-4 animate-fadeIn">
            <div className="flex items-center gap-1.5 px-1 select-none">
              <span className="font-semibold text-white text-xs">当前笔记所引用的系统链</span>
              <span className="text-[10px] bg-zinc-850 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
                已分析出 {outgoingFiles.length} 个本地硬链接
              </span>
            </div>

            <p className="text-[11px] text-zinc-500 px-1 leading-relaxed select-none">
              基于 Obsidian 自适应文档树（AST）语法树主动分析系统，我们自动抓取文章内部所有的绝对路径映射寻址，以此支撑复杂的知识双网穿梭。
            </p>

            <div className="flex flex-col gap-2 mt-1">
              {outgoingFiles.map(file => (
                <div
                  key={file.id}
                  onClick={() => onSelectLocalFile(file)}
                  className="bg-zinc-900/60 border border-zinc-850 hover:bg-zinc-900 hover:border-zinc-800 p-2.5 rounded-lg cursor-pointer transition flex justify-between items-center gap-2 group text-xs text-left"
                >
                  <div className="overflow-hidden flex-1 flex flex-col gap-0.5">
                    <span className="font-medium text-zinc-200 group-hover:text-violet-400 transition truncate">
                      {file.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 truncate font-mono">
                      {file.systemPath}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono font-medium shrink-0">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                    <span>映射建立</span>
                  </div>
                </div>
              ))}

              {outgoingFiles.length === 0 && (
                <div className="text-center py-12 text-zinc-605 text-zinc-600 text-xs">
                  当前双链笔记内容中暂不包含本地协议映射链接。
                  <p className="text-[11px] text-zinc-500 mt-1 italic">
                    通过拖拽或者编辑器下方快捷关联工具即可马上建立引用。
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= MODE 3: PLUGIN SOURCE CODE EXPORTER ================= */}
        {panelMode === 'source' && (
          <div className="p-4 flex flex-col gap-4 animate-fadeIn">
            
            <div className="bg-zinc-900/80 p-3 rounded-lg border border-zinc-850 text-xs leading-relaxed">
              <span className="font-semibold text-white block mb-1">💻 开发者自研及插件配置导出端</span>
              以下是在实际 Obsidian 会话环境中直接部署所需的完备工程代码。这涵盖了鼠标拖动代理行为（Drop Event Handler）以及 Electron 系统默认程序执行。
            </div>

            {/* Config Item 1: manifest.json */}
            <div className="flex flex-col border border-zinc-850 rounded-lg overflow-hidden">
              <div className="bg-zinc-900/90 px-3 py-2 border-b border-zinc-850 flex justify-between items-center text-xs font-semibold text-white">
                <span>manifest.json (插件配置文件)</span>
                <button
                  onClick={() => handleCopyText(MANIFEST_JSON, 'manifest')}
                  className="text-[10px] bg-zinc-800 hover:bg-zinc-700 hover:text-white px-2 py-1 rounded border border-zinc-700 transition flex items-center gap-1 font-mono cursor-pointer"
                >
                  {copiedManifest ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                  <span>{copiedManifest ? '已复制' : '复制配置'}</span>
                </button>
              </div>
              <div className="p-3 bg-zinc-950 font-mono text-[10px] text-amber-300 leading-relaxed max-h-40 overflow-y-auto select-text">
                <pre>{MANIFEST_JSON}</pre>
              </div>
            </div>

            {/* Config Item 2: main.ts */}
            <div className="flex flex-col border border-zinc-850 rounded-lg overflow-hidden">
              <div className="bg-zinc-900/90 px-3 py-2 border-b border-zinc-850 flex justify-between items-center text-xs font-semibold text-white">
                <span>main.ts (TypeScript 插件主逻辑)</span>
                <button
                  onClick={() => handleCopyText(MAIN_TS, 'main')}
                  className="text-[10px] bg-zinc-800 hover:bg-zinc-700 hover:text-white px-2 py-1 rounded border border-zinc-700 transition flex items-center gap-1 font-mono cursor-pointer"
                >
                  {copiedMain ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-zinc-400" />}
                  <span>{copiedMain ? '已复制' : '复制源码'}</span>
                </button>
              </div>
              <div className="p-3 bg-zinc-950 font-mono text-[10px] text-zinc-400 leading-relaxed h-72 overflow-y-auto select-text">
                <pre>{MAIN_TS}</pre>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}
