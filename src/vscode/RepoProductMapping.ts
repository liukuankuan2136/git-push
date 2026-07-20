import * as vscode from 'vscode';

// @AI-Begin C6D9E 20260720 @@claudeCode
export interface RepoProductMapping {
  originUrl: string;
  devprojId: string;
  devprojName: string;
  prodId: string;
  prodName: string;
}

const STORAGE_KEY = 'issueLinkPush.repoProductMap';

export class RepoProductMappingStore {
  constructor(private readonly globalState: vscode.Memento) {}

  get(originUrl: string): RepoProductMapping | undefined {
    const map = this.load();
    return map[normalizeUrl(originUrl)];
  }

  set(mapping: RepoProductMapping): void {
    const map = this.load();
    map[normalizeUrl(mapping.originUrl)] = mapping;
    this.save(map);
  }

  private load(): Record<string, RepoProductMapping> {
    return this.globalState.get<Record<string, RepoProductMapping>>(STORAGE_KEY) ?? {};
  }

  clear(): void {
    this.globalState.update(STORAGE_KEY, undefined);
  }

  private save(map: Record<string, RepoProductMapping>): void {
    this.globalState.update(STORAGE_KEY, map);
  }
}

function normalizeUrl(url: string): string {
  return url.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
}
// @AI-End C6D9E 20260720 @@claudeCode
