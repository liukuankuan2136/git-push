"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProvider = createProvider;
const vscode = __importStar(require("vscode"));
const CompanyDevOpsAdapter_1 = require("../core/providers/CompanyDevOpsAdapter");
// @AI-Begin M7N8K 20260605 @@claudeCode
const outputChannel = vscode.window.createOutputChannel('Issue Link Push');
// @AI-End M7N8K 20260605 @@claudeCode
function createProvider(config) {
    if (!config.username || !config.password) {
        throw new Error('请先执行”初始化 DevOps 账号”，保存用户名和密码。');
    }
    for (const variable of ['${COMMIT_TYPE}', '${SUBJECT}', '${CODE}', '${HOURS}', '${PROGRESS}']) {
        if (!config.commitTemplate.includes(variable)) {
            throw new Error(`issueLinkPush.commitTemplate must include ${variable}.`);
        }
    }
    return new CompanyDevOpsAdapter_1.CompanyDevOpsAdapter({
        username: config.username,
        password: config.password,
        timeoutMs: config.requestTimeoutMs,
        // @AI-Begin M7N8K 20260605 @@claudeCode
        log: config.debugMode ? (msg) => outputChannel.appendLine(msg) : undefined
        // @AI-End M7N8K 20260605 @@claudeCode
    });
}
//# sourceMappingURL=providerFactory.js.map