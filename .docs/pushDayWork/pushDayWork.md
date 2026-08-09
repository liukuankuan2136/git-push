# pushDayWork — 日报提交命令设计

## 概述

新增命令 `issueLinkPush.pushDayWork`，允许用户在 VS Code 中一键提交 DevOps 日报。

> 分析基于 HAR 抓包文件: `scripts/devops.ctjsoft.com.har` (2026-08-09 日报提交流程)

---

## 日报提交流程涉及的 API

| # | 方法 | 端点 | 用途 | 调用时机 |
|---|------|------|------|----------|
| 1 | GET | `/devopsReportNew/query/loadReportMechanismToUsers` | 获取主送/抄送用户列表 | 页面加载 |
| 2 | GET | `/devopsReportNew/query/loadReportNoMechanismToUsers` | 获取未配置汇报机制的用户 | 页面加载 |
| 3 | GET | `/devopsReportNew/query/loadVendorOrgUsers` | 获取供应商组织用户 | 页面加载 |
| 4 | GET | `/devopsReportNew/query/checkOverdueTask` | 检查是否有逾期任务 | 页面加载 |
| 5 | GET | `/commonDraft/query/loadDraftContent` | 加载草稿内容 | 页面加载 |
| 6 | GET | `/devopsReportNew/query/loadTodayWork` | 拉取今日工时汇总（树形结构） | 核心 |
| 7 | GET | `/devopsReportNew/query/loadTomorrowWork` | 拉取昨日日报填写的"明日计划"作为预填 | 核心 |
| 8 | GET | `/devopsReportNew/query/checkTodayWorkHourEnough` | 检查今日工时是否 >= 8h | 提交前检查 |
| 9 | POST | `/devopsReportNew/add` | 提交日报 | 核心 |
| 10 | POST | `/commonDraft/delete` | 提交成功后删除草稿 | 提交后 |

---

## 关键接口详细分析

### 1. loadTodayWork（拉取今日工时）

**请求**:
```
GET /devops-server/config/devopsReportNew/query/loadTodayWork?userId={userId}&reportDate=2026-08-09
Headers:
  user-context: {"userId":"...","pageId":"wlrFlaF"}
  cookie: {session}
```

**响应结构** (树形，包含工时分类):
```json
{
  "status_code": "0000",
  "data": [
    {"children": [], "id": "sumTime", "text": "当日工时合计：1.0h"},
    {"id": "planIn", "text": "计划内"},
    {
      "children": [
        {
          "children": [
            {
              "spendTaskTime": 1.0,
              "completion": "69%",
              "taskNo": "26061522",
              "id": "2410763130164930",
              "text": "AI智能体工程分析",
              "taskId": "10763130164930"
            }
          ],
          "id": "24",
          "text": "代码编写"
        }
      ],
      "id": "planOut",
      "text": "计划外"
    }
  ]
}
```

**关键字段**:
- `sumTime.text`: 今日工时合计，如 `"当日工时合计：1.0h"`
- `planIn` / `planOut`: 计划内/计划外分类
- 每个叶子节点: `spendTaskTime`(工时), `completion`(完成度), `taskNo`(编号), `text`(任务名), `taskId`

### 2. loadTomorrowWork（拉取明日计划）

**请求**:
```
GET /devops-server/config/devopsReportNew/query/loadTomorrowWork?userId={userId}
```

**响应**: data 直接是 HTML 字符串（来自昨日日报的 nextPlan 字段）:
```html
<ol>
  <li>【25111509】【1.0.2】【报销审核】打印查验结果...，计划0.0时</li>
  <li>【25115725】凭证同步，计划2.0时</li>
  ...
</ol>
```

### 3. checkTodayWorkHourEnough（工时检查）

**请求**:
```
GET /devops-server/config/devopsReportNew/query/checkTodayWorkHourEnough?userId={userId}&reportDate=2026-08-09
```

**响应**:
```json
{"status_code":"0000","data":"1.0"}
```
`data` 为字符串形式的工时总和（单位：小时）。

### 4. add（提交日报）— POST

**请求**:
```
POST /devops-server/config/devopsReportNew/add
Content-Type: application/json
user-context: {"userId":"...","pageId":"wlrFlaF"}
cookie: {session}
```

