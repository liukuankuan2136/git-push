// @AI-Begin T1U2V 20260721 @@claudeCode
import * as vscode from 'vscode';

// ── Template section definitions (from 02-task.md) ──

/** Mode: simple=仅任务描述, normal=任务描述+验收标准, benchmark=逐章节完整填写 */
export type TaskCreateMode = 'simple' | 'normal' | 'benchmark';

interface TaskTemplateSection {
  id: string;
  title: string;
  /** 展示在输入框 prompt 中的简短说明 */
  prompt: string;
  /** 来自模版注释的默认内容；用户回车跳过时使用 */
  defaultContent: string;
  /** 是否要求用户必须输入非空内容（仅在 simple/normal 模式对任务描述生效） */
  required: boolean;
}

const SECTIONS: TaskTemplateSection[] = [
  {
    id: 'prevTask',
    title: '前置任务',
    prompt: '输入前置任务编号或描述，回车跳过使用默认值',
    defaultContent: '上一任务，非必须，便于了解整个需求的全部任务，条理性清晰。',
    required: false
  },
  {
    id: 'taskDesc',
    title: '任务描述',
    prompt: '请输入任务明细、目标',
    defaultContent: '任务明细、目标。',
    required: true
  },
  {
    id: 'devDir',
    title: '开发目录',
    prompt: '输入 SVN 路径、package、class、method，回车跳过使用默认值',
    defaultContent: 'SVN 路径、package、class、method，非必须。',
    required: false
  },
  {
    id: 'svnPath',
    title: '一、SVN 路径',
    prompt: '输入 SVN 服务包路径，回车跳过使用默认值',
    defaultContent: '指定到对应的 SVN 服务包路径。',
    required: false
  },
  {
    id: 'dbChanges',
    title: '二、数据库修改',
    prompt: '输入数据库修改内容，回车跳过使用默认值',
    defaultContent: '根据实际情况修改。',
    required: false
  },
  {
    id: 'uiOverview',
    title: '三、前端修改 — 1. 整体界面情况',
    prompt: '描述按钮、列表、查询区情况，按钮需要指定在哪个状态显示，回车跳过使用默认值',
    defaultContent: '描述按钮、列表、查询区情况，按钮需要指定在哪个状态显示。',
    required: false
  },
  {
    id: 'featureDev',
    title: '三、前端修改 — 2. 功能开发',
    prompt: '描述涉及的功能页面，回车跳过使用默认值',
    defaultContent: '涉及功能页面。',
    required: false
  },
  {
    id: 'backendChanges',
    title: '四、服务端修改',
    prompt: '描述后端服务设计，回车跳过使用默认值',
    defaultContent: '设计后端服务。',
    required: false
  },
  {
    id: 'configChanges',
    title: '五、配置修改',
    prompt: '描述修改的配置（如字段映射等），回车跳过使用默认值',
    defaultContent: '描述修改的配置，如字段映射等。',
    required: false
  },
  {
    id: 'acceptCriteria',
    title: '六、验收标准',
    prompt: '输入验收标准，回车跳过',
    defaultContent: '',
    required: false
  },
  {
    id: 'impactScope',
    title: '七、影响范围（需要测试的功能）',
    prompt: '输入影响范围，回车跳过',
    defaultContent: '',
    required: false
  }
];

// ── Mode → sections-to-prompt mapping ──

const MODE_SECTIONS: Record<TaskCreateMode, string[]> = {
  simple: ['taskDesc'],
  normal: ['taskDesc', 'acceptCriteria'],
  benchmark: [
    'prevTask', 'taskDesc', 'devDir',
    'svnPath', 'dbChanges', 'uiOverview',
    'featureDev', 'backendChanges', 'configChanges',
    'acceptCriteria', 'impactScope'
  ]
};

// ── Helpers ──

