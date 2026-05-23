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
    this.addRibbonIcon('link-2', '插入本地文件映射链接', async () => {
      this.promptForLocalFileLink();
    });

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
            .setTitle('插入本地物理路径映射链接')
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
            video.controls = true;
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
              video.controls = true;
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

    // 6. 注册设置管理面板
    this.addSettingTab(new LocalFileLinkerSettingTab(this.app, this));
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
    this.modalEl.style.height = '80vh';
    this.modalEl.style.display = 'flex';
    this.modalEl.style.flexDirection = 'column';
    
    contentEl.createEl('h2', { text: '插入本地物理文件关联', cls: 'modal-title' });

    // 顶部设置区域
    const topArea = contentEl.createDiv();
    topArea.style.display = 'flex';
    topArea.style.flexDirection = 'column';
    topArea.style.gap = '12px';
    topArea.style.marginBottom = '20px';
    topArea.style.flexShrink = '0';
    
    // 1. 文件夹路径选择行
    const pathRow = topArea.createDiv();
    pathRow.style.display = 'flex';
    pathRow.style.gap = '10px';
    pathRow.style.alignItems = 'center';
    
    this.pathInputEl = pathRow.createEl('input', { type: 'text', placeholder: '粘贴文件夹的绝对路径...' });
    this.pathInputEl.style.flex = '1';
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

    const browseBtn = pathRow.createEl('button', { text: '浏览 (选择文件夹)' });
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
    modeBtn.title = '在外部绝对路径与当前 Obsidian 库目录模式之间切换';
    
    const updateModeBtn = () => {
        modeBtn.empty();
        if (this.currentMode === 'external') {
            setIcon(modeBtn, 'link-2-off');
            modeBtn.createSpan({ text: '外部路径模式' });
        } else {
            setIcon(modeBtn, 'link-2');
            modeBtn.createSpan({ text: '内部路径模式' });
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
    
    const tabs = [
        { id: 'all', label: '全部' },
        { id: 'image', label: '图片' },
        { id: 'video', label: '视频' },
        { id: 'audio', label: '音频' }
    ];
    
    tabs.forEach(tab => {
        const tabEl = tabsDiv.createEl('button', { text: tab.label });
        tabEl.style.boxShadow = 'none';
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
    this.contentContainer.style.border = '1px solid var(--background-modifier-border)';
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
          item.style.border = '1px solid var(--background-modifier-border)';
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
              item.style.borderColor = 'var(--interactive-accent)';
          });
          item.addEventListener('mouseleave', () => {
              item.style.transform = 'none';
              item.style.boxShadow = 'none';
              item.style.borderColor = 'var(--background-modifier-border)';
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
          
          item.addEventListener('click', () => {
              if (file.isDirectory) {
                  this.currentFolderPath = file.path;
                  this.searchQuery = '';
                  const searchInput = document.querySelector('input[placeholder="搜索该目录下的文件..."]') as HTMLInputElement;
                  if (searchInput) searchInput.value = '';
                  this.loadFiles();
              } else {
                  this.inputPath = file.path;
                  const nameToUse = this.customName || file.name;
                  this.close();
                  this.onSubmit(this.inputPath, nameToUse);
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
