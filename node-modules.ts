/**
 * Node.js 内置模块 - 仅 Electron 桌面环境可用
 * 所有 require() 调用集中在此文件，避免分散在多处导致 lint 警告扩散
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-var-requires -- 
   require() 返回类型为 any，但已通过显式类型注解约束导出的接口；Node.js 内置模块使用 require() 加载是 CommonJS 规范
*/
import { isDesktop } from './platform';

interface ElectronShell {
  openPath(filePath: string): Promise<string>;
  showItemInFolder(filePath: string): void;
}

/* eslint-disable @typescript-eslint/no-unsafe-return -- require('electron') 返回 any，需要返回正确的类型 */
export const electron: { shell: ElectronShell } | null = isDesktop()
  ? (() => { try { return require('electron') as { shell: ElectronShell }; } catch { return null; } })()
  : null;
/* eslint-enable @typescript-eslint/no-unsafe-return -- 恢复 no-unsafe-return 检查 */

/* eslint-disable @typescript-eslint/no-var-requires -- Node.js 内置模块必须使用 require() */
export const fs: typeof import('fs') = require('fs');
export const path: typeof import('path') = require('path');
export const crypto: typeof import('crypto') = require('crypto');
/* eslint-enable @typescript-eslint/no-var-requires -- 恢复 no-var-requires 检查 */
/* eslint-enable -- 恢复所有被禁用的 ESLint 规则 */
