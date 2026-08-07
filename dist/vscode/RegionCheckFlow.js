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
exports.collectRegionCheckReport = collectRegionCheckReport;
// @AI-Begin A8B3C 20260807 @@claudeCode
const vscode = __importStar(require("vscode"));
const locations_1 = require("../core/locations");
/**
 * 区域合规检查命令的完整交互流程。
 * 返回 undefined 表示用户取消。
 */
async function collectRegionCheckReport(provider, cache, outputChannel) {
    if (!provider.fetchDevProjects || !provider.fetchProductsByProject
        || !provider.fetchTasksByProduct || !provider.fetchWorkHours) {
        vscode.window.showErrorMessage('当前 DevOps 提供者不支持区域合规检查所需的功能。');
        return undefined;
    }
    // ── Step 1: 选择研发项目 ──
    const devProjects = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在加载研发项目', cancellable: false }, () => cache.getDevProjects(provider));
    if (devProjects.length === 0) {
        vscode.window.showWarningMessage('没有可用的研发项目。');
        return undefined;
    }
    const devPick = await vscode.window.showQuickPick(devProjects.map((p) => ({ label: p.devprojCname, description: p.devprojId, value: p.devprojId })), { title: '区域合规检查 — 选择研发项目', ignoreFocusOut: true });
    if (!devPick) {
        return undefined;
    }
    // ── Step 2: 选择产品 ──
    const products = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在加载产品列表', cancellable: false }, () => provider.fetchProductsByProject(devPick.value));
    if (products.length === 0) {
        vscode.window.showWarningMessage('该研发项目下没有可用的产品。');
        return undefined;
    }
    const prodPick = await vscode.window.showQuickPick(products.map((p) => ({ label: p.prodCname, description: p.prodId, value: p.prodId })), { title: '区域合规检查 — 选择所属产品', ignoreFocusOut: true });
    if (!prodPick) {
        return undefined;
    }
    // ── Step 3: 拉取本周所有 Task ──
    outputChannel.appendLine(`[区域合规检查] 研发项目: ${devPick.label} (${devPick.value})`);
    outputChannel.appendLine(`[区域合规检查] 所属产品: ${prodPick.label} (${prodPick.value})`);
    outputChannel.appendLine(`[区域合规检查] 正在拉取本周任务...`);
    const tasks = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在拉取本周任务列表（所有人的）', cancellable: false }, () => provider.fetchTasksByProduct(devPick.value, prodPick.value));
    if (tasks.length === 0) {
        outputChannel.appendLine(`[区域合规检查] 产品: ${prodPick.label}  本周任务数: 0`);
        vscode.window.showInformationMessage('该产品本周没有创建的任务。');
        return undefined;
    }
    outputChannel.appendLine(`[区域合规检查] 产品: ${prodPick.label}  本周任务数: ${tasks.length}`);
    outputChannel.appendLine(`[区域合规检查] 任务编号列表: ${tasks.map((t) => t.code).join(', ')}`);
    outputChannel.show(true);
    // ── Step 4: 逐任务拉取详细工时并执行检查 ──
    const results = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `正在检查 ${tasks.length} 个任务...`,
        cancellable: true
    }, async (progress, token) => {
        let checked = 0;
        for (const task of tasks) {
            if (token.isCancellationRequested) {
                break;
            }
            progress.report({
                message: `${checked + 1}/${tasks.length}: ${task.code}`,
                increment: 100 / tasks.length
            });
            // 拉取详细工时
            let records = [];
            try {
                records = await provider.fetchWorkHours(task.id || task.code);
            }
            catch (err) {
                outputChannel.appendLine(`  [WARN] 拉取 ${task.code} 工时失败: ${err instanceof Error ? err.message : String(err)}`);
            }
            const workContents = records
                .map((r) => r.workContent)
                .filter(Boolean)
                .join('\n');
            const regionName = task.regionName ?? '';
            const opsprojName = task.opsprojName ?? '';
            const checkResult = (0, locations_1.checkRegionCompliance)(task.title, workContents, regionName, opsprojName);
            results.push({ task, workContents, workHourRecords: records, checkResult });
            checked++;
        }
    });
    // ── Step 5: 输出报告 ──
    await outputReport(results, outputChannel);
    return results;
}
/**
 * 将检查报告输出到 OutputChannel。
 */
