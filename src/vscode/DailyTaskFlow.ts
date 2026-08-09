// @AI-Begin D8E9F 20260809 @@claudeCode
import * as vscode from 'vscode';
import { DevOpsCache } from '../core/DevOpsCache';
import { CreateTaskInput, DevOpsProvider } from '../core/DevOpsProvider';
import { TaskCreateMode } from './TaskTemplateFlow';
import { collectTaskTemplateContent } from './TaskTemplateFlow';
import { matchRegionFromTitle, pickRegion, pickDevProjectAndProduct } from './QuickPickFlow';
import { WorkspaceProductMapping } from './WorkspaceMapping';

/**
 * 日常任务登记流程收集的结果。
 */
export interface DailyTaskInput {
  taskInput: CreateTaskInput;
  hours: string;
  progress: string;
  workHourTypeCode: string;
  workHourTypeName: string;
  devprojName: string;
  prodName: string;
  /** 任务描述纯文本，用于工时登记的 workContent */
  taskDesc: string;
  /** 由工时类型映射得出的任务类型 */
  taskWorkItemCatalog: string;
}

/**
 * 工时类型 eleCode → 任务类型 eleCode 映射表。
 * 来源：用户提供的工时类型字典与任务类型对照。
 */
export const WORK_HOUR_TO_TASK_CATALOG: Record<string, string> = {
  '24': '3',  // 代码编写 → 编码工作
  '47': '23', // 代码编写（AI） → 编码工作（AI）
  '35': '3',  // 数据库/脚本整理 → 编码工作
  '5': '12',  // 单元/内部测试 → 测试工作
  '13': '3',  // bug修改 → 编码工作
  '48': '3',  // bug修改（AI） → 编码工作
  '3': '2',   // 文档编写 → 文档编写
  '11': '5',  // 技术评审 → 技术评审
  '37': '10', // 代码检查 → 代码检查
  '36': '1',  // 售前支持 → 需求工作
  '38': '4',  // 项目支持（研发） → 研发支持
  '4': '12',  // 测试支持（研发） → 测试工作
  '39': '1',  // 需求调研 → 需求工作
  '26': '1',  // 需求分析 → 需求工作
  '45': '1',  // 需求变更 → 需求工作
  '46': '1',  // 需求细化 → 需求工作
  '42': '1',  // 需求设计 → 需求工作
  '40': '1',  // 需求验证 → 需求工作
  '41': '1',  // 需求跟踪 → 需求工作
  '17': '7',  // 日常管理 → 管理工作
  '43': '2',  // 事务性工作 → 文档编写
  '12': '6',  // 学习培训 → 其他工作
  '18': '7',  // 会议 → 管理工作
  '27': '3',  // 测试设计 → 编码工作
  '28': '12', // 系统测试 → 测试工作
  '32': '12', // 环境搭建 → 测试工作
  '29': '12', // 用例编写 → 测试工作
  '50': '29', // 测试工作（AI） → 测试工作（AI）
  '31': '13', // 项目支持（测试） → 测试支持
  '61': '31', // 系统测试设计 → 系统测试
  '62': '31', // 系统测试用例设计 → 系统测试
  '63': '31', // 系统测试脚本开发 → 系统测试
  '64': '31', // 系统测试环境搭建 → 系统测试
  '65': '31', // 系统接收测试 → 系统测试
  '66': '31', // 系统测试执行 → 系统测试
  '67': '31', // 系统测试报告编写 → 系统测试
  '71': '32', // 性能测试设计 → 性能测试
  '72': '32', // 性能测试脚本开发 → 性能测试
  '73': '32', // 性能测试环境搭建 → 性能测试
  '74': '32', // 性能测试执行 → 性能测试
  '75': '32', // 性能瓶颈分析 → 性能测试
  '76': '32', // 性能测试报告编写 → 性能测试
  '81': '33', // 安全测试设计 → 安全测试
  '82': '33', // 安全漏洞扫描配置 → 安全测试
  '83': '33', // 人工渗透测试 → 安全测试
  '84': '33', // 漏洞复现与定级 → 安全测试
  '85': '2',  // 安全测试报告编写 → 文档编写
  '33': '14', // 质量保证（QA） → 质量工作
  '34': '15', // 配置管理（CM） → 配置工作
  '44': '4',  // 项目支持（产品） → 研发支持
  '49': '26', // 产品工作（AI） → 产品工作（AI）
  '51': '30', // 项目实施 → 实施工作
};

/** 映射未命中时的 fallback 值 */
const DEFAULT_TASK_WORK_ITEM_CATALOG = '3';

/**
 * 日常任务登记命令的完整交互流程。
 * @returns 收集的用户输入；undefined 表示用户取消。
 */
