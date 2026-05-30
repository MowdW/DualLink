import { Notice, Modal, App } from 'obsidian';
import { isMediaExt, isVideoExt, isAudioExt, isImageExt } from './constants';
import { getConvertPath } from './path-utils';

const SKIP_DIRS = new Set(['node_modules', '.git', '.obsidian', '$RECYCLE.BIN', 'System Volume Information']);
const findFileCache = new Map<string, string | null>();

export function isSameFile(path1: string, path2: string): boolean {
  const fs = require('fs');
  const crypto = require('crypto');
  try {
    const stat1 = fs.statSync(path1);
    const stat2 = fs.statSync(path2);
    if (stat1.size !== stat2.size) return false;
    const BUF_SIZE = 65536;
    const buf1 = Buffer.alloc(Math.min(stat1.size, BUF_SIZE));
    const buf2 = Buffer.alloc(Math.min(stat2.size, BUF_SIZE));
    const fd1 = fs.openSync(path1, 'r');
    const fd2 = fs.openSync(path2, 'r');
    fs.readSync(fd1, buf1, 0, buf1.length, 0);
    fs.readSync(fd2, buf2, 0, buf2.length, 0);
    fs.closeSync(fd1);
    fs.closeSync(fd2);
    return crypto.createHash('sha256').update(buf1).digest('hex')
           === crypto.createHash('sha256').update(buf2).digest('hex');
  } catch (e) {
    return false;
  }
}

export function hasOtherReferences(app: App, file: any, currentPath: string): boolean {
  try {
    const resolvedLinks = (app.metadataCache as any).resolvedLinks;
    if (resolvedLinks) {
      for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
        if (sourcePath === currentPath) continue;
        const linkMap = links as Record<string, number>;
        if (linkMap[file.path]) return true;
      }
    }
  } catch (e) {}

  try {
    const backlinks = (app.metadataCache as any).getBacklinksForFile?.(file);
    if (backlinks?.data) {
      for (const sourcePath of Object.keys(backlinks.data)) {
        if (sourcePath !== currentPath) return true;
      }
    }
  } catch (e) {}

  try {
    const fs = require('fs');
    const path = require('path');
    const vaultBase = (app.vault.adapter as any).getBasePath?.();
    if (!vaultBase) return false;

    const allFiles = app.vault.getMarkdownFiles();
    const lowerName = file.name.toLowerCase();

    for (const mf of allFiles) {
      if (mf.path === currentPath) continue;
      try {
        const content = fs.readFileSync(path.join(vaultBase, mf.path), 'utf8');
        const lower = content.toLowerCase();
        if (lower.includes(`![[${lowerName}`) || lower.includes(`[[${lowerName}`)) {
          return true;
        }
      } catch (e) {}
    }
  } catch (e) {}

  return false;
}

export function findFileRecursive(dir: string, targetName: string, maxDepth: number = 5): string | null {
  const cacheKey = `${dir}::${targetName}::${maxDepth}`;
  if (findFileCache.has(cacheKey)) {
    return findFileCache.get(cacheKey)!;
  }

  const fs = require('fs');
  const path = require('path');

  const stack: { dirPath: string; depth: number }[] = [{ dirPath: dir, depth: 0 }];

  while (stack.length > 0) {
    const { dirPath, depth } = stack.pop()!;
    const dirName = path.basename(dirPath);

    if (depth >= maxDepth || SKIP_DIRS.has(dirName)) continue;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          stack.push({ dirPath: fullPath, depth: depth + 1 });
        } else if (entry.isFile() && entry.name === targetName) {
          findFileCache.set(cacheKey, fullPath);
          return fullPath;
        }
      }
    } catch (e) {}
  }

  findFileCache.set(cacheKey, null);
  return null;
}

export async function findExternalFileRec(
  fileName: string,
  dir: string,
  maxDepth = 4,
  currentDepth = 0
): Promise<string | null> {
  if (currentDepth > maxDepth || !dir) return null;
  const fs = require('fs');
  const path = require('path');
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = await findExternalFileRec(
          fileName,
          path.join(dir, entry.name),
          maxDepth,
          currentDepth + 1
        );
        if (found) return found;
      } else if (entry.name === fileName) {
        return path.join(dir, entry.name);
      }
    }
  } catch (e) {}
  return null;
}

