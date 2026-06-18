/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { App, MarkdownRenderer, MarkdownPostProcessorContext, MarkdownView, Notice } from 'obsidian';
import { isImageExt, isVideoExt, isAudioExt } from './constants';
import { IDualLinkPlugin } from './types';
import { fs, path } from './node-modules';

interface IGalleryPathPromptModal {
  new(plugin: IDualLinkPlugin, defaultName: string, onSubmit: (path: string, name?: string) => void): { open(): void };
}

function addGalleryItemButtons(
    item: HTMLDivElement,
    images: string[],
    index: number,
    columns: number,
    plugin: IDualLinkPlugin,
    el: HTMLElement,
    updateCodeBlock: (newColumns: number, newImages: string[]) => Promise<void>,
    PathPromptModal: IGalleryPathPromptModal
) {
    const editImageBtn = item.createEl('div', {
        text: '\u270e',
        cls: 'duallink-gallery-item-btn duallink-gallery-item-btn--edit',
        title: '\u66ff\u6362\u6b64\u56fe\u7247'
    });

    const removeBtn = item.createEl('div', {
        text: '\u2715',
        cls: 'duallink-gallery-item-btn duallink-gallery-item-btn--remove',
        title: '\u79fb\u9664\u6b64\u56fe\u7247'
    });

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
        void updateCodeBlock(columns, newImages);
    });

    editImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.closest('.markdown-reading-view')) return;
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
            void updateCodeBlock(columns, newImages);
        }).open();
    });
}

