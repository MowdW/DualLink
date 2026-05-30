import React, { useState, useRef } from 'react';
import { Note, LocalFile } from '../types';
import { 
  Eye, 
  Edit3, 
  Columns, 
  ExternalLink, 
  FileText,
  MousePointerClick,
  Sparkles
} from 'lucide-react';

interface MarkdownEditorProps {
  note: Note;
  onUpdateNoteContent: (content: string) => void;
  localFiles: LocalFile[];
  onTriggerHoverPreview: (filePath: string, anchorRef: HTMLAnchorElement, show: boolean) => void;
  onOpenFileInLivePreview: (filePath: string) => void;
  onNotification: (msg: string, type: 'success' | 'info') => void;
}

export default function MarkdownEditor({
  note,
  onUpdateNoteContent,
  localFiles,
  onTriggerHoverPreview,
  onOpenFileInLivePreview,
  onNotification
}: MarkdownEditorProps) {
  // Mode selection: 'edit' | 'split' | 'preview'
  const [editorMode, setEditorMode] = useState<'edit' | 'split' | 'preview'>('split');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [replacingLineIndex, setReplacingLineIndex] = useState<number | null>(null);
  const [addingToBlockItems, setAddingToBlockItems] = useState<{ text: string; lineIndex: number }[] | null>(null);

  const handleUpdateColumns = (targetColumns: number, contentItems: { text: string; lineIndex: number }[]) => {
    const lines = note.content.split('\n');
    const firstItem = contentItems[0];
    if (firstItem && firstItem.text.trim().startsWith('{')) {
        try {
            const config = JSON.parse(firstItem.text.trim());
            config.columns = targetColumns;
            lines[firstItem.lineIndex] = JSON.stringify(config);
        } catch (e) {
            lines[firstItem.lineIndex] = `{ "columns": ${targetColumns} }`;
        }
    } else if (firstItem) {
        lines.splice(firstItem.lineIndex, 0, `{ "columns": ${targetColumns} }`);
    }
    onUpdateNoteContent(lines.join('\n'));
    onNotification(`已成功将分栏组图列数调整为 ${targetColumns}。`, 'success');
  };

  const handleAppendImage = (contentItems: { text: string; lineIndex: number }[], file: LocalFile) => {
    const lines = note.content.split('\n');
    const cleanPath = file.systemPath.replace(/\\/g, '/');
    const pathNoSlash = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    const ext = file.systemPath.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext);
    
    let newSyntax = '';
    if (isImage) {
        const pathNoLeadingSlash = pathNoSlash.startsWith('/') ? pathNoSlash.substring(1) : pathNoSlash;
        newSyntax = `![🖼 ${file.name}](<file:///${pathNoLeadingSlash}>)`;
    } else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
        newSyntax = `<video src="app://local${pathNoSlash}" controls></video>`;
    } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
        newSyntax = `<audio src="app://local${pathNoSlash}" controls></audio>`;
    } else {
        newSyntax = `[📄 ${file.name}](<local-file://${file.systemPath}>)`;
    }
    
    const lastItem = contentItems[contentItems.length - 1];
    const insertIndex = lastItem.lineIndex + 1;
    
    lines.splice(insertIndex, 0, newSyntax);
    onUpdateNoteContent(lines.join('\n'));
    setAddingToBlockItems(null);
    onNotification(`已成功向组图中追加并排入图片 "${file.name}"。`, 'success');
  };

  const handleRemoveGalleryImage = (lineIndex: number) => {
    const lines = note.content.split('\n');
    lines.splice(lineIndex, 1); // Delete the exact line!
    onUpdateNoteContent(lines.join('\n'));
    onNotification('已成功从分栏组图中移除该图片，Markdown 内容已同步联动修改。', 'success');
  };

  const handleReplaceGalleryImage = (lineIndex: number, file: LocalFile) => {
    const lines = note.content.split('\n');
    const cleanPath = file.systemPath.replace(/\\/g, '/');
    const pathNoSlash = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    const ext = file.systemPath.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext);
    
    let newSyntax = '';
    if (isImage) {
        const pathNoLeadingSlash = pathNoSlash.startsWith('/') ? pathNoSlash.substring(1) : pathNoSlash;
        newSyntax = `![🖼 ${file.name}](<file:///${pathNoLeadingSlash}>)`;
    } else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
        newSyntax = `<video src="app://local${pathNoSlash}" controls></video>`;
    } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
        newSyntax = `<audio src="app://local${pathNoSlash}" controls></audio>`;
    } else {
        newSyntax = `[📄 ${file.name}](<local-file://${file.systemPath}>)`;
    }
    
    lines[lineIndex] = newSyntax;
    onUpdateNoteContent(lines.join('\n'));
    setReplacingLineIndex(null);
    onNotification(`已成功替换该单元图片为 "${file.name}"。`, 'success');
  };

  const renderGalleryBlock = (contentItems: { text: string; lineIndex: number }[], idx: number) => {
    let columns = 3;
    let images: { path: string; rawLine: string; lineIndex: number }[] = [];
    let isConfig = true;

    for (const item of contentItems) {
      const trimmed = item.text.trim();
      if (!trimmed) continue;
      if (isConfig && trimmed.startsWith('{')) {
        try {
          const config = JSON.parse(trimmed);
          if (config.columns) columns = config.columns;
        } catch (e) { }
        isConfig = false;
      } else {
        isConfig = false;
        
        let path = trimmed;
        if (trimmed.startsWith('![[') && trimmed.endsWith(']]')) {
            path = trimmed.substring(3, trimmed.length - 2);
        } else {
            const labelMatch = trimmed.match(/!\[([^\]]*)\]\((?:<([^>]+)>|([^)]+))\)/);
            if (labelMatch) {
                path = labelMatch[2] || labelMatch[3];
            }
        }
        
        images.push({ path, rawLine: item.text, lineIndex: item.lineIndex });
      }
    }

    const resolvedImages = images.map(img => {
      let absolutePath = img.path;
      if (absolutePath.startsWith('file:///')) {
          absolutePath = decodeURIComponent(absolutePath.replace('file:///', '').replace('file://', ''));
      } else if (absolutePath.startsWith('local-file://')) {
          absolutePath = decodeURIComponent(absolutePath.replace('local-file://', ''));
      } else if (absolutePath.startsWith('app://')) {
          absolutePath = decodeURIComponent(absolutePath.replace('app://local/', '/').replace('app://local', ''));
      }
      
      const matchedFile = localFiles.find(f => 
          f.systemPath === absolutePath || 
          f.systemPath.endsWith(absolutePath) || 
          absolutePath.endsWith(f.systemPath) ||
          f.name === absolutePath
      );
      
      return {
          ...img,
          matchedFile,
          previewUrl: matchedFile?.previewUrl
      };
    });

    const gridColsClass = 
      columns === 1 ? 'grid-cols-1' :
      columns === 2 ? 'grid-cols-2' :
      columns === 3 ? 'grid-cols-3' :
      columns === 4 ? 'grid-cols-4' : 'grid-cols-5';

    return (
      <div key={`gallery-${idx}`} className="group/gallery relative my-4 p-4 pl-12 pr-12 rounded-xl border border-zinc-800 bg-zinc-950/20 shadow-inner">
        {/* Hover column change control panel at left */}
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 opacity-0 group-hover/gallery:opacity-100 transition-opacity duration-200 z-30 bg-zinc-950/80 border border-zinc-800 p-1 rounded-lg shadow-md">
          <button
            onClick={() => { if (columns < 5) handleUpdateColumns(columns + 1, contentItems); }}
            className="w-5 h-5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-violet-500 hover:bg-violet-950/35 flex items-center justify-center cursor-pointer select-none font-bold text-xs"
            title="增加组图分栏数 (+)"
          >
            +
          </button>
          <span className="text-[9px] text-zinc-500 font-mono select-none font-semibold leading-none">{columns}列</span>
          <button
            onClick={() => { if (columns > 1) handleUpdateColumns(columns - 1, contentItems); }}
            className="w-5 h-5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-violet-500 hover:bg-violet-950/35 flex items-center justify-center cursor-pointer select-none font-bold text-xs"
            title="减少组图合并列数 (-)"
          >
            -
          </button>
        </div>

        {/* Hover append picture control panel at right */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/gallery:opacity-100 transition-opacity duration-200 z-30 bg-zinc-950/80 border border-zinc-800 p-1 rounded-lg shadow-md">
          <button
            onClick={() => setAddingToBlockItems(contentItems)}
            className="w-6 h-6 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-violet-400 hover:bg-violet-950/35 flex items-center justify-center cursor-pointer select-none font-bold text-sm"
            title="追加并排图片 (+)"
          >
            +
          </button>
        </div>

        <div className="flex items-center justify-between mb-3 border-b border-zinc-850/60 pb-2 select-none">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-violet-400 bg-violet-400/10 px-1.5 py-0.5 rounded">
              分栏组图 (DualLink Gallery)
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">列数: {columns} | 单元数: {resolvedImages.length}</span>
          </div>
        </div>
        <div className={`grid gap-3 ${gridColsClass}`}>
          {resolvedImages.map((img, imgIdx) => {
            const ext = img.path.split('.').pop()?.toLowerCase() || '';
            const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext);
            const isVideo = ['mp4', 'webm', 'mov', 'mkv'].includes(ext);
            const mediaSrc = img.previewUrl || '';

            return (
              <div 
                key={`img-${imgIdx}`} 
                className="group relative rounded-lg overflow-hidden border border-zinc-800 bg-[#1e1e24]/45 flex flex-col justify-between transition-all hover:scale-[1.01] hover:border-[#383842] hover:shadow-lg min-h-[140px]"
              >
                {/* Hover Actions Bar */}
                <div className="absolute top-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-950/90 p-1 rounded-md border border-zinc-800 flex gap-1 shadow-md">
                  <button 
                    onClick={() => setReplacingLineIndex(img.lineIndex)}
                    className="w-6 h-6 rounded bg-zinc-900 border border-zinc-800 hover:border-violet-500 hover:text-violet-450 text-zinc-350 hover:text-violet-400 font-semibold text-xs flex items-center justify-center cursor-pointer select-none"
                    title="替换此图片 (✎)"
                  >
                    ✎
                  </button>
                  <button 
                    onClick={() => handleRemoveGalleryImage(img.lineIndex)}
                    className="w-6 h-6 rounded bg-zinc-900 border border-zinc-800 hover:border-red-500 hover:text-red-400 text-zinc-350 hover:text-red-400 font-semibold text-xs flex items-center justify-center cursor-pointer select-none"
                    title="移除此图片 (✕)"
                  >
                    ✕
                  </button>
                </div>
                
                {/* Image / Video / Audio rendering */}
                <div className="flex-1 flex items-center justify-center bg-zinc-950/30 p-1.5 min-h-[100px]">
                  {mediaSrc ? (
                    isVideo ? (
                      <video src={mediaSrc} controls className="max-w-full rounded max-h-[160px]" />
                    ) : isAudio ? (
                      <audio src={mediaSrc} controls className="w-full" />
                    ) : (
                      <img src={mediaSrc} alt={img.path} className="max-w-full max-h-[160px] object-contain rounded" />
                    )
                  ) : (
                    <div className="flex flex-col items-center justify-center p-3 text-center text-zinc-500 select-none">
                      <span className="text-xl mb-1">🖼</span>
                      <span className="text-[10px] font-mono select-text leading-tight font-medium break-all truncate max-w-[120px]">{img.path}</span>
                      <span className="text-[9px] text-zinc-650 mt-1 block">本地未挂载</span>
                    </div>
                  )}
                </div>

                {/* Label Footer */}
                <div className="bg-[#1e1e24]/90 border-t border-zinc-850 px-2 py-1 text-[9px] font-mono text-zinc-400 truncate select-text">
                   {img.path.split(/[/\\]/).pop()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Quick insertion helpers
  const insertLink = (file: LocalFile) => {
    if (!textareaRef.current) return;
    const txt = textareaRef.current;
    const start = txt.selectionStart;
    const end = txt.selectionEnd;
    const originalText = txt.value;
    
    // Auto prefix embedded media
    let formattedLink = '';
    const ext = file.systemPath.split('.').pop()?.toLowerCase() || '';
    const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'mov', 'mkv', 'mp3', 'wav', 'ogg'].includes(ext);
    
    const cleanPath = file.systemPath.replace(/['"]/g, '').trim().replace(/\\/g, '/');
    const urlPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

    if (isMedia) {
      if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
        formattedLink = `<video src="app://local${urlPath}" controls style="max-width: 100%; border-radius: 8px;"></video>`;
      } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
        formattedLink = `<audio src="app://local${urlPath}" controls style="width: 100%;"></audio>`;
      } else {
        const pathNoSlash = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath;
        formattedLink = `![🖼 ${file.name.replace(/['"]/g, '')}](<file:///${pathNoSlash}>)`;
      }
    } else {
      formattedLink = `[📄 ${file.name.replace(/['"]/g, '')}](<local-file://${cleanPath}>)`;
    }
    const updatedText = originalText.substring(0, start) + formattedLink + originalText.substring(end);
    
    onUpdateNoteContent(updatedText);
    
    // Focus back and set selection
    setTimeout(() => {
      txt.focus();
      const newCursorPos = start + formattedLink.length;
      txt.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);

    onNotification(`已在正文光标处插入 "${file.name}" 的本地绝对路径链路`, 'success');
  };

  // Drag and drop link handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const mdLink = e.dataTransfer.getData('text/plain');
    if (!mdLink || !mdLink.includes('local-file://')) return;

    // Detect media link to prepend ! if not already
    let finalLink = mdLink;
    const extMatch = mdLink.match(/\.([^.)]+)\)$/);
    if (extMatch && !mdLink.startsWith('!')) {
      const ext = extMatch[1].toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'mov', 'mkv', 'mp3', 'wav', 'ogg'].includes(ext)) {
        finalLink = '!' + mdLink;
      }
    }

    if (!textareaRef.current) {
      // Append if no ref
      onUpdateNoteContent(note.content + '\n' + finalLink);
      onNotification('已成功把拖拽的文件直接追加并关联到正文末尾！', 'success');
      return;
    }

    const txt = textareaRef.current;
    const start = txt.selectionStart;
    const end = txt.selectionEnd;
    const originalText = txt.value;

    const updatedText = originalText.substring(0, start) + finalLink + originalText.substring(end);
    onUpdateNoteContent(updatedText);
    onNotification('拖拽成功！已精确在光标悬落位置映射系统文件双链', 'success');
  };

  // Handle ticking check boxes in preview mode
  const handleChecklistToggle = (indexInText: number, currentTextLine: string) => {
    const lines = note.content.split('\n');
    
    const updatedLines = lines.map((line) => {
      if (line === currentTextLine) {
        if (line.includes('[ ]')) return line.replace('[ ]', '[x]');
        if (line.includes('[x]')) return line.replace('[x]', '[ ]');
      }
      return line;
    });

    onUpdateNoteContent(updatedLines.join('\n'));
    onNotification('待办 checklist 状态已同步更新并归档。', 'info');
  };

  // Rich parsing logic for simulating Obsidian reading mode
  const parseMarkdownToReact = (markdown: string): React.ReactNode[] => {
    const lines = markdown.split('\n');
    let insideCodeBlock = false;
    let codeBlockType = '';
    let codeBlockContent: { text: string; lineIndex: number }[] = [];

    return lines.map((line, idx) => {
      // 1. Code Block Handler
      if (line.trim().startsWith('```')) {
        if (insideCodeBlock) {
          insideCodeBlock = false;
          const contentItems = [...codeBlockContent];
          const finalType = codeBlockType;
          codeBlockContent = [];
          codeBlockType = '';

          if (finalType === 'duallink-gallery') {
              return renderGalleryBlock(contentItems, idx);
          }

          const rawCodeString = contentItems.map(item => item.text).join('\n');
          return (
            <pre key={`code-${idx}`} className="bg-zinc-950 border border-zinc-850 p-3 rounded-lg overflow-x-auto text-[11px] font-mono text-zinc-300 my-2 shadow-inner select-text">
              <code>{rawCodeString}</code>
            </pre>
          );
        } else {
          insideCodeBlock = true;
          codeBlockType = line.trim().slice(3).trim();
          return null;
        }
      }

      if (insideCodeBlock) {
        codeBlockContent.push({ text: line, lineIndex: idx });
        return null;
      }

      // 2. Headings
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-xl font-bold text-white border-b border-zinc-800 pb-1.5 mt-4 mb-2 tracking-tight select-text">{line.replace('# ', '')}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-base font-semibold text-zinc-100 mt-4 mb-2 border-b border-zinc-900/60 pb-1 select-text">{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-sm font-medium text-violet-400 mt-3 mb-1 select-text">{line.replace('### ', '')}</h3>;
      }

      // 2.5 Raw HTML Media Handlers (for simulator)
      const videoMatch = line.match(/<video src="([^"]+)"(.*?)><\/video>/i);
      if (videoMatch) {
         const src = videoMatch[1];
         // Simulator preview URL lookup
         let absolutePath = '';
         if (src.includes('?path=')) {
             absolutePath = decodeURIComponent(src.split('?path=')[1]);
         } else {
             absolutePath = decodeURIComponent(src.replace('file:///', '').replace('file://', '').replace('app://local/', '/').replace('app://local', ''));
         }
         const matchedFile = localFiles.find(f => f.systemPath === absolutePath || f.systemPath.endsWith(absolutePath));
         const convertPath = matchedFile?.previewUrl;
         if (!convertPath) {
             return <div key={idx} className="flex flex-col items-center justify-center py-8 px-4 my-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50">
                 <span className="text-zinc-400 text-sm mb-1">⚠️ 模拟器沙盒缺失凭据</span>
                 <span className="text-zinc-600 text-xs text-center">无法直接读取: {absolutePath}</span>
                 <span className="text-zinc-600 text-[10px] mt-2">请重新将该文件拖入模拟器以授权浏览器访问</span>
               </div>;
         }
         return <video key={idx} src={convertPath} controls className="max-w-full rounded-lg my-2 border border-zinc-800" />;
      }
      
      const audioMatch = line.match(/<audio src="([^"]+)"(.*?)><\/audio>/i);
      if (audioMatch) {
         const src = audioMatch[1];
         let absolutePath = '';
         if (src.includes('?path=')) {
             absolutePath = decodeURIComponent(src.split('?path=')[1]);
         } else {
             absolutePath = decodeURIComponent(src.replace('file:///', '').replace('file://', '').replace('app://local/', '/').replace('app://local', ''));
         }
         const matchedFile = localFiles.find(f => f.systemPath === absolutePath || f.systemPath.endsWith(absolutePath));
         const convertPath = matchedFile?.previewUrl;
         if (!convertPath) {
             return <div key={idx} className="flex flex-col items-center justify-center py-8 px-4 my-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50">
                 <span className="text-zinc-400 text-sm mb-1">⚠️ 模拟器沙盒缺失凭据</span>
                 <span className="text-zinc-600 text-xs text-center">无法直接读取音频: {absolutePath}</span>
               </div>;
         }
         return <audio key={idx} src={convertPath} controls className="w-full my-2 outline-none" />;
      }

      // 3. Bullet points and checklists
      if (line.trim().startsWith('* [ ]') || line.trim().startsWith('- [ ]')) {
        const textStr = line.replace(/^\s*(\*|-)\s*\[ \]\s*/, '');
        return (
          <div key={idx} className="flex items-center gap-2 py-0.5 text-xs text-zinc-300">
            <input 
              type="checkbox" 
              checked={false} 
              onChange={() => handleChecklistToggle(idx, line)}
              className="rounded border-zinc-700 bg-zinc-850 text-violet-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
            />
            <span className="select-text">{renderInlineText(textStr, idx)}</span>
          </div>
        );
      }
      if (line.trim().startsWith('* [x]') || line.trim().startsWith('- [x]')) {
        const textStr = line.replace(/^\s*(\*|-)\s*\[x\]\s*/, '');
        return (
          <div key={idx} className="flex items-center gap-2 py-0.5 text-xs text-zinc-400 line-through opacity-70">
            <input 
              type="checkbox" 
              checked={true} 
              onChange={() => handleChecklistToggle(idx, line)}
              className="rounded border-zinc-700 bg-zinc-850 text-violet-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
            />
            <span className="select-text">{renderInlineText(textStr, idx)}</span>
          </div>
        );
      }
      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        const textStr = line.replace(/^\s*(\*|-)\s*/, '');
        return (
          <li key={idx} className="list-disc ml-5 py-0.5 text-xs text-zinc-300 leading-relaxed select-text">
            {renderInlineText(textStr, idx)}
          </li>
        );
      }

      // 4. Default paragraphs
      if (line.trim() === '') {
        return <div key={idx} className="h-2.5" />;
      }

      return (
        <p key={idx} className="text-xs leading-relaxed text-zinc-300 mb-2 select-text">
          {renderInlineText(line, idx)}
        </p>
      );
    }).filter(node => node !== null) as React.ReactNode[];
  };

  // Helper inside lines to process links
  const renderInlineText = (text: string, lineKey: number): React.ReactNode => {
    // Matches markdown link [Label](Href) or [Label](<Href>)
    const linkRegex = /(!?)\[([^\]]+)\]\((?:<([^>]+)>|([^)]+))\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let matchCount = 0;

    // Bold tags formatting
    const applyFormatting = (str: string) => {
      // Handles simple **bold**
      const boldRegex = /\*\*([^*]+)\*\*/g;
      const bParts = [];
      let bLast = 0;
      let bMatch;
      while ((bMatch = boldRegex.exec(str)) !== null) {
        if (bMatch.index > bLast) {
          bParts.push(str.substring(bLast, bMatch.index));
        }
        bParts.push(<strong key={`b-${bMatch.index}`} className="font-semibold text-white">{bMatch[1]}</strong>);
        bLast = boldRegex.lastIndex;
      }
      if (bLast < str.length) {
        bParts.push(str.substring(bLast));
      }
      return bParts.length > 0 ? bParts : str;
    };

    while ((match = linkRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      
      // Before match
      if (matchIndex > lastIndex) {
        parts.push(...(Array.isArray(applyFormatting(text.substring(lastIndex, matchIndex))) 
          ? applyFormatting(text.substring(lastIndex, matchIndex)) as React.ReactNode[]
          : [text.substring(lastIndex, matchIndex)]));
      }

      const isEmbed = match[1] === '!';
      const label = match[2];
      const href = match[3] || match[4];
      const isLocalPath = href && (href.startsWith('local-file://') || href.startsWith('file:///') || href.startsWith('http://127.0.0.1') || href.startsWith('app://'));

      if (isEmbed && isLocalPath) {
        let absolutePath = '';
        if (href.includes('?path=')) {
          absolutePath = decodeURIComponent(href.split('?path=')[1]);
        } else {
          absolutePath = decodeURIComponent(href.replace('local-file://', '').replace('file:///', '').replace('app://local/', '/').replace('app://local', '').replace(/^\/\/\//, ''));
        }
        const ext = absolutePath.split('.').pop()?.toLowerCase() || '';
        const matchedFile = localFiles.find(f => f.systemPath === absolutePath || f.systemPath.endsWith(absolutePath) || absolutePath.endsWith(f.systemPath));
        const convertPath = matchedFile?.previewUrl;
        
        if (!convertPath) {
             parts.push(
               <div key={`media-${lineKey}-${matchCount}`} className="flex flex-col items-center justify-center py-8 px-4 my-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50">
                 <span className="text-zinc-400 text-sm mb-1">⚠️ 模拟器沙盒缺失凭据</span>
                 <span className="text-zinc-600 text-xs text-center">无法直接读取: {absolutePath}</span>
                 <span className="text-zinc-600 text-[10px] mt-2">请重新将该文件拖入模拟器以授权浏览器访问</span>
               </div>
            );
        } else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            parts.push(
               <video key={`media-${lineKey}-${matchCount}`} src={convertPath} controls className="max-w-full rounded-lg my-2 border border-zinc-800" />
            );
        } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
            parts.push(
               <audio key={`media-${lineKey}-${matchCount}`} src={convertPath} controls className="w-full my-2 outline-none" />
            );
        } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
            parts.push(
               <img key={`media-${lineKey}-${matchCount}`} src={convertPath} alt={label} className="max-w-full rounded my-2 border border-zinc-800" />
            );
        } else {
             parts.push(
               <span key={`media-${lineKey}-${matchCount}`} className="text-zinc-500 italic text-[10px] inline-block my-1 bg-zinc-900 border border-zinc-850 px-2 py-1 rounded">
                 [未知的媒体格式无法嵌入: {label}]
               </span>
            );
        }
      } else if (isLocalPath) {
        let absolutePath = '';
        if (href.includes('?path=')) {
          absolutePath = decodeURIComponent(href.split('?path=')[1]);
        } else {
          absolutePath = decodeURIComponent(href.replace('local-file://', '').replace('file:///', '').replace('app://local/', '/').replace('app://local', '').replace(/^\/\/\//, ''));
        }
        parts.push(
          <a
            key={`link-${lineKey}-${matchCount}`}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              onOpenFileInLivePreview(absolutePath);
            }}
            onMouseEnter={(e) => {
              onTriggerHoverPreview(absolutePath, e.currentTarget, true);
            }}
            onMouseLeave={(e) => {
              onTriggerHoverPreview(absolutePath, e.currentTarget, false);
            }}
            className="inline-flex items-center gap-1 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 font-medium px-1.5 py-0.5 rounded border border-violet-500/20 transition-all font-mono text-[11px] cursor-pointer"
            id={`link-node-${lineKey}-${matchCount}`}
          >
            <span className="underline decoration-violet-500/30 underline-offset-2">{label}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0 hover:text-violet-300" />
          </a>
        );
      } else {
        parts.push(
          <a
            key={`link-${lineKey}-${matchCount}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-405 text-amber-400 hover:underline inline-flex items-center gap-0.5 font-medium cursor-pointer"
          >
            {label}
          </a>
        );
      }

      matchCount++;
      lastIndex = linkRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(...(Array.isArray(applyFormatting(text.substring(lastIndex))) 
        ? applyFormatting(text.substring(lastIndex)) as React.ReactNode[]
        : [text.substring(lastIndex)]));
    }

    return parts.length > 0 ? parts : applyFormatting(text);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#16161a] h-full" id="markdown-editor">
      {/* Editor top menu bar resembling Obsidian's tabs and file title */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2d2d34] bg-[#1e1e24]/60 shrink-0 select-none">
        <div className="flex items-center gap-2 overflow-hidden">
          <FileText className="w-4 h-4 text-violet-400 shrink-0" />
          <h2 className="text-xs font-semibold text-white tracking-wide truncate">{note.title}.md</h2>
          <span className="text-[10px] text-zinc-500 border border-zinc-800 px-1.5 py-0.2 rounded bg-zinc-900 font-mono">UTF-8</span>
        </div>

        {/* Editor Controls */}
        <div className="flex bg-zinc-900 border border-zinc-800 p-0.5 rounded-md gap-0.5" id="view-mode-selector">
          <button
            onClick={() => setEditorMode('edit')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
              editorMode === 'edit'
                ? 'bg-[#2d2d34] text-white font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="纯文本 Markdown 编辑器"
            id="btn-edit-mode"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>源码编辑</span>
          </button>
          <button
            onClick={() => setEditorMode('split')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
              editorMode === 'split'
                ? 'bg-[#2d2d34] text-white font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="左右分栏：实时同步渲染编辑"
            id="btn-split-mode"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>实时拆分</span>
          </button>
          <button
            onClick={() => setEditorMode('preview')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
              editorMode === 'preview'
                ? 'bg-[#2d2d34] text-white font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="干净无扰阅读状态"
            id="btn-preview-mode"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>安全阅读</span>
          </button>
        </div>
      </div>

      {/* Editor Body Wrapper */}
      <div className="flex-1 flex min-h-0 relative">
        
        {/* ================= EDITING MODULE (TEXTAREA) ================= */}
        {(editorMode === 'edit' || editorMode === 'split') && (
          <div 
            className={`flex-1 flex flex-col h-full bg-[#16161a] border-r border-[#2d2d34]/60 ${
              editorMode === 'edit' ? 'p-1' : 'p-[2px]'
            }`}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex-1 flex flex-col relative group">
              
              {/* Floating drop helper cue */}
              <div className="absolute right-4 top-4 opacity-0 pointer-events-none group-hover:opacity-100 transition duration-300 bg-zinc-950/80 border border-zinc-805 text-[10px] px-2.5 py-1.5 rounded flex items-center gap-1.5 text-zinc-450 select-none z-10 border-zinc-800 text-zinc-400">
                <MousePointerClick className="w-3.5 h-3.5 text-violet-400" />
                <span>拖拽关联磁盘的文件块到此处，直接生成链接</span>
              </div>

              <textarea
                ref={textareaRef}
                value={note.content}
                onChange={(e) => onUpdateNoteContent(e.target.value)}
                placeholder="# 在这里开始您高能的双链 Markdown 备忘录..."
                className="flex-1 w-full h-full bg-[#16161a] text-zinc-200 outline-none p-5 text-xs md:text-sm font-mono leading-relaxed resize-none focus:ring-0 placeholder-zinc-700 select-text"
                id="markdown-textarea"
              />
            </div>

            {/* Quick Insertion Quick-Dock */}
            <div className="px-4 py-2 border-t border-[#2d2d34] bg-[#1e1e24]/20 flex items-center justify-between text-xs select-none shrink-0">
              <span className="text-zinc-500 font-mono text-[10px]">当前总字数: {note.content.length} 字符</span>
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">快捷插入本地直链:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {localFiles.map(file => (
                    <button
                      key={file.id}
                      onClick={() => insertLink(file)}
                      className="bg-[#212128] border border-zinc-800 text-[10px] px-2 py-0.5 rounded text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 transition cursor-pointer"
                      title={`快捷向文中输入 [📄 ${file.name}] 的硬连接`}
                    >
                      {file.name.split('.').slice(0, -1).join('.')}
                    </button>
                  ))}
                  {localFiles.length === 0 && (
                    <span className="text-[10px] text-zinc-600 italic">您暂未挂载系统文件</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= PREVIEWING MODULE (RENDERED PANELS) ================= */}
        {(editorMode === 'preview' || editorMode === 'split') && (
          <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#18181c] p-6 text-zinc-300 selection:bg-violet-950 selection:text-white">
            
            {/* Simulation Header */}
            <div className="mb-4 bg-violet-950/20 border border-violet-900/30 p-3 rounded-lg flex items-center justify-between text-xs text-violet-300 animate-fadeIn">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
                <span>
                  <strong>沙箱安全视图说明:</strong> 本地协议链接已被渲染。鼠标<strong>悬停</strong>在下方紫色链接片刻即可预览文件属性；<strong>点击</strong>可聚焦至属性面板。
                </span>
              </div>
            </div>

            {/* Rendered HTML */}
            <div className="markdown-preview max-w-none flex flex-col gap-1 pr-2">
              {note.content.trim() === '' ? (
                <div className="text-zinc-500 italic text-xs py-5">双链笔记内容为空，请在编辑视图中编写您的知识资产。</div>
              ) : (
                parseMarkdownToReact(note.content)
              )}
            </div>
          </div>
        )}

      </div>

      {/* Absolute overlay replacing modal when replacingLineIndex or addingToBlockItems is not null */}
      {(replacingLineIndex !== null || addingToBlockItems !== null) && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1a1a20] border border-zinc-800 w-full max-w-md rounded-xl p-5 shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center justify-between select-none">
              <span>{replacingLineIndex !== null ? '选择媒体资产进行替换' : '选择挂载资源追加到组图'}</span>
              <button 
                onClick={() => { setReplacingLineIndex(null); setAddingToBlockItems(null); }}
                className="text-zinc-500 hover:text-zinc-350 font-bold select-none cursor-pointer p-1"
              >
                ✕
              </button>
            </h3>
            <p className="text-xs text-zinc-400 mb-4 select-none">
              {replacingLineIndex !== null ? '请选择已挂载的文件作为该单元在新组图中的图像映射路径：' : '请选择已挂载的文件，该文件将作为新单元追加到当前的分栏组图块中：'}
            </p>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[180px]" id="replace-file-picker">
              {localFiles.map(file => {
                const ext = file.systemPath.split('.').pop()?.toLowerCase() || '';
                
                return (
                  <button
                    key={file.id}
                    onClick={() => {
                        if (replacingLineIndex !== null) {
                            handleReplaceGalleryImage(replacingLineIndex, file);
                        } else if (addingToBlockItems !== null) {
                            handleAppendImage(addingToBlockItems, file);
                        }
                    }}
                    className="w-full text-left bg-[#101014] hover:bg-violet-955/20 hover:border-violet-600 border border-zinc-850 p-2.5 rounded-lg flex items-center justify-between transition group cursor-pointer"
                  >
                    <div className="overflow-hidden pr-2">
                      <div className="text-xs font-semibold text-zinc-250 truncate group-hover:text-white">{file.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{file.systemPath}</div>
                    </div>
                    <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 group-hover:text-violet-400 shrink-0 font-mono pb-0.5 px-2 py-0.5 rounded border border-zinc-850 bg-zinc-950">
                      {ext || 'file'}
                    </span>
                  </button>
                );
              })}

              {localFiles.length === 0 && (
                <div className="text-center py-8 text-zinc-650 text-xs italic select-none">
                  您暂未挂载系统文件。请首先在左面板拖入或挂载本地文件资产。
                </div>
              )}
            </div>
            
            <div className="pt-4 border-t border-zinc-850/60 flex justify-end">
              <button 
                onClick={() => { setReplacingLineIndex(null); setAddingToBlockItems(null); }}
                className="bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-md px-4 py-1.5 text-xs transition cursor-pointer font-medium select-none"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
