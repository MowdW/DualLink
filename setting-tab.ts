import { App, PluginSettingTab, Setting } from 'obsidian';
import type LocalFileLinkerPlugin from './main';

export class LocalFileLinkerSettingTab extends PluginSettingTab {
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

    new Setting(containerEl)
      .setName('外部媒体归档目录 (External Media Folder)')
      .setDesc('DualOut 功能将内部附件迁移至此目录。留空则每次使用时手动选择。')
      .addText(text => text
        .setPlaceholder('例如: D:/MediaArchive')
        .setValue(this.plugin.settings.externalMediaFolder)
        .onChange(async (value) => {
          this.plugin.settings.externalMediaFolder = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('外置模式 (Pack-Out Mode)')
      .setDesc('移动：将文件从保险库剪切到外部目录；复制：保留原文件并复制到外部目录。')
      .addDropdown(dropdown => dropdown
        .addOption('move', '移动 (剪切)')
        .addOption('copy', '复制 (保留)')
        .setValue(this.plugin.settings.packOutMode)
        .onChange(async (value: 'move' | 'copy') => {
          this.plugin.settings.packOutMode = value;
          await this.plugin.saveSettings();
        }));
  }
}