export function registerGalleryProcessor(plugin: IDualLinkPlugin, PathPromptModal: IGalleryPathPromptModal): void {
    plugin.app.workspace.onLayoutReady(() => {
      plugin.registerMarkdownCodeBlockProcessor('duallink-gallery', (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
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

        const updateCodeBlock = async (newColumns: number, newImages: string[]) => {
            const info = ctx.getSectionInfo(el);
            if (!info) {
                new Notice('\u65e0\u6cd5\u83b7\u53d6\u533a\u5757\u5728\u6587\u6863\u4e2d\u7684\u884c\u53f7\uff0c\u8bf7\u786e\u4fdd\u6587\u6863\u5df2\u88ab\u6b63\u786e\u89e3\u6790\u3002');
                return;
            }
            const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);

            const newContent = `\`\`\`duallink-gallery\n{ "columns": ${newColumns} }\n${newImages.join('\n')}\n\`\`\``;

            if (view && (view as any).editor && typeof (view as any).editor.replaceRange === 'function' && (view as any).getMode() !== 'preview') {
                const e = (view as any).editor;
                e.replaceRange(
                    newContent,
                    { line: info.lineStart, ch: 0 },
                    { line: info.lineEnd, ch: e.getLine(info.lineEnd).length }
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
                    if (!fs.existsSync(rawPath) && plugin.settings.defaultFolderPath) {
                        const fileName = path.basename(rawPath);
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
                void updateCodeBlock(columns, newImages);
            }
        }, 100);

        const galleryWrapper = el.createEl('div');
        galleryWrapper.className = 'duallink-gallery-wrapper';

        const grid = galleryWrapper.createEl('div');
        grid.className = 'duallink-gallery-grid';

        const colEls: HTMLElement[] = [];
        for (let i = 0; i < columns; i++) {
            const col = grid.createDiv();
            col.className = 'duallink-gallery-col';
            colEls.push(col);
        }

        // 列控制按钮 (左侧)
        const colControls = galleryWrapper.createDiv({ cls: 'duallink-gallery-col-ctrl duallink-gallery-col-ctrl--left duallink-gallery-control' });

        const createColBtn = (text: string, title: string, onClick: () => void) => {
            const btn = colControls.createEl('button', { text, title });
            btn.className = 'duallink-gallery-col-btn';
            btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        };

        createColBtn('-', '\u51cf\u5c11\u5217\u6570', () => { if (columns > 1) void updateCodeBlock(columns - 1, images); });
        createColBtn('+', '\u589e\u52a0\u5217\u6570', () => { if (columns < 8) void updateCodeBlock(columns + 1, images); });

        // 添加按钮 (右侧)
        const addControls = galleryWrapper.createDiv({ cls: 'duallink-gallery-col-ctrl duallink-gallery-col-ctrl--right duallink-gallery-control' });

        const addBtn = addControls.createEl('button', { title: '\u6dfb\u52a0\u65b0\u56fe\u7247' });
        addBtn.className = 'duallink-gallery-col-btn';
        addBtn.style.display = 'flex';
        addBtn.style.alignItems = 'center';
        addBtn.style.justifyContent = 'center';
        addBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el.closest('.markdown-reading-view')) return;

            const tempBox = grid.createEl('div');
            tempBox.className = 'duallink-gallery-temp-box';
            tempBox.createEl('span', { text: '\u6b63\u5728\u9009\u62e9\u6587\u4ef6...' });

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
                void updateCodeBlock(columns, [...images, newSyntax]);
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

        const items: HTMLElement[] = [];
        let lastLayout = '';

        const distributeItems = () => {
            const colHeights = new Array(columns).fill(0);
            const targetCols = new Array(items.length);

            items.forEach((it, idx) => {
                let shortestIdx = 0;
                let minHeight = colHeights[0];
                for (let i = 1; i < columns; i++) {
                    if (colHeights[i] < minHeight) {
                        minHeight = colHeights[i];
                        shortestIdx = i;
                    }
                }
                targetCols[idx] = shortestIdx;
                const h = it.getBoundingClientRect().height;
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

            item.className = 'duallink-gallery-item';

            const urlMatch = imgSource.match(/(?:file:\/\/\/|local-file:\/\/|\]\])([^)"'<>]+)/);
            const urlForExt = urlMatch ? urlMatch[1] : imgSource;
            const isAudioOnly = isAudioExt(urlForExt.split('.').pop() || '');

            if (!isAudioOnly) {
                item.addClass('duallink-gallery-item--visual');
            } else {
                item.addClass('duallink-gallery-item--audio');
            }

            item.draggable = true;
            item.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                if (e.dataTransfer) {
                    e.dataTransfer.setData('duallink-gallery-index', index.toString());
                    e.dataTransfer.effectAllowed = 'move';
                }
                setTimeout(() => {
                    item.addClass('duallink-gallery-item--dragging');
                }, 0);
            });
            item.addEventListener('dragend', (e) => {
                item.removeClass('duallink-gallery-item--dragging');
                if (!isAudioOnly) {
                    item.style.border = '1px solid var(--background-modifier-border)';
                } else {
                    item.style.border = 'none';
                }
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                item.addClass('duallink-gallery-item--drag-over');
            });
            item.addEventListener('dragleave', (e) => {
                item.removeClass('duallink-gallery-item--drag-over');
                if (!isAudioOnly) {
                    item.style.border = '1px solid var(--background-modifier-border)';
                } else {
                    item.style.outline = 'none';
                }
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.removeClass('duallink-gallery-item--drag-over');
                item.style.border = '1px solid var(--background-modifier-border)';
                if (!e.dataTransfer) return;

                const originIndexStr = e.dataTransfer.getData('duallink-gallery-index');
                if (!originIndexStr) return;

                const originIndex = parseInt(originIndexStr, 10);
                if (originIndex === index || isNaN(originIndex)) return;

                const newImages = [...images];
                const [draggedImg] = newImages.splice(originIndex, 1);
                newImages.splice(index, 0, draggedImg);
                void updateCodeBlock(columns, newImages);
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
                overlay.className = 'duallink-gallery-overlay';

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
                clone.className = 'duallink-gallery-overlay-media';

                clone.addEventListener('click', (e2) => { e2.stopPropagation(); });
                overlay.appendChild(clone);

                const closeBtn = overlay.createEl('div', { text: '\u2715' });
                closeBtn.className = 'duallink-gallery-overlay-close';

                overlay.addEventListener('click', () => { overlay.remove(); });

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
                        video.className = 'duallink-gallery-media duallink-gallery-media--cover';
                        item.appendChild(video);
                    } else if (mediaType === 'audio') {
                        const audio = document.createElement('audio');
                        audio.src = mediaSrc;
                        audio.controls = true;
                        audio.setAttribute('draggable', 'false');
                        audio.className = 'duallink-gallery-media duallink-gallery-media--audio';
                        item.appendChild(audio);
                    } else {
                        const img = document.createElement('img');
                        img.src = mediaSrc;
                        img.loading = 'lazy';
                        img.decoding = 'async';
                        img.setAttribute('draggable', 'false');
                        img.className = 'duallink-gallery-media duallink-gallery-media--cover duallink-gallery-media--img';
                        item.appendChild(img);
                    }
                    addGalleryItemButtons(item, images, index, columns, plugin, el, updateCodeBlock, PathPromptModal);
                } else {
                    MarkdownRenderer.renderMarkdown(imgSource, item, ctx.sourcePath, plugin as any);

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
                emptyCell.className = 'duallink-gallery-empty';

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
                    const loadingSpan = emptyCell.createEl('span', { text: '\u6b63\u5728\u9009\u62e9\u6587\u4ef6...' });
                    loadingSpan.style.fontSize = '12px';
                    loadingSpan.style.color = 'var(--interactive-accent)';

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
                        void updateCodeBlock(columns, [...images, newSyntax]);
                    }).open();
                });
            }
        }

        distributeItems();
    });
  });
}
