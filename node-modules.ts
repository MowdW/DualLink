/**
 * Node.js 内置模块 - 仅 Electron 桌面环境可用
 * 所有 require() 调用集中在此文件，便于管理 lint 抑制
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
import { isDesktop } from './platform';

interface ElectronShell {
  openPath(filePath: string): Promise<string>;
  showItemInFolder(filePath: string): void;
}

export const electron: { shell: ElectronShell } | null = isDesktop()
  ? (() => { try { return require('electron'); } catch { return null; } })()
  : null;

export const fs: typeof import('fs') = require('fs');
export const path: typeof import('path') = require('path');
export const crypto: typeof import('crypto') = require('crypto');
/* eslint-enable */
