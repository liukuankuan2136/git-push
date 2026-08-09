"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceMappingStore = void 0;
const STORAGE_KEY = 'issueLinkPush.workspaceProductMap';
class WorkspaceMappingStore {
    globalState;
    constructor(globalState) {
        this.globalState = globalState;
    }
    get(workspacePath) {
        const map = this.load();
        return map[normalizePath(workspacePath)];
    }
    set(workspacePath, mapping) {
        const map = this.load();
        map[normalizePath(workspacePath)] = mapping;
        this.save(map);
    }
    clear() {
        this.globalState.update(STORAGE_KEY, undefined);
    }
    load() {
        return this.globalState.get(STORAGE_KEY) ?? {};
    }
    save(map) {
        this.globalState.update(STORAGE_KEY, map);
    }
}
exports.WorkspaceMappingStore = WorkspaceMappingStore;
function normalizePath(path) {
    return path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}
// @AI-End D8E9F 20260809 @@claudeCode
//# sourceMappingURL=WorkspaceMapping.js.map