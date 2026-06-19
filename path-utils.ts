/* eslint-disable @typescript-eslint/no-unsafe-member-access -- Obsidian Vault adapter 类型不完整，运行时代理可能包含额外方法 */
import { App } from 'obsidian';
import { VaultAdapter, VaultExt } from './types';

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

/** Extract clean absolute path from an app://local/ URL */
export function getCleanAppLocalPath(src: string): string {
    const raw = decodeURIComponent(
        src.replace(/^app:\/\/local\/[^/]*\//, 'app://local/').replace('app://local/', '')
    );
    const driveMatch = raw.match(/[a-zA-Z]:\//);
    return driveMatch ? raw.substring(raw.indexOf(driveMatch[0])) : raw;
}

function getVaultBasePath(app: App): string {
    try {
        const adapter = app.vault.adapter as unknown as VaultAdapter;
        if (adapter.getBasePath) {
            return adapter.getBasePath().replace(/\\/g, '/').replace(/\/$/, '');
        }
    } catch { /* vault adapter error, return empty string */ }
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
        return (app.vault as unknown as VaultExt).getResourcePath(encoded).split('?')[0];
    }

    return `app://local/${cleanPath}`;
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access -- 恢复 no-unsafe-member-access 检查 */
