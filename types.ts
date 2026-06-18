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
 * MarkdownView 编辑器接口
 */
export interface MarkdownViewEditor {
  replaceRange(text: string, start: { line: number; ch: number }, end: { line: number; ch: number }): void;
  getLine(line: number): string;
}

/**
 * MarkdownView 扩展接口
 */
export interface MarkdownViewWithEditor {
  editor: MarkdownViewEditor;
  getMode(): string;
}

/**
 * 带路径属性的 File 对象（Electron 环境）
 */
export interface FileWithPath extends File {
  readonly path?: string;
  readonly webkitRelativePath: string;
}

/**
 * 支持 webkitdirectory 的 HTMLInputElement
 */
export interface HTMLInputElementWithDirectory extends HTMLInputElement {
  webkitdirectory: boolean;
}

/**
 * MetadataCache 扩展接口
 */
export interface MetadataCacheExt {
  resolvedLinks: Record<string, Record<string, number>>;
  getBacklinksForFile(file: import('obsidian').TFile): { data: Record<string, unknown> } | undefined;
}

/**
 * Vault 扩展接口
 */
export interface VaultExt {
  getResourcePath(path: string): string;
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
