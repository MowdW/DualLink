import { App } from 'obsidian';

export interface LocalFileLinkerSettings {
  defaultLinkStyle: 'absolute-path' | 'file-uri' | 'custom-protocol';
  inlineRenderEnabled: boolean;
  autoExtractMetadata: boolean;
  customPreviewFolders: string;
  defaultFolderPath: string;
  internalFolderPath: string;
  externalMediaFolder: string;
  packOutMode: 'move' | 'copy';
  hoverPreviewEnabled: boolean;
  showMobileToolbarButton: boolean;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  ext: string;
}

/**
 * Obsidian Vault 适配器接口（精简版）
 */
export interface VaultAdapter {
  getBasePath(): string;
}

/**
 * 带路径属性的 File 对象（Electron 环境）
 */
export interface FileWithPath extends File {
  readonly path?: string;
  readonly webkitRelativePath: string;
}

/**
 * 插件实例接口 - 供 gallery-processor / packer / mobile-file-picker 引用，
 * 避免与 main.ts 循环依赖
 */
export interface IDualLinkPlugin {
  app: App;
  settings: LocalFileLinkerSettings;
  saveSettings(): Promise<void>;
  generateMarkdownLink(fileName: string, filePath: string): string;
  findExternalFileRec(fileName: string, dir: string, maxDepth?: number, currentDepth?: number): Promise<string | null>;
  registerMarkdownCodeBlockProcessor(language: string, handler: (source: string, el: HTMLElement, ctx: import('obsidian').MarkdownPostProcessorContext) => void | Promise<void>): void;
}
