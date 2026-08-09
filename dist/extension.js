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
exports.activate = activate;
exports.deactivate = deactivate;
const cp = __importStar(require("node:child_process"));
const util = __importStar(require("node:util"));
const vscode = __importStar(require("vscode"));
const DevOpsCache_1 = require("./core/DevOpsCache");
const ConfigManager_1 = require("./vscode/ConfigManager");
const AmendStrategy_1 = require("./vscode/AmendStrategy");
const DevOpsCommitFormatter_1 = require("./core/DevOpsCommitFormatter");
const git_1 = require("./vscode/git");
const providerFactory_1 = require("./vscode/providerFactory");
const CompanyDevOpsAdapter_1 = require("./core/providers/CompanyDevOpsAdapter");
const QuickPickFlow_1 = require("./vscode/QuickPickFlow");
const RepoProductMapping_1 = require("./vscode/RepoProductMapping");
const RegionCheckFlow_1 = require("./vscode/RegionCheckFlow");
const PushDayWorkFlow_1 = require("./vscode/PushDayWorkFlow");
const execFile = util.promisify(cp.execFile);
function activate(context) {
    const configManager = new ConfigManager_1.ConfigManager(context.secrets);
    let cache;
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('issueLinkPush')) {
            cache = undefined;
        }
    }), vscode.commands.registerCommand('issueLinkPush.initializeDevOps', async () => {
        await configManager.initializeDevOpsAccount();
        cache = undefined;
    }), 
    // @AI-Begin W3F6G 20260518 @@clearCache
    vscode.commands.registerCommand('issueLinkPush.clearCache', () => {
        const parts = [];
        if (cache) {
            cache.clear();
            parts.push('DevOps 缓存');
        }
        // @AI-Begin V5W2X 20260606 @@claudeCode
        context.globalState.update('issueLinkPush.lastVersion', undefined);
        parts.push('版本记录');
        // @AI-End V5W2X 20260606 @@claudeCode
        // @AI-Begin C6D9E 20260720 @@claudeCode
        const repoMappingStore = new RepoProductMapping_1.RepoProductMappingStore(context.globalState);
        repoMappingStore.clear();
        parts.push('仓库映射');
        // @AI-End C6D9E 20260720 @@claudeCode
        if (parts.length > 0) {
            vscode.window.showInformationMessage(`${parts.join('、')}已清除。`);
        }
        else {
            vscode.window.showInformationMessage('缓存为空，无需清除。');
        }
    }), 
    // @AI-End W3F6G 20260518 @@cc
    vscode.commands.registerCommand('issueLinkPush.submitWithDevOpsTask', async () => {
        const config = await configManager.load();
        cache ??= new DevOpsCache_1.DevOpsCache(config.cacheTtlMs);
        await runSubmitWithDevOpsTask(config, cache);
    }), 
    // @AI-Begin B6C7D 20260520 @@cc
    vscode.commands.registerCommand('issueLinkPush.commitAndPush', async () => {
        const config = await configManager.load();
        cache ??= new DevOpsCache_1.DevOpsCache(config.cacheTtlMs);
        await runCommitAndPush(config, cache);
    }), vscode.commands.registerCommand('issueLinkPush.commitOnly', async () => {
        const config = await configManager.load();
        cache ??= new DevOpsCache_1.DevOpsCache(config.cacheTtlMs);
        await runCommitOnly(config, cache);
    }), 
    // @AI-End B6C7D 20260520 @@cc
    // @AI-Begin C6D9E 20260720 @@claudeCode
    vscode.commands.registerCommand('issueLinkPush.opsWorkHourRecord', async () => {
        const config = await configManager.load();
        cache ??= new DevOpsCache_1.DevOpsCache(config.cacheTtlMs);
        await runOpsWorkHourRecord(config, cache, context);
    }), 
    // @AI-End C6D9E 20260720 @@claudeCode
    // @AI-Begin A8B3C 20260807 @@claudeCode
    vscode.commands.registerCommand('issueLinkPush.regionCheck', async () => {
        const config = await configManager.load();
        cache ??= new DevOpsCache_1.DevOpsCache(config.cacheTtlMs);
        await runRegionCheck(config, cache);
    }), 
    // @AI-End A8B3C 20260807 @@claudeCode
    // @AI-Begin K1L2M 20260809 @@claudeCode
    vscode.commands.registerCommand('issueLinkPush.pushDayWork', async () => {
        const config = await configManager.load();
        cache ??= new DevOpsCache_1.DevOpsCache(config.cacheTtlMs);
        await runPushDayWork(config);
    })
    // @AI-End K1L2M 20260809 @@claudeCode
    );
    // @AI-Begin V5W2X 20260606 @@claudeCode
    // @AI-Begin D5E6F 20260807 @@claudeCode — 升级提醒改为由 issueLinkPush.upgradeReminder 配置控制，默认不提醒
    const currentVersion = context.extension.packageJSON.version;
    const storedVersion = context.globalState.get('issueLinkPush.lastVersion');
    const upgradeReminder = vscode.workspace.getConfiguration('issueLinkPush').get('upgradeReminder', false);
    providerFactory_1.outputChannel.appendLine(`[versionCheck] currentVersion: ${currentVersion}`);
    providerFactory_1.outputChannel.appendLine(`[versionCheck] storedVersion: ${storedVersion ?? '<none>'}`);
    providerFactory_1.outputChannel.appendLine(`[versionCheck] isUpgrade: ${currentVersion !== storedVersion}`);
    providerFactory_1.outputChannel.appendLine(`[versionCheck] upgradeReminder: ${upgradeReminder}`);
    if (currentVersion !== storedVersion) {
        context.globalState.update('issueLinkPush.lastVersion', currentVersion);
        if (upgradeReminder) {
            vscode.window.showInformationMessage(`Issue Link Push 已更新至 v${currentVersion}`, '查看变更').then((selection) => {
                if (selection === '查看变更') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/liukuankuan2136/git-push/releases'));
                }
            });
        }
    }
    // @AI-End D5E6F 20260807 @@claudeCode
    // @AI-End V5W2X 20260606 @@claudeCode
}
// @AI-Begin C6D9E 20260720 @@claudeCode
async function runOpsWorkHourRecord(config, cache, context) {
    try {
        // 检查 git
        const git = await (0, git_1.getGitApi)();
        const repository = await (0, git_1.pickRepository)(git);
        if (!repository) {
            vscode.window.showWarningMessage('当前没有打开 Git 仓库。');
            return;
        }
        const cwd = repository.rootUri.fsPath;
        if (!(await (0, git_1.hasStagedChanges)(cwd))) {
            vscode.window.showWarningMessage('当前没有已暂存的改动。请先 git add 暂存要提交的文件。');
            return;
        }
        const pushTarget = await resolvePushTarget(cwd, repository, false);
        if (!pushTarget) {
            return;
        }
        // 获取 origin URL 用于仓库映射
        const originUrl = await getOriginUrl(cwd);
        // 创建 provider
        const provider = (0, providerFactory_1.createProvider)(config);
        if (!provider.createTask || !provider.fetchDevProjects || !provider.fetchRegions
            || !provider.fetchProductsByProject || !provider.fetchOpsProjectsByRegion
            || !provider.getUserId || !provider.addWorkHour) {
            vscode.window.showErrorMessage('当前 DevOps 提供者不支持运维工时补录所需的功能。');
            return;
        }
        // 获取 userId（从 session 中）
        await provider.testConnection();
        // 仓库映射
        const repoMappingStore = new RepoProductMapping_1.RepoProductMappingStore(context.globalState);
        const existingMapping = originUrl ? repoMappingStore.get(originUrl) : undefined;
        // 收集输入
        const collected = await (0, QuickPickFlow_1.collectOpsWorkHourRecord)(provider, cache, originUrl ?? '', existingMapping, config.taskCreateMode);
        if (!collected) {
            return;
        }
        // 保存仓库映射
        if (originUrl && !existingMapping) {
            repoMappingStore.set({
                originUrl,
                devprojId: collected.taskInput.devprojId,
                devprojName: collected.devprojName,
                prodId: collected.taskInput.prodId,
                prodName: collected.prodName
            });
        }
        // 创建任务
        const taskResult = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在创建 DevOps 任务', cancellable: false }, async () => provider.createTask(collected.taskInput));
        providerFactory_1.outputChannel.appendLine(`[opsWorkHourRecord] task created: code=${taskResult.code}, id=${taskResult.id}`);
        // 构建 commit message（使用 commitTemplate，SUBJECT 用任务标题）
        const metadata = {
            project: { code: collected.taskInput.prodId, name: collected.taskInput.prodId },
            task: {
                code: taskResult.code,
                title: taskResult.title,
                type: 'task',
                status: '新增',
                projectCode: collected.taskInput.prodId,
                id: taskResult.id,
                url: taskResult.url
            },
            commitType: collected.commitType,
            subject: collected.taskInput.taskName,
            hours: collected.hours,
            progress: collected.progress,
            workHourTypeCode: collected.workHourTypeCode,
            workHourTypeName: collected.workHourTypeName
        };
        const message = (0, DevOpsCommitFormatter_1.formatDevOpsCommitMetadata)(config.commitTemplate, metadata);
        providerFactory_1.outputChannel.appendLine(`[opsWorkHourRecord] commit message: ${message}`);
        // commit
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在提交代码', cancellable: false }, async () => { await execFile('git', ['commit', '-m', message], { cwd }); });
        // push（失败不阻塞工时登记）
        let pushFailed = false;
        try {
            await doPush(repository, pushTarget);
        }
        catch (pushError) {
            pushFailed = true;
            providerFactory_1.outputChannel.appendLine(`[opsWorkHourRecord] push failed: ${pushError instanceof Error ? pushError.message : String(pushError)}`);
            vscode.window.showWarningMessage('代码推送失败，请手动推送。工时将继续登记。');
        }
        // 登记工时：日期当天、类型默认"代码编写"、工时=用户输入的本次投入工时
        providerFactory_1.outputChannel.appendLine('[opsWorkHourRecord] recording work hours...');
        const today = new Date().toISOString().split('T')[0];
        const calcHours = Number(collected.hours);
        if (calcHours <= 0) {
            providerFactory_1.outputChannel.appendLine(`[opsWorkHourRecord] calculated hours is ${calcHours}, skipping work hour registration`);
            vscode.window.showWarningMessage(`工时登记已跳过：当前完成度 ${collected.progress}% 下计算工时为 0。`);
        }
        else {
            const codeWritingType = await findCodeWritingType(provider, cache);
            const workContent = collected.taskDesc
                || collected.taskInput.taskName;
            try {
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在登记工时到 DevOps', cancellable: false }, async () => {
                    await provider.addWorkHour(taskResult.id, today, calcHours, `${collected.progress}%`, workContent, codeWritingType);
                });
                providerFactory_1.outputChannel.appendLine(`[opsWorkHourRecord] work hours registered: ${calcHours}h on task=${taskResult.id}`);
            }
            catch (whError) {
                providerFactory_1.outputChannel.appendLine(`[opsWorkHourRecord] work hour registration failed: ${whError instanceof Error ? whError.message : String(whError)}`);
                vscode.window.showWarningMessage(`工时登记失败: ${whError instanceof Error ? whError.message : String(whError)}`);
            }
        }
        const pushStatus = pushFailed ? '（推送失败，请手动 git push）' : '已推送';
        const openLabel = '在浏览器中打开';
        vscode.window.showInformationMessage(`运维工时补录完成: ${taskResult.code}，代码已提交。${pushStatus}`, openLabel).then((selection) => {
            if (selection === openLabel) {
                const url = taskResult.url ?? `https://devops.ctjsoft.com/devops-web4/linkIframe/HNoGJlq`;
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
        });
    }
    catch (error) {
        vscode.window.showErrorMessage(`运维工时补录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function findCodeWritingType(provider, cache) {
    try {
        const types = await cache.getWorkHourTypes(provider);
        const codeWriting = types.find((t) => t.eleName === '代码编写');
        if (codeWriting) {
            return codeWriting.eleCode;
        }
    }
    catch { /* ignore */ }
    return '24'; // fallback default
}
async function getOriginUrl(cwd) {
    try {
        const { stdout } = await execFile('git', ['remote', 'get-url', 'origin'], { cwd });
        return stdout.trim();
    }
    catch {
        return undefined;
    }
}
// @AI-Begin A8B3C 20260807 @@claudeCode
async function runRegionCheck(config, cache) {
    try {
        // 区域合规检查始终开启诊断日志
        const provider = new CompanyDevOpsAdapter_1.CompanyDevOpsAdapter({
            username: config.username,
            password: config.password,
            timeoutMs: config.requestTimeoutMs,
            log: (msg) => providerFactory_1.outputChannel.appendLine(msg)
        });
        if (!provider.fetchTasksByProduct || !provider.fetchWorkHours
            || !provider.fetchDevProjects || !provider.fetchProductsByProject) {
            vscode.window.showErrorMessage('当前 DevOps 提供者不支持区域合规检查功能。');
            return;
        }
        await provider.testConnection();
        await (0, RegionCheckFlow_1.collectRegionCheckReport)(provider, cache, providerFactory_1.outputChannel);
    }
    catch (error) {
        vscode.window.showErrorMessage(`区域合规检查失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// @AI-End A8B3C 20260807 @@claudeCode
// @AI-End C6D9E 20260720 @@claudeCode
// @AI-Begin K1L2M 20260809 @@claudeCode
async function runPushDayWork(config) {
    try {
        if (!config.username || !config.password) {
            vscode.window.showErrorMessage('请先执行"初始化 DevOps 账号"，保存用户名和密码。');
            return;
        }
        const provider = new CompanyDevOpsAdapter_1.CompanyDevOpsAdapter({
            username: config.username,
            password: config.password,
            timeoutMs: config.requestTimeoutMs,
            log: (msg) => providerFactory_1.outputChannel.appendLine(msg)
        });
        await provider.testConnection();
        providerFactory_1.outputChannel.appendLine('[pushDayWork] connection verified');
        const collected = await (0, PushDayWorkFlow_1.collectPushDayWork)(provider, providerFactory_1.outputChannel);
        if (!collected) {
            providerFactory_1.outputChannel.appendLine('[pushDayWork] user cancelled');
            return;
        }
        providerFactory_1.outputChannel.appendLine(`[pushDayWork] submitting report for ${collected.reportDate}...`);
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在提交日报...', cancellable: false }, async () => {
            await provider.submitDailyReport({
                nowWork: collected.nowWorkHtml,
                nextPlan: collected.nextPlan,
                otherMatters: collected.otherMatters,
                reportDate: collected.reportDate,
                toUserIds: collected.toUserIds
            });
        });
        providerFactory_1.outputChannel.appendLine('[pushDayWork] report submitted successfully');
        vscode.window.showInformationMessage(`日报已提交 (${collected.reportDate})。`);
    }
    catch (error) {
        providerFactory_1.outputChannel.appendLine(`[pushDayWork] error: ${error instanceof Error ? error.message : String(error)}`);
        vscode.window.showErrorMessage(`日报提交失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// @AI-End K1L2M 20260809 @@claudeCode
function deactivate() { }
// @AI-End D8E4F 20260520 @@cc
async function runSubmitWithDevOpsTask(config, cache) {
    try {
        const git = await (0, git_1.getGitApi)();
        const repository = await (0, git_1.pickRepository)(git);
        if (!repository) {
            vscode.window.showWarningMessage('当前没有打开 Git 仓库。');
            return;
        }
        const cwd = repository.rootUri.fsPath;
        // @AI-Begin F1G3H 20260520 @@cc
        const pushTarget = await resolvePushTarget(cwd, repository);
        if (!pushTarget) {
            return;
        }
        // @AI-End F1G3H 20260520 @@cc
        const provider = (0, providerFactory_1.createProvider)(config);
        const metadata = await (0, QuickPickFlow_1.collectDevOpsCommitMetadata)(provider, cache, config);
        if (!metadata) {
            return;
        }
        const strategy = new AmendStrategy_1.AmendStrategy(cwd);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在写入 DevOps 信息到 commit',
            cancellable: false
        }, () => strategy.apply(metadata, config.commitTemplate));
        await pushAndRecordHours({
            repository,
            cwd,
            pushTarget,
            provider,
            metadata,
            config,
            onPushFailure: () => recoverAmend(cwd),
            successMessage: 'DevOps 信息已写入，推送并登记工时完成。'
        });
    }
    catch (error) {
        vscode.window.showErrorMessage(formatGitError(error));
    }
}
// @AI-Begin E8F9G 20260520 @@cc
async function runCommitAndPush(config, cache) {
    try {
        const git = await (0, git_1.getGitApi)();
        const repository = await (0, git_1.pickRepository)(git);
        if (!repository) {
            vscode.window.showWarningMessage('当前没有打开 Git 仓库。');
            return;
        }
        const cwd = repository.rootUri.fsPath;
        if (!(await (0, git_1.hasStagedChanges)(cwd))) {
            vscode.window.showWarningMessage('当前没有已暂存的改动。请先 git add 暂存要提交的文件。');
            return;
        }
        const pushTarget = await resolvePushTarget(cwd, repository, false);
        if (!pushTarget) {
            return;
        }
        const provider = (0, providerFactory_1.createProvider)(config);
        const metadata = await (0, QuickPickFlow_1.collectDevOpsCommitMetadata)(provider, cache, config);
        if (!metadata) {
            return;
        }
        const message = (0, DevOpsCommitFormatter_1.formatDevOpsCommitMetadata)(config.commitTemplate, metadata);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在提交代码',
            cancellable: false
        }, async () => {
            await execFile('git', ['commit', '-m', message], { cwd });
        });
        await pushAndRecordHours({
            repository,
            cwd,
            pushTarget,
            provider,
            metadata,
            config,
            onPushFailure: () => recoverCommit(cwd),
            successMessage: '代码已提交，推送并登记工时完成。'
        });
    }
    catch (error) {
        vscode.window.showErrorMessage(formatGitError(error));
    }
}
async function runCommitOnly(config, cache) {
    try {
        const git = await (0, git_1.getGitApi)();
        const repository = await (0, git_1.pickRepository)(git);
        if (!repository) {
            vscode.window.showWarningMessage('当前没有打开 Git 仓库。');
            return;
        }
        const cwd = repository.rootUri.fsPath;
        if (!(await (0, git_1.hasStagedChanges)(cwd))) {
            vscode.window.showWarningMessage('当前没有已暂存的改动。请先 git add 暂存要提交的文件。');
            return;
        }
        const provider = (0, providerFactory_1.createProvider)(config);
        const metadata = await (0, QuickPickFlow_1.collectDevOpsCommitMetadata)(provider, cache, config);
        if (!metadata) {
            return;
        }
        const message = (0, DevOpsCommitFormatter_1.formatDevOpsCommitMetadata)(config.commitTemplate, metadata);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在提交代码',
            cancellable: false
        }, async () => {
            await execFile('git', ['commit', '-m', message], { cwd });
        });
        await recordHours(provider, metadata, config);
        vscode.window.showInformationMessage('代码已提交到本地，工时已登记。');
    }
    catch (error) {
        vscode.window.showErrorMessage(formatGitError(error));
    }
}
async function recoverCommit(cwd) {
    try {
        await execFile('git', ['reset', '--soft', 'HEAD~1'], { cwd });
    }
    catch {
        // 恢复失败不掩盖原始错误
    }
}
async function doPush(repository, pushTarget) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在推送代码',
        cancellable: false
    }, () => {
        if (pushTarget.hasUpstream) {
            return repository.push();
        }
        return repository.push(pushTarget.remoteName, pushTarget.branchName, true);
    });
}
async function pushAndRecordHours(options) {
    const { repository, cwd, pushTarget, provider, metadata, config, onPushFailure } = options;
    try {
        await doPush(repository, pushTarget);
    }
    catch (pushError) {
        await onPushFailure();
        throw pushError;
    }
    await recordHours(provider, metadata, config);
    vscode.window.showInformationMessage(options.successMessage);
}
async function recordHours(provider, metadata, config) {
    const createTime = new Date().toISOString().split('T')[0];
    const spendTaskTime = calcSpendTaskTime(metadata, config.workHourMode);
    const dayCompletion = calcDayCompletion(metadata, config.progressMode);
    const taskId = metadata.task.id || metadata.task.code;
    if (metadata.todayWorkHour && provider.modifyWorkHour) {
        const workContent = calcWorkContent(metadata, config.workContentMode);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在更新今日工时到 DevOps',
            cancellable: false
        }, async () => {
            await provider.modifyWorkHour(metadata.todayWorkHour.taskWorkhourId, taskId, createTime, spendTaskTime, dayCompletion, workContent, metadata.workHourTypeCode);
        });
    }
    else if (provider.addWorkHour) {
        // @AI-Begin X5Y6Z 20260526 @@cc
        const sanitizedSubject = metadata.subject.replace(/^[•\-\*\+]\s*/, '');
        const workContent = `• ${sanitizedSubject}`;
        // @AI-End X5Y6Z 20260526 @@cc
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在登记工时到 DevOps',
            cancellable: false
        }, async () => {
            await provider.addWorkHour(taskId, createTime, spendTaskTime, dayCompletion, workContent, metadata.workHourTypeCode);
        });
    }
}
function calcSpendTaskTime(metadata, mode) {
    const input = Number(metadata.hours);
    if (mode === 'append' && metadata.todayWorkHour) {
        return metadata.todayWorkHour.spendTaskTime + input;
    }
    return input;
}
function calcDayCompletion(metadata, mode) {
    const input = Number(metadata.progress);
    if (mode === 'append' && metadata.todayWorkHour) {
        const existing = parseFloat(metadata.todayWorkHour.dayCompletion) || 0;
        return `${Math.min(existing + input, 100)}%`;
    }
    return `${input}%`;
}
function calcWorkContent(metadata, mode) {
    // @AI-Begin X5Y6Z 20260526 @@cc
    const sanitizedSubject = metadata.subject.replace(/^[•\-\*\+]\s*/, '');
    const entry = `• ${sanitizedSubject}`;
    // @AI-End X5Y6Z 20260526 @@cc
    if (mode === 'append' && metadata.todayWorkHour) {
        return metadata.todayWorkHour.workContent + '\n' + entry;
    }
    return entry;
}
function formatGitError(error) {
    if (error instanceof Error) {
        const execError = error;
        if (execError.stderr) {
            return execError.stderr.trim();
        }
        return error.message;
    }
    return String(error);
}
// @AI-Begin P2Q4R 20260520 @@cc
async function resolvePushTarget(cwd, repository, requireUnpushedCommits = true) {
    const state = await (0, AmendStrategy_1.checkBranchState)(cwd);
    if (requireUnpushedCommits && !state.hasUnpushedCommits) {
        vscode.window.showWarningMessage('当前没有未推送的 commit。');
        return null;
    }
    if (state.hasUpstream) {
        return { hasUpstream: true };
    }
    const remotes = await (0, git_1.listRemotes)(cwd);
    if (remotes.length === 0) {
        vscode.window.showErrorMessage('当前仓库没有配置 remote，请先执行 git remote add 添加远程仓库。');
        return null;
    }
    let remoteName;
    if (remotes.length === 1) {
        remoteName = remotes[0];
    }
    else {
        const picked = await vscode.window.showQuickPick(remotes.map((r) => ({ label: r })), { placeHolder: '当前分支没有 upstream，请选择要推送到的远程仓库' });
        if (!picked) {
            return null;
        }
        remoteName = picked.label;
    }
    const localBranch = (0, git_1.getCurrentBranchName)(repository) ?? 'main';
    const remoteBranch = await vscode.window.showInputBox({
        prompt: `将推送到 ${remoteName}，请输入远程分支名`,
        value: localBranch,
        validateInput: (value) => {
            if (!value.trim()) {
                return '远程分支名不能为空';
            }
            return null;
        }
    });
    if (!remoteBranch) {
        return null;
    }
    return {
        hasUpstream: false,
        remoteName,
        branchName: remoteBranch.trim()
    };
}
// @AI-End P2Q4R 20260520 @@cc
async function recoverAmend(cwd) {
    try {
        const { stdout } = await execFile('git', ['rev-parse', 'HEAD@{1}'], { cwd });
        const prevCommit = stdout.trim();
        if (prevCommit) {
            await execFile('git', ['reset', '--soft', 'HEAD@{1}'], { cwd });
        }
    }
    catch {
        // 恢复失败不掩盖原始错误
    }
}
//# sourceMappingURL=extension.js.map