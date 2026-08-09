// @AI-Begin D8E9F 20260809 @@claudeCode
import * as vscode from 'vscode';

/**
 * 基于工作区路径（而非 git origin URL）的产品映射记录。
 * 用于不依赖 Git 的命令（如日常任务登记）。
 */
export interface WorkspaceProductMapping {
  devprojId: string;
  devprojName: string;
  prodId: string;
  prodName: string;
}

const STORAGE_KEY = 'issueLinkPush.workspaceProductMap';

export class WorkspaceMappingStore {
  constructor(private readonly globalState: vscode.Memento) {}

  get(workspacePath: string): WorkspaceProductMapping | undefined {
    const map = this.load();
    return map[normalizePath(workspacePath)];
  }

  set(workspacePath: string, mapping: WorkspaceProductMapping): void {
    const map = this.load();
    map[normalizePath(workspacePath)] = mapping;
    this.save(map);
  }

  clear(): void {
    this.globalState.update(STORAGE_KEY, undefined);
  }

  private load(): Record<string, WorkspaceProductMapping> {
    return this.globalState.get<Record<string, WorkspaceProductMapping>>(STORAGE_KEY) ?? {};
  }

  private save(map: Record<string, WorkspaceProductMapping>): void {
    this.globalState.update(STORAGE_KEY, map);
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}
// @AI-End D8E9F 20260809 @@claudeCode
