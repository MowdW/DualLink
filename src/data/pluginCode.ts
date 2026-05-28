export const MANIFEST_JSON = `{
  "id": "obsidian-local-file-linker",
  "name": "本地文件关联与实时预览 (DualLink)",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "向笔记添加本地系统绝对路径文件，自动生成双向链接以快速跳转，并提供实时交互式预览，无须导入文件耗费保险箱空间。",
  "author": "Google AI Studio Developer",
  "authorUrl": "https://ai.studio/build",
  "isDesktopOnly": true
}`;

export const MAIN_TS = `/**
 * Obsidian Local File Linker & Live Preview Plugin
 * Built for Obsidian (runs on Electron)
 */

import { 
  Plugin, 
  PluginSettingTab, 
  App, 
  Setting, 
  MarkdownView, 
  Notice,
  Modal,
  Menu,
  setIcon
} from 'obsidian';

interface LocalFileLinkerSettings {
  defaultLinkStyle: 'absolute-path' | 'file-uri' | 'custom-protocol';
  inlineRenderEnabled: boolean;
  autoExtractMetadata: boolean;
  customPreviewFolders: string;
  defaultFolderPath: string;
  internalFolderPath: string;
}

const DEFAULT_SETTINGS: LocalFileLinkerSettings = {
  defaultLinkStyle: 'custom-protocol',
  inlineRenderEnabled: true,
  autoExtractMetadata: true,
  customPreviewFolders: '',
  defaultFolderPath: '',
  internalFolderPath: ''
};

export default class LocalFileLinkerPlugin extends Plugin {
  settings: LocalFileLinkerSettings;

  async onload() {
    console.log('正在加载 Obsidian 外部物理文件关联映射插件 (DualLink)...');
    await this.loadSettings();

    // 注入样式去除 Live Preview 默认边框
    if (!document.getElementById('duallink-gallery-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'duallink-gallery-styles';
        styleEl.textContent = \`
            .markdown-source-view.mod-cm6 .cm-embed-block:has(.duallink-gallery-container),
            .markdown-source-view.mod-cm6 .cm-preview-code-block:has(.duallink-gallery-container) {
                border: 0 !important;
                box-shadow: none !important;
                background-color: transparent !important;
            }
            .markdown-source-view.mod-cm6 .cm-embed-block:has(.duallink-gallery-container):hover,
            .markdown-source-view.mod-cm6 .cm-preview-code-block:has(.duallink-gallery-container):hover {
                box-shadow: none !important;
            }
            .markdown-reading-view .duallink-gallery-add-btn,
            .markdown-reading-view .duallink-gallery-sub-btn,
            .markdown-reading-view .duallink-gallery-plus-btn {
                display: none !important;
            }
        \`;
        document.head.appendChild(styleEl);
    }

    // 注册自定义 local-file:// 安全协议解析与快捷点击动作
    this.registerObsidianProtocol();

    // 1. 注册编辑器拖拽 (Drag & Drop) 拦截监听，拖入任何系统外围文件即刻自动生成映射外链
    this.registerEvent(
      this.app.workspace.on('editor-drop', (evt: DragEvent, editor: any) => {
        const files = evt.dataTransfer?.files;
        if (!files || files.length === 0) return;

        // Electron 特性：拖拽获得的 File 对象自带原始物理磁盘绝对路径（file.path)
        const fileList = Array.from(files);
        let insertedAny = false;

        fileList.forEach(file => {
          const systemPath = (file as any).path;
          if (!systemPath) return;

          evt.preventDefault();
          insertedAny = true;

          // 依据设置转化成相对应的 Markdown 连接样式
          const markdownLink = this.generateMarkdownLink(file.name, systemPath);
          
          // 在光标所在处或托落节点植入文本
          const cursor = editor.getCursor();
          editor.replaceRange(markdownLink + '\\n', cursor);
        });

        if (insertedAny) {
          new Notice('🔗 成功通过外部映射方式创建了本地文件的物理双链！');
        }
      })
    );

    // 2. 注册 Ribbon 图标便于手动录入外部物理路径
    // this.addRibbonIcon('link-2', '插入本地文件映射链接', async () => {
    //   this.promptForLocalFileLink();
    // });

    // 4. 注册全局命令列表便于键盘流操作
    this.addCommand({
      id: 'insert-local-file-link',
      name: '插入本地物理文件绝对路径链接',
      editorCallback: (editor) => {
        this.promptForLocalFileLink(editor);
      }
    });

    // 4.5 注册右键菜单 (Editor Context Menu)
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle('DualLink')
            .setIcon('link-2')
            .onClick(() => {
              this.promptForLocalFileLink(editor);
            });
        });
      })
    );

    // 5. 注册 Markdown 渲染后处理器, 用于在只读模式下内联渲染图片与音视频
    this.registerMarkdownPostProcessor((element, context) => {
      if (!this.settings.inlineRenderEnabled) return;

      // 1. 处理标准的嵌入语法 (形如 ![name](local-file://...)) 被 Obsidian 渲染成的 <img>
      const images = Array.from(element.querySelectorAll('img'));
      images.forEach((img) => {
        const src = img.getAttribute('src');
        if (src && (src.startsWith('local-file://') || src.startsWith('file:///'))) {
          const filePath = this.getCleanLocalPath(src);
          if (!filePath) return;
          
          const convertPath = this.getConvertPath(filePath);
          const ext = filePath.split('.').pop()?.toLowerCase() || '';

          if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            const video = document.createElement('video');
            video.src = convertPath;
            video.controls = false;
            video.addEventListener('mouseenter', () => video.controls = true);
            video.addEventListener('mouseleave', () => video.controls = false);
            video.style.maxWidth = '100%';
            video.style.borderRadius = '8px';
            video.style.marginTop = '8px';
            video.style.marginBottom = '8px';
            img.replaceWith(video);
          } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
            const audio = document.createElement('audio');
            audio.src = convertPath;
            audio.controls = true;
            audio.style.width = '100%';
            audio.style.marginTop = '8px';
            audio.style.marginBottom = '8px';
            img.replaceWith(audio);
          } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
            img.src = convertPath;
            img.style.maxWidth = '100%';
            img.style.borderRadius = '4px';
          }
        }
      });

      // 2. 某些情况下 Obsidian 会把媒体文件语法当成 <a> 展现（比如没有感叹号，或者特殊解析），我们需要矫正它
      const links = Array.from(element.querySelectorAll('a.external-link'));
      links.forEach(a => {
        const href = a.getAttribute('href');
        if (href && (href.startsWith('local-file://') || href.startsWith('file:///'))) {
          const filePath = this.getCleanLocalPath(href);
          if (!filePath) return;
          const convertPath = this.getConvertPath(filePath);
          const ext = filePath.split('.').pop()?.toLowerCase() || '';
          
          // 如果是图片或视频类型的扩展名，且用户开启了内联渲染
          if (['mp4', 'webm', 'mov', 'mkv', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
            // 查看上一个节点是否是属于文本节点且以 '!' 结尾，如果有则移除
            const prevNode = a.previousSibling;
            if (prevNode && prevNode.nodeType === Node.TEXT_NODE && prevNode.textContent?.endsWith('!')) {
              prevNode.textContent = prevNode.textContent.slice(0, -1); 
            }

            if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
              const video = document.createElement('video');
              video.src = convertPath;
              video.controls = false;
              video.addEventListener('mouseenter', () => video.controls = true);
              video.addEventListener('mouseleave', () => video.controls = false);
              video.style.maxWidth = '100%';
              video.style.borderRadius = '8px';
              a.replaceWith(video);
            } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
              const audio = document.createElement('audio');
              audio.src = convertPath;
              audio.controls = true;
              audio.style.width = '100%';
              a.replaceWith(audio);
            } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
              const img = document.createElement('img');
              img.src = convertPath;
              img.style.maxWidth = '100%';
              img.style.borderRadius = '4px';
              a.replaceWith(img);
            }
          }
        }
      });
    });

    // 5.5 注册分栏组图 (Gallery) 的 代码块 处理器
    this.registerMarkdownCodeBlockProcessor('duallink-gallery', (source, el, ctx) => {
      const lines = source.split('\\n');
      let columns = 3;
      const images: string[] = [];
      let isConfig = true;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (isConfig && trimmed.startsWith('{')) {
          try {
            const config = JSON.parse(trimmed);
            if (config.columns) columns = config.columns;
          } catch (e) { }
          isConfig = false;
        } else {
          isConfig = false;
          images.push(trimmed);
        }
      }

      el.addClass('duallink-gallery-container');
      el.style.position = 'relative';

      const updateCodeBlock = async (newColumns: number, newImages: string[]) => {
          const info = ctx.getSectionInfo(el);
          if (!info) {
              const { Notice } = require('obsidian');
              new Notice('无法获取区块在文档中的行号，请确保文档已被正确解析。');
              return;
          }
          const { MarkdownView } = require('obsidian');
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          
          const newContent = \`\\\`\\\`\\\`duallink-gallery\\n{ "columns": \${newColumns} }\\n\${newImages.join('\\n')}\\n\\\`\\\`\\\`\`;
          
          if (view && (view as any).editor && typeof (view as any).editor.replaceRange === 'function' && (view as any).getMode() !== 'preview') {
              const editor = (view as any).editor;
              editor.replaceRange(
                  newContent,
                  { line: info.lineStart, ch: 0 },
                  { line: info.lineEnd, ch: editor.getLine(info.lineEnd).length }
              );
          } else {
              const file = this.app.workspace.getActiveFile();
              if (file) {
                  await this.app.vault.process(file, (data) => {
                      const lines = data.split('\\n');
                      lines.splice(info.lineStart, info.lineEnd - info.lineStart + 1, newContent);
                      return lines.join('\\n');
                  });
              }
          }
      };

      // 启动后台校验和自动修正工作
      setTimeout(async () => {
          let hasFixes = false;
          const newImages = [...images];
          for (let i = 0; i < newImages.length; i++) {
              const imgSource = newImages[i];
              const internalMatch = imgSource.match(/!\\[\\[(.*?)\\]\\]/);
              if (internalMatch) {
                  const linkText = internalMatch[1].split('|')[0];
                  const dest = this.app.metadataCache.getFirstLinkpathDest(linkText, ctx.sourcePath);
                  if (!dest) {
                      const fileName = linkText.split(/[\\/\\\\]/).pop();
                      if (fileName) {
                          const fallbackDest = this.app.metadataCache.getFirstLinkpathDest(fileName, ctx.sourcePath);
                          if (fallbackDest) {
                              hasFixes = true;
                              const newLinkText = fallbackDest.path + (internalMatch[1].includes('|') ? '|' + internalMatch[1].split('|')[1] : '');
                              newImages[i] = imgSource.replace(internalMatch[1], newLinkText);
                          }
                      }
                  }
                  continue;
              }
              
              const externalMatch = imgSource.match(/!\\[.*?\\]\\(<file:\\/\\/\\/(.*?)>\\)/) || imgSource.match(/!\\[.*?\\]\\(file:\\/\\/\\/(.*?)\\)/);
              if (externalMatch) {
                  const rawPath = decodeURIComponent(externalMatch[1]);
                  const fs = require('fs');
                  if (!fs.existsSync(rawPath) && this.settings.defaultFolderPath) {
                      const fileName = require('path').basename(rawPath);
                      const newPath = await this.findExternalFileRec(fileName, this.settings.defaultFolderPath, 4, 0);
                      if (newPath) {
                          hasFixes = true;
                          let appendPath = newPath.split(/[\\/\\\\]/).map((c:string) => encodeURIComponent(c)).join('/');
                          appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '\$1:');
                          newImages[i] = imgSource.replace(externalMatch[1], appendPath);
                      }
                  }
                  continue;
              }
          }
          if (hasFixes) {
              updateCodeBlock(columns, newImages);
          }
      }, 100);

      const galleryWrapper = el.createEl('div');
      galleryWrapper.style.position = 'relative';

      const grid = galleryWrapper.createEl('div');
      grid.style.display = 'flex';
      grid.style.gap = '12px';
      grid.style.alignItems = 'flex-start';

      const colEls: HTMLElement[] = [];
      for (let i = 0; i < columns; i++) {
          const col = grid.createDiv();
          col.style.display = 'flex';
          col.style.flexDirection = 'column';
          col.style.gap = '12px';
          col.style.flex = '1';
          col.style.minWidth = '0';
          colEls.push(col);
      }
      
      const colControls = galleryWrapper.createDiv({ cls: 'duallink-gallery-control' });
      colControls.style.position = 'absolute';
      colControls.style.top = '50%';
      colControls.style.left = '4px';
      colControls.style.transform = 'translateY(-50%)';
      colControls.style.display = 'flex';
      colControls.style.flexDirection = 'column';
      colControls.style.alignItems = 'center';
      colControls.style.justifyContent = 'center';
      colControls.style.background = 'transparent';
      colControls.style.zIndex = '10';
      colControls.style.opacity = '0';
      colControls.style.transition = 'opacity 0.2s';
      colControls.style.width = '32px';

      const createColBtn = (text: string, title: string, onClick: () => void) => {
          const btn = colControls.createEl('button', { text, title });
          btn.style.background = 'transparent';
          btn.style.border = 'none';
          btn.style.boxShadow = 'none';
          btn.style.cursor = 'pointer';
          btn.style.color = 'var(--text-muted)';
          btn.style.fontSize = '24px';
          btn.style.padding = '0';
          btn.style.lineHeight = '1';
          btn.style.transition = 'transform 0.2s, color 0.2s';
          btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.2)'; btn.style.color = 'var(--text-normal)'; });
          btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; btn.style.color = 'var(--text-muted)'; });
          btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      };

      createColBtn('-', '减少列数', () => { if (columns > 1) updateCodeBlock(columns - 1, images); });
      createColBtn('+', '增加列数', () => { if (columns < 8) updateCodeBlock(columns + 1, images); });

      const addControls = galleryWrapper.createDiv({ cls: 'duallink-gallery-control' });
      addControls.style.position = 'absolute';
      addControls.style.top = '50%';
      addControls.style.right = '4px';
      addControls.style.transform = 'translateY(-50%)';
      addControls.style.display = 'flex';
      addControls.style.alignItems = 'center';
      addControls.style.justifyContent = 'center';
      addControls.style.background = 'transparent';
      addControls.style.zIndex = '10';
      addControls.style.opacity = '0';
      addControls.style.transition = 'opacity 0.2s';
      addControls.style.width = '32px';

      const addBtn = addControls.createEl('button', { title: '添加新图片' });
      addBtn.style.background = 'transparent';
      addBtn.style.border = 'none';
      addBtn.style.boxShadow = 'none';
      addBtn.style.cursor = 'pointer';
      addBtn.style.color = 'var(--text-muted)';
      addBtn.style.padding = '0';
      addBtn.style.display = 'flex';
      addBtn.style.alignItems = 'center';
      addBtn.style.justifyContent = 'center';
      addBtn.style.transition = 'transform 0.2s, color 0.2s';
      addBtn.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>\`;

      addBtn.addEventListener('mouseenter', () => { addBtn.style.transform = 'scale(1.2)'; addBtn.style.color = 'var(--text-normal)'; });
      addBtn.addEventListener('mouseleave', () => { addBtn.style.transform = 'scale(1)'; addBtn.style.color = 'var(--text-muted)'; });

      addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (el.closest('.markdown-reading-view')) return;
          
          const tempBox = grid.createEl('div');
          tempBox.style.borderRadius = '8px';
          tempBox.style.border = '2px dashed var(--interactive-accent)';
          tempBox.style.display = 'flex';
          tempBox.style.alignItems = 'center';
          tempBox.style.justifyContent = 'center';
          tempBox.style.minHeight = '100px';
          tempBox.style.color = 'var(--interactive-accent)';
          tempBox.style.fontSize = '12px';
          tempBox.createEl('span', { text: '正在选择文件...' });

          const { Notice, MarkdownView } = require('obsidian');
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view) { 
              tempBox.remove(); 
              return; 
          }
          
          new PathPromptModal(this, '', (inputPath: string) => {
               if(!inputPath) { 
                   tempBox.remove(); 
                   return; 
               }
               const adapter = this.app.vault.adapter;
               const vaultBasePath = (adapter as any).getBasePath ? (adapter as any).getBasePath() : '';
               let newSyntax = '';
               
               const cleanP = inputPath.replace(/['"]/g, '').trim();
               let isInternal = false;
               let internalPath = '';
               if (vaultBasePath && cleanP.startsWith(vaultBasePath)) {
                   isInternal = true;
                   internalPath = cleanP.substring(vaultBasePath.length).replace(/^[/\\\\]+/, '').replace(/\\\\/g, '/');
               }
               if (isInternal) {
                   newSyntax = \`![[\${internalPath}]]\`;
               } else {
                   let appendPath = cleanP.startsWith('/') ? cleanP.substring(1) : cleanP;
                   appendPath = appendPath.split('/').map(c => encodeURIComponent(c)).join('/');
                   appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '\$1:');
                   newSyntax = \`![](<file:///\${appendPath}>)\`;
               }
               updateCodeBlock(columns, [...images, newSyntax]);
          }).open();
      });

      galleryWrapper.addEventListener('mouseenter', () => {
           if (!el.closest('.markdown-reading-view')) {
               colControls.style.opacity = '1';
               addControls.style.opacity = '1';
           }
      });
      galleryWrapper.addEventListener('mouseleave', () => {
           colControls.style.opacity = '0';
           addControls.style.opacity = '0';
      });

      galleryWrapper.style.padding = '0 36px';

      const items: HTMLElement[] = [];
      let lastLayout = '';
      
      const distributeItems = () => {
          const colHeights = new Array(columns).fill(0);
          const targetCols = new Array(items.length);
          
          items.forEach((item, idx) => {
              let shortestIdx = 0;
              let minHeight = colHeights[0];
              for (let i = 1; i < columns; i++) {
                  if (colHeights[i] < minHeight) {
                      minHeight = colHeights[i];
                      shortestIdx = i;
                  }
              }
              targetCols[idx] = shortestIdx;
              const h = item.getBoundingClientRect().height;
              colHeights[shortestIdx] += (h > 0 ? h : 100) + 12;
          });

          const newLayout = targetCols.join(',');
          if (lastLayout !== newLayout) {
              lastLayout = newLayout;
              targetCols.forEach((colIdx, itemIdx) => {
                  colEls[colIdx].appendChild(items[itemIdx]);
              });
          }
      };

      const resizeObserver = new ResizeObserver(() => {
          window.requestAnimationFrame(() => {
              distributeItems();
          });
      });

      images.forEach((imgSource, index) => {
        const item = document.createElement('div');
        items.push(item);
        resizeObserver.observe(item);
        
        item.style.position = 'relative';
        item.style.borderRadius = '8px';
        item.style.overflow = 'hidden';
        item.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        item.style.border = '1px solid var(--background-modifier-border)';
        item.style.backgroundColor = 'var(--background-secondary)';
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.cursor = 'grab';

        item.style.transition = 'transform 0.2s, opacity 0.2s';

        // 拖拽排序
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            if (e.dataTransfer) {
                e.dataTransfer.setData('duallink-gallery-index', index.toString());
                e.dataTransfer.effectAllowed = 'move';
            }
            setTimeout(() => {
                item.style.opacity = '0.4';
            }, 0);
        });
        item.addEventListener('dragend', (e) => {
            item.style.opacity = '1';
            item.style.border = '1px solid var(--background-modifier-border)';
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            item.style.border = '2px dashed var(--interactive-accent)';
        });
        item.addEventListener('dragleave', (e) => {
            item.style.border = '1px solid var(--background-modifier-border)';
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.style.border = '1px solid var(--background-modifier-border)';
            if (!e.dataTransfer) return;
            
            const originIndexStr = e.dataTransfer.getData('duallink-gallery-index');
            if (!originIndexStr) return;
            
            const originIndex = parseInt(originIndexStr, 10);
            if (originIndex === index || isNaN(originIndex)) return;
            
            const newImages = [...images];
            const [draggedImg] = newImages.splice(originIndex, 1);
            newImages.splice(index, 0, draggedImg);
            
            updateCodeBlock(columns, newImages);
        });

        item.addEventListener('mouseenter', () => {
            if (el.closest('.markdown-reading-view')) return;
            item.style.transform = 'scale(1.02)';
        });
        item.addEventListener('mouseleave', () => {
            if (el.closest('.markdown-reading-view')) return;
            item.style.transform = 'none';
        });

        // 双击放大预览
        item.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const media = item.querySelector('img, video') as HTMLImageElement | HTMLVideoElement;
            if (!media) return;

            const overlay = document.body.createEl('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
            overlay.style.zIndex = '99999';
            overlay.style.display = 'flex';
            overlay.style.justifyContent = 'center';
            overlay.style.alignItems = 'center';
            overlay.style.cursor = 'zoom-out';
            // overlay.style.backdropFilter = 'blur(4px)'; // optional, can be slow

            let clone: HTMLElement;
            if (media.tagName.toLowerCase() === 'img') {
                clone = document.createElement('img');
                (clone as HTMLImageElement).src = (media as HTMLImageElement).src;
            } else {
                clone = document.createElement('video');
                (clone as HTMLVideoElement).src = (media as HTMLVideoElement).src;
                (clone as HTMLVideoElement).controls = true;
                (clone as HTMLVideoElement).autoplay = true;
            }

            clone.style.maxWidth = '90vw';
            clone.style.maxHeight = '90vh';
            clone.style.objectFit = 'contain';
            clone.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
            clone.style.borderRadius = '8px';
            clone.style.cursor = 'default';
            
            // 阻止点击图片时关闭
            clone.addEventListener('click', (e2) => {
                e2.stopPropagation();
            });

            overlay.appendChild(clone);

            // 关闭按钮
            const closeBtn = overlay.createEl('div', { text: '✕' });
            closeBtn.style.position = 'absolute';
            closeBtn.style.top = '20px';
            closeBtn.style.right = '20px';
            closeBtn.style.width = '40px';
            closeBtn.style.height = '40px';
            closeBtn.style.backgroundColor = 'rgba(0,0,0,0.5)';
            closeBtn.style.color = 'white';
            closeBtn.style.borderRadius = '50%';
            closeBtn.style.display = 'flex';
            closeBtn.style.justifyContent = 'center';
            closeBtn.style.alignItems = 'center';
            closeBtn.style.fontSize = '20px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.transition = 'background-color 0.2s';
            
            closeBtn.addEventListener('mouseenter', () => closeBtn.style.backgroundColor = 'rgba(255,255,255,0.2)');
            closeBtn.addEventListener('mouseleave', () => closeBtn.style.backgroundColor = 'rgba(0,0,0,0.5)');

            overlay.addEventListener('click', () => {
                overlay.remove();
            });
            
            // 支持 ESC 关闭
            const escListener = (e2: KeyboardEvent) => {
                if (e2.key === 'Escape') {
                    overlay.remove();
                    document.removeEventListener('keydown', escListener);
                }
            };
            document.addEventListener('keydown', escListener);
            
            overlay.addEventListener('remove', () => {
                document.removeEventListener('keydown', escListener);
            });
        });

        // 修改按钮
        const editImageBtn = item.createEl('div', { text: '✎' });
        editImageBtn.style.position = 'absolute';
        editImageBtn.style.top = '4px';
        editImageBtn.style.left = '4px';
        editImageBtn.style.width = '20px';
        editImageBtn.style.height = '20px';
        editImageBtn.style.background = 'transparent';
        editImageBtn.style.color = 'rgba(255, 255, 255, 0.8)';
        editImageBtn.style.borderRadius = '50%';
        editImageBtn.style.display = 'flex';
        editImageBtn.style.justifyContent = 'center';
        editImageBtn.style.alignItems = 'center';
        editImageBtn.style.cursor = 'pointer';
        editImageBtn.style.opacity = '0';
        editImageBtn.style.transition = 'opacity 0.2s, color 0.2s';
        editImageBtn.style.zIndex = '5';
        editImageBtn.style.fontSize = '14px';
        editImageBtn.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
        editImageBtn.title = '替换此图片';
        
        editImageBtn.addEventListener('mouseenter', () => editImageBtn.style.color = 'var(--interactive-accent)');
        editImageBtn.addEventListener('mouseleave', () => editImageBtn.style.color = 'rgba(255, 255, 255, 0.8)');

        // 删除按钮
        const removeBtn = item.createEl('div', { text: '✕' });
        removeBtn.style.position = 'absolute';
        removeBtn.style.top = '4px';
        removeBtn.style.left = '28px';
        removeBtn.style.width = '20px';
        removeBtn.style.height = '20px';
        removeBtn.style.background = 'transparent';
        removeBtn.style.color = 'rgba(255, 255, 255, 0.8)';
        removeBtn.style.borderRadius = '50%';
        removeBtn.style.display = 'flex';
        removeBtn.style.justifyContent = 'center';
        removeBtn.style.alignItems = 'center';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.opacity = '0';
        removeBtn.style.transition = 'opacity 0.2s, color 0.2s';
        removeBtn.style.zIndex = '5';
        removeBtn.style.fontSize = '14px';
        removeBtn.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
        removeBtn.title = '移除此图片';
        
        removeBtn.addEventListener('mouseenter', () => removeBtn.style.color = 'var(--background-modifier-error)');
        removeBtn.addEventListener('mouseleave', () => removeBtn.style.color = 'rgba(255, 255, 255, 0.8)');
        
        item.addEventListener('mouseenter', () => {
            if (el.closest('.markdown-reading-view')) return;
            removeBtn.style.opacity = '1';
            editImageBtn.style.opacity = '1';
        });
        item.addEventListener('mouseleave', () => {
            removeBtn.style.opacity = '0';
            editImageBtn.style.opacity = '0';
        });
        
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el.closest('.markdown-reading-view')) return;
            const newImages = [...images];
            newImages.splice(index, 1);
            updateCodeBlock(columns, newImages);
        });

        editImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el.closest('.markdown-reading-view')) return;
            const { Notice, MarkdownView } = require('obsidian');
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return;
            
            new PathPromptModal(this, '', (inputPath: string) => {
                 if(!inputPath) return;
                 const adapter = this.app.vault.adapter;
                 const vaultBasePath = (adapter as any).getBasePath ? (adapter as any).getBasePath() : '';
                 let newSyntax = '';
                 
                 const cleanP = inputPath.replace(/['"]/g, '').trim();
                 let isInternal = false;
                 let internalPath = '';
                 if (vaultBasePath && cleanP.startsWith(vaultBasePath)) {
                     isInternal = true;
                     internalPath = cleanP.substring(vaultBasePath.length).replace(/^[/\\\\]+/, '').replace(/\\\\/g, '/');
                 }
                 if (isInternal) {
                     newSyntax = \`![[\${internalPath}]]\`;
                 } else {
                     let appendPath = cleanP.startsWith('/') ? cleanP.substring(1) : cleanP;
                     appendPath = appendPath.split('/').map(c => encodeURIComponent(c)).join('/');
                     appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '\$1:');
                     newSyntax = \`![](<file:///\${appendPath}>)\`;
                 }
                 const newImages = [...images];
                 newImages[index] = newSyntax;
                 updateCodeBlock(columns, newImages);
            }).open();
        });

        const { MarkdownRenderer } = require('obsidian');
        MarkdownRenderer.renderMarkdown(imgSource, item, ctx.sourcePath, this);
        
        setTimeout(() => {
            const allImgs = Array.from(item.querySelectorAll('img'));
            // 修复由于 markdown 默认把 file:///...mp4 渲染成 <img> 的问题
            allImgs.forEach(img => {
                const src = img.src || img.getAttribute('src');
                if (src && /\\.(mp4|webm|mov|mkv)\$/i.test(src.split('?')[0])) {
                    const video = document.createElement('video');
                    video.src = src;
                    video.controls = false;
                    video.addEventListener('mouseenter', () => video.controls = true);
                    video.addEventListener('mouseleave', () => video.controls = false);
                    video.setAttribute('controlslist', 'nodownload'); // Optional nice touch
                    img.parentNode?.replaceChild(video, img);
                }
            });

            const medias = item.querySelectorAll('img, video, .internal-embed');
            medias.forEach(media => {
                if (media instanceof HTMLElement) {
                  media.style.width = '100%';
                  media.style.height = '100%';
                  media.style.objectFit = 'cover';
                  media.style.display = 'block';
                  media.style.borderRadius = '0';
                  media.style.margin = '0';
                  if (media.tagName.toLowerCase() === 'img') {
                      media.style.pointerEvents = 'none';
                  }
                  media.setAttribute('draggable', 'false'); // Disable native drag
                }
            });
            const ps = item.querySelectorAll('p');
            ps.forEach(p => {
                p.style.margin = '0';
                p.style.padding = '0';
            });
        }, 50);
      });

      const remainingCols = columns - images.length;
      if (remainingCols > 0) {
          for (let i = 0; i < remainingCols; i++) {
              const emptyCell = document.createElement('div');
              items.push(emptyCell);
              resizeObserver.observe(emptyCell);
              emptyCell.style.borderRadius = '8px';
              emptyCell.style.border = '2px dashed var(--background-modifier-border)';
              emptyCell.style.display = 'flex';
              emptyCell.style.alignItems = 'center';
              emptyCell.style.justifyContent = 'center';
              emptyCell.style.cursor = 'pointer';
              emptyCell.style.minHeight = '100px';
              emptyCell.style.color = 'var(--text-muted)';
              emptyCell.style.transition = 'all 0.2s';
              
              const updateIcon = () => {
                  emptyCell.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>\`;
              };
              updateIcon();
              
              emptyCell.addEventListener('mouseenter', () => {
                  if (el.closest('.markdown-reading-view')) return;
                  emptyCell.style.borderColor = 'var(--interactive-accent)';
                  emptyCell.style.color = 'var(--interactive-accent)';
                  emptyCell.style.transform = 'scale(1.02)';
              });
              emptyCell.addEventListener('mouseleave', () => {
                  emptyCell.style.borderColor = 'var(--background-modifier-border)';
                  emptyCell.style.color = 'var(--text-muted)';
                  emptyCell.style.transform = 'scale(1)';
              });
              emptyCell.addEventListener('click', (e) => {
                  e.stopPropagation();
                  if (el.closest('.markdown-reading-view')) return;
                  
                  emptyCell.innerHTML = '';
                  const loadingSpan = emptyCell.createEl('span', { text: '正在选择文件...' });
                  loadingSpan.style.fontSize = '12px';
                  loadingSpan.style.color = 'var(--interactive-accent)';
                  
                  const { Notice, MarkdownView } = require('obsidian');
                  const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                  if (!view) { 
                      updateIcon();
                      return; 
                  }
                  
                  new PathPromptModal(this, '', (inputPath: string) => {
                       if(!inputPath) { 
                           updateIcon();
                           return; 
                       }
                       const adapter = this.app.vault.adapter;
                       const vaultBasePath = (adapter as any).getBasePath ? (adapter as any).getBasePath() : '';
                       let newSyntax = '';
                       
                       const cleanP = inputPath.replace(/['"]/g, '').trim();
                       let isInternal = false;
                       let internalPath = '';
                       if (vaultBasePath && cleanP.startsWith(vaultBasePath)) {
                           isInternal = true;
                           internalPath = cleanP.substring(vaultBasePath.length).replace(/^[/\\\\]+/, '').replace(/\\\\/g, '/');
                       }
                       if (isInternal) {
                           newSyntax = \`![[\${internalPath}]]\`;
                       } else {
                           let appendPath = cleanP.startsWith('/') ? cleanP.substring(1) : cleanP;
                           appendPath = appendPath.split('/').map(c => encodeURIComponent(c)).join('/');
                           appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '\$1:');
                           newSyntax = \`![](<file:///\${appendPath}>)\`;
                       }
                       updateCodeBlock(columns, [...images, newSyntax]);
                  }).open();
              });
          }
      }

    });

    // 6. 注册设置管理面板
    this.addSettingTab(new LocalFileLinkerSettingTab(this.app, this));
  }

  onunload() {
    console.log('正在卸载 Obsidian 本地物理链接插件 (DualLink)...');
    const styleEl = document.getElementById('duallink-gallery-styles');
    if (styleEl) {
        styleEl.remove();
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  public getCleanLocalPath(href: string): string {
    let filePath = '';
    // Use match to extract the raw path, being mindful of angular brackets or quotes.
    const cleanHref = href.replace(/^[<"']|[>"']\$/g, '').trim();
    const matchLocal = cleanHref.match(/local-file:\\/\\/(.+)/);
    const matchFile = cleanHref.match(/file:\\/\\/\\/(.+)/);
    
    if (matchLocal) {
      filePath = decodeURIComponent(matchLocal[1]);
    } else if (matchFile) {
      filePath = decodeURIComponent(matchFile[1]);
    } else {
      filePath = decodeURIComponent(cleanHref.replace('local-file://', '').replace('file:///', ''));
    }
    
    // Removes any trailing parenthesis from code mirrors, and unnecessary quotes
    return filePath.replace(/\\)\$/, '').replace(/['">]/g, '').trim(); 
  }

  public getConvertPath(filePath: string): string {
    const cleanPath = filePath.replace(/['">]/g, '').trim().replace(/\\\\/g, '/');
    let hashPrefix = 'app://local/';
    
    // dynamically get the vault app root URL to fix broken paths in modern Obsidian
    if (this.app.vault.adapter && (this.app.vault.adapter as any).getResourcePath) {
      try {
        const vaultRootUrl = (this.app.vault.adapter as any).getResourcePath("").split("?")[0];
        const match = vaultRootUrl.match(/^app:\\/\\/[^\\/]+\\//);
        if (match) {
            hashPrefix = match[0];
        }
      } catch (e) {
        console.warn("Failed to extract vault app prefix:", e);
      }
    }
    
    let appendPath = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
    
    // Encode the path to ensure Chinese characters and spaces are safely loaded inside Obsidian
    appendPath = appendPath.split('/').map(c => encodeURIComponent(c)).join('/');
    // For Windows drives (e.g., C:), ensure colon is preserved
    appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '\$1:');

    return \`\${hashPrefix}\${appendPath}\`;
  }

  public async findExternalFileRec(fileName: string, dir: string, maxDepth = 4, currentDepth = 0): Promise<string | null> {
    if (currentDepth > maxDepth || !dir) return null;
    const fs = require('fs');
    const path = require('path');
    try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const found = await this.findExternalFileRec(fileName, path.join(dir, entry.name), maxDepth, currentDepth + 1);
                if (found) return found;
            } else if (entry.name === fileName) {
                return path.join(dir, entry.name);
            }
        }
    } catch (e) {
        // ignore errors like permission denied
    }
    return null;
  }

  /**
   * 按用户预设偏好，渲染链接到 Markdown 中
   */
  generateMarkdownLink(fileName: string, path: string): string {
    // 1. 去除路径中可能出现的头尾双引号 (常见于 Windows "复制文件路径" 功能)
    const cleanPath = path.replace(/['"]/g, '').trim().replace(/\\\\/g, '/');
    const cleanName = fileName.replace(/['"]/g, '').trim();

    const ext = cleanName.split('.').pop()?.toLowerCase() || '';
    const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'mov', 'mkv', 'mp3', 'wav', 'ogg'].includes(ext);

    // 对于富媒体文件且启用了内联渲染，强制生成对 Live Preview (实时预览) 更加友好的语法。
    if (isMedia && this.settings.inlineRenderEnabled) {
      const urlWithoutLeadingSlash = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
      const finalSrc = \`file:///\${urlWithoutLeadingSlash}\`;
      
      // 直接输出 HTML video/audio 标签，从而能够在 Live Preview 中实现实时无缝交互式预览，
      // 注意：这里我们使用 file:/// 协议，因为使用基于 UUID 的 app:// 协议在重启后会失效。
      // Obsidian 的 Live Preview 有时并不完全支持 file:/// 视频，但对于图片支持极佳。如果用户需要完美支持，
      // 我们推荐使用标准 Markdown 语法，但这将留给用户和由于 Electron 决定的原生行为。
      if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
        return \`<video src="\${finalSrc}" controls style="max-width: 100%; border-radius: 8px;"></video>\`;
      } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
        return \`<audio src="\${finalSrc}" controls style="width: 100%; border-radius: 8px;"></audio>\`;
      } else {
        // 图片由于受 Live Preview 原生 ![] 支持最好，强制使用 file:/// 协议以支持跨端预览
        return \`![🖼 \${cleanName}](<\${finalSrc}>)\`;
      }
    }

    switch (this.settings.defaultLinkStyle) {
      case 'file-uri':
        const fileUrl = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
        return \`[📄 \${cleanName}](<file:///\${fileUrl}>)\`;
      case 'absolute-path':
        return \`[📄 \${cleanName}](<\${cleanPath}>)\`;
      case 'custom-protocol':
      default:
        // 推荐采用 custom-protocol 格式，它不易与原生 web url 行为产生干涉，防断裂的尖括号包含格式。
        return \`[📄 \${cleanName}](<local-file://\${cleanPath}>)\`;
    }
  }

  /**
   * 注册自定义底层协议与 DOM 交互拦截
   */
  registerObsidianProtocol() {
    // 监听 Obsidian 内部路由：obsidian://local-file-open?path=...
    this.registerObsidianProtocolHandler('local-file-open', (args) => {
      const pathWithSlash = args.path;
      if (pathWithSlash) {
        const decodedPath = decodeURIComponent(pathWithSlash);
        this.openFileInSystem(decodedPath);
      }
    });

    // 捕获阅读视图中的 A 标签事件。如果是 local-file:// 开头则安全拦截，通过系统原生应用调取
    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
      const target = evt.target as HTMLElement;
      if (!target) return;

      let href = null;
      if (target.tagName === 'A' && target.classList.contains('external-link')) {
        href = target.getAttribute('href');
      } else if (target.classList.contains('cm-url') || target.classList.contains('cm-link') || target.classList.contains('cm-underline')) {
        href = target.innerText || target.textContent;
      }

      if (href && (href.startsWith('local-file://') || href.includes('local-file://'))) {
        evt.preventDefault();
        const match = href.match(/local-file:\\/\\/(.+)/);
        if (match) {
          const filePath = decodeURIComponent(match[1]);
          this.openFileInSystem(filePath);
        }
      }
    });

    // 监听右键点击，唤起辅助菜单（实现：4. 在资源管理器中显示该文件）
    this.registerDomEvent(document, 'contextmenu', (evt: MouseEvent) => {
      const target = evt.target as HTMLElement;
      if (!target) return;

      let href = null;
      if (target.tagName === 'A' && target.classList.contains('external-link')) {
        href = target.getAttribute('href');
      } else if (target.classList.contains('cm-url') || target.classList.contains('cm-link') || target.classList.contains('cm-underline')) {
        href = target.innerText || target.textContent;
      }

      if (href && (href.startsWith('local-file://') || href.includes('local-file://') || href.includes('file:///'))) {
        const filePath = this.getCleanLocalPath(href);
        if (!filePath) return;

        evt.preventDefault();

        const menu = new Menu();

        // 也可以选择在默认应用中打开文件 (行为类似鼠标左键点击)
        menu.addItem((item) => {
          item.setTitle('在相关默认应用中打开文件')
            .setIcon('popup-open')
            .onClick(() => {
              this.openFileInSystem(filePath);
            });
        });

        // 核心功能：在系统文件资源管理器中显示（Reveal in Explorer / Show in Finder）
        menu.addItem((item) => {
          item.setTitle('在系统资源管理器中显示 (Reveal)')
            .setIcon('folder')
            .onClick(() => {
              try {
                const { shell } = require('electron');
                shell.showItemInFolder(filePath);
                new Notice('正在文件系统的所在文件夹中高亮显示该文件...');
              } catch (e) {
                console.error("Shell error", e);
                new Notice('无法调用系统资源管理器定位。', 5000);
              }
            });
        });

        menu.addItem((item) => {
          item.setTitle('复制绝对路径')
            .setIcon('link')
            .onClick(async () => {
              await navigator.clipboard.writeText(filePath);
              new Notice('已复制文件的绝对路径到剪贴板！');
            });
        });

        menu.showAtMouseEvent(evt);
      }
    });
  }

  /**
   * 唤醒宿主机操作系统的底层默认程序（无需复制或加载大容量文件）
   */
  openFileInSystem(filePath: string) {
    const fileName = filePath.split('/').pop() || '外部文件';
    new Notice(\`📂 正在调取系统原生应用打开文件: \${fileName}\`);
    try {
      // 在 Obsidian (基于 Electron) 运行时中，可以直接加载 electron 核心功能
      const { shell } = require('electron');
      shell.openPath(filePath).then((err: string) => {
        if (err) {
          new Notice(\`⚠️ 无法唤醒程序: \${err}\`, 5000);
        }
      });
    } catch (e) {
      // 兼容非 Electron Web 环境下的说明
      new Notice('提示：当前不在本地 Electron 桌面外壳中。请在桌面版 Obsidian 中使用以一键唤起。');
    }
  }

  /**
   * 手动指令录入全路径降级辅助
   */
  async promptForLocalFileLink(editor?: any) {
    const defaultEditor = editor || this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
    if (!defaultEditor) {
      new Notice('无法读取到当前正在编辑的活动 Markdown 文档！');
      return;
    }

    const selectedText = defaultEditor.getSelection().trim();

    new PathPromptModal(this, selectedText, (inputPath, customName) => {
      if (!inputPath) return;

      if (customName && customName.startsWith('____GALLERY_CONFIG_COLUMNS_')) {
          const colsCount = customName.replace('____GALLERY_CONFIG_COLUMNS_', '');
          const paths = inputPath.split('|||');
          
          let blockContent = \`\\\`\\\`\\\`duallink-gallery\\n{ "columns": \${colsCount} }\\n\`;
          const adapter = this.app.vault.adapter;
          const vaultBasePath = (adapter as any).getBasePath ? (adapter as any).getBasePath() : '';
          
          paths.forEach(p => {
              const cleanP = p.replace(/['"]/g, '').trim();
              let isInternal = false;
              let internalPath = '';
              if (vaultBasePath && cleanP.startsWith(vaultBasePath)) {
                  isInternal = true;
                  internalPath = cleanP.substring(vaultBasePath.length).replace(/^[/\\\\]+/, '').replace(/\\\\/g, '/');
              }
              if (isInternal) {
                  blockContent += \`![[\${internalPath}]]\\n\`;
              } else {
                  let appendPath = cleanP.startsWith('/') ? cleanP.substring(1) : cleanP;
                  appendPath = appendPath.split('/').map(c => encodeURIComponent(c)).join('/');
                  appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '\$1:');
                  blockContent += \`![](<file:///\${appendPath}>)\\n\`;
              }
          });
          blockContent += '\`\`\`\\n';
          
          const cursor = defaultEditor.getCursor();
          defaultEditor.replaceRange(blockContent, cursor);
          new Notice('✅ 已向文档焦点处注入了分栏组图！');
          return;
      }

      const cleanInputPath = inputPath.replace(/['"]/g, '').trim();
      const defaultName = cleanInputPath.split(/[/\\\\\\\\]/).pop() || '外部关联文件';
      const finalName = customName.trim() || defaultName;
      
      let mdLink = '';
      
      const adapter = this.app.vault.adapter;
      let vaultBasePath = '';
      if ((adapter as any).getBasePath) {
          vaultBasePath = (adapter as any).getBasePath();
      }
      
      let isInternal = false;
      let internalPath = '';
      
      if (vaultBasePath && cleanInputPath.startsWith(vaultBasePath)) {
          isInternal = true;
          internalPath = cleanInputPath.substring(vaultBasePath.length).replace(/^[/\\\\]+/, '').replace(/\\\\/g, '/');
      }

      if (isInternal) {
          const isMedia = /\\.(png|jpg|jpeg|gif|svg|webp|mp4|webm|mov|mkv|mp3|wav|ogg|m4a|flac)\$/i.test(internalPath);
          mdLink = isMedia ? \`![[\${internalPath}]]\` : \`[[\${internalPath}|\${finalName}]]\`;
      } else {
          mdLink = this.generateMarkdownLink(finalName, cleanInputPath);
      }
      
      const cursor = defaultEditor.getCursor();
      if (selectedText) {
        defaultEditor.replaceSelection(mdLink);
      } else {
        defaultEditor.replaceRange(mdLink, cursor);
      }
      new Notice('✅ 已向文档焦点处注入了本地文件物理软连接！');
    }).open();
  }
}

class PathPromptModal extends Modal {
  private onSubmit: (path: string, name: string) => void;
  private inputPath: string = '';
  private customName: string = '';
  private currentFolderPath: string = '';
  private searchQuery: string = '';
  private currentTab: 'all' | 'image' | 'video' | 'audio' = 'all';
  private filesList: any[] = [];
  private contentContainer: HTMLElement;
  private pathInputEl: HTMLInputElement | null = null;
  private plugin: LocalFileLinkerPlugin;
  private currentMode: 'external' | 'internal' = 'external';
  private lastExternalPath: string = '';

  private fileItemsMap: Map<string, HTMLElement> = new Map();
  private selectedFiles: Set<any> = new Set();
  private isMultiSelectMode: boolean = false;
  private colsCount: number = 3;

  constructor(plugin: LocalFileLinkerPlugin, defaultName: string, onSubmit: (path: string, name: string) => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.customName = defaultName;
    this.onSubmit = onSubmit;
    this.currentFolderPath = plugin.settings.defaultFolderPath || '';
    this.lastExternalPath = this.currentFolderPath;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    
    // 设置大尺寸弹窗
    this.modalEl.style.width = '80vw';
    this.modalEl.style.maxWidth = '1000px';
    this.modalEl.style.maxHeight = '80vh';
    this.modalEl.style.minHeight = '40vh';
    this.modalEl.style.height = 'auto'; // 根据内容自动高度，最大 80vh，最小 40vh
    this.modalEl.style.display = 'flex';
    this.modalEl.style.flexDirection = 'column';
    
    // 内容区的布局配置，使其能正确响应 flex
    contentEl.style.display = 'flex';
    contentEl.style.flexDirection = 'column';
    contentEl.style.flex = '1';
    contentEl.style.overflow = 'hidden';

    // 顶部设置区域
    const topArea = contentEl.createDiv();
    topArea.style.display = 'flex';
    topArea.style.flexDirection = 'column';
    topArea.style.gap = '12px';
    topArea.style.marginBottom = '12px';
    topArea.style.flexShrink = '0';
    
    // 1. 文件夹路径选择行
    const pathRow = topArea.createDiv();
    pathRow.style.display = 'flex';
    pathRow.style.gap = '10px';
    pathRow.style.alignItems = 'center';
    
    this.pathInputEl = pathRow.createEl('input', { type: 'text', placeholder: '粘贴文件夹的绝对路径...' });
    this.pathInputEl.style.flex = '1';
    this.pathInputEl.style.border = '0';
    this.pathInputEl.style.boxShadow = 'none';
    this.pathInputEl.value = this.currentFolderPath;
    this.pathInputEl.addEventListener('change', (e) => {
        this.currentFolderPath = (e.target as HTMLInputElement).value;
        this.loadFiles();
    });
    
    // 隐藏的系统文件选择器，用于获取目录
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.setAttribute('webkitdirectory', '');
    fileInput.setAttribute('directory', '');
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    const browseBtn = pathRow.createEl('button', { text: '浏览' });
    browseBtn.style.boxShadow = 'none';
    browseBtn.style.border = '0';
    browseBtn.style.background = 'transparent';
    browseBtn.addEventListener('click', () => {
        try {
            // 首先尝试使用 Electron 系统原生的文件夹选择弹窗
            const electron = require('electron');
            if (electron && electron.remote && electron.remote.dialog) {
                const paths = electron.remote.dialog.showOpenDialogSync({
                    properties: ['openDirectory']
                });
                if (paths && paths.length > 0) {
                    this.currentFolderPath = paths[0];
                    if (this.pathInputEl) this.pathInputEl.value = this.currentFolderPath;
                    this.loadFiles();
                    return; // 成功使用原生方式
                } else {
                    return; // 被用户取消
                }
            }
        } catch (e) {
            // ignore
        }

        fileInput.value = ''; // Always clear previous value
        fileInput.onchange = (e: any) => {
            if (e.target.files && e.target.files.length > 0) {
                const file = e.target.files[0];
                const sysPath = (file as any).path; // Obsidian 中的绝对路径
                let finalFolderPath = '';

                if (sysPath) {
                    try {
                        const path = require('path');
                        const relPath = (file as any).webkitRelativePath; // "MyFolder/sub/file.txt"
                        if (relPath && relPath.includes('/')) {
                            // relPath 中包含了多少个 '/' 就说明嵌套了多少层
                            let depth = relPath.split('/').length - 1;
                            let currentPath = sysPath;
                            while (depth > 0) {
                                currentPath = path.dirname(currentPath);
                                depth--;
                            }
                            finalFolderPath = currentPath;
                        } else {
                            // 对于普通的文件选择或者不支持 webkitRelativePath，直接取文件的所在目录
                            finalFolderPath = path.dirname(sysPath);
                        }
                        
                        this.currentFolderPath = finalFolderPath;
                        if (this.pathInputEl) this.pathInputEl.value = this.currentFolderPath;
                        this.loadFiles();
                    } catch (err) {
                         console.error(err);
                    }
                }
            }
        };
        fileInput.click();
    });

    const modeBtn = pathRow.createEl('button');
    modeBtn.style.display = 'flex';
    modeBtn.style.alignItems = 'center';
    modeBtn.style.gap = '6px';
    modeBtn.style.boxShadow = 'none';
    modeBtn.style.border = '0';
    modeBtn.style.background = 'transparent';
    modeBtn.title = '在外部绝对路径与当前 Obsidian 库目录模式之间切换';
    
    const updateModeBtn = () => {
        modeBtn.empty();
        if (this.currentMode === 'external') {
            setIcon(modeBtn, 'link-2-off');
            modeBtn.createSpan({ text: '外' });
        } else {
            setIcon(modeBtn, 'link-2');
            modeBtn.createSpan({ text: '内' });
        }
    };
    updateModeBtn();

    modeBtn.addEventListener('click', () => {
        if (this.currentMode === 'external') {
            this.currentMode = 'internal';
            this.lastExternalPath = this.currentFolderPath; // 记录外部路径

            if (this.plugin.settings.internalFolderPath) {
                this.currentFolderPath = this.plugin.settings.internalFolderPath;
            } else {
                const adapter = this.plugin.app.vault.adapter;
                if ((adapter as any).getBasePath) {
                    this.currentFolderPath = (adapter as any).getBasePath();
                } else {
                    new Notice('无法获取当前库目录的绝对路径');
                }
            }
        } else {
            this.currentMode = 'external';
            this.currentFolderPath = this.lastExternalPath || this.plugin.settings.defaultFolderPath; // 恢复外部路径
        }
        
        updateModeBtn();

        if (this.pathInputEl) this.pathInputEl.value = this.currentFolderPath;
        this.loadFiles();
    });

    // 2. 搜索框与分类标签栏
    const filterRow = topArea.createDiv();
    filterRow.style.display = 'flex';
    filterRow.style.gap = '20px';
    filterRow.style.alignItems = 'center';
    
    const searchInput = filterRow.createEl('input', { type: 'text', placeholder: '搜索该目录下的文件...' });
    searchInput.style.width = '250px';
    searchInput.style.border = '0';
    searchInput.style.boxShadow = 'none';
    searchInput.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
        this.renderFiles();
    });
    
    // 聚焦到文件搜索框中
    setTimeout(() => {
        searchInput.focus();
    }, 50);
    
    const tabsDiv = filterRow.createDiv();
    tabsDiv.style.display = 'flex';
    tabsDiv.style.gap = '8px';
    tabsDiv.style.flex = '1';

    // 2.5 多选模式与栏数控制（自动控制）
    const galleryControls = filterRow.createDiv();
    galleryControls.style.display = 'flex';
    galleryControls.style.gap = '10px';
    galleryControls.style.alignItems = 'center';

    const insertGalleryBtn = galleryControls.createEl('button', { text: '插入多项' });
    insertGalleryBtn.style.display = 'none';
    insertGalleryBtn.style.border = '0';
    insertGalleryBtn.style.boxShadow = 'none';
    insertGalleryBtn.style.backgroundColor = 'var(--interactive-accent)';
    insertGalleryBtn.style.color = 'var(--text-on-accent)';

    insertGalleryBtn.addEventListener('click', () => {
        if (this.selectedFiles.size === 0) {
            new Notice('请先选择至少一个图像');
            return;
        }
        const selected = Array.from(this.selectedFiles);
        this.close();
        
        const paths = selected.map(f => f.path).join('|||');
        const count = selected.length;
        this.colsCount = count > 5 ? 5 : count;
        this.onSubmit(paths, \`____GALLERY_CONFIG_COLUMNS_\${this.colsCount}\`);
    });
    
    // helper to update btn from items click
    (this as any).updateInsertBtn = () => {
        if (this.selectedFiles.size > 0) {
            insertGalleryBtn.style.display = 'block';
            const count = this.selectedFiles.size;
            const cols = count > 5 ? 5 : count;
            insertGalleryBtn.textContent = \`插入 \${count} 张图 (分\${cols}栏)\`;
        } else {
            insertGalleryBtn.style.display = 'none';
        }
    };

    const tabs = [
        { id: 'all', label: '全部' },
        { id: 'image', label: '图片' },
        { id: 'video', label: '视频' },
        { id: 'audio', label: '音频' }
    ];
    
    tabs.forEach(tab => {
        const tabEl = tabsDiv.createEl('button', { text: tab.label });
        tabEl.style.boxShadow = 'none';
        tabEl.style.border = '0';
        if (this.currentTab === tab.id) {
            tabEl.style.backgroundColor = 'var(--interactive-accent)';
            tabEl.style.color = 'var(--text-on-accent)';
        }
        tabEl.addEventListener('click', () => {
            this.currentTab = tab.id as any;
            Array.from(tabsDiv.children).forEach((child: HTMLElement) => {
                child.style.backgroundColor = '';
                child.style.color = '';
            });
            tabEl.style.backgroundColor = 'var(--interactive-accent)';
            tabEl.style.color = 'var(--text-on-accent)';
            this.renderFiles();
        });
    });
    
    // 内容显示区
    this.contentContainer = contentEl.createDiv();
    this.contentContainer.style.flex = '1';
    this.contentContainer.style.border = '0';
    this.contentContainer.style.borderRadius = '8px';
    this.contentContainer.style.padding = '16px';
    this.contentContainer.style.overflowY = 'auto';
    this.contentContainer.style.display = 'grid';
    this.contentContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
    this.contentContainer.style.gap = '16px';
    this.contentContainer.style.alignContent = 'start';
    this.contentContainer.style.backgroundColor = 'var(--background-primary)';

    // Cleanup input
    this.contentEl.addEventListener('DOMNodeRemovedFromDocument', () => {
      if (document.body.contains(fileInput)) {
        document.body.removeChild(fileInput);
      }
    });

    if (this.currentFolderPath) {
      this.loadFiles();
    } else {
      this.renderEmptyState('请输入或选择一个文件夹路径开始预览。');
    }
  }

  loadFiles() {
      if (!this.currentFolderPath) return;
      try {
          const fs = require('fs');
          const path = require('path');
          const files = fs.readdirSync(this.currentFolderPath);
          
          this.filesList = files.map((fileName: string) => {
              const fullPath = path.join(this.currentFolderPath, fileName);
              try {
                  const stat = fs.statSync(fullPath);
                  return {
                      name: fileName,
                      path: fullPath,
                      isDirectory: stat.isDirectory(),
                      ext: path.extname(fileName).toLowerCase().replace('.', '')
                  };
              } catch (e) { return null; }
          }).filter((f: any) => f !== null);

          // 排序：文件夹在前，文件在后
          this.filesList.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          
          // 更新设置中的默认文件路径，这样下次打开会自动处于该目录
          if (this.currentMode === 'external') {
              this.plugin.settings.defaultFolderPath = this.currentFolderPath;
              this.plugin.saveSettings();
              this.lastExternalPath = this.currentFolderPath;
          } else {
              this.plugin.settings.internalFolderPath = this.currentFolderPath;
              this.plugin.saveSettings();
          }

          if (this.pathInputEl) {
              this.pathInputEl.value = this.currentFolderPath;
          }

          this.renderFiles();
      } catch (e) {
          console.error('Error loading files', e);
          this.renderEmptyState('无法读取该路径，请检查路径是否正确或是否存在权限限制。');
      }
  }

  renderEmptyState(text: string) {
      this.contentContainer.empty();
      const emptyMsg = this.contentContainer.createEl('div', { text });
      emptyMsg.style.gridColumn = '1 / -1';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.padding = '60px 20px';
      emptyMsg.style.color = 'var(--text-muted)';
  }

  renderFiles() {
      this.contentContainer.empty();
      
      const filtered = this.filesList.filter(file => {
          if (this.searchQuery && !file.name.toLowerCase().includes(this.searchQuery)) return false;
          
          if (this.currentTab === 'image' && !file.isDirectory && !['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(file.ext)) return false;
          if (this.currentTab === 'video' && !file.isDirectory && !['mp4', 'webm', 'mov', 'mkv'].includes(file.ext)) return false;
          if (this.currentTab === 'audio' && !file.isDirectory && !['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(file.ext)) return false;
          
          return true;
      });

      // 添加返回上级目录选项
      try {
          const path = require('path');
          const parentDir = path.dirname(this.currentFolderPath);
          if (parentDir && parentDir !== this.currentFolderPath) {
              filtered.unshift({
                  name: '.. (上级目录)',
                  path: parentDir,
                  isDirectory: true,
                  ext: ''
              });
          }
      } catch (e) { }
      
      if (filtered.length === 0) {
          this.renderEmptyState('该目录下没有找到匹配的文件。');
          return;
      }
      
      filtered.forEach(file => {
          const item = this.contentContainer.createDiv();
          item.style.border = '0';
          item.style.borderRadius = '8px';
          item.style.padding = '8px';
          item.style.display = 'flex';
          item.style.flexDirection = 'column';
          item.style.alignItems = 'center';
          item.style.cursor = 'pointer';
          item.style.backgroundColor = 'var(--background-secondary)';
          item.style.transition = 'all 0.15s ease-in-out';
          
          item.addEventListener('mouseenter', () => {
              item.style.transform = 'translateY(-2px)';
              item.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          });
          item.addEventListener('mouseleave', () => {
              item.style.transform = 'none';
              item.style.boxShadow = 'none';
          });
          
          // Icon or Preview
          const previewDiv = item.createDiv();
          previewDiv.style.height = '90px';
          previewDiv.style.width = '100%';
          previewDiv.style.display = 'flex';
          previewDiv.style.justifyContent = 'center';
          previewDiv.style.alignItems = 'center';
          previewDiv.style.marginBottom = '8px';
          previewDiv.style.borderRadius = '4px';
          previewDiv.style.overflow = 'hidden';
          previewDiv.style.backgroundColor = 'var(--background-primary)';
          
          const isImage = !file.isDirectory && ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(file.ext);
          const isVideo = !file.isDirectory && ['mp4', 'webm', 'mov', 'mkv'].includes(file.ext);
          
          if (file.isDirectory) {
              const icon = previewDiv.createEl('div', { text: '📁' });
              icon.style.fontSize = '40px';
              icon.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
          } else if (isImage) {
              const img = previewDiv.createEl('img');
              img.src = this.plugin.getConvertPath(file.path);
              img.style.maxWidth = '100%';
              img.style.maxHeight = '100%';
              img.style.objectFit = 'contain';
          } else if (isVideo) {
              const video = previewDiv.createEl('video');
              video.src = this.plugin.getConvertPath(file.path);
              video.style.maxWidth = '100%';
              video.style.maxHeight = '100%';
              video.style.objectFit = 'contain';
              video.muted = true;
              video.autoplay = true;
              video.loop = true;
              video.style.pointerEvents = 'none'; // 防止点击覆盖
          } else {
              const icon = previewDiv.createEl('div', { text: file.ext ? file.ext.toUpperCase() : '?' });
              icon.style.fontSize = '20px';
              icon.style.fontWeight = 'bold';
              icon.style.color = 'var(--text-muted)';
          }
          
          const nameSpan = item.createEl('div', { text: file.name });
          nameSpan.style.fontSize = '12px';
          nameSpan.style.textAlign = 'center';
          nameSpan.style.wordBreak = 'break-all';
          nameSpan.style.display = '-webkit-box';
          (nameSpan.style as any).webkitLineClamp = '2';
          (nameSpan.style as any).webkitBoxOrient = 'vertical';
          nameSpan.style.overflow = 'hidden';
          nameSpan.style.width = '100%';
          nameSpan.title = file.name;
          
          let isSelected = Array.from(this.selectedFiles).some((f: any) => f.path === file.path);
          if (isSelected) {
              item.style.borderColor = 'var(--interactive-accent)';
              item.style.backgroundColor = 'rgba(var(--interactive-accent-rgb, 136, 57, 239), 0.15)';
              item.style.boxShadow = '0 0 0 2px var(--interactive-accent)';
          }

          item.addEventListener('click', (e) => {
              if (file.isDirectory) {
                  this.currentFolderPath = file.path;
                  this.searchQuery = '';
                  const searchInput = document.querySelector('input[placeholder="搜索该目录下的文件..."]') as HTMLInputElement;
                  if (searchInput) searchInput.value = '';
                  this.loadFiles();
              } else {
                  if (e.ctrlKey || e.metaKey) {
                      // Toggle selection
                      if (isSelected) {
                          const toRemove = Array.from(this.selectedFiles).find((f: any) => f.path === file.path);
                          this.selectedFiles.delete(toRemove);
                          isSelected = false;
                          item.style.borderColor = 'var(--background-modifier-border)';
                          item.style.backgroundColor = 'var(--background-secondary)';
                          item.style.boxShadow = 'none';
                      } else {
                          this.selectedFiles.add(file);
                          isSelected = true;
                          item.style.borderColor = 'var(--interactive-accent)';
                          item.style.backgroundColor = 'rgba(var(--interactive-accent-rgb, 136, 57, 239), 0.15)';
                          item.style.boxShadow = '0 0 0 2px var(--interactive-accent)';
                      }
                      this.isMultiSelectMode = this.selectedFiles.size > 0;
                      if ((this as any).updateInsertBtn) (this as any).updateInsertBtn();
                  } else {
                      this.inputPath = file.path;
                      const nameToUse = this.customName || file.name;
                      this.close();
                      const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'mov', 'mkv'].includes(file.ext.toLowerCase());
                      if (isMedia) {
                          this.onSubmit(this.inputPath, \`____GALLERY_CONFIG_COLUMNS_1\`);
                      } else {
                          this.onSubmit(this.inputPath, nameToUse);
                      }
                  }
              }
          });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class LocalFileLinkerSettingTab extends PluginSettingTab {
  plugin: LocalFileLinkerPlugin;

  constructor(app: App, plugin: LocalFileLinkerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: '本地文件映射 & 实时预览设置面板 (Plugin Settings)' });

    new Setting(containerEl)
      .setName('默认双链格式 (Default Link Format)')
      .setDesc('决定拖拽或录入本地绝对路径时在 Markdown 内部生成的格式。')
      .addDropdown(dropdown => dropdown
        .addOption('custom-protocol', 'custom-protocol:// (推荐，安全平滑)')
        .addOption('file-uri', 'file:/// 标准协议 (跨端与外部工具兼容)')
        .addOption('absolute-path', '绝对路径明文 (直接地址形式)')
        .setValue(this.plugin.settings.defaultLinkStyle)
        .onChange(async (value: any) => {
          this.plugin.settings.defaultLinkStyle = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('文档内嵌渲染媒体 (Inline Rendering)')
      .setDesc('在阅读视图下，自动将带感叹号的 ![视频](local-file://...) 媒体链接原内联转换为播放器、图片组件。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.inlineRenderEnabled)
        .onChange(async (value) => {
          this.plugin.settings.inlineRenderEnabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('自适应元数据解析 (Auto-Extract Metadata)')
      .setDesc('在鼠标悬浮时在 Electron 进程后端智能读取物理文件的大小、类型与文本前几行，更新给弹窗。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoExtractMetadata)
        .onChange(async (value) => {
          this.plugin.settings.autoExtractMetadata = value;
          await this.plugin.saveSettings();
        }));
  }
}
`;
