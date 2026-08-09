# pushDayWork — 开发方案

> 基于设计文档 [pushDayWork.md](./pushDayWork.md)，本文档聚焦于实现层面的技术方案、文件变更清单、以及现有代码的复用分析。

---

## 一、文件变更清单

| # | 文件 | 操作 | 变更量 | 说明 |
|---|------|------|--------|------|
| 1 | `src/core/DevOpsProvider.ts` | **修改** | +~50 行 | 新增 5 个接口方法 + 4 个数据接口 |
| 2 | `src/core/providers/CompanyDevOpsAdapter.ts` | **修改** | +~120 行 | 实现日报 API 调用 + 新增 pageId 常量 |
| 3 | `src/vscode/PushDayWorkFlow.ts` | **新增** | +~250 行 | 日报提交流程编排（QuickPick + API） |
| 4 | `src/extension.ts` | **修改** | +~90 行 | 注册命令 `issueLinkPush.pushDayWork` + `runPushDayWork()` |
| 5 | `package.json` | **修改** | +~15 行 | 声明命令 contributes |

---

## 二、现有代码复用分析

### 2.1 可直接复用（无需修改）

#### A. `fetchJson<T>()` — `src/core/http.ts`

```typescript
export async function fetchJson<T>(
  provider: string,
  url: string,
  options: HttpRequestOptions
): Promise<T>
```

**推荐理由**:
- 日报所有 API 调用都是标准 HTTP JSON 请求，与现有的 `fetchProjects`、`fetchWorkHours`、`addWorkHour` 等方法使用完全相同的模式
- 已内置超时控制（`AbortController`）、错误映射（`ProviderError`）、非标准 JSON 解析回退（`Function()` 构造器）
- 日报 API 的 `loadTodayWork` 等接口返回标准 JSON，无 IIFE 格式，但 `parseResponsePayload` 的回退机制提供额外安全性

**使用方式**: 直接在 Adapter 新方法中调用，与现有方法完全一致

---

#### B. `parseResponsePayload<T>()` — `src/core/http.ts`

**推荐理由**:
- 与 `fetchJson` 配套使用，已经过充分测试
- 日报 API 的响应格式是标准 `{"status_code":"0000","data":...}` JSON，但有了回退机制可以防止意外格式变更

---

#### C. `DevOpsCache` — `src/core/DevOpsCache.ts`

```typescript
export class DevOpsCache {
  constructor(private readonly ttlMs: number) {}
  async getProjects(provider): Promise<DevOpsProject[]>
  async getTasks(provider, type): Promise<DevOpsTask[]>
  async getWorkHourTypes(provider): Promise<WorkHourType[]>
  // ...
}
```

**推荐理由**:
- 设计上已支持 TTL 缓存模式，项目中所有 API 调用都经过它
- 日报流程虽然不需要缓存工时数据（每日变化），但保持统一入口是最佳实践
- `extension.ts` 的命令注册模式已经固定为 `const config = await configManager.load(); cache ??= new DevOpsCache(...)`

**使用方式**: 日报命令注册沿用此模式，但日报数据不走缓存（`loadTodayWork` 按日期变化，缓存无意义）。`DevOpsCache` 在日报命令中仅作为工厂模式的一部分传入，日报相关的 Adapter 方法直接调用不走 cache wrapper。

---

#### D. `createProvider()` — `src/vscode/providerFactory.ts`

```typescript
export function createProvider(config: ExtensionConfig): DevOpsProvider {
  // 检查 username/password
  // 检查 commitTemplate
  // 返回 new CompanyDevOpsAdapter({ username, password, timeoutMs, log })
}
```

**推荐理由**:
- 统一的 Provider 工厂，封装了凭据检查、commitTemplate 校验、debug log 注入
- 日报命令同样需要 `CompanyDevOpsAdapter`，不同的是可以跳过 `commitTemplate` 校验（日报不涉及 commit）

**使用方式**: 日报命令可以直接 `new CompanyDevOpsAdapter({...})` 跳过 commitTemplate 校验，或者修改 `createProvider` 增加可选参数。**推荐直接 new Adapter**，与 `runRegionCheck` (extension.ts:300-306) 的做法一致。

