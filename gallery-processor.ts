import { App, MarkdownRenderer } from 'obsidian';
import { isImageExt, isVideoExt, isAudioExt } from './constants';

function addGalleryItemButtons(
    item: HTMLDivElement,
    images: string[],
    index: number,
    columns: number,
    plugin: any,
    el: HTMLElement,
    updateCodeBlock: (newColumns: number, newImages: string[]) => Promise<void>,
    PathPromptModal: any
) {
    const editImageBtn = item.createEl('div', { text: '✎' });
    editImageBtn.style.position = 'absolute';
    editImageBtn.style.top = '4px';
    editImageBtn.style.left = '4px';
    editImageBtn.style.width = '20px';
    editImageBtn.style.height = '20px';
    editImageBtn.style.background = 'transparent';
    editImageBtn.style.color = 'rgba(255, 255, 255, 0.8)';
    editImageBtn.style.borderRadius = '50%';
    editImageBtn.style.display = 'flex';
    editImageBtn.style.justifyContent = 'center';
    editImageBtn.style.alignItems = 'center';
    editImageBtn.style.cursor = 'pointer';
    editImageBtn.style.opacity = '0';
    editImageBtn.style.transition = 'opacity 0.2s, color 0.2s';
    editImageBtn.style.zIndex = '5';
    editImageBtn.style.fontSize = '14px';
    editImageBtn.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
    editImageBtn.title = '替换此图片';

    editImageBtn.addEventListener('mouseenter', () => editImageBtn.style.color = 'var(--interactive-accent)');
    editImageBtn.addEventListener('mouseleave', () => editImageBtn.style.color = 'rgba(255, 255, 255, 0.8)');

    const removeBtn = item.createEl('div', { text: '✕' });
    removeBtn.style.position = 'absolute';
    removeBtn.style.top = '4px';
    removeBtn.style.left = '28px';
    removeBtn.style.width = '20px';
    removeBtn.style.height = '20px';
    removeBtn.style.background = 'transparent';
    removeBtn.style.color = 'rgba(255, 255, 255, 0.8)';
    removeBtn.style.borderRadius = '50%';
    removeBtn.style.display = 'flex';
    removeBtn.style.justifyContent = 'center';
    removeBtn.style.alignItems = 'center';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.opacity = '0';
    removeBtn.style.transition = 'opacity 0.2s, color 0.2s';
    removeBtn.style.zIndex = '5';
    removeBtn.style.fontSize = '14px';
    removeBtn.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
    removeBtn.title = '移除此图片';

    removeBtn.addEventListener('mouseenter', () => removeBtn.style.color = 'var(--background-modifier-error)');
    removeBtn.addEventListener('mouseleave', () => removeBtn.style.color = 'rgba(255, 255, 255, 0.8)');

    item.addEventListener('mouseenter', () => {
        if (el.closest('.markdown-reading-view')) return;
        removeBtn.style.opacity = '1';
        editImageBtn.style.opacity = '1';
    });
    item.addEventListener('mouseleave', () => {
        removeBtn.style.opacity = '0';
        editImageBtn.style.opacity = '0';
    });

    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.closest('.markdown-reading-view')) return;
        const newImages = [...images];
        newImages.splice(index, 1);
        updateCodeBlock(columns, newImages);
    });

    editImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.closest('.markdown-reading-view')) return;
        const { Notice, MarkdownView } = require('obsidian');
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        new PathPromptModal(plugin, '', (inputPath: string) => {
            if (!inputPath) return;
            const adapter = plugin.app.vault.adapter;
            const vaultBasePath = (adapter as any).getBasePath ? (adapter as any).getBasePath() : '';
            let newSyntax = '';

            const cleanP = inputPath.replace(/['"]/g, '').trim();
            let isInternal = false;
            let internalPath = '';
            if (vaultBasePath && cleanP.startsWith(vaultBasePath)) {
                isInternal = true;
                internalPath = cleanP.substring(vaultBasePath.length).replace(/^[/\\\\]+/, '').replace(/\\\\/g, '/');
            }
            if (isInternal) {
                newSyntax = `![[${internalPath}]]`;
            } else {
                let appendPath = cleanP.startsWith('/') ? cleanP.substring(1) : cleanP;
                appendPath = appendPath.split('/').map((c: string) => encodeURIComponent(c)).join('/');
                appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '$1:');
                newSyntax = `![](<file:///${appendPath}>)`;
            }
            const newImages = [...images];
            newImages[index] = newSyntax;
            updateCodeBlock(columns, newImages);
        }).open();
    });
}

