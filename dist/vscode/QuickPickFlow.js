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
exports.collectDevOpsCommitMetadata = collectDevOpsCommitMetadata;
exports.collectOpsWorkHourRecord = collectOpsWorkHourRecord;
exports.matchRegionFromTitle = matchRegionFromTitle;
exports.pickRegion = pickRegion;
exports.pickDevProjectAndProduct = pickDevProjectAndProduct;
const vscode = __importStar(require("vscode"));
const DevOpsCommitFormatter_1 = require("../core/DevOpsCommitFormatter");
const TaskTemplateFlow_1 = require("./TaskTemplateFlow");
const DailyTaskFlow_1 = require("./DailyTaskFlow");
const WORK_HOUR_MODE_HINT = {
    append: '[累加模式]',
    overwrite: '[覆盖模式]'
};
const WORK_CONTENT_MODE_HINT = {
    append: '[追加模式]',
    overwrite: '[覆盖模式]'
};
const PROGRESS_MODE_HINT = {
    append: '[累加模式，上限100%]',
    overwrite: '[覆盖模式]'
};
const COMMIT_TYPES = [
    { label: 'feat', description: '增加新功能' },
    { label: 'fix', description: '修复 bug' },
    { label: 'perf', description: '性能或体验优化' },
    { label: 'refactor', description: '代码重构' },
    { label: 'test', description: '增加或调整测试' },
    { label: 'style', description: '格式、空格、缩进等不影响含义的改动' },
    { label: 'build', description: '构建、发布、依赖调整' },
    { label: 'chore', description: '日常维护或杂务处理' },
    { label: 'upd', description: '已有内容更新或修改' },
    { label: 'Merge', description: '合并操作，必须以 Merge 空格开头' },
    { label: 'doc', description: '文档改动' }
];
async function collectDevOpsCommitMetadata(provider, cache, config) {
    // @AI-Begin R2S5T 20260519 @@cc
    const taskTypePick = await vscode.window.showQuickPick([
        { label: 'task', description: '开发任务', value: 'task' },
        { label: 'bug', description: '缺陷修复', value: 'bug' }
    ], {
        title: '选择工作项类型',
        placeHolder: 'task 或 bug',
        ignoreFocusOut: true
    });
    if (!taskTypePick) {
        return undefined;
    }
    const taskType = taskTypePick.value;
    const tasks = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `正在加载 ${taskType} 列表`,
        cancellable: false
    }, () => cache.getTasks(provider, taskType));
    if (tasks.length === 0) {
        vscode.window.showWarningMessage(`没有未完成的 ${taskType}。`);
        return undefined;
    }
    const grouped = groupByProduct(tasks);
    const taskPickItems = [];
    for (const [productName, productTasks] of grouped) {
        taskPickItems.push({ label: productName, kind: vscode.QuickPickItemKind.Separator });
        for (const task of productTasks) {
            taskPickItems.push({
                label: task.code,
                description: task.status,
                detail: `${task.title}${formatTaskReference(task)}`,
                task
            });
        }
    }
    // @AI-Begin M7N8K 20260605 @@claudeCode
    const selectedTask = await new Promise((resolve) => {
        let resolved = false;
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = `输入或选择一个 ${taskType}`;
        quickPick.placeholder = '搜索工作项编号或标题，或输入编号后回车查询';
        quickPick.items = taskPickItems;
        quickPick.matchOnDetail = true;
        quickPick.ignoreFocusOut = true;
        quickPick.onDidAccept(async () => {
            const pick = quickPick.selectedItems[0];
            if (pick?.task) {
                // 用户从列表中选中了已有的工作项
                resolved = true;
                quickPick.hide();
                resolve(pick.task);
                return;
            }
            // 没有选中列表项 — 用户输入了自定义编号
            const code = quickPick.value.trim();
            if (!code) {
                return;
            }
            // 检查输入是否恰好匹配列表中某一项的编号
            const matched = taskPickItems.find((item) => item.label === code && item.task);
            if (matched?.task) {
                resolved = true;
                quickPick.hide();
                resolve(matched.task);
                return;
            }
            // 手动查询
            if (!provider.fetchTaskByCode) {
                vscode.window.showErrorMessage('当前 DevOps 提供者不支持手动查询编号。');
                return;
            }
            quickPick.busy = true;
            quickPick.placeholder = `正在查询 ${code} ...`;
            try {
                const task = await provider.fetchTaskByCode(code, taskType);
                if (task) {
                    resolved = true;
                    quickPick.hide();
                    resolve(task);
                }
                else {
                    quickPick.busy = false;
                    quickPick.placeholder = '搜索工作项编号或标题，或输入编号后回车查询';
                    vscode.window.showErrorMessage(`未找到编号 ${code} 的 ${taskType}。`);
                }
            }
            catch (error) {
                quickPick.busy = false;
                quickPick.placeholder = '搜索工作项编号或标题，或输入编号后回车查询';
                vscode.window.showErrorMessage(`查询失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
        quickPick.onDidHide(() => {
            if (!resolved) {
                resolve(undefined);
            }
            quickPick.dispose();
        });
        quickPick.show();
    });
    // @AI-End M7N8K 20260605 @@claudeCode
    if (!selectedTask) {
        return undefined;
    }
    // @AI-Begin J7K8L 20260518 @@cc
    let todayWorkHour;
    if (provider.fetchWorkHours) {
        const taskId = selectedTask.id || selectedTask.code;
        todayWorkHour = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在查询今日工时记录',
            cancellable: false
        }, async () => {
            const records = await provider.fetchWorkHours(taskId);
            const today = new Date().toISOString().split('T')[0];
            return records.find((r) => r.taskWorkhourDate === today);
        });
    }
    // @AI-End J7K8L 20260518 @@cc
    const commitTypePick = await vscode.window.showQuickPick(COMMIT_TYPES, {
        title: '选择 commit type',
        placeHolder: '必须以指定 type 开头',
        ignoreFocusOut: true
    });
    if (!commitTypePick) {
        return undefined;
    }
    const subject = await vscode.window.showInputBox({
        title: '输入提交说明 subject',
        prompt: buildSubjectPrompt(config, todayWorkHour),
        placeHolder: '修复xxxx缺陷',
        ignoreFocusOut: true,
        validateInput: validateSubject
    });
    if (subject === undefined) {
        return undefined;
    }
    // @AI-Begin N8M3K 20260521 @@cc
    let workHourTypeCode = '24';
    let workHourTypeName = '';
    if (provider.fetchWorkHourTypes) {
        const types = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在加载工时类型',
            cancellable: false
        }, () => cache.getWorkHourTypes(provider));
        if (types.length > 0) {
            const typePick = await vscode.window.showQuickPick(types.map((t) => ({ label: t.eleName, code: t.eleCode })), {
                title: '选择工时类型',
                placeHolder: '选择本次工时对应的类型',
                ignoreFocusOut: true
            });
            if (!typePick) {
                return undefined;
            }
            workHourTypeCode = typePick.code;
            workHourTypeName = typePick.label;
        }
    }
    // @AI-End N8M3K 20260521 @@cc
    // @AI-Begin J7K8L 20260518 @@cc
    const hoursPrompt = todayWorkHour
        ? `${formatTodayWorkHourHint(todayWorkHour)} ${WORK_HOUR_MODE_HINT[config.workHourMode]}\n${formatHoursReference(selectedTask)}`
        : `消耗工时。${WORK_HOUR_MODE_HINT[config.workHourMode]} ${formatHoursReference(selectedTask)}`;
    const hours = await vscode.window.showInputBox({
        title: '输入投入工时',
        prompt: hoursPrompt,
        placeHolder: '例如：2 或 1.5',
        ignoreFocusOut: true,
        validateInput: validateHours
    });
    // @AI-End J7K8L 20260518 @@cc
    if (hours === undefined) {
        return undefined;
    }
    const progress = await vscode.window.showInputBox({
        title: '输入任务完成度',
        prompt: `完成百分比。${PROGRESS_MODE_HINT[config.progressMode]} ${formatProgressReference(selectedTask)}。`,
        placeHolder: '0-100',
        ignoreFocusOut: true,
        validateInput: validateProgress
    });
    if (progress === undefined) {
        return undefined;
    }
    // @AI-Begin J7K8L 20260518 @@cc
    const metadata = {
        project: {
            code: selectedTask.projectCode,
            name: selectedTask.projectName || selectedTask.projectCode
        },
        task: selectedTask,
        commitType: commitTypePick.label,
        subject: subject.trim(),
        hours: normalizeNumber(hours),
        progress: normalizeNumber(progress),
        todayWorkHour,
        // @AI-Begin N8M3K 20260521 @@cc
        workHourTypeCode,
        // @AI-End N8M3K 20260521 @@cc
        workHourTypeName
    };
    // @AI-End J7K8L 20260518 @@cc
    const preview = (0, DevOpsCommitFormatter_1.formatDevOpsCommitMetadata)(config.commitTemplate, metadata);
    // @AI-Begin L5K7J 20260521 @@cc
    const confirmation = await vscode.window.showInformationMessage(`本次提交命令为：${preview}`, { modal: true }, '确认并推送', '复制');
    if (confirmation === '复制') {
        await vscode.env.clipboard.writeText(preview);
        vscode.window.showInformationMessage('已复制 commit message 到剪贴板。');
        return undefined;
    }
    return confirmation === '确认并推送' ? metadata : undefined;
    // @AI-End L5K7J 20260521 @@cc
}
function validateSubject(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return '请输入提交说明。';
    }
    if (trimmed.length < 5) {
        return '提交说明不能少于 5 个字。';
    }
    if (trimmed.length > 250) {
        return '提交说明不能超过 250 个字。';
    }
    if (/scrum\s+-e/i.test(trimmed)) {
        return 'subject 中不要手动输入 scrum -e，插件会自动生成。';
    }
    return undefined;
}
function validateHours(value) {
    const number = Number(value);
    if (!value.trim()) {
        return '请输入工时。';
    }
    if (!Number.isFinite(number) || number <= 0) {
        return '工时必须大于 0。';
    }
    return undefined;
}
function validateProgress(value) {
    const number = Number(value);
    if (!value.trim()) {
        return '请输入完成度。';
    }
    if (!Number.isInteger(number) || number < 0 || number > 100) {
        return '完成度必须是 0 到 100 之间的整数。';
    }
    return undefined;
}
function normalizeNumber(value) {
    return String(Number(value));
}
function formatTaskReference(task) {
    const parts = [
        task.estimatedHours ? `预计工时 ${task.estimatedHours}` : undefined,
        task.usedHours ? `已发生工时 ${task.usedHours}` : undefined,
        task.currentProgress ? `当前完成度 ${task.currentProgress}%` : undefined
    ].filter(Boolean);
    return parts.length ? `\n${parts.join('，')}` : '';
}
function formatHoursReference(task) {
    const parts = [
        task.estimatedHours ? `预计工时：${task.estimatedHours}` : undefined,
        task.usedHours ? `已发生工时：${task.usedHours}` : undefined
    ].filter(Boolean);
    return parts.length ? `\n参考：${parts.join('，')}。` : '';
}
function formatProgressReference(task) {
    return task.currentProgress ? `当前完成度：${task.currentProgress}%` : '';
}
// @AI-Begin J7K8L 20260518 @@cc
function formatTodayWorkHourHint(record) {
    return `今日已登记 ${record.spendTaskTime}h（${record.dayCompletion}）`;
}
function buildSubjectPrompt(config, todayWorkHour) {
    const base = `请输入本次提交的简短描述。${WORK_CONTENT_MODE_HINT[config.workContentMode]}`;
    if (!todayWorkHour) {
        return base;
    }
    return `${base}\n\n今日描述：\n${todayWorkHour.workContent}\n`;
}
async function collectOpsWorkHourRecord(provider, cache, originUrl, existingMapping, taskCreateMode) {
    const today = new Date().toISOString().split('T')[0];
    // ── Step 1: 输入任务标题 ──
    const taskName = await vscode.window.showInputBox({
        title: '运维工时补录 — 任务标题',
        prompt: '请输入任务标题（必填），建议包含地区名称以便自动匹配区域',
        placeHolder: '例如：北京xxxxxxxx',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value.trim()) {
                return '请输入任务标题。';
            }
            if (value.trim().length < 3) {
                return '标题不能少于 3 个字。';
            }
            if (value.trim().length > 200) {
                return '标题不能超过 200 个字。';
            }
            return undefined;
        }
    });
    if (!taskName) {
        return undefined;
    }
    // ── Step 2: 研发项目 + 所属产品 ──
    let devprojId;
    let devprojName;
    let prodId;
    let prodName;
    if (existingMapping) {
        // 已有映射：自动填入，让用户确认
        const useMapped = await vscode.window.showQuickPick([
            { label: `是，使用已关联项目`, description: `${existingMapping.devprojName} / ${existingMapping.prodName}`, value: true },
            { label: '否，重新选择', description: '手动选择研发项目和产品', value: false }
        ], { title: `当前仓库已关联: ${existingMapping.devprojName} → ${existingMapping.prodName}`, ignoreFocusOut: true });
        if (!useMapped) {
            return undefined;
        }
        if (useMapped.value) {
            devprojId = existingMapping.devprojId;
            devprojName = existingMapping.devprojName;
            prodId = existingMapping.prodId;
            prodName = existingMapping.prodName;
        }
        else {
            const picked = await pickDevProjectAndProduct(provider, cache);
            if (!picked) {
                return undefined;
            }
            devprojId = picked.devprojId;
            devprojName = picked.devprojName;
            prodId = picked.prodId;
            prodName = picked.prodName;
        }
    }
    else {
        const picked = await pickDevProjectAndProduct(provider, cache);
        if (!picked) {
            return undefined;
        }
        devprojId = picked.devprojId;
        devprojName = picked.devprojName;
        prodId = picked.prodId;
        prodName = picked.prodName;
    }
    // ── Step 2.5: 产品版本（级联产品）──
    let prodVersionId;
    try {
        const versions = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在加载产品版本', cancellable: false }, () => provider.fetchProductVersions(prodId));
        if (versions.length === 1) {
            prodVersionId = versions[0].id;
        }
        else if (versions.length > 1) {
            const verPick = await vscode.window.showQuickPick(versions.map((v) => ({ label: v.name, description: v.id, value: v.id })), { title: '选择产品版本', ignoreFocusOut: true });
            if (!verPick) {
                return undefined;
            }
            prodVersionId = verPick.value;
        }
    }
    catch { /* 版本查询失败不阻塞流程 */ }
    // ── Step 3: 区域（从标题模糊匹配）──
    const regions = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在加载区域列表', cancellable: false }, () => cache.getRegions(provider));
    let regionId;
    const matchedRegion = matchRegionFromTitle(taskName, regions);
    if (matchedRegion) {
        const confirm = await vscode.window.showQuickPick([
            { label: `是，使用 "${matchedRegion.regionName}"`, value: true },
            { label: '否，手动选择区域', value: false }
        ], { title: `任务标题自动匹配区域: ${matchedRegion.regionName}`, ignoreFocusOut: true });
        if (!confirm) {
            return undefined;
        }
        if (confirm.value) {
            regionId = matchedRegion.regionId;
        }
        else {
            const picked = await pickRegion(regions);
            if (!picked) {
                return undefined;
            }
            regionId = picked;
        }
    }
    else {
        const picked = await pickRegion(regions);
        if (!picked) {
            return undefined;
        }
        regionId = picked;
    }
    // ── Step 4: 实施项目（级联区域）──
    const opsProjects = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在加载实施项目', cancellable: false }, () => provider.fetchOpsProjectsByRegion(regionId));
    let opsprojId = '';
    if (opsProjects.length === 1) {
        opsprojId = opsProjects[0].opsprojId;
    }
    else if (opsProjects.length > 1) {
        const opsPick = await vscode.window.showQuickPick(opsProjects.map((o) => ({ label: o.opsprojCname, description: o.opsprojId, value: o.opsprojId })), { title: '选择实施项目', ignoreFocusOut: true });
        if (!opsPick) {
            return undefined;
        }
        opsprojId = opsPick.value;
    }
    else {
        vscode.window.showWarningMessage('该区域下没有关联的实施项目，任务将不会关联实施项目。');
    }
    // ── Step 5: 输入运维工时 ──
    const hours = await vscode.window.showInputBox({
        title: '运维工时补录 — 投入工时',
        prompt: '本次运维工作投入的工时（小时）',
        placeHolder: '例如：4 或 1.5',
        ignoreFocusOut: true,
        validateInput: (value) => {
            const n = Number(value);
            if (!value.trim()) {
                return '请输入工时。';
            }
            if (!Number.isFinite(n) || n <= 0) {
                return '工时必须大于 0。';
            }
            return undefined;
        }
    });
    if (!hours) {
        return undefined;
    }
    // ── Step 6: 选择工时类型 → 自动映射任务类型 ──
    let workHourTypeCode = '24';
    let workHourTypeName = '';
    let taskWorkItemCatalog = '3';
    if (provider.fetchWorkHourTypes) {
        const types = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在加载工时类型', cancellable: false }, () => cache.getWorkHourTypes(provider));
        if (types.length > 0) {
            const typePick = await vscode.window.showQuickPick(types.map((t) => {
                const mappedCatalog = DailyTaskFlow_1.WORK_HOUR_TO_TASK_CATALOG[t.eleCode];
                const mappedLabel = mappedCatalog ? ` → 任务类型=${mappedCatalog}` : '';
                return { label: t.eleName, description: mappedLabel, code: t.eleCode };
            }), { title: '选择工时类型（将自动映射任务类型）', ignoreFocusOut: true });
            if (!typePick) {
                return undefined;
            }
            workHourTypeCode = typePick.code;
            workHourTypeName = typePick.label;
            taskWorkItemCatalog = DailyTaskFlow_1.WORK_HOUR_TO_TASK_CATALOG[workHourTypeCode] ?? '3';
        }
    }
    // ── Step 7: 输入完成度 ──
    const progress = await vscode.window.showInputBox({
        title: '运维工时补录 — 任务完成度',
        prompt: '百分比 (0-100)，默认 100%',
        value: '100',
        ignoreFocusOut: true,
        validateInput: (value) => {
            const n = Number(value);
            if (!Number.isInteger(n) || n < 0 || n > 100) {
                return '必须是 0~100 的整数。';
            }
            return undefined;
        }
    });
    if (!progress) {
        return undefined;
    }
    // ── Step 7.5: 预计结束时间（完成度 < 100% 时）──
    // @AI-Begin G8H2I 20260723 @@claudeCode
    let expectedEndDate;
    let calculatedPlanTaskTime;
    if (Number(progress) < 100) {
        const dateResult = await vscode.window.showInputBox({
            title: '运维工时补录 — 预计结束时间',
            prompt: '任务未 100% 完成，请输入预计结束日期',
            placeHolder: `格式 YYYY-MM-DD，例如：${today}`,
            ignoreFocusOut: true,
            validateInput: (value) => {
                const trimmed = value.trim();
                if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                    return '日期格式不正确，请输入 YYYY-MM-DD。';
                }
                const inputDate = new Date(trimmed);
                if (isNaN(inputDate.getTime())) {
                    return '无效日期，请重新输入。';
                }
                if (trimmed < today) {
                    return '预计结束日期不能早于今天。';
                }
                return undefined;
            }
        });
        if (!dateResult) {
            return undefined;
        }
        expectedEndDate = dateResult.trim();
        // 计算预计工时：日历天数差（含头含尾）× 8h/天
        const startDate = new Date(today);
        const endDate = new Date(expectedEndDate);
        const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        calculatedPlanTaskTime = Math.max(diffDays, 1) * 8;
    }
    // @AI-End G8H2I 20260723 @@claudeCode
    // ── Step 8: 选择 commit type ──
    const COMMIT_TYPES = [
        { label: 'feat', description: '增加新功能' },
        { label: 'fix', description: '修复 bug' },
        { label: 'upd', description: '已有内容更新或修改' },
        { label: 'perf', description: '性能或体验优化' },
        { label: 'refactor', description: '代码重构' },
        { label: 'chore', description: '日常维护或杂务处理' },
        { label: 'doc', description: '文档改动' },
        { label: 'test', description: '增加或调整测试' },
        { label: 'style', description: '格式、空格、缩进等不影响含义的改动' },
        { label: 'build', description: '构建、发布、依赖调整' },
        { label: 'Merge', description: '合并操作' }
    ];
    const commitTypePick = await vscode.window.showQuickPick(COMMIT_TYPES, {
        title: '选择 commit type',
        placeHolder: '运维工时常选 upd',
        ignoreFocusOut: true
    });
    if (!commitTypePick) {
        return undefined;
    }
    // ── Step 9: 按模版收集 Task 内容 ──
    const templateResult = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在收集任务模版内容', cancellable: false }, async () => {
        const modeLabel = taskCreateMode === 'simple' ? '简易模式' : taskCreateMode === 'normal' ? '普通模式' : '标杆模式';
        vscode.window.showInformationMessage(`运维工时补录 — 当前模式: ${modeLabel}`);
        return (0, TaskTemplateFlow_1.collectTaskTemplateContent)(taskCreateMode);
    });
    if (!templateResult) {
        return undefined;
    }
    const { taskRemark, taskDesc } = templateResult;
    // ── 构建输入 ──
    const taskInput = {
        taskName: taskName.trim(),
        devprojId,
        prodId,
        regionId,
        opsprojId,
        executeUser: await provider.getUserId(),
        importance: '1',
        priority: '2',
        workSource: '3',
        planTaskTime: calculatedPlanTaskTime ?? Number(hours),
        planStartTime: today,
        planEndTime: expectedEndDate ?? today,
        ecDate: expectedEndDate ?? today,
        taskRemark,
        prodVersionId,
        taskWorkItemCatalog
    };
    // ── 确认页 ──
    const regionName = regions.find((r) => r.regionId === regionId)?.regionName ?? regionId;
    const opsName = opsProjects.find((o) => o.opsprojId === opsprojId)?.opsprojCname ?? '';
    const summary = [
        `任务标题: ${taskInput.taskName}`,
        `研发项目: ${devprojName}`,
        `所属产品: ${prodName}`,
        `区域: ${regionName}${matchedRegion ? ' (自动匹配)' : ''}`,
        opsprojId ? `实施项目: ${opsName}` : '',
        `处理人: 当前用户 (auto)`,
        `任务类型: ${taskWorkItemCatalog}（由工时类型 "${workHourTypeName}" 自动映射）`,
        `优先级: 中 (default) / 工作来源: 常规需求 (default)`,
        `投入工时: ${taskInput.planTaskTime}h / 完成度: ${progress}%`,
        expectedEndDate ? `预计结束: ${expectedEndDate}（${calculatedPlanTaskTime}h = ${Math.round((new Date(expectedEndDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)) + 1} 天 × 8h）` : '',
        `Commit: ${commitTypePick.label}:${taskInput.taskName}`,
        `日期: ${today} (default)`,
        taskRemark ? `\n任务内容:\n（已按 ${taskCreateMode === 'simple' ? '简易' : taskCreateMode === 'normal' ? '普通' : '标杆'}模式填写）` : ''
    ].filter(Boolean).join('\n');
    const confirmation = await vscode.window.showInformationMessage(`确认创建运维任务并提交？\n\n${summary}`, { modal: true }, '确认创建并提交');
    if (confirmation !== '确认创建并提交') {
        return undefined;
    }
    return {
        taskInput,
        commitType: commitTypePick.label,
        hours: normalizeNumber(hours),
        progress: normalizeNumber(progress),
        workHourTypeCode,
        workHourTypeName,
        devprojName,
        prodName,
        taskDesc
    };
}
// ── 辅助函数 ──
/** 从标题模糊匹配区域，按名称长度降序匹配 */
function matchRegionFromTitle(title, regions) {
    const sorted = [...regions]
        .filter((r) => r.regionName && r.regionName.length > 1)
        .sort((a, b) => b.regionName.length - a.regionName.length);
    for (const r of sorted) {
        if (title.includes(r.regionName)) {
            return r;
        }
    }
    return undefined;
}
/** 弹出区域选择框 */
async function pickRegion(regions) {
    if (regions.length === 0) {
        vscode.window.showWarningMessage('没有可用的区域。');
        return undefined;
    }
    const pick = await vscode.window.showQuickPick(regions.map((r) => ({ label: r.regionName, description: r.regionId, value: r.regionId })), { title: '选择区域', ignoreFocusOut: true });
    return pick?.value;
}
/** 选择研发项目 → 级联选择产品 */
async function pickDevProjectAndProduct(provider, cache) {
    const devProjects = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在加载研发项目', cancellable: false }, () => cache.getDevProjects(provider));
    if (devProjects.length === 0) {
        vscode.window.showWarningMessage('没有可用的研发项目。');
        return undefined;
    }
    const devPick = await vscode.window.showQuickPick(devProjects.map((p) => ({ label: p.devprojCname, description: p.devprojId, value: p.devprojId })), { title: '选择研发项目', ignoreFocusOut: true });
    if (!devPick) {
        return undefined;
    }
    const products = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在加载产品列表', cancellable: false }, () => provider.fetchProductsByProject(devPick.value));
    if (products.length === 0) {
        vscode.window.showWarningMessage('该研发项目下没有可用的产品。');
        return undefined;
    }
    const prodPick = await vscode.window.showQuickPick(products.map((p) => ({ label: p.prodCname, description: p.prodId, value: p.prodId })), { title: '选择所属产品', ignoreFocusOut: true });
    if (!prodPick) {
        return undefined;
    }
    return {
        devprojId: devPick.value,
        devprojName: devPick.label,
        prodId: prodPick.value,
        prodName: prodPick.label
    };
}
// @AI-End C6D9E 20260720 @@claudeCode
// @AI-Begin R2S5T 20260519 @@cc
function groupByProduct(tasks) {
    const map = new Map();
    for (const task of tasks) {
        const key = task.projectName || task.projectCode;
        const group = map.get(key);
        if (group) {
            group.push(task);
        }
        else {
            map.set(key, [task]);
        }
    }
    return map;
}
// @AI-End R2S5T 20260519 @@cc
//# sourceMappingURL=QuickPickFlow.js.map