---

#### E. `ConfigManager` — `src/vscode/ConfigManager.ts`

```typescript
export class ConfigManager {
  async load(): Promise<ExtensionConfig>
  async initializeDevOpsAccount(): Promise<void>
}
```

**推荐理由**:
- 日报命令需要 `username`、`password`、`requestTimeoutMs` 三个配置项，`ExtensionConfig` 已全部包含
- 无需新增配置键
- `load()` 从 VS Code 配置和 SecretStorage 读取凭据

**使用方式**: 与现有命令完全相同

---

#### F. `outputChannel` — `src/vscode/providerFactory.ts`

```typescript
export const outputChannel = vscode.window.createOutputChannel('Issue Link Push');
```

**推荐理由**:
- 全局共享的输出通道，所有命令共用
- `runRegionCheck` 已示范如何通过 Adapter 的 `log` 参数注入 debug 日志
- 日报命令需要在提交前后记录关键信息

**使用方式**: 与 `runRegionCheck` 一致 — 创建 Adapter 时传 `{ log: (msg) => outputChannel.appendLine(msg) }`

---

#### G. `ProviderError` — `src/core/AppError.ts`

**推荐理由**:
- 统一的异常类型，包含 provider 名称和 HTTP 状态码
- `fetchJson` 和 `CompanyDevOpsAdapter` 已广泛使用
- 命令层只写一个 try-catch 即可统一处理所有 API 错误

---

### 2.2 可复用的代码模式（无需修改代码，直接参照）

#### H. Session/Cookie 认证模式 — `CompanyDevOpsAdapter.getSession()`

