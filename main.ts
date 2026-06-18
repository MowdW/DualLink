/**
 * Obsidian Local File Linker & Live Preview Plugin
 * Built for Obsidian (runs on Electron)
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { 
  Plugin, 
  App, 
  MarkdownView, 
  Notice,
  Modal,
  Menu,
  setIcon,
  Editor
} from 'obsidian';
import { isDesktop, isMobile, isElectron } from './platform';
import { isImageExt, isVideoExt, isAudioExt, isMediaExt } from './constants';
import { getCleanLocalPath, getCleanAppLocalPath } from './path-utils';
import { electron, fs, path } from './node-modules';
import {
  findExternalFileRec,
  packToVault as doPackToVault,
  packOut as doPackOut,
} from './packer';
import { registerGalleryProcessor } from './gallery-processor';
import { LocalFileLinkerSettingTab } from './setting-tab';
import { MobileFilePickerModal } from './mobile-file-picker';
import { createPublicAPI, DualLinkPublicAPI } from './api';

import { LocalFileLinkerSettings, FileItem, IDualLinkPlugin, VaultAdapter, FileWithPath } from './types';


const DEFAULT_SETTINGS: LocalFileLinkerSettings = {
  defaultLinkStyle: 'custom-protocol',
  inlineRenderEnabled: true,
  autoExtractMetadata: true,
  customPreviewFolders: '',
  defaultFolderPath: '',
  internalFolderPath: '',
  externalMediaFolder: '',
  packOutMode: 'move',
  hoverPreviewEnabled: true,
  showMobileToolbarButton: true
};

export default class LocalFileLinkerPlugin extends Plugin {
  settings: LocalFileLinkerSettings;
  api: DualLinkPublicAPI;

  async onload() {
    console.log('正在加载 Obsidian 外部物理文件关联映射插件 (DualLink)...');
    await this.loadSettings();

    // 初始化公共 API（供其他插件调用）
    this.api = createPublicAPI(this);

    // 桌面环境才启用的功能
    if (isDesktop() && fs && path && electron) {
      // 注册自定义 local-file:// 安全协议解析与快捷点击动作
      this.registerObsidianProtocol();

      // 1. 注册编辑器拖拽 (Drag & Drop) 拦截监听，拖入任何系统外围文件即刻自动生成映射外链
      this.registerEvent(
        this.app.workspace.on('editor-drop', (evt: DragEvent, editor: Editor) => {
          const files = evt.dataTransfer?.files;
          if (!files || files.length === 0) return;

          // Electron 特性：拖拽获得的 File 对象自带原始物理磁盘绝对路径（file.path)
          const fileList = Array.from(files);
          let insertedAny = false;

          fileList.forEach(file => {
            const systemPath = (file as FileWithPath).path;
            if (!systemPath) return;

            evt.preventDefault();
            insertedAny = true;

            // 依据设置转化成相对应的 Markdown 连接样式
            const markdownLink = this.generateMarkdownLink(file.name, systemPath);
            
            // 在光标所在处或托落节点植入文本
            const cursor = editor.getCursor();
            editor.replaceRange(markdownLink + '\n', cursor);
          });

          if (insertedAny) {
            new Notice('🔗 成功通过外部映射方式创建了本地文件的物理双链！');
          }
        })
      );

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
        editorCallback: () => { void this.packToVault(); }
      });

      this.addCommand({
        id: 'duallink-pack-out',
        name: 'DualOut: 外置内部媒体到外部目录',
        editorCallback: () => { void this.packOut(); }
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
              .setTitle('DualIn')
              .setIcon('archive')
              .onClick(() => {
                void this.packToVault();
              });
          });
          menu.addItem((item) => {
            item
              .setTitle('DualOut')
              .setIcon('external-link')
              .onClick(() => {
                void this.packOut();
              });
          });
        })
      );

      // 5. 注册 Markdown 渲染后处理器, 用于在只读模式下内联渲染图片与音视频
      this.registerMarkdownPostProcessor((element, context) => {
        if (!this.settings.inlineRenderEnabled) return;

        const createBlobUrl = (filePath: string): string | null => {
          try {
            const buf = fs.readFileSync(filePath);
            const ext = filePath.split('.').pop()?.toLowerCase() || '';
            let mime = '';
            if (isImageExt(ext)) {
              const imageMimes: Record<string, string> = { jpg: 'jpeg', svg: 'svg+xml' };
              mime = `image/${imageMimes[ext] || ext}`;
            } else if (isVideoExt(ext)) {
              mime = `video/${ext}`;
            } else if (isAudioExt(ext)) {
              const audioMimes: Record<string, string> = { mp3: 'mpeg' };
              mime = `audio/${audioMimes[ext] || ext}`;
            } else {
              return null;
            }
            const blob = new Blob([buf], { type: mime });
            return URL.createObjectURL(blob);
          } catch (e) {
            return null;
          }
        };

        // 1. 处理标准的嵌入语法 (形如 ![name](local-file://...)) 被 Obsidian 渲染成的 <img>
        const images = Array.from(element.querySelectorAll('img'));
        images.forEach((img) => {
          const src = img.getAttribute('src');
          if (src && (src.startsWith('local-file://') || src.startsWith('file:///') || src.startsWith('app://local/'))) {
            const filePath = src.startsWith('app://local/')
              ? getCleanAppLocalPath(src)
              : getCleanLocalPath(src);
            if (!filePath) return;
            
            const ext = filePath.split('.').pop()?.toLowerCase() || '';
            const blobUrl = createBlobUrl(filePath);

            if (isVideoExt(ext)) {
              if (blobUrl) {
                const video = document.createElement('video');
                video.src = blobUrl;
                video.controls = false;
                video.addEventListener('mouseenter', () => video.controls = true);
                video.addEventListener('mouseleave', () => video.controls = false);
                video.className = 'duallink-rendered-video';
                img.replaceWith(video);
              }
            } else if (isAudioExt(ext)) {
              if (blobUrl) {
                const audio = document.createElement('audio');
                audio.src = blobUrl;
                audio.controls = true;
                audio.className = 'duallink-rendered-audio';
                img.replaceWith(audio);
              }
            } else if (blobUrl) {
              img.src = blobUrl;
              img.className = 'duallink-rendered-image';
            }
          }
        });

        // 2. 某些情况下 Obsidian 会把媒体文件语法当成 <a> 展现
        const links = Array.from(element.querySelectorAll('a.external-link'));
        links.forEach(a => {
          const href = a.getAttribute('href');
          if (href && (href.startsWith('local-file://') || href.startsWith('file:///') || href.startsWith('app://local/'))) {
            const filePath = href.startsWith('app://local/')
              ? getCleanAppLocalPath(href)
              : getCleanLocalPath(href);
            if (!filePath) return;
            const ext = filePath.split('.').pop()?.toLowerCase() || '';
            
            if (isMediaExt(ext)) {
              const blobUrl = createBlobUrl(filePath);
              if (!blobUrl) return;

              const prevNode = a.previousSibling;
              if (prevNode && prevNode.nodeType === Node.TEXT_NODE && prevNode.textContent?.endsWith('!')) {
                prevNode.textContent = prevNode.textContent.slice(0, -1); 
              }

              if (isVideoExt(ext)) {
                const video = document.createElement('video');
                video.src = blobUrl;
                video.controls = false;
                video.addEventListener('mouseenter', () => video.controls = true);
                video.addEventListener('mouseleave', () => video.controls = false);
                video.className = 'duallink-rendered-video';
                a.replaceWith(video);
              } else if (isAudioExt(ext)) {
                const audio = document.createElement('audio');
                audio.src = blobUrl;
                audio.controls = true;
                audio.className = 'duallink-rendered-audio';
                a.replaceWith(audio);
              } else if (isImageExt(ext)) {
                const img = document.createElement('img');
                img.src = blobUrl;
                img.className = 'duallink-rendered-image';
                a.replaceWith(img);
              }
            }
          }
        });
      });
    } else {
      // 移动端提示
      console.log('DualLink: Running in mobile mode, desktop features disabled.');
    }

    // 5.5 注册分栏组图 (Gallery) 的 代码块处理器（通用功能）
    registerGalleryProcessor(this, PathPromptModal);

    // 6. 注册通用命令 - 插入保险库内文件链接（桌面和移动端均可使用）
    this.addCommand({
      id: 'insert-vault-file-link',
      name: '插入保险库文件链接',
      editorCallback: (editor) => {
        new MobileFilePickerModal(this, editor).open();
      }
    });

    // 7. 添加 Ribbon 图标（桌面和移动端通用）
    if (this.settings.showMobileToolbarButton) {
      this.addRibbonIcon('link-2', 'DualLink', (evt: MouseEvent) => {
        if (isDesktop() && fs && path && electron) {
          this.showDesktopMenu();
        } else {
          this.showMobileMenu();
        }
      });
    }

    // 8. 注册设置管理面板
    this.addSettingTab(new LocalFileLinkerSettingTab(this.app, this));
  }

  // 显示桌面端菜单
  showDesktopMenu() {
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle('插入本地文件链接')
        .setIcon('link-2')
        .onClick(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view) {
            this.promptForLocalFileLink(view.editor);
          }
        });
    });

    menu.addItem((item) => {
      item.setTitle('插入保险库文件')
        .setIcon('folder')
        .onClick(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view) {
            new MobileFilePickerModal(this, view.editor).open();
          } else {
            new Notice('请先打开一个 Markdown 编辑器');
          }
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item.setTitle('DualIn：打包到保险库')
        .setIcon('archive')
        .onClick(() => void this.packToVault());
    });

    menu.addItem((item) => {
      item.setTitle('DualOut：外置到外部')
        .setIcon('external-link')
        .onClick(() => void this.packOut());
    });

    menu.showAtPosition({ x: 50, y: 50 });
  }

  // 显示移动端菜单
  showMobileMenu() {
    const menu = new Menu();

    menu.addItem((item) => {
      item.setTitle('插入保险库文件')
        .setIcon('folder')
        .onClick(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (view) {
            new MobileFilePickerModal(this, view.editor).open();
          } else {
            new Notice('请先打开一个 Markdown 编辑器');
          }
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item.setTitle('关于 DualLink')
        .setIcon('info')
        .onClick(() => {
          new Notice('DualLink - 管理本地与保险库文件链接的插件。桌面端支持更多功能。');
        });
    });

    menu.showAtPosition({ x: 50, y: 50 });
  }

  onunload() {
    console.log('正在卸载 Obsidian 本地物理链接插件 (DualLink)...');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  public async findExternalFileRec(fileName: string, dir: string, maxDepth = 4, currentDepth = 0): Promise<string | null> {
    return findExternalFileRec(fileName, dir, maxDepth, currentDepth);
  }

  generateMarkdownLink(fileName: string, path: string): string {
    const cleanPath = path.replace(/['"]/g, '').trim().replace(/\\/g, '/');
    const cleanName = fileName.replace(/['"]/g, '').trim();
    const ext = cleanName.split('.').pop()?.toLowerCase() || '';

    if (isMediaExt(ext) && this.settings.inlineRenderEnabled) {
      let urlPath = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
      urlPath = urlPath.split('/').map(c => encodeURIComponent(c)).join('/');
      urlPath = urlPath.replace(/^([a-zA-Z])%3A/, '$1:');
      const finalSrc = `file:///${urlPath}`;
      if (isVideoExt(ext)) return `![🎬 ${cleanName}](<${finalSrc}>)`;
      if (isAudioExt(ext)) return `![🎵 ${cleanName}](<${finalSrc}>)`;
      return `![🖼 ${cleanName}](<${finalSrc}>)`;
    }

    switch (this.settings.defaultLinkStyle) {
      case 'file-uri':
        return `[📄 ${cleanName}](<file:///${cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath}>)`;
      case 'absolute-path':
        return `[📄 ${cleanName}](<${cleanPath}>)`;
      default:
        return `[📄 ${cleanName}](<local-file://${cleanPath}>)`;
    }
  }

  async packToVault() {
    if (!isDesktop() || !fs || !path) {
      new Notice('DualIn 功能仅支持桌面版 Obsidian');
      return;
    }
    await doPackToVault(this);
  }

  async packOut() {
    if (!isDesktop() || !fs || !path) {
      new Notice('DualOut 功能仅支持桌面版 Obsidian');
      return;
    }
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

      if (href && (href.startsWith('local-file://') || href.includes('local-file://') || href.includes('file:///'))) {
        evt.preventDefault();
        const filePath = getCleanLocalPath(href);
        if (filePath) {
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
        if (electron) {
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
        }

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
    if (!isDesktop() || !electron) {
      new Notice('提示：当前不在本地 Electron 桌面外壳中。请在桌面版 Obsidian 中使用以一键唤起。');
      return;
    }
    const fileName = filePath.split('/').pop() || '外部文件';
    new Notice(`📂 正在调取系统原生应用打开文件: ${fileName}`);
    try {
      electron.shell.openPath(filePath).then((err: string) => {
        if (err) {
          new Notice(`⚠️ 无法唤醒程序: ${err}`, 5000);
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
  async promptForLocalFileLink(editor?: Editor) {
    if (!isDesktop() || !fs || !path) {
      new Notice('文件浏览器功能仅支持桌面版 Obsidian');
      return;
    }
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
          
          let blockContent = `\`\`\`duallink-gallery\n{ "columns": ${colsCount} }\n`;
          const adapter = this.app.vault.adapter as unknown as VaultAdapter;
          const vaultBasePath = adapter.getBasePath ? adapter.getBasePath() : '';
          
          paths.forEach(p => {
              const cleanP = p.replace(/['"]/g, '').trim();
              let isInternal = false;
              let internalPath = '';
              if (vaultBasePath && cleanP.startsWith(vaultBasePath)) {
                  isInternal = true;
                  internalPath = cleanP.substring(vaultBasePath.length).replace(/^[/\\]+/, '').replace(/\\/g, '/');
              }
              if (isInternal) {
                  blockContent += `![[${internalPath}]]\n`;
              } else {
                  let appendPath = cleanP.startsWith('/') ? cleanP.substring(1) : cleanP;
                  appendPath = appendPath.split('/').map(c => encodeURIComponent(c)).join('/');
                  appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '$1:');
                  blockContent += `![](<file:///${appendPath}>)\n`;
              }
          });
          blockContent += '```\n';
          
          const cursor = defaultEditor.getCursor();
          defaultEditor.replaceRange(blockContent, cursor);
          new Notice('✅ 已向文档焦点处注入了分栏组图！');
          return;
      }

      const cleanInputPath = inputPath.replace(/['"]/g, '').trim();
      const defaultName = cleanInputPath.split(/[/\\\\]/).pop() || '外部关联文件';
      const finalName = customName.trim() || defaultName;
      
      let mdLink = '';
      
      const adapter = this.app.vault.adapter as unknown as VaultAdapter;
      let vaultBasePath = '';
      if (adapter.getBasePath) {
          vaultBasePath = adapter.getBasePath();
      }
      
      let isInternal = false;
      let internalPath = '';
      
      if (vaultBasePath && cleanInputPath.startsWith(vaultBasePath)) {
          isInternal = true;
          internalPath = cleanInputPath.substring(vaultBasePath.length).replace(/^[/\\]+/, '').replace(/\\/g, '/');
      }

      if (isInternal) {
          const ext = internalPath.split('.').pop()?.toLowerCase() || '';
          const media = isMediaExt(ext);
          mdLink = media ? `![[${internalPath}]]` : `[[${internalPath}|${finalName}]]`;
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
  private filesList: FileItem[] = [];
  private contentContainer: HTMLElement;
  private pathInputEl: HTMLInputElement | null = null;
  private plugin: LocalFileLinkerPlugin;
  private currentMode: 'external' | 'internal' = 'external';
  private lastExternalPath: string = '';

  private selectedFiles: Set<FileItem> = new Set();
  private isMultiSelectMode: boolean = false;
  private colsCount: number = 3;
  private updateInsertBtn?: () => void;

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
    
    // 检测设备并设置合适的弹窗尺寸
    const isMobileDevice = window.innerWidth < 768;
    // 设置弹窗尺寸，移动端用全宽
    this.modalEl.style.width = isMobileDevice ? '100%' : '80vw';
    this.modalEl.style.maxWidth = isMobileDevice ? 'none' : '1000px';
    this.modalEl.style.maxHeight = '80vh';
    this.modalEl.style.minHeight = isMobileDevice ? '60vh' : '40vh';
    this.modalEl.style.height = 'auto'; 
    this.modalEl.style.display = 'flex';
    this.modalEl.style.flexDirection = 'column';
    
    // 内容区的布局配置
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
    
    // 1. 文件夹路径选择行 - 移动端优化
    const pathRow = topArea.createDiv();
    pathRow.style.display = 'flex';
    pathRow.style.gap = '8px';
    pathRow.style.alignItems = 'center';
    pathRow.style.flexWrap = isMobileDevice ? 'wrap' : 'nowrap';
    
    this.pathInputEl = pathRow.createEl('input', { type: 'text', placeholder: '粘贴文件夹的绝对路径...' });
    this.pathInputEl.style.flex = '1';
    this.pathInputEl.style.border = '0';
    this.pathInputEl.style.boxShadow = 'none';
    this.pathInputEl.style.minWidth = isMobileDevice ? '120px' : 'auto';
    this.pathInputEl.value = this.currentFolderPath;
    this.pathInputEl.addEventListener('change', async (e) => {
        this.currentFolderPath = (e.target as HTMLInputElement).value;
        await this.loadFiles();
    });
    
    // 浏览按钮 - 优先用 Electron 原生对话框
    const browseBtn = pathRow.createEl('button', { text: '浏览' });
    browseBtn.style.boxShadow = 'none';
    browseBtn.style.border = '0';
    browseBtn.style.background = 'transparent';
    browseBtn.style.padding = '8px 12px';
    browseBtn.addEventListener('click', async () => {
        // 尝试 Electron 原生对话框
        let selectedDir: string | null = null;
        try {
            const electronModule: any = require('electron');
            if (electronModule?.remote?.dialog) {
                const result = await electronModule.remote.dialog.showOpenDialog({
                    title: '选择文件夹',
                    properties: ['openDirectory']
                });
                if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
                    selectedDir = result.filePaths[0];
                }
            }
        } catch {
            // remote 不可用，降级到 HTML input
        }

        if (selectedDir) {
            this.currentFolderPath = selectedDir;
            if (this.pathInputEl) this.pathInputEl.value = this.currentFolderPath;
            await this.loadFiles();
        } else {
            // 降级: HTML webkitdirectory input
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.setAttribute('webkitdirectory', '');
            fileInput.setAttribute('directory', '');
            (fileInput as any).webkitdirectory = true;
            fileInput.style.position = 'fixed';
            fileInput.style.left = '-9999px';
            fileInput.style.top = '-9999px';
            fileInput.style.opacity = '0';
            document.body.appendChild(fileInput);
            
            fileInput.onchange = async () => {
                if (fileInput.files && fileInput.files.length > 0) {
                    const f = fileInput.files[0];
                    const sysPath = (f as FileWithPath).path;
                    if (sysPath) {
                        try {
                            const relPath = (f as FileWithPath).webkitRelativePath;
                            let dirPath: string;
                            if (relPath && relPath.includes('/')) {
                                let d = relPath.split('/').length - 1;
                                dirPath = sysPath;
                                while (d > 0) { dirPath = path.dirname(dirPath); d--; }
                            } else {
                                dirPath = path.dirname(sysPath);
                            }
                            this.currentFolderPath = dirPath;
                            if (this.pathInputEl) this.pathInputEl.value = this.currentFolderPath;
                            await this.loadFiles();
                        } catch (err) {
                            console.error('DualLink browse error:', err);
                            new Notice('读取目录失败: ' + (err instanceof Error ? err.message : String(err)));
                        }
                    } else {
                        new Notice('无法获取系统路径，请手动输入。');
                    }
                } else {
                    new Notice('所选目录为空或无法读取。');
                }
                fileInput.remove();
            };
            fileInput.click();
        }
    });

    const modeBtn = pathRow.createEl('button');
    modeBtn.style.display = 'flex';
    modeBtn.style.alignItems = 'center';
    modeBtn.style.gap = '6px';
    modeBtn.style.boxShadow = 'none';
    modeBtn.style.border = '0';
    modeBtn.style.background = 'transparent';
    modeBtn.style.padding = '8px';
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
            this.lastExternalPath = this.currentFolderPath; 

            if (this.plugin.settings.internalFolderPath) {
                this.currentFolderPath = this.plugin.settings.internalFolderPath;
            } else {
                const adapter = this.plugin.app.vault.adapter as unknown as VaultAdapter;
            if (adapter.getBasePath) {
                this.currentFolderPath = adapter.getBasePath();
                } else {
                    new Notice('无法获取当前库目录的绝对路径');
                }
            }
        } else {
            this.currentMode = 'external';
            this.currentFolderPath = this.lastExternalPath || this.plugin.settings.defaultFolderPath; 
        }
        
        updateModeBtn();

        if (this.pathInputEl) this.pathInputEl.value = this.currentFolderPath;
        await this.loadFiles();
    });

    // 2. 搜索框与分类标签栏 - 移动端优化为垂直布局
    const filterRow = topArea.createDiv();
    filterRow.style.display = 'flex';
    filterRow.style.flexDirection = isMobileDevice ? 'column' : 'row';
    filterRow.style.gap = isMobileDevice ? '12px' : '20px';
    filterRow.style.alignItems = isMobileDevice ? 'stretch' : 'center';
    
    const searchInput = filterRow.createEl('input', { type: 'text', placeholder: '搜索该目录下的文件...' });
    searchInput.style.width = isMobileDevice ? '100%' : '250px';
    searchInput.style.border = '0';
    searchInput.style.boxShadow = 'none';
    searchInput.style.minHeight = '40px';
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
    tabsDiv.style.flexWrap = 'wrap';

    // 2.5 多选模式与栏数控制
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
        this.onSubmit(paths, `____GALLERY_CONFIG_COLUMNS_${this.colsCount}`);
    });
    
    this.updateInsertBtn = () => {
        if (this.selectedFiles.size > 0) {
            insertGalleryBtn.style.display = 'block';
            const count = this.selectedFiles.size;
            const cols = count > 5 ? 5 : count;
            insertGalleryBtn.textContent = `插入 ${count} 张图 (分${cols}栏)`;
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
            this.currentTab = tab.id as typeof this.currentTab;
            Array.from(tabsDiv.children).forEach((child: HTMLElement) => {
                child.style.backgroundColor = '';
                child.style.color = '';
            });
            tabEl.style.backgroundColor = 'var(--interactive-accent)';
            tabEl.style.color = 'var(--text-on-accent)';
            this.renderFiles();
        });
    });
    
    // 内容显示区 - 移动端优化 (使用同一个 isMobileDevice 变量)
    this.contentContainer = contentEl.createDiv();
    this.contentContainer.style.flex = '1';
    this.contentContainer.style.border = '0';
    this.contentContainer.style.borderRadius = '8px';
    this.contentContainer.style.padding = isMobileDevice ? '12px' : '16px';
    this.contentContainer.style.overflowY = 'auto';
    this.contentContainer.style.display = 'grid';
    // 移动端用更紧凑的网格
    this.contentContainer.style.gridTemplateColumns = isMobileDevice 
      ? 'repeat(auto-fill, minmax(100px, 1fr))' 
      : 'repeat(auto-fill, minmax(130px, 1fr))';
    this.contentContainer.style.gap = isMobileDevice ? '12px' : '16px';
    this.contentContainer.style.alignContent = 'start';
    this.contentContainer.style.backgroundColor = 'var(--background-primary)';

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
          
          this.filesList = dirents.map((dirent: import('fs').Dirent) => {
              const fullPath = path.join(this.currentFolderPath, dirent.name);
              return {
                  name: dirent.name,
                  path: fullPath,
                  isDirectory: dirent.isDirectory(),
                  ext: dirent.isDirectory() ? '' : path.extname(dirent.name).toLowerCase().replace('.', '')
              };
          }).filter((f: FileItem) => f !== null);

          // 排序：文件夹在前，文件在后
          this.filesList.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          
          // 更新设置中的默认文件路径，这样下次打开会自动处于该目录
          if (this.currentMode === 'external') {
              this.plugin.settings.defaultFolderPath = this.currentFolderPath;
              await this.plugin.saveSettings();
              this.lastExternalPath = this.currentFolderPath;
          } else {
              this.plugin.settings.internalFolderPath = this.currentFolderPath;
              await this.plugin.saveSettings();
          }

          if (this.pathInputEl) {
              this.pathInputEl.value = this.currentFolderPath;
          }

          this.renderFiles();
      } catch (e) {
          console.error('DualLink loadFiles error:', e);
          new Notice('无法读取该路径: ' + (e instanceof Error ? e.message : String(e)));
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
      
      const isMobileDevice = window.innerWidth < 768;
      
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
          item.style.padding = isMobileDevice ? '6px' : '8px';
          item.style.display = 'flex';
          item.style.flexDirection = 'column';
          item.style.alignItems = 'center';
          item.style.cursor = 'pointer';
          item.style.backgroundColor = 'var(--background-secondary)';
          item.style.transition = 'all 0.15s ease-in-out';
          item.style.minHeight = isMobileDevice ? '120px' : 'auto';
          
          item.addEventListener('mouseenter', () => {
              item.style.transform = 'translateY(-2px)';
              item.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          });
          item.addEventListener('mouseleave', () => {
              item.style.transform = 'none';
              item.style.boxShadow = 'none';
          });
          
          // Icon or Preview - 移动端调整预览尺寸
          const previewDiv = item.createDiv();
          previewDiv.style.height = isMobileDevice ? '70px' : '90px';
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
          } else if (imageCheck || videoCheck) {
              try {
                  const buf = fs.readFileSync(file.path);
                  let mime = '';
                  if (isImageExt(file.ext)) {
                      const imageMimes: Record<string, string> = { jpg: 'jpeg', svg: 'svg+xml' };
                      mime = `image/${imageMimes[file.ext] || file.ext}`;
                  } else {
                      mime = `video/${file.ext}`;
                  }
                  const blob = new Blob([buf], { type: mime });
                  const blobUrl = URL.createObjectURL(blob);
                  if (imageCheck) {
                      const img = previewDiv.createEl('img');
                      img.src = blobUrl;
                      img.style.maxWidth = '100%';
                      img.style.maxHeight = '100%';
                      img.style.objectFit = 'contain';
                  } else {
                      const video = previewDiv.createEl('video');
                      video.src = blobUrl;
                      video.style.maxWidth = '100%';
                      video.style.maxHeight = '100%';
                      video.style.objectFit = 'contain';
                      video.muted = true;
                      video.autoplay = true;
                      video.loop = true;
                      video.style.pointerEvents = 'none';
                  }
              } catch (err) {
                  const icon = previewDiv.createEl('div', { text: file.ext ? file.ext.toUpperCase() : '?' });
                  icon.style.fontSize = '20px';
                  icon.style.fontWeight = 'bold';
                  icon.style.color = 'var(--text-muted)';
              }
          } else {
              const icon = previewDiv.createEl('div', { text: file.ext ? file.ext.toUpperCase() : '?' });
              icon.style.fontSize = '20px';
              icon.style.fontWeight = 'bold';
              icon.style.color = 'var(--text-muted)';
          }
          
          const nameSpan = item.createEl('div', { text: file.name });
          nameSpan.style.fontSize = isMobileDevice ? '11px' : '12px';
          nameSpan.style.textAlign = 'center';
          nameSpan.style.wordBreak = 'break-all';
          nameSpan.style.display = '-webkit-box';
          (nameSpan.style as CSSStyleDeclaration).webkitLineClamp = '2';
          (nameSpan.style as CSSStyleDeclaration).webkitBoxOrient = 'vertical';
          nameSpan.style.overflow = 'hidden';
          nameSpan.style.width = '100%';
          nameSpan.title = file.name;
          
          let isSelected = Array.from(this.selectedFiles).some((f: FileItem) => f.path === file.path);
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
                          const toRemove = Array.from(this.selectedFiles).find((f: FileItem) => f.path === file.path);
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
                      if (this.updateInsertBtn) this.updateInsertBtn();
                  } else {
                      this.inputPath = file.path;
                      const nameToUse = this.customName || file.name;
                      this.close();
                      const media = isMediaExt(file.ext.toLowerCase());
                      if (media) {
                          this.onSubmit(this.inputPath, `____GALLERY_CONFIG_COLUMNS_1`);
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