export async function packToVault(plugin: any): Promise<void> {
  const fs = require('fs');
  const path = require('path');

  const activeFile = plugin.app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice('请先打开一个 Markdown 文档。');
    return;
  }

  const content = await plugin.app.vault.read(activeFile);
  const vaultBasePath = (plugin.app.vault.adapter as any).getBasePath();

  const attachmentFolderCfg =
    ((plugin.app.vault as any).config?.attachmentFolderPath as string) || '.';
  let attachmentsDir: string;
  let attachmentVaultPrefix: string;

  if (attachmentFolderCfg.startsWith('./')) {
    const relFolder = attachmentFolderCfg.substring(2);
    const noteDir = path.dirname(path.join(vaultBasePath, activeFile.path));
    attachmentsDir = path.join(noteDir, relFolder);
    const noteVaultDir = path.dirname(activeFile.path);
    attachmentVaultPrefix = noteVaultDir === '.' ? relFolder : `${noteVaultDir}/${relFolder}`;
  } else if (attachmentFolderCfg === '.' || attachmentFolderCfg === './') {
    const noteDir = path.dirname(path.join(vaultBasePath, activeFile.path));
    attachmentsDir = noteDir;
    attachmentVaultPrefix = path.dirname(activeFile.path);
    if (attachmentVaultPrefix === '.') attachmentVaultPrefix = '';
  } else {
    attachmentsDir = path.join(vaultBasePath, attachmentFolderCfg);
    attachmentVaultPrefix = attachmentFolderCfg;
  }

  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  const replacements: { old: string; new: string }[] = [];
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const processed = new Set<string>();

  const getUniqueName = (dir: string, name: string): string => {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let candidate = name;
    let counter = 1;
    while (fs.existsSync(path.join(dir, candidate))) {
      candidate = `${base}_${counter}${ext}`;
      counter++;
    }
    return candidate;
  };

  const imgRegex = /!\[.*?\]\(<(file:\/\/\/|local-file:\/\/)([^>]+)>\)/g;
  const linkRegex = /(?<!!)\[.*?\]\(<(file:\/\/\/|local-file:\/\/)([^>]+)>\)/g;
  const mediaRegex = /<(video|audio)\s+src="(file:\/\/\/)([^"]+)"/g;

  for (const regex of [imgRegex, linkRegex, mediaRegex]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      let extPath: string;
      if (match[1] === 'video' || match[1] === 'audio') {
        extPath = match[3];
      } else {
        extPath = match[2];
      }

      try { extPath = decodeURIComponent(extPath); } catch (e) {}
      extPath = extPath.replace(/\)$/, '').replace(/['">]/g, '').trim();

      if (processed.has(extPath)) continue;

      if (!fs.existsSync(extPath)) {
        skipCount++;
        processed.add(extPath);
        continue;
      }

      const fileName = path.basename(extPath);
      let finalName = fileName;
      const destPath = path.join(attachmentsDir, finalName);
      let shouldCopy = true;
      let existingVaultPath = '';

      if (fs.existsSync(destPath)) {
        existingVaultPath = destPath;
      } else {
        existingVaultPath = findFileRecursive(attachmentsDir, fileName) || '';
      }

      if (existingVaultPath) {
        if (isSameFile(extPath, existingVaultPath)) {
          shouldCopy = false;
          const rel = existingVaultPath
            .substring(attachmentsDir.length)
            .replace(/\\/g, '/')
            .replace(/^\//, '');
          finalName = rel;
        } else {
          const decision = await new Promise<'use-existing' | 'rename'>((resolve) => {
            new FileDedupModal(plugin, existingVaultPath, extPath, resolve).open();
          });
          if (decision === 'use-existing') {
            shouldCopy = false;
            const rel = existingVaultPath
              .substring(attachmentsDir.length)
              .replace(/\\/g, '/')
              .replace(/^\//, '');
            finalName = rel;
          } else {
            finalName = getUniqueName(attachmentsDir, fileName);
          }
        }
      }

      try {
        if (shouldCopy || finalName !== fileName || existingVaultPath !== destPath) {
          const finalDestPath = path.join(attachmentsDir, finalName);
          if (shouldCopy) fs.copyFileSync(extPath, finalDestPath);
        }

        const internalPath = attachmentVaultPrefix
          ? `${attachmentVaultPrefix}/${finalName}`
          : finalName;
        const ext = path.extname(finalName).toLowerCase();
        const media = isMediaExt(ext);

        replacements.push({
          old: match[0],
          new: media ? `![[${internalPath}]]` : `[[${internalPath}]]`,
        });
        successCount++;
      } catch (e) {
        failCount++;
      }
      processed.add(extPath);
    }
  }

  if (replacements.length === 0) {
    new Notice('DualIn: 未找到可打包的外部资源链接。');
    return;
  }

  let newContent = content;
  const sorted = replacements.sort((a, b) => b.old.length - a.old.length);
  for (const r of sorted) {
    newContent = newContent.split(r.old).join(r.new);
  }

  await plugin.app.vault.modify(activeFile, newContent);
  new Notice(`DualIn 完成：成功 ${successCount} 个，跳过 ${skipCount} 个，失败 ${failCount} 个。`);
}

export async function packOut(plugin: any): Promise<void> {
  const fs = require('fs');
  const path = require('path');

  const activeFile = plugin.app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice('请先打开一个 Markdown 文档。');
    return;
  }

  let externalDir = plugin.settings.externalMediaFolder;
  if (!externalDir) {
    new Notice('请在插件设置中配置"外部媒体归档目录"，或稍后设置后再试。');
    return;
  }

  if (!fs.existsSync(externalDir)) {
    fs.mkdirSync(externalDir, { recursive: true });
  }

  const isCopyMode = plugin.settings.packOutMode === 'copy';

  const content = await plugin.app.vault.read(activeFile);
  const vaultBasePath = (plugin.app.vault.adapter as any).getBasePath();

  const replacements: { old: string; new: string }[] = [];
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let copyCount = 0;
  const processed = new Set<string>();

  const getUniqueName = (dir: string, name: string): string => {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let candidate = name;
    let counter = 1;
    while (fs.existsSync(path.join(dir, candidate))) {
      candidate = `${base}_${counter}${ext}`;
      counter++;
    }
    return candidate;
  };

  const internalLinkRegex = /!\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = internalLinkRegex.exec(content)) !== null) {
    const linkPath = match[1].split('|')[0].trim();
    if (processed.has(linkPath)) continue;

    const dest = plugin.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
    if (!dest) {
      skipCount++;
      processed.add(linkPath);
      continue;
    }

    const srcFullPath = path.join(vaultBasePath, dest.path);
    if (!fs.existsSync(srcFullPath)) {
      skipCount++;
      processed.add(linkPath);
      continue;
    }

    const fileName = path.basename(dest.path);
    const destFullPath = path.join(externalDir, fileName);

    const hasOtherRefs = hasOtherReferences(plugin.app, dest, activeFile.path);
    const forceCopyForFile = hasOtherRefs && !isCopyMode;
    if (hasOtherRefs) {
      new Notice(`⚠️ "${fileName}" 被其他文档引用，将复制而非剪切到外部目录。`, 5000);
    }

    let finalName = fileName;
    let existingExtPath = '';
    let skipMove = false;

    if (fs.existsSync(destFullPath)) {
      existingExtPath = destFullPath;
    } else {
      existingExtPath = findFileRecursive(externalDir, fileName) || '';
    }

    if (existingExtPath) {
      if (isSameFile(srcFullPath, existingExtPath)) {
        skipMove = true;
        finalName = existingExtPath
          .substring(externalDir.length)
          .replace(/\\/g, '/')
          .replace(/^\//, '');
        if (!isCopyMode && !forceCopyForFile) {
          fs.unlinkSync(srcFullPath);
          plugin.app.vault.trigger('delete', dest);
        }
      } else {
        finalName = getUniqueName(externalDir, fileName);
        new Notice(`⚠️ "${fileName}" 与外部目录已有同名不同内容的文件，已重命名为 "${finalName}"。`, 5000);
      }
    }

    const finalDestPath = path.join(externalDir, finalName);
    try {
      if (!skipMove) {
        if (isCopyMode || forceCopyForFile) {
          fs.copyFileSync(srcFullPath, finalDestPath);
        } else {
          try {
            fs.renameSync(srcFullPath, finalDestPath);
          } catch (e) {
            fs.copyFileSync(srcFullPath, finalDestPath);
            fs.unlinkSync(srcFullPath);
          }
          plugin.app.vault.trigger('delete', dest);
        }
      }

      const ext = path.extname(finalName).toLowerCase();
      let encodedPath = finalDestPath.replace(/\\/g, '/');
      encodedPath = encodedPath.split('/').map(c => encodeURIComponent(c)).join('/');
      encodedPath = encodedPath.replace(/^([a-zA-Z])%3A/, '$1:');

      let newSyntax: string;
      if (isVideoExt(ext)) {
        newSyntax = `![🎬 ${finalName}](<file:///${encodedPath}>)`;
      } else if (isAudioExt(ext)) {
        newSyntax = `![🎵 ${finalName}](<file:///${encodedPath}>)`;
      } else {
        newSyntax = `![🖼 ${finalName}](<file:///${encodedPath}>)`;
      }

      replacements.push({ old: match[0], new: newSyntax });
      successCount++;
      if (hasOtherRefs) copyCount++;
    } catch (e) {
      failCount++;
    }
    processed.add(linkPath);
  }

  if (replacements.length === 0) {
    new Notice('DualOut: 未找到可外置的内部媒体链接。');
    return;
  }

  let newContent = content;
  const sorted = replacements.sort((a, b) => b.old.length - a.old.length);
  for (const r of sorted) {
    newContent = newContent.split(r.old).join(r.new);
  }

  await plugin.app.vault.modify(activeFile, newContent);
  const copyMsg = copyCount > 0 ? `，其中 ${copyCount} 个被其他文档引用已复制保留` : '';
  new Notice(`DualOut 完成：成功 ${successCount} 个${copyMsg}，跳过 ${skipCount} 个，失败 ${failCount} 个。`);
}