**来源**: [CompanyDevOpsAdapter.ts:895-973](../src/core/providers/CompanyDevOpsAdapter.ts#L895)

```typescript
private async getSession(): Promise<DevOpsSession> {
  if (this.session) { return this.session; }
  // POST /login as FormData
  // parse cookie from Set-Cookie headers
  // find userId from response body
  // store and return { cookie, userId }
}
```

**推荐理由**:
- `getSession()` 是私有方法，已内置懒加载 + 缓存
- 所有 Adapter 方法通过 `const session = await this.getSession()` 一行获取认证态
- 日报新增的方法只需调用 `this.getSession()`，无需任何额外代码

**在新方法中的使用**:
```typescript
async fetchTodayWork(reportDate: string): Promise<TodayWorkSummary> {
  const session = await this.getSession();  // ← 复用现有私有方法
  // ...
}
```

---

#### I. API Header 组装模式

**来源**: 所有 Adapter 方法，如 [addWorkHour()](../src/core/providers/CompanyDevOpsAdapter.ts#L520)

**GET 请求模式**:
```typescript
const url = new URL(`${DEVOPS_BASE_URL}/devops-server/...`);
url.searchParams.set('userId', session.userId);
const response = await fetchJson<T>(this.name, url.toString(), {
  timeoutMs: this.options.timeoutMs,
  headers: {
    cookie: session.cookie,
    'user-context': JSON.stringify({ userId: session.userId, pageId: DEVOPS_PAGE_ID })
  }
});
```

**POST 请求模式**:
```typescript
const response = await fetchJson<T>(this.name, `${DEVOPS_BASE_URL}/...`, {
  method: 'POST',
  timeoutMs: this.options.timeoutMs,
  headers: {
    'content-type': 'application/json',
    cookie: session.cookie,
    origin: DEVOPS_BASE_URL,
    'user-context': JSON.stringify({ userId: session.userId, pageId: DEVOPS_PAGE_ID })
  },
  body: JSON.stringify(payload)
});
```

**推荐理由**:
- 这是整个项目的核心网络调用范式，所有 API 调用遵循同一模式
- 日报 API 的 7 个调用（5 个 GET + 1 个 POST + 1 个 POST 删除草稿）全部遵循此模式
- 唯一区别是日报专用 `pageId = 'wlrFlaF'`（见下文变动）

---

#### J. QuickPick 交互流程模式 — `RegionCheckFlow.ts`

**来源**: [RegionCheckFlow.ts](../src/vscode/RegionCheckFlow.ts)

```typescript
export async function collectRegionCheckReport(
  provider: DevOpsProvider,
  cache: DevOpsCache,
  outputChannel: vscode.OutputChannel
): Promise<TaskCheckResult[] | undefined> {
  // Step 1: 能力检查
  if (!provider.fetchDevProjects || !provider.fetchProductsByProject ...) { ... }

  // Step 2-N: 级联 QuickPick
  const devPick = await vscode.window.showQuickPick(...);
  if (!devPick) { return undefined; }

  // 最后: 返回结果或 undefined（用户取消）
}
```

**推荐理由**:
- `RegionCheckFlow` 是最近的实现（2026-08-07），结构清晰，且与日报命令高度相似：
  - 都不依赖 git
  - 都是纯 API 调用 + QuickPick 交互
  - 都有 `provider` + `cache` + `outputChannel` 参数
  - 都返回 `undefined` 表示用户取消
  - 都使用 `ignoreFocusOut: true` 防止误关闭
- PushDayWorkFlow 可以直接参照其文件结构、导入语句、函数签名

---

#### K. 确认 Modal 模式 — `QuickPickFlow.ts`

**来源**: [QuickPickFlow.ts:290-296](../src/vscode/QuickPickFlow.ts#L290)

```typescript
const confirmation = await vscode.window.showInformationMessage(
  `本次提交命令为：${preview}`,
  { modal: true },
  '确认并推送',
  '复制'
);
```

**推荐理由**:
- 日报提交前需要最终确认，与 commit message 确认场景完全相同
- Modal 弹窗强制用户做出选择后才继续

---

#### L. Progress 通知模式 — 全项目通用

```typescript
await vscode.window.withProgress(
  { location: vscode.ProgressLocation.Notification, title: '...', cancellable: false },
  async () => { /* API 调用 */ }
);
```

**推荐理由**:
- 为每个网络操作提供视觉反馈
- 日报命令在拉取数据阶段和提交阶段分别使用

---

### 2.3 需要修改后复用

#### M. `DevOpsProvider` 接口 — `src/core/DevOpsProvider.ts`

**需要修改**: 新增 5 个可选方法 + 4 个数据接口

**为什么需要修改而不是新建**:
1. 这是项目的核心抽象接口，所有 Provider 实现必须实现它
2. 日报功能属于 DevOps 业务范畴，放在此接口中语义正确
3. 所有新方法都是 `?` 可选方法，保持向后兼容，不影响现有功能
4. 新增的类型定义（`TodayWorkSummary` 等）本质上是 DevOps 数据模型的扩展，放在此文件中与其他类型（`DevOpsTask`、`WorkHourRecord`）保持一致

**新增内容**:
```typescript
// 4 个数据接口（见设计文档数据模型章节）
export interface TodayWorkItem { ... }
export interface TodayWorkGroup { ... }
export interface TodayWorkSummary { ... }
export interface DailyReportInput { ... }

// 5 个可选方法（添加到 DevOpsProvider 接口中）
export interface DevOpsProvider {
  // ... 现有方法 ...

  fetchTodayWork?(reportDate: string): Promise<TodayWorkSummary>;
  fetchTomorrowPlan?(): Promise<string>;
  checkTodayWorkHourEnough?(reportDate: string): Promise<string>;
  checkOverdueTasks?(): Promise<{ total: number; title: string }>;
  submitDailyReport?(input: DailyReportInput): Promise<void>;
}
```

---

#### N. `CompanyDevOpsAdapter` — `src/core/providers/CompanyDevOpsAdapter.ts`

**需要修改**: 新增 1 个 pageId 常量 + 5 个方法实现

**为什么需要修改而不是新建**:
1. 这是 `DevOpsProvider` 的**唯一**实现类，新增接口方法必须在此实现
2. 日报 API 与现有 API 共享同一 base URL、同一认证机制（`getSession()`）、同一 HTTP 客户端（`fetchJson()`）
3. 如果创建新 Adapter，会导致：认证逻辑重复（session 管理 + cookie 提取）、HTTP 调用代码重复、两个 Adapter 的 session 不共享导致重复登录
4. 现有的 `getSession()`、`fetchJson()`、header 组装逻辑全部复用，只需聚焦于 API 调用和响应解析

**新增常量**:
```typescript
const DEVOPS_DAILY_PAGE_ID = 'wlrFlaF';  // 日报专用 pageId
```

**为什么需要新 pageId**: 日报模块在 DevOps 中是一个独立的页面模块，使用 `pageId=wlrFlaF`。现有的 `DEVOPS_PAGE_ID = 'h7BdNkJ'` 用于 Task/Bug 管理，`DEVOPS_DEV_TASK_PAGE_ID = 'AbY8d4R'` 用于研发任务创建。使用错误的 pageId 可能导致服务端权限校验失败。

---

#### N-1. `fetchTodayWork()` 实现要点

```typescript
async fetchTodayWork(reportDate: string): Promise<TodayWorkSummary> {
  const session = await this.getSession();  // 复用 getSession()
  const log = this.options.log ?? (() => {});

  const url = new URL(
    `${DEVOPS_BASE_URL}/devops-server/config/devopsReportNew/query/loadTodayWork`
  );
  url.searchParams.set('userId', session.userId);
  url.searchParams.set('reportDate', reportDate);

  // 复用 fetchJson() + 标准 header 模式
  const response = await fetchJson<{ data?: unknown[] }>(
    this.name, url.toString(), {
      timeoutMs: this.options.timeoutMs,
      headers: {
        cookie: session.cookie,
        'user-context': JSON.stringify({
          userId: session.userId,
          pageId: DEVOPS_DAILY_PAGE_ID  // 日报专用 pageId
        })
      }
    }
  );

  // 解析树形结构为 TodayWorkSummary
  return parseTodayWorkTree(response.data ?? []);
}
```

**复用清单**:
- `this.getSession()` — 认证
- `fetchJson()` — HTTP 请求
- `this.options.timeoutMs` — 超时配置
- `this.options.log` — 调试日志
- `DEVOPS_BASE_URL` — 基础 URL
- header 组装模式 — cookie + user-context

---

#### N-2. `submitDailyReport()` 实现要点

```typescript
async submitDailyReport(input: DailyReportInput): Promise<void> {
  const session = await this.getSession();  // 复用
  const log = this.options.log ?? (() => {});

  const payload = {
    ...input,
    reportType: '1',
    createUser: session.userId,
    fileIds: []
  };

  log(`[submitDailyReport] payload size: ${JSON.stringify(payload).length}`);

  // 复用 POST 请求模式（与 addWorkHour 完全相同）
  const response = await fetchJson<{ status_code?: string; reason?: string }>(
    this.name,
    `${DEVOPS_BASE_URL}/devops-server/config/devopsReportNew/add`,
    {
      method: 'POST',
      timeoutMs: this.options.timeoutMs,
      headers: {
        'content-type': 'application/json',
        cookie: session.cookie,
        origin: DEVOPS_BASE_URL,
        'user-context': JSON.stringify({
          userId: session.userId,
          pageId: DEVOPS_DAILY_PAGE_ID
        })
      },
      body: JSON.stringify(payload)
    }
  );

  // 复用 status_code 检查模式（与 addWorkHour 完全相同）
  if (response.status_code !== '0000') {
    throw new ProviderError(
      response.reason ?? '提交日报失败',
      undefined,
      this.name
    );
  }
}
```

**与 `addWorkHour()` 的相似度**: 结构完全一致，只是 URL 和 payload 不同。

---

#### O. `extension.ts` — `src/extension.ts`

**需要修改**: 新增命令注册 + `runPushDayWork()` 函数

**为什么需要修改而不是新建入口文件**:
1. `extension.ts` 是 VS Code 的约定入口（`package.json` 的 `main` 指向 `dist/extension.js`），所有命令必须在此注册
2. 命令注册模式已经固定：注入 `configManager`→ 创建 `cache`→ 调用 `runXxx()`
3. 新增命令只需 3 行注册 + 一个函数

**注册代码**（放在 `activate()` 内，与其他命令并列）:
```typescript
vscode.commands.registerCommand('issueLinkPush.pushDayWork', async () => {
  const config = await configManager.load();
  cache ??= new DevOpsCache(config.cacheTtlMs);
  await runPushDayWork(config);
});
```

**为什么参照 `runRegionCheck` 而不是 `runOpsWorkHourRecord`**:
- `runRegionCheck` 不需要 git，日报也不需要 — 结构更接近
- `runOpsWorkHourRecord` 需要 git staging + commit + push — 多了大量无关逻辑
- `runRegionCheck` 直接在函数内 `new CompanyDevOpsAdapter(...)` 并开启 log — 日报同理

---

#### P. `package.json`

**需要修改**: 在 `contributes.commands` 数组中新增命令声明

```json
{
  "command": "issueLinkPush.pushDayWork",
  "title": "提交日报"
}
```

**为什么需要修改**: VS Code 要求在 `package.json` 中声明所有命令。这是必须的配置变更。

---

### 2.4 全新代码

#### Q. `PushDayWorkFlow.ts` — `src/vscode/PushDayWorkFlow.ts`（新增）

**为什么新建**: 日报的交互流程在现有代码中没有对应物。最接近的是 `RegionCheckFlow.ts`（纯 API + QuickPick，无 git），但业务逻辑完全不同。

**结构设计**（参照 `RegionCheckFlow.ts`）:
```typescript
// 导出一个主函数，返回 undefined 表示用户取消
export async function collectPushDayWork(
  provider: DevOpsProvider,
  outputChannel: vscode.OutputChannel
): Promise<PushDayWorkResult | undefined> {

  // ── Step 1: 能力检查 ──
  if (!provider.fetchTodayWork || !provider.fetchTomorrowPlan
      || !provider.submitDailyReport || !provider.checkTodayWorkHourEnough) {
    vscode.window.showErrorMessage('...');
    return undefined;
  }

  // ── Step 2: 并行拉取数据 ──
  const reportDate = new Date().toISOString().split('T')[0];
  const [summary, tomorrowPlan, hourCheck, overdueResult] =
    await Promise.all([
      provider.fetchTodayWork(reportDate),
      provider.fetchTomorrowPlan(),
      provider.checkTodayWorkHourEnough(reportDate),
      provider.checkOverdueTasks?.()
    ]);

  // ── Step 3: 前置检查 ──
  // 工时不足 8h 警告
  // 逾期任务提醒

  // ── Step 4: 编辑明日计划 ──
  const nextPlan = await vscode.window.showInputBox({
    title: '编辑明日计划',
    value: tomorrowPlan,
    // ...
  });
  if (nextPlan === undefined) { return undefined; }

  // ── Step 5: 其他事项 ──
  const otherMatters = await vscode.window.showInputBox({ ... });

  // ── Step 6: 最终确认 ──
  const confirmed = await vscode.window.showInformationMessage(
    previewSummary, { modal: true }, '确认提交'
  );

  return { summary, tomorrowPlan: nextPlan, otherMatters };
}
```

---

## 三、复用关系总览图

```
┌─────────────────────────────────────────────────────────────┐
│                     新增/变更代码                             │
├─────────────────────────────────────────────────────────────┤
│  extension.ts ──新增──▶ runPushDayWork()                    │
│      │                                                      │
│      ├──复用──▶ ConfigManager.load()  (凭据+配置)            │
│      ├──复用──▶ DevOpsCache         (缓存实例)               │
│      └──调用──▶ collectPushDayWork()                        │
│                      │                                      │
│  PushDayWorkFlow.ts (NEW) ──参照──▶ RegionCheckFlow.ts     │
│      │                           (文件结构、函数签名)         │
│      ├──复用──▶ vscode.window.showQuickPick    (选择器)     │
│      ├──复用──▶ vscode.window.showInputBox     (输入框)     │
│      ├──复用──▶ vscode.window.showInformationMessage (确认) │
│      ├──复用──▶ vscode.window.withProgress      (加载)     │
│      └──调用──▶ provider.fetchTodayWork() etc.              │
│                      │                                      │
│  DevOpsProvider.ts ──新增──▶ 5 个接口 + 4 个数据模型         │
│      │                                                      │
│  CompanyDevOpsAdapter.ts ──新增──▶ 5 个方法实现              │
│      │                                                      │
│      ├──复用──▶ getSession()          (私有，已存在)          │
│      ├──复用──▶ fetchJson<T>()        (http.ts)             │
│      ├──复用──▶ parseResponsePayload()(http.ts)             │
│      ├──复用──▶ ProviderError         (AppError.ts)         │
│      ├──复用──▶ DEVOPS_BASE_URL       (常量)                │
│      ├──复用──▶ header 组装模式        (cookie+user-context) │
│      └──新增──▶ DEVOPS_DAILY_PAGE_ID  ('wlrFlaF')           │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、新增代码与复用代码行数估算

| 类别 | 文件 | 新增行 | 其中复用行（间接计入） |
|------|------|--------|------------------------|
| 数据模型 | `DevOpsProvider.ts` | ~50 | 0（纯接口和类型定义） |
| API 实现 | `CompanyDevOpsAdapter.ts` | ~120 | ~60（getSession/fetchJson/header 模式） |
| 交互流程 | `PushDayWorkFlow.ts` | ~250 | ~50（QuickPick/InputBox/withProgress 模式） |
| 命令注册 | `extension.ts` | ~90 | ~30（注册/factory/log 模式） |
| 命令声明 | `package.json` | ~15 | 0 |
| **合计** | | **~525** | **~140（~27%）** |

**解释**: "复用行"是指不需要重新发明、直接参照现有模式即可完成的部分。比如 API Header 的组装代码虽然是新写的，但逻辑完全照搬现有代码，风险极低。

---

## 五、实现步骤

### 阶段 1: 接口定义（DevOpsProvider.ts）
1. 新增 `TodayWorkItem`、`TodayWorkGroup`、`TodayWorkSummary`、`DailyReportInput` 四个数据接口
2. 在 `DevOpsProvider` 接口中新增 5 个可选方法声明

### 阶段 2: API 实现（CompanyDevOpsAdapter.ts）
1. 新增 `DEVOPS_DAILY_PAGE_ID = 'wlrFlaF'` 常量
2. 实现 `fetchTodayWork(reportDate)` — GET + 树形结构解析
3. 实现 `fetchTomorrowPlan()` — GET + 直接返回字符串
4. 实现 `checkTodayWorkHourEnough(reportDate)` — GET + 返回工时数字符串
5. 实现 `checkOverdueTasks()` — GET + 返回逾期数量
6. 实现 `submitDailyReport(input)` — POST + status_code 检查

### 阶段 3: 交互流程（PushDayWorkFlow.ts）
1. 实现 `buildNowWorkHtml(summary)` — 将 TodayWorkSummary 转为 nowWork HTML
2. 实现 `collectPushDayWork(provider, outputChannel)` — 主交互流程
3. 实现工时不足 8h 警告逻辑
4. 实现最终确认 Modal

### 阶段 4: 命令注册（extension.ts + package.json）
1. 在 `package.json` 中声明 `issueLinkPush.pushDayWork` 命令
2. 在 `extension.ts` 中注册命令
3. 实现 `runPushDayWork(config)` 函数
4. 实现 `normalizeReportDate()` 工具函数（保证 `Asia/Shanghai` 时区）
5. 编译测试

---

## 六、风险点

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| `pageId=wlrFlaF` 可能变更 | API 调用失败 | 提取为常量，方便修改 |
| nowWork HTML 格式被服务端校验 | 提交失败 | v1 严格按抓包格式生成；如失败，抓取新 HAR 调整 |
| 时区问题 (`new Date()`) | 日期偏差 | 使用 `Asia/Shanghai` 时区计算日期 |
| 今日已提交日报 | 重复提交错误 | 提交前可先调 `loadReports` 检查是否已有当天日报 |
| 网络不稳定 | 提交后草稿删除失败 | 草稿删除失败不阻塞主流程（try-catch 包裹） |
