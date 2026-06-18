import { Modal, App, Notice, setIcon, TFile, MarkdownView, Editor } from 'obsidian';
import { isImageExt, isVideoExt, isAudioExt, isMediaExt } from './constants';
import { IDualLinkPlugin } from './types';

export class MobileFilePickerModal extends Modal {
  private plugin: IDualLinkPlugin;
  private editor: Editor;
  private allFiles: TFile[] = [];
  private searchQuery: string = '';
  private currentTab: 'all' | 'image' | 'video' | 'audio' | 'doc' = 'all';
  private contentContainer: HTMLElement;

  constructor(plugin: IDualLinkPlugin, editor: Editor) {
    super(plugin.app);
    this.plugin = plugin;
    this.editor = editor;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // 加载保险库中所有文件
    this.allFiles = this.app.vault.getFiles();

    const isMobileDevice = window.innerWidth < 768;
    this.modalEl.style.width = isMobileDevice ? '100%' : '80vw';
    this.modalEl.style.maxWidth = isMobileDevice ? 'none' : '800px';
    this.modalEl.style.maxHeight = '85vh';
    this.modalEl.style.height = 'auto';
    this.modalEl.style.display = 'flex';
    this.modalEl.style.flexDirection = 'column';

    contentEl.style.display = 'flex';
    contentEl.style.flexDirection = 'column';
    contentEl.style.flex = '1';
    contentEl.style.overflow = 'hidden';
    contentEl.style.padding = '12px';

    // 标题
    const titleEl = contentEl.createEl('h3', { text: '选择保险库中的文件' });
    titleEl.style.margin = '0 0 10px 0';
    titleEl.style.fontSize = '15px';

    // 搜索框
    const searchRow = contentEl.createDiv();
    searchRow.style.display = 'flex';
    searchRow.style.gap = '10px';
    searchRow.style.marginBottom = '10px';

    const searchInput = searchRow.createEl('input', {
      type: 'text',
      placeholder: '搜索文件名...',
    });
    searchInput.style.flex = '1';
    searchInput.style.padding = '8px 12px';
    searchInput.style.borderRadius = '6px';
    searchInput.style.border = '1px solid var(--background-modifier-border)';
    searchInput.style.backgroundColor = 'var(--background-primary)';
    searchInput.style.minHeight = '40px';
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.toLowerCase();
      this.renderFiles();
    });

    setTimeout(() => searchInput.focus(), 100);

    // 标签栏
    const tabsRow = contentEl.createDiv();
    tabsRow.style.display = 'flex';
    tabsRow.style.gap = '6px';
    tabsRow.style.marginBottom = '12px';
    tabsRow.style.flexWrap = 'wrap';

    const tabs = [
      { id: 'all', label: '全部' },
      { id: 'image', label: '图片' },
      { id: 'video', label: '视频' },
      { id: 'audio', label: '音频' },
      { id: 'doc', label: '文档' },
    ] as const;

    tabs.forEach((tab) => {
      const tabEl = tabsRow.createEl('button', { text: tab.label });
      tabEl.style.padding = '6px 14px';
      tabEl.style.borderRadius = '16px';
      tabEl.style.border = '1px solid var(--background-modifier-border)';
      tabEl.style.backgroundColor = 'transparent';
      tabEl.style.fontSize = '12px';
      tabEl.style.cursor = 'pointer';

      if (this.currentTab === tab.id) {
        tabEl.style.backgroundColor = 'var(--interactive-accent)';
        tabEl.style.color = 'var(--text-on-accent)';
        tabEl.style.borderColor = 'var(--interactive-accent)';
      }

      tabEl.addEventListener('click', () => {
        this.currentTab = tab.id;
        Array.from(tabsRow.children).forEach((child: HTMLElement) => {
          child.style.backgroundColor = 'transparent';
          child.style.color = '';
          child.style.borderColor = 'var(--background-modifier-border)';
        });
        tabEl.style.backgroundColor = 'var(--interactive-accent)';
        tabEl.style.color = 'var(--text-on-accent)';
        tabEl.style.borderColor = 'var(--interactive-accent)';
        this.renderFiles();
      });
    });

    // 文件列表容器
    this.contentContainer = contentEl.createDiv();
    this.contentContainer.style.flex = '1';
    this.contentContainer.style.overflowY = 'auto';
    this.contentContainer.style.padding = '4px 0';

    this.renderFiles();
  }

  renderFiles() {
    this.contentContainer.empty();

    const filtered = this.allFiles.filter((file) => {
      if (this.searchQuery && !file.name.toLowerCase().includes(this.searchQuery)) {
        return false;
      }

      const ext = file.extension.toLowerCase();
      switch (this.currentTab) {
        case 'image':
          return isImageExt(ext);
        case 'video':
          return isVideoExt(ext);
        case 'audio':
          return isAudioExt(ext);
        case 'doc':
          return ext === 'md';
        default:
          return true;
      }
    });

    if (filtered.length === 0) {
      const empty = this.contentContainer.createEl('div', {
        text: '没有找到匹配的文件',
      });
      empty.style.textAlign = 'center';
      empty.style.padding = '40px 20px';
      empty.style.color = 'var(--text-muted)';
      empty.style.fontSize = '14px';
      return;
    }

    // 显示结果计数
    const countEl = this.contentContainer.createEl('div', {
      text: `共 ${filtered.length} 个文件`,
    });
    countEl.style.fontSize = '11px';
    countEl.style.color = 'var(--text-muted)';
    countEl.style.marginBottom = '8px';
    countEl.style.paddingLeft = '4px';

    filtered.forEach((file) => {
      void this.renderFileItem(file);
    });
  }

  private async renderFileItem(file: TFile) {
    const isMobileDevice = window.innerWidth < 768;
    const ext = file.extension.toLowerCase();
    const isMedia = isMediaExt(ext);

    const item = this.contentContainer.createDiv();
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '12px';
    item.style.padding = isMobileDevice ? '10px 8px' : '8px 12px';
    item.style.borderRadius = '8px';
    item.style.cursor = 'pointer';
    item.style.marginBottom = '4px';
    item.style.backgroundColor = 'var(--background-secondary)';
    item.style.transition = 'background-color 0.15s';

    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = 'var(--background-secondary)';
    });

    // 缩略图或图标
    const iconDiv = item.createDiv();
    iconDiv.style.width = isMobileDevice ? '48px' : '56px';
    iconDiv.style.height = isMobileDevice ? '48px' : '56px';
    iconDiv.style.flexShrink = '0';
    iconDiv.style.borderRadius = '6px';
    iconDiv.style.overflow = 'hidden';
    iconDiv.style.display = 'flex';
    iconDiv.style.alignItems = 'center';
    iconDiv.style.justifyContent = 'center';
    iconDiv.style.backgroundColor = 'var(--background-primary)';

    // 尝试加载媒体预览
    let previewLoaded = false;
    if (isImageExt(ext) || isVideoExt(ext)) {
      try {
        const data = await this.app.vault.readBinary(file);
        let mime = '';
        if (isImageExt(ext)) {
          const mimes: Record<string, string> = { jpg: 'jpeg', svg: 'svg+xml' };
          mime = `image/${mimes[ext] || ext}`;
        } else {
          mime = `video/${ext}`;
        }
        const blob = new Blob([data], { type: mime });
        const blobUrl = URL.createObjectURL(blob);

        if (isImageExt(ext)) {
          const img = iconDiv.createEl('img');
          img.src = blobUrl;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          previewLoaded = true;
        } else {
          const video = iconDiv.createEl('video');
          video.src = blobUrl;
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'cover';
          video.muted = true;
          video.autoplay = true;
          video.loop = true;
          video.style.pointerEvents = 'none';
          previewLoaded = true;
        }
      } catch { /* preview failed */ }
    }

    if (!previewLoaded) {
      // 显示文件类型图标
      let iconText = '📄';
      if (isImageExt(ext)) iconText = '🖼';
      else if (isVideoExt(ext)) iconText = '🎬';
      else if (isAudioExt(ext)) iconText = '🎵';
      else if (ext === 'md') iconText = '📝';

      const icon = iconDiv.createEl('span', { text: iconText });
      icon.style.fontSize = isMobileDevice ? '22px' : '26px';
    }

    // 文件信息
    const infoDiv = item.createDiv();
    infoDiv.style.flex = '1';
    infoDiv.style.minWidth = '0';

    const nameEl = infoDiv.createEl('div', { text: file.name });
    nameEl.style.fontSize = '13px';
    nameEl.style.fontWeight = '500';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';
    nameEl.style.whiteSpace = 'nowrap';

    // 路径
    const dirPath = file.parent?.path || '';
    const pathEl = infoDiv.createEl('div', { text: dirPath || '根目录' });
    pathEl.style.fontSize = '10px';
    pathEl.style.color = 'var(--text-muted)';
    pathEl.style.overflow = 'hidden';
    pathEl.style.textOverflow = 'ellipsis';
    pathEl.style.whiteSpace = 'nowrap';
    pathEl.style.marginTop = '2px';

    // 点击事件 - 插入链接到编辑器
    item.addEventListener('click', () => {
      this.insertFileLink(file);
    });
  }

  private insertFileLink(file: TFile) {
    const ext = file.extension.toLowerCase();
    const isMedia = isMediaExt(ext);
    const vaultPath = file.path;

    // 媒体文件用 ![[path]]，普通文件用 [[path]]
    const link = isMedia ? `![[${vaultPath}]]` : `[[${vaultPath}]]`;

    if (this.editor) {
      const cursor = this.editor.getCursor();
      this.editor.replaceRange(link + '\n', cursor);
    } else {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view?.editor) {
        view.editor.replaceRange(link + '\n', view.editor.getCursor());
      }
    }

    new Notice(`✅ 已插入: ${file.name}`);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}