async function outputReport(results, channel) {
    const violations = results.filter((r) => r.checkResult.hasViolation);
    const cleanCount = results.length - violations.length;
    channel.appendLine('');
    channel.appendLine('═'.repeat(70));
    channel.appendLine(`  区域合规检查报告  (${new Date().toLocaleString('zh-CN')})`);
    channel.appendLine('═'.repeat(70));
    channel.appendLine(`  检查任务总数: ${results.length}`);
    channel.appendLine(`  合规任务数:   ${cleanCount}`);
    channel.appendLine(`  存疑任务数:   ${violations.length}`);
    channel.appendLine('═'.repeat(70));
    channel.appendLine('');
    if (violations.length === 0) {
        channel.appendLine('  ✓ 所有任务均通过区域合规检查。');
        channel.appendLine('');
        channel.show(true);
        vscode.window.showInformationMessage(`区域合规检查完成: ${results.length} 个任务全部合规。`);
        return;
    }
    for (const result of violations) {
        const { task, checkResult } = result;
        const primary = (0, locations_1.extractPrimaryLocation)(task.opsprojName ?? '');
        channel.appendLine('─'.repeat(70));
        channel.appendLine(`  【${task.code}】${task.title}`);
        channel.appendLine(`  处理人: ${task.executeUserName || '(无)'}`);
        channel.appendLine(`  区域: ${task.regionName || '(无)'}  |  实施项目: ${task.opsprojName || '(无)'}`);
        if (primary) {
            channel.appendLine(`  实施项目主地点: ${primary.name} (${primary.province})`);
        }
        channel.appendLine(`  状态: ${task.status}  |  创建时间: ${task.createTime || '(无)'}`);
        if (checkResult.regionViolations.length > 0) {
            channel.appendLine(`  ── 规则A 区域维度异常: 发现不属于「${task.regionName}」的地名 ──`);
            for (const v of checkResult.regionViolations) {
                channel.appendLine(`    ✗ "${v.name}" (${v.province})`);
            }
        }
        if (checkResult.opsprojViolations.length > 0) {
            channel.appendLine(`  ── 规则B 实施项目维度异常: 发现不属于「${task.opsprojName}」的地名 ──`);
            for (const v of checkResult.opsprojViolations) {
                channel.appendLine(`    ✗ "${v.name}" (${v.province})`);
            }
        }
        // 展示工时内容中有问题的部分
        if (result.workHourRecords.length > 0) {
            channel.appendLine(`  详细工时 (${result.workHourRecords.length} 条):`);
            for (const r of result.workHourRecords) {
                const date = r.taskWorkhourDate || '(无日期)';
                const content = r.workContent || '(空)';
                // 只展示有内容的行
                if (content !== '(空)') {
                    channel.appendLine(`    [${date}] ${content.slice(0, 200)}`);
                }
            }
        }
        channel.appendLine('');
    }
    channel.appendLine('═'.repeat(70));
    channel.appendLine('  检查规则说明:');
    channel.appendLine('  规则A: 区域 = "共同区域" 时，任务名称/工时中不得出现任何地名');
    channel.appendLine('          区域 = 某省份时，不得出现其他省份/城市的地名');
    channel.appendLine('  规则B: 实施项目所在地不得与任务名称/工时中出现的其他地名冲突');
    channel.appendLine('═'.repeat(70));
    channel.appendLine('');
    channel.appendLine('─'.repeat(70));
    channel.appendLine('  检查任务编号汇总');
    channel.appendLine('─'.repeat(70));
    channel.appendLine(`  全部 (${results.length}): ${results.map((r) => r.task.code).join(', ')}`);
    if (violations.length > 0) {
        channel.appendLine(`  存疑 (${violations.length}): ${violations.map((r) => r.task.code).join(', ')}`);
    }
    if (cleanCount > 0) {
        const clean = results.filter((r) => !r.checkResult.hasViolation);
        channel.appendLine(`  合规 (${cleanCount}): ${clean.map((r) => r.task.code).join(', ')}`);
    }
    channel.appendLine('═'.repeat(70));
    channel.show(true);
    // 弹出摘要提示
    const action = await vscode.window.showWarningMessage(`区域合规检查: ${violations.length}/${results.length} 个任务存疑。详见输出面板。`, { modal: false }, '查看详情');
    if (action === '查看详情') {
        channel.show(true);
    }
}
// @AI-End A8B3C 20260807 @@claudeCode
//# sourceMappingURL=RegionCheckFlow.js.map