**Body 结构**:
```json
{
  "nextPlan": "<ol><li>...明日计划 HTML...</li></ol>",
  "nowWork": "<p style=\"font-size:14px;font-weight: bold\">当日工时合计：X.Xh</p><p style=\"font-size:14px;font-weight: bold\">计划内：</p>...",
  "otherMatters": "<p><br></p>",
  "reportType": "1",
  "toUserIds": [],
  "createUser": "1684453404467208194",
  "reportDate": "2026-08-09",
  "fileIds": []
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `nextPlan` | string (HTML) | 明日计划，`<ol><li>...</li></ol>` 格式 |
| `nowWork` | string (HTML) | 今日工作内容，带内联样式 |
| `otherMatters` | string (HTML) | 其他事项，`<p><br></p>` 即空 |
| `reportType` | string | 固定 `"1"` = 日报 |
| `toUserIds` | string[] | 抄送用户 ID 列表 |
| `createUser` | string | 当前用户 ID |
| `reportDate` | string | 日期 `YYYY-MM-DD` |
| `fileIds` | string[] | 附件 ID，默认为 `[]` |

**nowWork HTML 格式规范**（从 web 端提交的抓包分析）:
```html
<p style="font-size:14px;font-weight: bold">当日工时合计：1.0h</p>
<p style="font-size:14px;font-weight: bold">计划内：</p>
<p>无</p>
<p style="font-size:14px;font-weight: bold">计划外：</p>
<p style="font-size:14px">【代码编写】</p>
<p style="text-indent:8px;font-size:14px">1、<a href="/devops-web4/linkIframe/HNm7jHP?detailId=10763130164930" rel="noopener noreferrer" target="_blank">26061522</a>  AI智能体工程分析，69%，1</p>
```

**响应**: `{"status_code":"0000","reason":"保存成功"}`

### 5. checkOverdueTask（逾期任务检查）

**响应**:
```json
{
  "data": {
    "overdueTotal": 2,
    "overdueTitle": "截至当前您有2条工作项已超期。",
    "taskList": [...]
  }
}
```

### 6. loadReportMechanismToUsers（汇报对象）

**响应**:
```json
{"data":{"main":["王巍"],"copy":["雷瑞恒"]}}
```

---

## 设计决策

### 命令 ID 与标题

| 项 | 值 |
|----|-----|
| 命令 ID | `issueLinkPush.pushDayWork` |
| 标题 | 提交日报 |
| 菜单分类 | Issue Link Push |

### 交互流程

```
┌──────────────────────────────────────┐
│ 1. 验证登录态（无 git 依赖）          │
│    → testConnection()                │
├──────────────────────────────────────┤
│ 2. 并行拉取数据                       │
│    → loadTodayWork (今日工时)          │
│    → loadTomorrowWork (明日计划预填)    │
│    → checkTodayWorkHourEnough (工时检查)│
│    → checkOverdueTask (逾期任务检查)    │
│    → loadReportMechanismToUsers (汇报对象)│
├──────────────────────────────────────┤
│ 3. 前置检查                           │
│    ✓ 逾期任务提醒（> 0 时展示）         │
│    ✓ 工时不足提醒（< 8h 时警告但允许继续）│
├──────────────────────────────────────┤
│ 4. QuickPick 确认                     │
│    Step A: 展示今日工时摘要 + 编辑明日计划│
│    Step B: 输入其他事项（可选）          │
│    Step C: 最终确认（预览完整内容）       │
├──────────────────────────────────────┤
│ 5. 提交                               │
│    → POST /devopsReportNew/add        │
│    → 成功后删除草稿                     │
├──────────────────────────────────────┤
│ 6. 结果展示                           │
│    → 成功: "日报已提交"                │
│    → 失败: 展示错误原因                 │
└──────────────────────────────────────┘
```

### 关于 8 小时工时要求

**结论**: 8小时是**建议性约束**，服务端 `add` 接口**不做硬性校验**。

根据 HAR 抓包记录，当日工时仅 1.0h 的情况下，`add` 接口仍然返回 `"保存成功"`。`checkTodayWorkHourEnough` 接口只是返回工时数值，由 web 前端决定是否拦截。

**我们的策略**: 工时不足 8h 时发出**警告提示**，但**允许用户继续提交**。

### 不依赖 Git 上下文

日报提交是纯 DevOps API 操作，不涉及 git commit/push。因此该命令：
- 不需要检查 git 仓库
- 不需要 staged changes
- 不需要 upstream 配置

这与现有命令（都需要 git 上下文）有本质区别。在设计上，相当于现有的 `regionCheck` 命令模式（纯 API 操作，无 git 操作）。

---

## 数据模型

```typescript
/** 今日工时叶子节点（一条工时记录） */
export interface TodayWorkItem {
  spendTaskTime: number;
  completion: string;
  taskNo: string;
  taskId: string;
  text: string;       // 任务标题
}

