import { App } from 'obsidian';

export function getCleanLocalPath(href: string): string {
    let filePath = '';
    const cleanHref = href.replace(/^[<"']|[>"']$/g, '').trim();
    const matchLocal = cleanHref.match(/local-file:\/\/(.+)/);
    const matchFile = cleanHref.match(/file:\/\/\/(.+)/);

    if (matchLocal) {
        filePath = decodeURIComponent(matchLocal[1]);
    } else if (matchFile) {
        filePath = decodeURIComponent(matchFile[1]);
    } else {
        filePath = decodeURIComponent(cleanHref.replace('local-file://', '').replace('file:///', ''));
    }

    return filePath.replace(/\)$/, '').replace(/['">]/g, '').trim();
}

function getVaultBasePath(app: App): string {
    try {
        if ((app.vault.adapter as any).getBasePath) {
            return (app.vault.adapter as any).getBasePath().replace(/\\/g, '/').replace(/\/$/, '');
        }
    } catch (e) {}
    return '';
}

function isInsideVault(app: App, filePath: string): boolean {
    const vaultBase = getVaultBasePath(app);
    if (!vaultBase) return false;
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.toLowerCase().startsWith(vaultBase.toLowerCase());
}

export function getConvertPath(app: App, filePath: string): string {
    const cleanPath = filePath.replace(/['">]/g, '').trim().replace(/\\/g, '/');

    if (isInsideVault(app, cleanPath)) {
        const vaultBase = getVaultBasePath(app);
        const relativePath = cleanPath.substring(vaultBase.length).replace(/^\//, '');
        const encoded = relativePath.split('/').map(c => encodeURIComponent(c)).join('/');
        return app.vault.getResourcePath(encoded).split('?')[0];
    }

    return `app://local/${cleanPath}`;
}
