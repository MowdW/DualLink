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
  App, 
  MarkdownView, 
  Notice,
  Modal,
  Menu,
  setIcon
} from 'obsidian';
import * as electron from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { isImageExt, isVideoExt, isAudioExt, isMediaExt } from './constants';
import { getCleanLocalPath, getConvertPath } from './path-utils';
import {
  isSameFile as isSameFileFn,
  hasOtherReferences as hasOtherReferencesFn,
  findFileRecursive as findFileRecursiveFn,
  findExternalFileRec as findExternalFileRecFn,
  packToVault as doPackToVault,
  packOut as doPackOut,
} from './packer';
import { registerGalleryProcessor } from './gallery-processor';
import { LocalFileLinkerSettingTab } from './setting-tab';

interface LocalFileLinkerSettings {
  defaultLinkStyle: 'absolute-path' | 'file-uri' | 'custom-protocol';
  inlineRenderEnabled: boolean;
  autoExtractMetadata: boolean;
  customPreviewFolders: string;
  defaultFolderPath: string;
  internalFolderPath: string;
  externalMediaFolder: string;
  packOutMode: 'move' | 'copy';
  hoverPreviewEnabled: boolean;
}

const DEFAULT_SETTINGS: LocalFileLinkerSettings = {
  defaultLinkStyle: 'custom-protocol',
  inlineRenderEnabled: true,
  autoExtractMetadata: true,
  customPreviewFolders: '',
  defaultFolderPath: '',
  internalFolderPath: '',
  externalMediaFolder: '',
  packOutMode: 'move',
  hoverPreviewEnabled: true
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

    this.addCommand({
      id: 'duallink-pack-to-vault',
      name: 'DualIn: 打包外部资源到保险库',
      editorCallback: () => this.packToVault()
    });

    this.addCommand({
      id: 'duallink-pack-out',
      name: 'DualOut: 外置内部媒体到外部目录',
      editorCallback: () => this.packOut()
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
        menu.addItem((item) => {
          item
            .setTitle('DualIn: 打包外部资源到保险库')
            .setIcon('archive')
            .onClick(() => {
              this.packToVault();
            });
        });
        menu.addItem((item) => {
          item
            .setTitle('DualOut: 外置内部媒体到外部目录')
            .setIcon('external-link')
            .onClick(() => {
              this.packOut();
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
          const filePath = getCleanLocalPath(src);
          if (!filePath) return;
          
          const convertPath = getConvertPath(this.app, filePath);
          const ext = filePath.split('.').pop()?.toLowerCase() || '';

          if (isVideoExt(ext)) {
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
          } else if (isAudioExt(ext)) {
            const audio = document.createElement('audio');
            audio.src = convertPath;
            audio.controls = true;
            audio.style.width = '100%';
            audio.style.marginTop = '8px';
            audio.style.marginBottom = '8px';
            img.replaceWith(audio);
          } else if (isImageExt(ext)) {
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
          const filePath = getCleanLocalPath(href);
          if (!filePath) return;
          const convertPath = getConvertPath(this.app, filePath);
          const ext = filePath.split('.').pop()?.toLowerCase() || '';
          
          // 如果是图片或视频类型的扩展名，且用户开启了内联渲染
          if (isMediaExt(ext)) {
            // 查看上一个节点是否是属于文本节点且以 '!' 结尾，如果有则移除
            const prevNode = a.previousSibling;
            if (prevNode && prevNode.nodeType === Node.TEXT_NODE && prevNode.textContent?.endsWith('!')) {
              prevNode.textContent = prevNode.textContent.slice(0, -1); 
            }

            if (isVideoExt(ext)) {
              const video = document.createElement('video');
              video.src = convertPath;
              video.controls = false;
              video.addEventListener('mouseenter', () => video.controls = true);
              video.addEventListener('mouseleave', () => video.controls = false);
              video.style.maxWidth = '100%';
              video.style.borderRadius = '8px';
              a.replaceWith(video);
            } else if (isAudioExt(ext)) {
              const audio = document.createElement('audio');
              audio.src = convertPath;
              audio.controls = true;
              audio.style.width = '100%';
              a.replaceWith(audio);
            } else if (isImageExt(ext)) {
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
    registerGalleryProcessor(this, PathPromptModal);

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

  public async findExternalFileRec(fileName: string, dir: string, maxDepth = 4, currentDepth = 0): Promise<string | null> {
    return findExternalFileRecFn(fileName, dir, maxDepth, currentDepth);
  }

  /**
   * 按用户预设偏好，渲染链接到 Markdown 中
   */
  generateMarkdownLink(fileName: string, path: string): string {
    // 1. 去除路径中可能出现的头尾双引号 (常见于 Windows "复制文件路径" 功能)
    const cleanPath = path.replace(/['"]/g, '').trim().replace(/\\\\/g, '/');
    const cleanName = fileName.replace(/['"]/g, '').trim();

    const ext = cleanName.split('.').pop()?.toLowerCase() || '';
    const media = isMediaExt(ext);

    if (media && this.settings.inlineRenderEnabled) {
      const urlWithoutLeadingSlash = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
      const finalSrc = \`file:///\${urlWithoutLeadingSlash}\`;
      
      if (isVideoExt(ext)) {
        return \`<video src="\${finalSrc}" controls style="max-width: 100%; border-radius: 8px;"></video>\`;
      } else if (isAudioExt(ext)) {
        return \`<audio src="\${finalSrc}" controls style="width: 100%; border-radius: 8px;"></audio>\`;
      } else {
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

  isSameFile(path1: string, path2: string): boolean {
    return isSameFileFn(path1, path2);
  }

  hasOtherReferences(file: any, currentPath: string): boolean {
    return hasOtherReferencesFn(this.app, file, currentPath);
  }

  findFileRecursive(dir: string, targetName: string): string | null {
    return findFileRecursiveFn(dir, targetName);
  }

  async packToVault() {
    await doPackToVault(this);
  }

  async packOut() {
    await doPackOut(this);
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

      if (target.tagName !== 'A' && !target.classList.contains('cm-url') && !target.classList.contains('cm-link') && !target.classList.contains('cm-underline')) {
        return;
      }

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
        const filePath = getCleanLocalPath(href);
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
                electron.shell.showItemInFolder(filePath);
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
      electron.shell.openPath(filePath).then((err: string) => {
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
          const ext = internalPath.split('.').pop()?.toLowerCase() || '';
          const media = isMediaExt(ext);
          mdLink = media ? \`![[\${internalPath}]]\` : \`[[\${internalPath}|\${finalName}]]\`;
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

export class PathPromptModal extends Modal {
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

  async onOpen() {
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
    this.pathInputEl.addEventListener('change', async (e) => {
        this.currentFolderPath = (e.target as HTMLInputElement).value;
        await this.loadFiles();
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
        fileInput.value = '';
        fileInput.onchange = async (e: any) => {
            if (e.target.files && e.target.files.length > 0) {
                const file = e.target.files[0];
                const sysPath = (file as any).path;
                let finalFolderPath = '';

                if (sysPath) {
                      try {
                        const relPath = (file as any).webkitRelativePath;
                        if (relPath && relPath.includes('/')) {
                            let depth = relPath.split('/').length - 1;
                            let currentPath = sysPath;
                            while (depth > 0) {
                                currentPath = path.dirname(currentPath);
                                depth--;
                            }
                            finalFolderPath = currentPath;
                        } else {
                            finalFolderPath = path.dirname(sysPath);
                        }
                        
                        this.currentFolderPath = finalFolderPath;
                        if (this.pathInputEl) this.pathInputEl.value = this.currentFolderPath;
                        await this.loadFiles();
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

    modeBtn.addEventListener('click', async () => {
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
        await this.loadFiles();
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
      await this.loadFiles();
    } else {
      this.renderEmptyState('请输入或选择一个文件夹路径开始预览。');
    }
  }

  async loadFiles() {
      if (!this.currentFolderPath) return;
      try {
          const dirents = await fs.promises.readdir(this.currentFolderPath, { withFileTypes: true });
          
          this.filesList = dirents.map((dirent: fs.Dirent) => {
              const fullPath = path.join(this.currentFolderPath, dirent.name);
              return {
                  name: dirent.name,
                  path: fullPath,
                  isDirectory: dirent.isDirectory(),
                  ext: dirent.isDirectory() ? '' : path.extname(dirent.name).toLowerCase().replace('.', '')
              };
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
          
          if (this.currentTab === 'image' && !file.isDirectory && !isImageExt(file.ext)) return false;
          if (this.currentTab === 'video' && !file.isDirectory && !isVideoExt(file.ext)) return false;
          if (this.currentTab === 'audio' && !file.isDirectory && !isAudioExt(file.ext)) return false;
          
          return true;
      });

      // 添加返回上级目录选项
      try {
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
          
          const imageCheck = !file.isDirectory && isImageExt(file.ext);
          const videoCheck = !file.isDirectory && isVideoExt(file.ext);

          if (file.isDirectory) {
              const icon = previewDiv.createEl('div', { text: '📁' });
              icon.style.fontSize = '40px';
              icon.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
          } else if (imageCheck) {
              const img = previewDiv.createEl('img');
              img.src = getConvertPath(this.plugin.app, file.path);
              img.style.maxWidth = '100%';
              img.style.maxHeight = '100%';
              img.style.objectFit = 'contain';
          } else if (videoCheck) {
              const video = previewDiv.createEl('video');
              video.src = getConvertPath(this.plugin.app, file.path);
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

          item.addEventListener('click', async (e) => {
              if (file.isDirectory) {
                  this.currentFolderPath = file.path;
                  this.searchQuery = '';
                  const searchInput = document.querySelector('input[placeholder="搜索该目录下的文件..."]') as HTMLInputElement;
                  if (searchInput) searchInput.value = '';
                  await this.loadFiles();
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
                      const media = isMediaExt(file.ext.toLowerCase());
                      if (media) {
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


`;