function getSectionById(id: string): TaskTemplateSection | undefined {
  return SECTIONS.find((s) => s.id === id);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 将收集到的各章节内容组装为 HTML 格式的 taskRemark */
function buildTaskRemarkHtml(collected: Record<string, string>): string {
  // 按模版顺序组装
  const ordered: { id: string; tag: string; label: string }[] = [
    { id: 'prevTask', tag: 'h2', label: '前置任务' },
    { id: 'taskDesc', tag: 'h2', label: '任务描述' },
    { id: 'devDir', tag: 'h2', label: '开发目录' },
    { id: 'svnPath', tag: 'h2', label: '一、SVN 路径' },
    { id: 'dbChanges', tag: 'h2', label: '二、数据库修改' },
    { id: 'uiOverview', tag: 'h3', label: '1. 整体界面情况' },
    { id: 'featureDev', tag: 'h3', label: '2. 功能开发' },
    { id: 'backendChanges', tag: 'h2', label: '四、服务端修改' },
    { id: 'configChanges', tag: 'h2', label: '五、配置修改' },
    { id: 'acceptCriteria', tag: 'h2', label: '六、验收标准' },
    { id: 'impactScope', tag: 'h2', label: '七、影响范围（需要测试的功能）' }
  ];

  let html = '';
  let frontendSectionOpened = false;

  for (const item of ordered) {
    const content = collected[item.id];
    if (content === undefined) {
      continue;
    }

    // 跳过空内容章节
    if (!content.trim()) {
      continue;
    }

    if (item.id === 'uiOverview') {
      // 打开"三、前端修改"章节
      html += '<h2>三、前端修改</h2>';
      frontendSectionOpened = true;
    }

    if (item.id === 'featureDev' && !frontendSectionOpened) {
      // 防御：如果跳过 uiOverview 但 featureDev 有内容，补上章节标题
      html += '<h2>三、前端修改</h2>';
      frontendSectionOpened = true;
    }

    html += `<${item.tag}>${item.label}</${item.tag}><p>${escapeHtml(content)}</p>`;
  }

  return html;
}

// ── Public API ──

/** collectTaskTemplateContent 的返回值 */
export interface TaskTemplateResult {
  /** 组装好的 taskRemark HTML 字符串（所有章节），用于创建 Task */
  taskRemark: string;
  /** 任务描述纯文本，用于工时登记的 workContent */
  taskDesc: string;
}

/**
 * 按指定模式收集 Task 模版各章节内容。
 * @param mode 任务内容填写模式
 * @returns 包含 taskRemark（完整HTML）和 taskDesc（任务描述文本）的结果；用户取消任意步骤时返回 undefined
 */
export async function collectTaskTemplateContent(
  mode: TaskCreateMode
): Promise<TaskTemplateResult | undefined> {
  const sectionIds = MODE_SECTIONS[mode];
  const collected: Record<string, string> = {};

  for (const sectionId of sectionIds) {
    const section = getSectionById(sectionId);
    if (!section) {
      continue;
    }

    const isBenchmark = mode === 'benchmark';
    // 非标杆模式下的任务描述 → 必须输入
    const enforceRequired = section.required && !isBenchmark;

    const result = await vscode.window.showInputBox({
      title: isBenchmark
        ? `运维工时补录 — ${section.title}`
        : `运维工时补录 — 任务内容`,
      prompt: isBenchmark ? section.prompt : buildSimplePrompt(section),
      placeHolder: section.defaultContent || undefined,
      ignoreFocusOut: true,
      validateInput: enforceRequired
        ? (value) => {
            if (!value.trim()) {
              return section.id === 'taskDesc'
                ? '请输入任务描述。'
                : '此项不能为空。';
            }
            if (section.id === 'taskDesc' && value.trim().length < 20) {
              return `至少需要 20 个字，当前 ${value.trim().length} 字。`;
            }
            return undefined;
          }
        : undefined
    });

    // 用户取消 (Esc)
    if (result === undefined) {
      return undefined;
    }

    const trimmed = result.trim();
    if (trimmed) {
      collected[sectionId] = trimmed;
    } else if (section.defaultContent) {
      collected[sectionId] = section.defaultContent;
    }
    // 如果用户输入为空且无默认值 → 不写入 collected（后续 build 中跳过空内容）
  }

  // 未提示的章节 → 使用默认值
  for (const section of SECTIONS) {
    if (!(section.id in collected) && section.defaultContent) {
      collected[section.id] = section.defaultContent;
    }
  }

  return {
    taskRemark: buildTaskRemarkHtml(collected),
    taskDesc: collected['taskDesc'] || ''
  };
}

/** 简易/普通模式下的 prompt 文本 */
function buildSimplePrompt(section: TaskTemplateSection): string {
  if (section.id === 'taskDesc') {
    return '请输入任务描述（必填）';
  }
  if (section.id === 'acceptCriteria') {
    return '请输入验收标准（选填，回车跳过）';
  }
  return section.prompt;
}
// @AI-End T1U2V 20260721 @@claudeCode