/** 今日工时分组节点 */
export interface TodayWorkGroup {
  id: string;          // 分组 ID（如 "planIn", "planOut", 或工时类型 code）
  text: string;        // 分组显示名（如 "计划内", "计划外", "代码编写"）
  children?: TodayWorkGroup[];
  items?: TodayWorkItem[];
}

/** 今日工时汇总（解析后的结构化数据） */
export interface TodayWorkSummary {
  totalHours: number;          // 工时合计（小时）
  totalHoursText: string;      // 原始文本（如 "当日工时合计：7.5h"）
  planIn: TodayWorkGroup[];    // 计划内分组
  planOut: TodayWorkGroup[];   // 计划外分组
}

/** 日报提交输入 */
export interface DailyReportInput {
  nowWork: string;       // 今日工作 HTML
  nextPlan: string;      // 明日计划 HTML
  otherMatters: string;  // 其他事项 HTML（默认 "<p><br></p>"）
  reportDate: string;    // YYYY-MM-DD
  toUserIds: string[];   // 抄送用户 ID
}

/** 日报提交收集结果 */
export interface PushDayWorkResult {
  summary: TodayWorkSummary;
  tomorrowPlan: string;
  otherMatters: string;
}
```

---

## 限制与待确认项

### 当前已知限制

1. **nowWork HTML 格式依赖**: `add` 接口的 `nowWork` 字段需要 HTML 格式。当前通过 web 端抓包得知了格式规范，但如果服务端对格式有校验（如必须包含特定 class 或结构），可能需要调整。

2. **工时合计计算的精度**: `checkTodayWorkHourEnough` 返回字符串如 `"1.0"`，`loadTodayWork` 的 sumTime 格式为 `"当日工时合计：1.0h"`，需要解析数字。需要处理精度（浮点）。

3. **日报日期**: 目前按 `new Date()` 本地时间计算当天日期。如果用户在跨日临界点操作，可能存在时区问题（服务端用 `Asia/Shanghai`）。

4. **重复提交**: HAR 中没有覆盖"重复提交同一天日报"的场景。服务端可能返回错误，插件需要捕捉并友好展示。

5. **草稿功能**: web 端支持草稿保存/恢复，v1 版本不实现草稿功能（用户编辑的明日计划在提交失败时可能丢失）。

6. **附件上传**: v1 版本不支持 `fileIds`（始终传 `[]`）。

7. **toUserIds（抄送人）**: v1 版本默认使用 `loadReportMechanismToUsers` 返回的 copy 列表，用户不可手动编辑。后续版本可扩展为选择器。

### 待确认项

1. **页面验证后的 nowWork HTML**: web 端提交的 nowWork 是经过页面 JS 组装后的 HTML，包含内联样式和 `<a>` 链接。需要确认服务端是否对 HTML 结构有校验要求。

2. **日报类型**: `reportType` 固定为 `"1"`（日报）。是否有周报（`"2"`）等其他类型？可以先只支持日报。

3. **已提交日报的读取和编辑**: `loadReports` + `loadReportById` 可以查询已有日报。后续可扩展支持"查看今日日报"或"修改今日日报"功能。

---

## 实现优先级

| 优先级 | 功能点 | 说明 |
|--------|--------|------|
| P0 | 拉取今日工时 + 工时检查 | 核心前置步骤 |
| P0 | 拉取明日计划预填 | 核心体验 |
| P0 | QuickPick 确认 + InputBox 编辑 | 核心交互 |
| P0 | 提交日报 | 核心功能 |
| P1 | 逾期任务检查 | 增强提醒 |
| P1 | 工时不足 8h 警告 | 增强提醒 |
| P2 | 草稿自动保存/恢复 | 体验优化 |
| P2 | 支持编辑抄送人 | 功能完整 |
| P3 | 查看/修改已有日报 | 扩展功能 |
