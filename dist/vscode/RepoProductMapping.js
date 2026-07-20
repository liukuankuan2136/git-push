"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepoProductMappingStore = void 0;
const STORAGE_KEY = 'issueLinkPush.repoProductMap';
class RepoProductMappingStore {
    globalState;
    constructor(globalState) {
        this.globalState = globalState;
    }
    get(originUrl) {
        const map = this.load();
        return map[normalizeUrl(originUrl)];
    }
    set(mapping) {
        const map = this.load();
        map[normalizeUrl(mapping.originUrl)] = mapping;
        this.save(map);
    }
    load() {
        return this.globalState.get(STORAGE_KEY) ?? {};
    }
    clear() {
        this.globalState.update(STORAGE_KEY, undefined);
    }
    save(map) {
        this.globalState.update(STORAGE_KEY, map);
    }
}
exports.RepoProductMappingStore = RepoProductMappingStore;
function normalizeUrl(url) {
    return url.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
}
// @AI-End C6D9E 20260720 @@claudeCode
//# sourceMappingURL=RepoProductMapping.js.map