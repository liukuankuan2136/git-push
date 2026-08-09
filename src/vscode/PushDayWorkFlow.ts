// @AI-Begin K1L2M 20260809 @@claudeCode
import * as vscode from 'vscode';
import { DevOpsProvider, TodayWorkSummary } from '../core/DevOpsProvider';

/**
 * 日报提交流程收集的结果。
 */
export interface PushDayWorkResult {
  nowWorkHtml: string;
  nextPlan: string;
  otherMatters: string;
  reportDate: string;
  toUserIds: string[];
}

/**
 * 日报提交命令的完整交互流程。
 * @param log 调试日志函数，非 debug 模式传入空函数即可
 * 返回 undefined 表示用户取消。
 */
export async function collectPushDayWork(
  provider: DevOpsProvider,
  log: (msg: string) => void
): Promise<PushDayWorkResult | undefined> {
  // ── 能力检查 ──
  if (!provider.fetchTodayWork || !provider.fetchTomorrowPlan
      || !provider.submitDailyReport || !provider.checkTodayWorkHourEnough) {
    vscode.window.showErrorMessage('当前 DevOps 提供者不支持日报提交所需的功能。');
    return undefined;
  }

  const reportDate = normalizeReportDate();
  log(`[pushDayWork] reportDate: ${reportDate}`);

  // ── 并行拉取数据 ──
  let summary: TodayWorkSummary;
  let tomorrowPlan: string;
  let hourCheck: string;
  let overdueResult: { total: number; title: string } | undefined;

  try {
    const results = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '正在拉取今日工时...', cancellable: false },
      async () => {
        return Promise.all([
          provider.fetchTodayWork!(reportDate),
          provider.fetchTomorrowPlan!(),
          provider.checkTodayWorkHourEnough!(reportDate),
          provider.checkOverdueTasks ? provider.checkOverdueTasks() : Promise.resolve(undefined)
        ]);
      }
    );
    summary = results[0];
    tomorrowPlan = results[1];
    hourCheck = results[2];
    overdueResult = results[3];
  } catch (error) {
    vscode.window.showErrorMessage(`拉取日报数据失败: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }

  log(`[pushDayWork] todayWork totalHours: ${summary.totalHours}h, hourCheck: ${hourCheck}`);
  log(`[pushDayWork] tomorrowPlan length: ${tomorrowPlan.length}`);

  // ── 前置检查 ──
  // 工时不足 8h 警告（允许继续，不阻断）
  const hourNumber = parseFloat(hourCheck);
  if (!Number.isNaN(hourNumber) && hourNumber < 8) {
    const action = await vscode.window.showWarningMessage(
      `今日工时 ${hourCheck}h，不足 8 小时，确定提交日报吗？`,
      { modal: false },
      '确认提交',
      '取消'
    );
    if (action !== '确认提交') { return undefined; }
  }

  // ── Step 1: 展示摘要 + 编辑明日计划 ──
  const summaryText = formatSummaryText(summary);
  log(`[pushDayWork] summary:\n${summaryText}`);

  const nextPlanResult = await vscode.window.showInputBox({
    title: '日报 — 编辑明日计划',
    prompt: `今日工时合计：${summary.totalHours}h。请编辑明日计划（可留空跳过）：`,
    value: tomorrowPlan || '',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (value.length > 5000) {
        return '明日计划内容过长，请精简至 5000 字以内。';
      }
      return undefined;
    }
  });
  if (nextPlanResult === undefined) { return undefined; }

  // ── Step 2: 其他事项（可选） ──
  const otherMattersResult = await vscode.window.showInputBox({
    title: '日报 — 其他事项（可选）',
    prompt: '请输入其他事项，可留空：',
    placeHolder: '如：请假、培训、会议等',
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (value.length > 2000) {
        return '内容过长，请精简至 2000 字以内。';
      }
      return undefined;
    }
  });
  if (otherMattersResult === undefined) { return undefined; }

  // ── Step 3: 生成 nowWork HTML ──
  const nowWorkHtml = buildNowWorkHtml(summary);

  // ── Step 4: 最终确认 ──
  const nextPlanDisplay = nextPlanResult.trim() || '（空）';
  const otherMattersDisplay = otherMattersResult.trim() || '（空）';
  const overdueHint = overdueResult && overdueResult.total > 0
    ? `\n⚠️ ${overdueResult.title}\n`
    : '';

  const confirmText = [
    `📅 日期: ${reportDate}`,
    `⏱ 工时: ${summary.totalHours}h`,
    ``,
    `📅 明日计划:`,
    `${nextPlanDisplay.slice(0, 300)}${nextPlanDisplay.length > 300 ? '...' : ''}`,
    ``,
    `📝 其他事项: ${otherMattersDisplay.slice(0, 100)}${otherMattersDisplay.length > 100 ? '...' : ''}`,
    overdueHint,
    `确认提交日报？`
  ].filter(Boolean).join('\n');

  const confirmed = await vscode.window.showInformationMessage(
    confirmText,
    { modal: true },
    '确认提交'
  );

  if (confirmed !== '确认提交') { return undefined; }

  return {
    nowWorkHtml,
    nextPlan: nextPlanResult.trim() || '<p><br></p>',
    otherMatters: otherMattersResult.trim()
      ? `<p>${otherMattersResult.trim()}</p>`
      : '<p><br></p>',
    reportDate,
    toUserIds: []
  };
}

/**
 * 将 loadTodayWork 的树形数据格式化为可读文本，供摘要展示。
 */
function formatSummaryText(summary: TodayWorkSummary): string {
  const lines: string[] = [];
  lines.push(summary.totalHoursText);

  const rawTree = summary.rawTree;
  const planIn = rawTree.find((n) => (n as { id?: string })?.id === 'planIn') as { children?: unknown[]; text?: string } | undefined;
  const planOut = rawTree.find((n) => (n as { id?: string })?.id === 'planOut') as { children?: unknown[]; text?: string } | undefined;

  for (const [label, node] of [['计划内', planIn], ['计划外', planOut]] as const) {
    if (!node) { continue; }
    lines.push(`${label}：`);
    for (const group of (node.children ?? [])) {
      const g = group as { text?: string; children?: unknown[] };
      lines.push(`  【${g.text ?? ''}】`);
      for (const item of (g.children ?? [])) {
        const i = item as { text?: string; spendTaskTime?: number; completion?: string; taskNo?: string; children?: { text: string }[] };
        lines.push(`    ${i.taskNo ?? ''} ${i.text ?? ''}，${i.spendTaskTime ?? 0}h，${i.completion ?? '0%'}`);
        for (const detail of (i.children ?? [])) {
          lines.push(`      ${detail.text ?? ''}`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * 将 loadTodayWork 的树形数据生成为 nowWork HTML（匹配 web 端格式）。
 */
function buildNowWorkHtml(summary: TodayWorkSummary): string {
  const parts: string[] = [];
  parts.push(`<p style="font-size:14px;font-weight: bold">${summary.totalHoursText}</p>`);

  const rawTree = summary.rawTree;
  const planIn = rawTree.find((n) => (n as { id?: string })?.id === 'planIn') as { children?: unknown[]; text?: string } | undefined;
  const planOut = rawTree.find((n) => (n as { id?: string })?.id === 'planOut') as { children?: unknown[]; text?: string } | undefined;

  for (const [label, node] of [['计划内', planIn], ['计划外', planOut]] as const) {
    parts.push(`<p style="font-size:14px;font-weight: bold">${label}：</p>`);
    if (!node || !node.children || node.children.length === 0) {
      parts.push('<p>无</p>');
      continue;
    }
    for (const group of node.children) {
      const g = group as { text?: string; children?: unknown[] };
      parts.push(`<p style="font-size:14px">【${g.text ?? ''}】</p>`);
      let idx = 1;
      for (const item of (g.children ?? [])) {
        const i = item as { text?: string; spendTaskTime?: number; completion?: string; taskNo?: string; taskId?: string; children?: { text: string }[] };
        const completion = i.completion ?? '0%';
        const time = i.spendTaskTime ?? 0;
        const taskId = i.taskId ?? '';
        const detailUrl = taskId ? `/devops-web4/linkIframe/HNm7jHP?detailId=${taskId}` : '#';
        parts.push(
          `<p style="text-indent:8px;font-size:14px">${idx}、` +
          `<a href="${detailUrl}" rel="noopener noreferrer" target="_blank">${i.taskNo ?? ''}</a>` +
          `  ${i.text ?? ''}，${completion}，${time}</p>`
        );
        for (const detail of (i.children ?? [])) {
          parts.push(`<p style="text-indent:16px;font-size:14px;color:#666">${detail.text ?? ''}</p>`);
        }
        idx++;
      }
    }
  }

  return parts.join('');
}

/**
 * 获取 Asia/Shanghai 时区的当天日期字符串 (yyyy-MM-dd)。
 */
function normalizeReportDate(): string {
  const now = new Date();
  // 使用 toLocaleDateString 保证时区为 Asia/Shanghai
  const parts = now.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('/');
  return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
}
// @AI-End K1L2M 20260809 @@claudeCode