class FileDedupModal extends Modal {
  private resolve: (value: 'use-existing' | 'rename') => void;
  private existingPath: string;
  private newPath: string;
  private plugin: any;

  constructor(
    plugin: any,
    existingPath: string,
    newPath: string,
    resolve: (value: 'use-existing' | 'rename') => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.existingPath = existingPath;
    this.newPath = newPath;
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.cssText = 'padding: 20px; max-width: 700px;';

    contentEl.createEl('h3', { text: '发现同名文件' });
    contentEl.createEl('p', { text: '保险库中已存在同名文件，请确认是否与此文件相同：' }).style.cssText =
      'color: var(--text-muted); margin-bottom: 16px;';

    const previewRow = contentEl.createEl('div');
    previewRow.style.cssText = 'display: flex; gap: 16px; margin: 0 0 16px 0;';

    const leftCol = previewRow.createEl('div');
    leftCol.style.cssText =
      'flex: 1; text-align: center; border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px;';
    leftCol.createEl('div', { text: '保险库已有' }).style.cssText =
      'font-weight: 600; margin-bottom: 8px; font-size: 13px;';
    this.renderFilePreview(leftCol, this.existingPath);

    const rightCol = previewRow.createEl('div');
    rightCol.style.cssText =
      'flex: 1; text-align: center; border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px;';
    rightCol.createEl('div', { text: '即将导入' }).style.cssText =
      'font-weight: 600; margin-bottom: 8px; font-size: 13px;';
    this.renderFilePreview(rightCol, this.newPath);

    const infoRow = contentEl.createEl('div');
    infoRow.style.cssText =
      'display: flex; gap: 16px; font-size: 11px; color: var(--text-muted); margin-bottom: 20px;';
    for (const p of [this.existingPath, this.newPath]) {
      const col = infoRow.createEl('div');
      col.style.flex = '1';
      col.style.textAlign = 'center';
      try {
        const fs = require('fs');
        const stat = fs.statSync(p);
        col.createEl('div', { text: `${(stat.size / 1024).toFixed(1)} KB` });
        col.createEl('div', { text: stat.mtime.toLocaleString() });
      } catch (e) {
        col.createEl('div', { text: '无法读取' });
      }
    }

    const btnRow = contentEl.createEl('div');
    btnRow.style.cssText = 'display: flex; gap: 12px; justify-content: center;';

    const sameBtn = btnRow.createEl('button');
    sameBtn.textContent = '是同一个文件，使用现有';
    sameBtn.style.cssText =
      'padding: 10px 28px; border-radius: 6px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; cursor: pointer; font-size: 13px; font-weight: 500;';
    sameBtn.addEventListener('click', () => {
      this.resolve('use-existing');
      this.close();
    });

    const renameBtn = btnRow.createEl('button');
    renameBtn.textContent = '是不同的文件，重命名导入';
    renameBtn.style.cssText =
      'padding: 10px 28px; border-radius: 6px; background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); cursor: pointer; font-size: 13px;';
    renameBtn.addEventListener('click', () => {
      this.resolve('rename');
      this.close();
    });

    document.addEventListener('keydown', this.escHandler);
  }

  private escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.resolve('rename');
      this.close();
    }
  };

  onClose() {
    document.removeEventListener('keydown', this.escHandler);
    this.contentEl.empty();
  }

  private renderFilePreview(container: HTMLElement, filePath: string) {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const image = isImageExt(ext);
    const fs = require('fs');
    const path = require('path');

    if (image) {
      try {
        const img = container.createEl('img');
        img.style.cssText =
          'max-width: 100%; max-height: 200px; object-fit: contain; border-radius: 4px;';
        const convertPath = getConvertPath(this.plugin.app, filePath);
        img.src = convertPath;
      } catch (e) {
        container.createEl('div', { text: '预览失败' }).style.cssText =
          'color: var(--text-error); padding: 40px 0;';
      }
    } else {
      const icon = container.createEl('div', { text: '📄' });
      icon.style.cssText = 'font-size: 48px; padding: 30px 0;';
      container.createEl('div', { text: path.basename(filePath) }).style.cssText =
        'font-size: 11px; word-break: break-all;';
    }
  }
}