export function registerGalleryProcessor(plugin: any, PathPromptModal: any): void {
    plugin.registerMarkdownCodeBlockProcessor('duallink-gallery', (source: string, el: HTMLElement, ctx: any) => {
        const lines = source.split('\n');
        let columns = 3;
        const images: string[] = [];
        let isConfig = true;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (isConfig && trimmed.startsWith('{')) {
                try {
                    const config = JSON.parse(trimmed);
                    if (config.columns) columns = config.columns;
                } catch (e) { }
                isConfig = false;
            } else {
                isConfig = false;
                images.push(trimmed);
            }
        }

        el.addClass('duallink-gallery-container');
        el.style.position = 'relative';

        const updateCodeBlock = async (newColumns: number, newImages: string[]) => {
            const info = ctx.getSectionInfo(el);
            if (!info) {
                const { Notice } = require('obsidian');
                new Notice('无法获取区块在文档中的行号，请确保文档已被正确解析。');
                return;
            }
            const { MarkdownView } = require('obsidian');
            const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);

            const newContent = `\`\`\`duallink-gallery\n{ "columns": ${newColumns} }\n${newImages.join('\n')}\n\`\`\``;

            if (view && (view as any).editor && typeof (view as any).editor.replaceRange === 'function' && (view as any).getMode() !== 'preview') {
                const editor = (view as any).editor;
                editor.replaceRange(
                    newContent,
                    { line: info.lineStart, ch: 0 },
                    { line: info.lineEnd, ch: editor.getLine(info.lineEnd).length }
                );
            } else {
                const file = plugin.app.workspace.getActiveFile();
                if (file) {
                    await plugin.app.vault.process(file, (data: string) => {
                        const lines = data.split('\n');
                        lines.splice(info.lineStart, info.lineEnd - info.lineStart + 1, newContent);
                        return lines.join('\n');
                    });
                }
            }
        };

        setTimeout(async () => {
            let hasFixes = false;
            const newImages = [...images];
            for (let i = 0; i < newImages.length; i++) {
                const imgSource = newImages[i];
                const internalMatch = imgSource.match(/!\[\[(.*?)\]\]/);
                if (internalMatch) {
                    const linkText = internalMatch[1].split('|')[0];
                    const dest = plugin.app.metadataCache.getFirstLinkpathDest(linkText, ctx.sourcePath);
                    if (!dest) {
                        const fileName = linkText.split(/[\/\\]/).pop();
                        if (fileName) {
                            const fallbackDest = plugin.app.metadataCache.getFirstLinkpathDest(fileName, ctx.sourcePath);
                            if (fallbackDest) {
                                hasFixes = true;
                                const newLinkText = fallbackDest.path + (internalMatch[1].includes('|') ? '|' + internalMatch[1].split('|')[1] : '');
                                newImages[i] = imgSource.replace(internalMatch[1], newLinkText);
                            }
                        }
                    }
                    continue;
                }

                const externalMatch = imgSource.match(/!\[.*?\]\(<file:\/\/\/(.*?)>\)/) || imgSource.match(/!\[.*?\]\(file:\/\/\/(.*?)\)/);
                if (externalMatch) {
                    const rawPath = decodeURIComponent(externalMatch[1]);
                    const fs = require('fs');
                    if (!fs.existsSync(rawPath) && plugin.settings.defaultFolderPath) {
                        const fileName = require('path').basename(rawPath);
                        const newPath = await plugin.findExternalFileRec(fileName, plugin.settings.defaultFolderPath, 4, 0);
                        if (newPath) {
                            hasFixes = true;
                            let appendPath = newPath.split(/[\/\\]/).map((c: string) => encodeURIComponent(c)).join('/');
                            appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '$1:');
                            newImages[i] = imgSource.replace(externalMatch[1], appendPath);
                        }
                    }
                    continue;
                }
            }
            if (hasFixes) {
                updateCodeBlock(columns, newImages);
            }
        }, 100);

        const galleryWrapper = el.createEl('div');
        galleryWrapper.style.position = 'relative';

        const grid = galleryWrapper.createEl('div');
        grid.style.display = 'flex';
        grid.style.gap = '12px';
        grid.style.alignItems = 'flex-start';

        const colEls: HTMLElement[] = [];
        for (let i = 0; i < columns; i++) {
            const col = grid.createDiv();
            col.style.display = 'flex';
            col.style.flexDirection = 'column';
            col.style.gap = '12px';
            col.style.flex = '1';
            col.style.minWidth = '0';
            colEls.push(col);
        }

        const colControls = galleryWrapper.createDiv({ cls: 'duallink-gallery-control' });
        colControls.style.position = 'absolute';
        colControls.style.top = '50%';
        colControls.style.left = '4px';
        colControls.style.transform = 'translateY(-50%)';
        colControls.style.display = 'flex';
        colControls.style.flexDirection = 'column';
        colControls.style.alignItems = 'center';
        colControls.style.justifyContent = 'center';
        colControls.style.background = 'transparent';
        colControls.style.zIndex = '10';
        colControls.style.opacity = '0';
        colControls.style.transition = 'opacity 0.2s';
        colControls.style.width = '32px';

        const createColBtn = (text: string, title: string, onClick: () => void) => {
            const btn = colControls.createEl('button', { text, title });
            btn.style.background = 'transparent';
            btn.style.border = 'none';
            btn.style.boxShadow = 'none';
            btn.style.cursor = 'pointer';
            btn.style.color = 'var(--text-muted)';
            btn.style.fontSize = '24px';
            btn.style.padding = '0';
            btn.style.lineHeight = '1';
            btn.style.transition = 'transform 0.2s, color 0.2s';
            btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.2)'; btn.style.color = 'var(--text-normal)'; });
            btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; btn.style.color = 'var(--text-muted)'; });
            btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        };

        createColBtn('-', '减少列数', () => { if (columns > 1) updateCodeBlock(columns - 1, images); });
        createColBtn('+', '增加列数', () => { if (columns < 8) updateCodeBlock(columns + 1, images); });

        const addControls = galleryWrapper.createDiv({ cls: 'duallink-gallery-control' });
        addControls.style.position = 'absolute';
        addControls.style.top = '50%';
        addControls.style.right = '4px';
        addControls.style.transform = 'translateY(-50%)';
        addControls.style.display = 'flex';
        addControls.style.alignItems = 'center';
        addControls.style.justifyContent = 'center';
        addControls.style.background = 'transparent';
        addControls.style.zIndex = '10';
        addControls.style.opacity = '0';
        addControls.style.transition = 'opacity 0.2s';
        addControls.style.width = '32px';

        const addBtn = addControls.createEl('button', { title: '添加新图片' });
        addBtn.style.background = 'transparent';
        addBtn.style.border = 'none';
        addBtn.style.boxShadow = 'none';
        addBtn.style.cursor = 'pointer';
        addBtn.style.color = 'var(--text-muted)';
        addBtn.style.padding = '0';
        addBtn.style.display = 'flex';
        addBtn.style.alignItems = 'center';
        addBtn.style.justifyContent = 'center';
        addBtn.style.transition = 'transform 0.2s, color 0.2s';
        addBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

        addBtn.addEventListener('mouseenter', () => { addBtn.style.transform = 'scale(1.2)'; addBtn.style.color = 'var(--text-normal)'; });
        addBtn.addEventListener('mouseleave', () => { addBtn.style.transform = 'scale(1)'; addBtn.style.color = 'var(--text-muted)'; });

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el.closest('.markdown-reading-view')) return;

            const tempBox = grid.createEl('div');
            tempBox.style.borderRadius = '8px';
            tempBox.style.border = '2px dashed var(--interactive-accent)';
            tempBox.style.display = 'flex';
            tempBox.style.alignItems = 'center';
            tempBox.style.justifyContent = 'center';
            tempBox.style.minHeight = '100px';
            tempBox.style.color = 'var(--interactive-accent)';
            tempBox.style.fontSize = '12px';
            tempBox.createEl('span', { text: '正在选择文件...' });

            const { Notice, MarkdownView } = require('obsidian');
            const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) {
                tempBox.remove();
                return;
            }

            new PathPromptModal(plugin, '', (inputPath: string) => {
                if (!inputPath) {
                    tempBox.remove();
                    return;
                }
                const adapter = plugin.app.vault.adapter;
                const vaultBasePath = (adapter as any).getBasePath ? (adapter as any).getBasePath() : '';
                let newSyntax = '';

                const cleanP = inputPath.replace(/['"]/g, '').trim();
                let isInternal = false;
                let internalPath = '';
                if (vaultBasePath && cleanP.startsWith(vaultBasePath)) {
                    isInternal = true;
                    internalPath = cleanP.substring(vaultBasePath.length).replace(/^[/\\]+/, '').replace(/\\/g, '/');
                }
                if (isInternal) {
                    newSyntax = `![[${internalPath}]]`;
                } else {
                    let appendPath = cleanP.startsWith('/') ? cleanP.substring(1) : cleanP;
                    appendPath = appendPath.split('/').map(c => encodeURIComponent(c)).join('/');
                    appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '$1:');
                    newSyntax = `![](<file:///${appendPath}>)`;
                }
                updateCodeBlock(columns, [...images, newSyntax]);
            }).open();
        });

        galleryWrapper.addEventListener('mouseenter', () => {
            if (!el.closest('.markdown-reading-view')) {
                colControls.style.opacity = '1';
                addControls.style.opacity = '1';
            }
        });
        galleryWrapper.addEventListener('mouseleave', () => {
            colControls.style.opacity = '0';
            addControls.style.opacity = '0';
        });

        galleryWrapper.style.padding = '0 36px';

        const items: HTMLElement[] = [];
        let lastLayout = '';

        const distributeItems = () => {
            const colHeights = new Array(columns).fill(0);
            const targetCols = new Array(items.length);

            items.forEach((item, idx) => {
                let shortestIdx = 0;
                let minHeight = colHeights[0];
                for (let i = 1; i < columns; i++) {
                    if (colHeights[i] < minHeight) {
                        minHeight = colHeights[i];
                        shortestIdx = i;
                    }
                }
                targetCols[idx] = shortestIdx;
                const h = item.getBoundingClientRect().height;
                colHeights[shortestIdx] += (h > 0 ? h : 100) + 12;
            });

            const newLayout = targetCols.join(',');
            if (lastLayout !== newLayout) {
                lastLayout = newLayout;
                const colCounters = new Array(columns).fill(0);
                targetCols.forEach((colIdx, itemIdx) => {
                    const targetCol = colEls[colIdx];
                    const currentElement = items[itemIdx];
                    const expectedIndex = colCounters[colIdx]++;

                    if (targetCol.children[expectedIndex] !== currentElement) {
                        const referenceNode = targetCol.children[expectedIndex] || null;
                        targetCol.insertBefore(currentElement, referenceNode);
                    }
                });
            }
        };

        let rafId: number | null = null;
        const resizeObserver = new ResizeObserver(() => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                distributeItems();
            });
        });

        images.forEach((imgSource, index) => {
            const item = document.createElement('div');
            items.push(item);
            resizeObserver.observe(item);

            item.style.position = 'relative';
            item.style.borderRadius = '8px';
            item.style.overflow = 'hidden';

            const urlMatch = imgSource.match(/(?:file:\/\/\/|local-file:\/\/|\]\])([^)"'<>]+)/);
            const urlForExt = urlMatch ? urlMatch[1] : imgSource;
            const isAudioOnly = isAudioExt(urlForExt.split('.').pop() || '');
            if (!isAudioOnly) {
                item.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                item.style.border = '1px solid var(--background-modifier-border)';
                item.style.backgroundColor = 'var(--background-secondary)';
            } else {
                item.style.backgroundColor = 'transparent';
                item.style.boxShadow = 'none';
                item.style.border = 'none';
            }

            item.style.display = 'flex';
            item.style.flexDirection = 'column';
            item.style.cursor = 'grab';

            item.style.transition = 'transform 0.2s, opacity 0.2s';

            item.draggable = true;
            item.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                if (e.dataTransfer) {
                    e.dataTransfer.setData('duallink-gallery-index', index.toString());
                    e.dataTransfer.effectAllowed = 'move';
                }
                setTimeout(() => {
                    item.style.opacity = '0.4';
                }, 0);
            });
            item.addEventListener('dragend', (e) => {
                item.style.opacity = '1';
                if (!isAudioOnly) {
                    item.style.border = '1px solid var(--background-modifier-border)';
                } else {
                    item.style.border = 'none';
                }
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'move';
                }
                if (!isAudioOnly) {
                    item.style.border = '2px dashed var(--interactive-accent)';
                } else {
                    item.style.outline = '2px dashed var(--interactive-accent)';
                }
            });
            item.addEventListener('dragleave', (e) => {
                if (!isAudioOnly) {
                    item.style.border = '1px solid var(--background-modifier-border)';
                } else {
                    item.style.outline = 'none';
                }
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.style.border = '1px solid var(--background-modifier-border)';
                if (!e.dataTransfer) return;

                const originIndexStr = e.dataTransfer.getData('duallink-gallery-index');
                if (!originIndexStr) return;

                const originIndex = parseInt(originIndexStr, 10);
                if (originIndex === index || isNaN(originIndex)) return;

                const newImages = [...images];
                const [draggedImg] = newImages.splice(originIndex, 1);
                newImages.splice(index, 0, draggedImg);

                updateCodeBlock(columns, newImages);
            });

            item.addEventListener('mouseenter', () => {
                if (el.closest('.markdown-reading-view')) return;
                item.style.transform = 'scale(1.02)';
            });
            item.addEventListener('mouseleave', () => {
                if (el.closest('.markdown-reading-view')) return;
                item.style.transform = 'none';
            });

            item.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const media = item.querySelector('img, video') as HTMLImageElement | HTMLVideoElement;
                if (!media) return;

                const overlay = document.body.createEl('div');
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100vw';
                overlay.style.height = '100vh';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
                overlay.style.zIndex = '99999';
                overlay.style.display = 'flex';
                overlay.style.justifyContent = 'center';
                overlay.style.alignItems = 'center';
                overlay.style.cursor = 'zoom-out';

                let clone: HTMLElement;
                if (media.tagName.toLowerCase() === 'img') {
                    clone = document.createElement('img');
                    (clone as HTMLImageElement).src = (media as HTMLImageElement).src;
                } else {
                    clone = document.createElement('video');
                    (clone as HTMLVideoElement).src = (media as HTMLVideoElement).src;
                    (clone as HTMLVideoElement).controls = true;
                    (clone as HTMLVideoElement).autoplay = true;
                }

                clone.style.maxWidth = '90vw';
                clone.style.maxHeight = '90vh';
                clone.style.objectFit = 'contain';
                clone.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
                clone.style.borderRadius = '8px';
                clone.style.cursor = 'default';

                clone.addEventListener('click', (e2) => {
                    e2.stopPropagation();
                });

                overlay.appendChild(clone);

                const closeBtn = overlay.createEl('div', { text: '✕' });
                closeBtn.style.position = 'absolute';
                closeBtn.style.top = '20px';
                closeBtn.style.right = '20px';
                closeBtn.style.width = '40px';
                closeBtn.style.height = '40px';
                closeBtn.style.backgroundColor = 'rgba(0,0,0,0.5)';
                closeBtn.style.color = 'white';
                closeBtn.style.borderRadius = '50%';
                closeBtn.style.display = 'flex';
                closeBtn.style.justifyContent = 'center';
                closeBtn.style.alignItems = 'center';
                closeBtn.style.fontSize = '20px';
                closeBtn.style.cursor = 'pointer';
                closeBtn.style.transition = 'background-color 0.2s';

                closeBtn.addEventListener('mouseenter', () => closeBtn.style.backgroundColor = 'rgba(255,255,255,0.2)');
                closeBtn.addEventListener('mouseleave', () => closeBtn.style.backgroundColor = 'rgba(0,0,0,0.5)');

                overlay.addEventListener('click', () => {
                    overlay.remove();
                });

                const escListener = (e2: KeyboardEvent) => {
                    if (e2.key === 'Escape') {
                        overlay.remove();
                        document.removeEventListener('keydown', escListener);
                    }
                };
                document.addEventListener('keydown', escListener);

                overlay.addEventListener('remove', () => {
                    document.removeEventListener('keydown', escListener);
                });
            });

            addGalleryItemButtons(item, images, index, columns, plugin, el, updateCodeBlock, PathPromptModal);

            const { MarkdownRenderer: MR } = require('obsidian');

            if (true) {
                let mediaSrc = '';
                let mediaType = '';
                const cleanSrc = imgSource.replace(/[\)\]>]+$/, '').replace(/^!\[.*?\]\(<?/, '').replace(/^!\[\[/, '');
                const ext = cleanSrc.split('.').pop()?.toLowerCase() || '';

                if (isVideoExt(ext)) mediaType = 'video';
                else if (isAudioExt(ext)) mediaType = 'audio';
                else if (isImageExt(ext)) mediaType = 'image';

                const internalMatch = imgSource.match(/!\[\[(.*?)\]\]/);
                const standardMatch = imgSource.match(/!\[.*?\]\((?!file:\/\/|local-file:\/\/)(.*?)\)/);

                let linkPath = '';
                if (internalMatch) {
                    linkPath = internalMatch[1].split('|')[0].trim();
                } else if (standardMatch) {
                    linkPath = standardMatch[1].split(' ')[0].trim();
                }

                if (linkPath) {
                    try { linkPath = decodeURIComponent(linkPath); } catch (e) { }

                    let dest = plugin.app.metadataCache.getFirstLinkpathDest(linkPath, ctx.sourcePath);
                    if (!dest) {
                        const abstractFile = plugin.app.vault.getAbstractFileByPath(linkPath);
                        if (abstractFile && 'extension' in abstractFile) {
                            dest = abstractFile as any;
                        }
                    }
                    if (!dest) {
                        const targetName = linkPath.split('/').pop()?.toLowerCase() || linkPath.toLowerCase();
                        const files = plugin.app.vault.getFiles();
                        dest = files.find(f => f.name.toLowerCase() === targetName || f.path.toLowerCase() === linkPath.toLowerCase()) || null;
                    }

                    if (dest) {
                        mediaSrc = plugin.app.vault.getResourcePath(dest);
                    }
                }

                if (!mediaSrc) {
                    let externalPath = '';
                    const externalMatch = imgSource.match(/!\[.*?\]\(<file:\/\/\/(.*?)>\)/) || imgSource.match(/!\[.*?\]\(file:\/\/\/(.*?)\)/) || imgSource.match(/!\[.*?\]\(<local-file:\/\/(.*?)>\)/) || imgSource.match(/!\[.*?\]\(local-file:\/\/(.*?)\)/);
                    if (externalMatch) {
                        externalPath = externalMatch[1];
                    } else if (imgSource.includes('local-file://') || imgSource.includes('file://')) {
                        const m = imgSource.match(/(?:local-file|file):\/\/\/?([^\)"'<>]+)/);
                        if (m) externalPath = m[1];
                    }
                    if (externalPath) {
                        try { externalPath = decodeURIComponent(externalPath); } catch (e) { }
                        try {
                            const fs = require('fs');
                            const buf = fs.readFileSync(externalPath);
                            const ext = externalPath.split('.').pop()?.toLowerCase() || '';
                            let mime = '';
                            if (isImageExt(ext)) {
                                const imageMimes: Record<string, string> = { jpg: 'jpeg', svg: 'svg+xml' };
                                mime = `image/${imageMimes[ext] || ext}`;
                            } else if (isVideoExt(ext)) {
                                mime = `video/${ext}`;
                            } else if (isAudioExt(ext)) {
                                const audioMimes: Record<string, string> = { mp3: 'mpeg' };
                                mime = `audio/${audioMimes[ext] || ext}`;
                            }
                            if (mime) {
                                const blob = new Blob([buf], { type: mime });
                                mediaSrc = URL.createObjectURL(blob);
                            }
                        } catch (err) {
                            console.error('Failed to load external file:', externalPath, err);
                        }
                    }
                }

                if (mediaSrc) {
                    item.innerHTML = '';
                    if (mediaType === 'video') {
                        const video = document.createElement('video');
                        video.src = mediaSrc;
                        video.controls = false;
                        video.addEventListener('mouseenter', () => video.controls = true);
                        video.addEventListener('mouseleave', () => video.controls = false);
                        video.setAttribute('controlslist', 'nodownload');
                        video.setAttribute('draggable', 'false');
                        video.style.width = '100%';
                        video.style.height = '100%';
                        video.style.objectFit = 'cover';
                        video.style.display = 'block';
                        video.style.borderRadius = '0';
                        video.style.margin = '0';
                        item.appendChild(video);
                    } else if (mediaType === 'audio') {
                        const audio = document.createElement('audio');
                        audio.src = mediaSrc;
                        audio.controls = true;
                        audio.setAttribute('draggable', 'false');
                        audio.style.width = '100%';
                        audio.style.height = '54px';
                        audio.style.outline = 'none';
                        audio.style.borderRadius = '8px';
                        audio.style.margin = '0';
                        audio.style.display = 'block';
                        item.appendChild(audio);
                    } else {
                        const img = document.createElement('img');
                        img.src = mediaSrc;
                        img.loading = 'lazy';
                        img.decoding = 'async';
                        img.setAttribute('draggable', 'false');
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.objectFit = 'cover';
                        img.style.display = 'block';
                        img.style.borderRadius = '0';
                        img.style.margin = '0';
                        img.style.pointerEvents = 'none';
                        item.appendChild(img);
                    }
                    addGalleryItemButtons(item, images, index, columns, plugin, el, updateCodeBlock, PathPromptModal);
                } else {
                    MR.renderMarkdown(imgSource, item, ctx.sourcePath, plugin);

                    setTimeout(() => {
                        const medias = item.querySelectorAll('img, video, audio, .internal-embed');
                        medias.forEach(media => {
                            if (media instanceof HTMLElement) {
                                let isAudio = media.tagName.toLowerCase() === 'audio' || media.querySelector('audio') !== null;
                                const srcAttr = media.getAttribute('src');
                                if (srcAttr && /\.(mp3|wav|ogg|m4a|flac)$/i.test(srcAttr.split('?')[0])) {
                                    isAudio = true;
                                }

                                if (isAudio && media.classList.contains('internal-embed')) {
                                    media.setAttribute('draggable', 'false');
                                    return;
                                }

                                media.style.width = '100%';
                                media.style.display = 'block';
                                media.setAttribute('draggable', 'false');

                                if (!isAudio) {
                                    if (!media.classList.contains('internal-embed')) {
                                        media.style.height = '100%';
                                        media.style.objectFit = 'cover';
                                        media.style.borderRadius = '0';
                                    }
                                    media.style.margin = '0';
                                } else {
                                    media.style.height = '54px';
                                    media.style.borderRadius = '8px';
                                    media.style.margin = '0';
                                }

                                if (media.tagName.toLowerCase() === 'img') {
                                    media.style.pointerEvents = 'none';
                                }
                            }
                        });
                        const ps = item.querySelectorAll('p');
                        ps.forEach(p => {
                            p.style.margin = '0';
                            p.style.padding = '0';
                        });
                    }, 50);
                }
            }
        });

        const remainingCols = columns - images.length;
        if (remainingCols > 0) {
            for (let i = 0; i < remainingCols; i++) {
                const emptyCell = document.createElement('div');
                items.push(emptyCell);
                resizeObserver.observe(emptyCell);
                emptyCell.style.borderRadius = '8px';
                emptyCell.style.border = '2px dashed var(--background-modifier-border)';
                emptyCell.style.display = 'flex';
                emptyCell.style.alignItems = 'center';
                emptyCell.style.justifyContent = 'center';
                emptyCell.style.cursor = 'pointer';
                emptyCell.style.minHeight = '100px';
                emptyCell.style.color = 'var(--text-muted)';
                emptyCell.style.transition = 'all 0.2s';

                const updateIcon = () => {
                    emptyCell.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
                };
                updateIcon();

                emptyCell.addEventListener('mouseenter', () => {
                    if (el.closest('.markdown-reading-view')) return;
                    emptyCell.style.borderColor = 'var(--interactive-accent)';
                    emptyCell.style.color = 'var(--interactive-accent)';
                    emptyCell.style.transform = 'scale(1.02)';
                });
                emptyCell.addEventListener('mouseleave', () => {
                    emptyCell.style.borderColor = 'var(--background-modifier-border)';
                    emptyCell.style.color = 'var(--text-muted)';
                    emptyCell.style.transform = 'scale(1)';
                });
                emptyCell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (el.closest('.markdown-reading-view')) return;

                    emptyCell.innerHTML = '';
                    const loadingSpan = emptyCell.createEl('span', { text: '正在选择文件...' });
                    loadingSpan.style.fontSize = '12px';
                    loadingSpan.style.color = 'var(--interactive-accent)';

                    const { Notice, MarkdownView } = require('obsidian');
                    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
                    if (!view) {
                        updateIcon();
                        return;
                    }

                    new PathPromptModal(plugin, '', (inputPath: string) => {
                        if (!inputPath) {
                            updateIcon();
                            return;
                        }
                        const adapter = plugin.app.vault.adapter;
                        const vaultBasePath = (adapter as any).getBasePath ? (adapter as any).getBasePath() : '';
                        let newSyntax = '';

                        const cleanP = inputPath.replace(/['"]/g, '').trim();
                        let isInternal = false;
                        let internalPath = '';
                        if (vaultBasePath && cleanP.startsWith(vaultBasePath)) {
                            isInternal = true;
                            internalPath = cleanP.substring(vaultBasePath.length).replace(/^[/\\]+/, '').replace(/\\/g, '/');
                        }
                        if (isInternal) {
                            newSyntax = `![[${internalPath}]]`;
                        } else {
                            let appendPath = cleanP.startsWith('/') ? cleanP.substring(1) : cleanP;
                            appendPath = appendPath.split('/').map(c => encodeURIComponent(c)).join('/');
                            appendPath = appendPath.replace(/^([a-zA-Z])%3A/, '$1:');
                            newSyntax = `![](<file:///${appendPath}>)`;
                        }
                        updateCodeBlock(columns, [...images, newSyntax]);
                    }).open();
                });
            }
        }

        distributeItems();
    });
}
