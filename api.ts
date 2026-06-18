import type LocalFileLinkerPlugin from './main';

export interface DualLinkPublicAPI {
  generateMarkdownLink(fileName: string, filePath: string): string;
  packToVault(): Promise<void>;
  packOut(): Promise<void>;
  findExternalFileRec(fileName: string, dir: string, maxDepth?: number, currentDepth?: number): Promise<string | null>;
}

export function createPublicAPI(plugin: LocalFileLinkerPlugin): DualLinkPublicAPI {
  return {
    generateMarkdownLink: plugin.generateMarkdownLink.bind(plugin),
    packToVault: () => plugin.packToVault(),
    packOut: () => plugin.packOut(),
    findExternalFileRec: plugin.findExternalFileRec.bind(plugin),
  };
}