export async function collectDailyTaskInput(
  provider: DevOpsProvider,
  cache: DevOpsCache,
  workspacePath: string,
  existingMapping: WorkspaceProductMapping | undefined,
  taskCreateMode: TaskCreateMode
): Promise<DailyTaskInput | undefined> {
  const today = new Date().toISOString().split('T')[0];

  // ── Step 1: 输入任务标题 ──
  const taskName = await vscode.window.showInputBox({
    title: '日常任务登记 — 任务标题',
    prompt: '请输入任务标题（必填），建议包含地区名称以便自动匹配区域',
    placeHolder: '例如：北京xxxxxxxx',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value.trim()) { return '请输入任务标题。'; }
      if (value.trim().length < 3) { return '标题不能少于 3 个字。'; }
      if (value.trim().length > 200) { return '标题不能超过 200 个字。'; }
      return undefined;
    }
  });
  if (!taskName) { return undefined; }

  // ── Step 2: 研发项目 + 所属产品 ──
  let devprojId: string;
  let devprojName: string;
  let prodId: string;
  let prodName: string;

  if (existingMapping) {
    const useMapped = await vscode.window.showQuickPick(
      [
        { label: `是，使用已关联项目`, description: `${existingMapping.devprojName} / ${existingMapping.prodName}`, value: true as const },
        { label: '否，重新选择', description: '手动选择研发项目和产品', value: false as const }
      ],
      { title: `当前工作区已关联: ${existingMapping.devprojName} → ${existingMapping.prodName}`, ignoreFocusOut: true }
    );
    if (!useMapped) { return undefined; }
    if (useMapped.value) {
      devprojId = existingMapping.devprojId;
      devprojName = existingMapping.devprojName;
      prodId = existingMapping.prodId;
      prodName = existingMapping.prodName;
    } else {
      const picked = await pickDevProjectAndProduct(provider, cache);
      if (!picked) { return undefined; }
      devprojId = picked.devprojId;
      devprojName = picked.devprojName;
      prodId = picked.prodId;
      prodName = picked.prodName;
    }
  } else {
    const picked = await pickDevProjectAndProduct(provider, cache);
    if (!picked) { return undefined; }
    devprojId = picked.devprojId;
    devprojName = picked.devprojName;
    prodId = picked.prodId;
    prodName = picked.prodName;
  }

  // ── Step 3: 产品版本（级联产品）──
  let prodVersionId: string | undefined;
  if (provider.fetchProductVersions) {
    try {
      const versions = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '正在加载产品版本', cancellable: false },
        () => provider.fetchProductVersions!(prodId)
      );
      if (versions.length === 1) {
        prodVersionId = versions[0].id;
      } else if (versions.length > 1) {
        const verPick = await vscode.window.showQuickPick(
          versions.map((v) => ({ label: v.name, description: v.id, value: v.id })),
          { title: '选择产品版本', ignoreFocusOut: true }
        );
        if (!verPick) { return undefined; }
        prodVersionId = verPick.value;
      }
    } catch { /* 版本查询失败不阻塞流程 */ }
  }

  // ── Step 4: 区域（从标题模糊匹配）──
  let regionId: string;
  const regions = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: '正在加载区域列表', cancellable: false },
    () => cache.getRegions(provider)
  );

  const matchedRegion = matchRegionFromTitle(taskName, regions);

  if (matchedRegion) {
    const confirm = await vscode.window.showQuickPick(
      [
        { label: `是，使用 "${matchedRegion.regionName}"`, value: true as const },
        { label: '否，手动选择区域', value: false as const }
      ],
      { title: `任务标题自动匹配区域: ${matchedRegion.regionName}`, ignoreFocusOut: true }
    );
    if (!confirm) { return undefined; }
    if (confirm.value) {
      regionId = matchedRegion.regionId;
    } else {
      const picked = await pickRegion(regions);
      if (!picked) { return undefined; }
      regionId = picked;
    }
  } else {
    const picked = await pickRegion(regions);
    if (!picked) { return undefined; }
    regionId = picked;
  }

  // ── Step 5: 实施项目（级联区域）──
  let opsprojId = '';
  if (provider.fetchOpsProjectsByRegion) {
    const opsProjects = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '正在加载实施项目', cancellable: false },
      () => provider.fetchOpsProjectsByRegion!(regionId)
    );
    if (opsProjects.length === 1) {
      opsprojId = opsProjects[0].opsprojId;
    } else if (opsProjects.length > 1) {
      const opsPick = await vscode.window.showQuickPick(
        opsProjects.map((o) => ({ label: o.opsprojCname, description: o.opsprojId, value: o.opsprojId })),
        { title: '选择实施项目', ignoreFocusOut: true }
      );
      if (!opsPick) { return undefined; }
      opsprojId = opsPick.value;
    } else {
      vscode.window.showWarningMessage('该区域下没有关联的实施项目，任务将不会关联实施项目。');
    }
  }

  // ── Step 6: 选择工时类型 → 自动映射任务类型 ──
  let workHourTypeCode = '24';
  let workHourTypeName = '';
  let taskWorkItemCatalog = DEFAULT_TASK_WORK_ITEM_CATALOG;

  if (provider.fetchWorkHourTypes) {
    const types = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '正在加载工时类型', cancellable: false },
      () => cache.getWorkHourTypes(provider)
    );
    if (types.length > 0) {
      const typePick = await vscode.window.showQuickPick(
        types.map((t) => {
          const mappedCatalog = WORK_HOUR_TO_TASK_CATALOG[t.eleCode];
          const mappedLabel = mappedCatalog ? ` → 任务类型=${mappedCatalog}` : '';
          return { label: t.eleName, description: mappedLabel, code: t.eleCode };
        }),
        { title: '选择工时类型（将自动映射任务类型）', ignoreFocusOut: true }
      );
      if (!typePick) { return undefined; }
      workHourTypeCode = typePick.code;
      workHourTypeName = typePick.label;

      // 自动映射
      taskWorkItemCatalog = WORK_HOUR_TO_TASK_CATALOG[workHourTypeCode] ?? DEFAULT_TASK_WORK_ITEM_CATALOG;
    }
  }

  // ── Step 7: 输入运维工时 ──
  const hours = await vscode.window.showInputBox({
    title: '日常任务登记 — 投入工时',
    prompt: '本次工作投入的工时（小时）',
    placeHolder: '例如：4 或 1.5',
    ignoreFocusOut: true,
    validateInput: (value) => {
      const n = Number(value);
      if (!value.trim()) { return '请输入工时。'; }
      if (!Number.isFinite(n) || n <= 0) { return '工时必须大于 0。'; }
      return undefined;
    }
  });
  if (!hours) { return undefined; }

  // ── Step 8: 输入完成度 ──
  const progress = await vscode.window.showInputBox({
    title: '日常任务登记 — 任务完成度',
    prompt: '百分比 (0-100)，默认 100%',
    value: '100',
    ignoreFocusOut: true,
    validateInput: (value) => {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 100) { return '必须是 0~100 的整数。'; }
      return undefined;
    }
  });
  if (!progress) { return undefined; }

  // ── Step 9: 预计结束时间（完成度 < 100% 时）──
  let expectedEndDate: string | undefined;
  let calculatedPlanTaskTime: number | undefined;
  if (Number(progress) < 100) {
    const dateResult = await vscode.window.showInputBox({
      title: '日常任务登记 — 预计结束时间',
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
    if (!dateResult) { return undefined; }
    expectedEndDate = dateResult.trim();
    const startDate = new Date(today);
    const endDate = new Date(expectedEndDate);
    const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    calculatedPlanTaskTime = Math.max(diffDays, 1) * 8;
  }

  // ── Step 10: 按模版收集 Task 内容 ──
  const templateResult = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: '正在收集任务模版内容', cancellable: false },
    async () => {
      const modeLabel = taskCreateMode === 'simple' ? '简易模式' : taskCreateMode === 'normal' ? '普通模式' : '标杆模式';
      vscode.window.showInformationMessage(`日常任务登记 — 当前模式: ${modeLabel}`);
      return collectTaskTemplateContent(taskCreateMode);
    }
  );
  if (!templateResult) { return undefined; }

  const { taskRemark, taskDesc } = templateResult;

  // ── 构建输入 ──
  const taskInput: CreateTaskInput = {
    taskName: taskName.trim(),
    devprojId,
    prodId,
    regionId,
    opsprojId,
    executeUser: await provider.getUserId!(),
    // Web UI 默认值（来自 HAR 录制）
    importance: '1',
    priority: '2',
    workSource: '3',
    planTaskTime: calculatedPlanTaskTime ?? Number(hours),
    planStartTime: today,
    planEndTime: expectedEndDate ?? today,
    ecDate: expectedEndDate ?? today,
    taskRemark,
    prodVersionId,
    taskWorkItemCatalog,
  };

  // ── 确认页 ──
  const regionName = regions.find((r) => r.regionId === regionId)?.regionName ?? regionId;
  const regionNote = matchedRegion ? ' (自动匹配)' : '';
  const summary = [
    `任务标题: ${taskInput.taskName}`,
    `研发项目: ${devprojName}`,
    `所属产品: ${prodName}`,
    `区域: ${regionName}${regionNote}`,
    opsprojId ? `实施项目: ${opsprojId}` : '',
    `任务类型: ${taskWorkItemCatalog}（由工时类型 "${workHourTypeName}" 自动映射）`,
    `处理人: 当前用户 (auto)`,
    `投入工时: ${taskInput.planTaskTime}h / 完成度: ${progress}%`,
    expectedEndDate ? `预计结束: ${expectedEndDate}` : '',
    `日期: ${today}`,
    taskRemark ? `\n任务内容:\n（已按 ${taskCreateMode === 'simple' ? '简易' : taskCreateMode === 'normal' ? '普通' : '标杆'}模式填写）` : ''
  ].filter(Boolean).join('\n');

  const confirmation = await vscode.window.showInformationMessage(
    `确认创建日常任务？\n\n${summary}`,
    { modal: true },
    '确认创建'
  );

  if (confirmation !== '确认创建') { return undefined; }

  return {
    taskInput,
    hours: normalizeNumber(hours),
    progress: normalizeNumber(progress),
    workHourTypeCode,
    workHourTypeName,
    devprojName,
    prodName,
    taskDesc,
    taskWorkItemCatalog,
  };
}

function normalizeNumber(value: string): string {
  return String(Number(value));
}
// @AI-End D8E9F 20260809 @@claudeCode
