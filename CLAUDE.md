# CLAUDE.md

## 项目概述

**Issue Link Push** — VS Code 扩展，用于关联公司 DevOps (devops.ctjsoft.com) 任务/Bug，自动生成规范的提交信息并推送代码，同时登记工时。

- **语言**: TypeScript (ES2022, CommonJS)
- **运行时**: VS Code Extension Host (`engines.vscode: ^1.90.0`)
- **编译**: `tsc -p ./` → `dist/` 目录
- **入口**: `src/extension.ts` → `dist/extension.js`

## 核心架构

```
src/
├── extension.ts              # 入口：激活事件、命令注册、commit/push 流程编排
├── core/
│   ├── DevOpsProvider.ts     # 核心接口定义：DevOpsTask, WorkHourRecord, DevOpsProvider 等
│   ├── DevOpsCommitFormatter.ts  # 提交信息模板渲染
│   ├── DevOpsCache.ts        # 项目列表、任务列表、工时类型的 TTL 缓存
│   ├── http.ts               # HTTP 请求封装（fetchJson, 超时, 错误处理, 非标准JSON解析）
│   ├── AppError.ts           # ProviderError 异常类
│   ├── locations.ts          # 中国行政区划字典 + 区域合规检查引擎（纯静态，无 AI 依赖）
│   └── providers/
│       └── CompanyDevOpsAdapter.ts  # DevOps API 适配器实现（登录、CRUD、字段映射）
└── vscode/
    ├── ConfigManager.ts      # 配置加载 + SecretStorage 凭据管理
    ├── git.ts                # Git 操作封装（获取API、分支、remote、staged检查）
    ├── AmendStrategy.ts      # git commit --amend 策略 + 分支状态检查
    ├── QuickPickFlow.ts      # 多步骤 QuickPick 交互流程（选类型→选任务→选工时类型→填工时→填进度→确认）
    ├── RegionCheckFlow.ts    # 区域合规检查交互流程（选项目→选产品→拉取任务→逐条检查→输出报告）
    ├── PushDayWorkFlow.ts    # 日报提交交互流程（拉取工时→编辑明日计划→确认→提交）
    └── providerFactory.ts    # DevOpsProvider 工厂 + 输出通道
```

## 命令列表

| 命令 ID | 标题 | 功能 |
|---|---|---|
| `issueLinkPush.submitWithDevOpsTask` | 关联 DevOps 任务并推送 | amend 最新 commit 并推送 + 登记工时 |
| `issueLinkPush.commitAndPush` | 关联 DevOps 任务提交并推送 | 新建 commit 并推送 + 登记工时 |
| `issueLinkPush.commitOnly` | 关联 DevOps 任务仅提交 | 仅新建 commit 到本地 + 登记工时 |
| `issueLinkPush.initializeDevOps` | 初始化 DevOps 账号 | 保存用户名/密码到 SecretStorage |
| `issueLinkPush.clearCache` | 清除 DevOps 缓存 | 清除内存中的项目和任务缓存 |
| `issueLinkPush.opsWorkHourRecord` | 运维工时补录 | 创建 Task 并登记工时 |
| `issueLinkPush.regionCheck` | 区域合规检查 | 选产品→拉本周全部任务→检查地名合规→输出报告 |
| `issueLinkPush.pushDayWork` | 提交日报 | 拉取今日工时→编辑明日计划→确认→提交日报 |

## 配置项 (`issueLinkPush.*`)

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `commitTemplate` | string | `${COMMIT_TYPE}:${SUBJECT} scrum -e ${CODE} -h:${HOURS} -s:${PROGRESS}` | 提交信息模板 |
| `requestTimeoutMs` | number | 10000 | API 请求超时 (ms) |
| `cacheTtlMs` | number | 300000 | 缓存 TTL (ms) |
| `workHourMode` | enum | `append` | 工时记录模式: append / overwrite |
| `workContentMode` | enum | `append` | 工时描述模式: append / overwrite |
| `progressMode` | enum | `overwrite` | 百分比模式: append / overwrite |
| `debugMode` | boolean | `false` | 调试模式，开启后在输出通道打印 API 请求/响应日志 |

## 关键交互流程

### 主流程 (submitWithDevOpsTask)
1. 获取 Git API → 选择仓库
2. 解析推送目标（检查 upstream、未推送 commit）
3. 创建 DevOpsProvider → QuickPick 流程收集元数据
4. Amend 最新 commit（写入 DevOps 信息）
5. 推送代码
6. 登记工时（新增/修改）

### QuickPick 步骤
1. 选工作项类型 (task / bug)
2. 从缓存/API 加载任务列表，按产品分组显示
3. 支持手动输入编号查询不在列表中的任务 (`fetchTaskByCode`)
4. 查询今日工时记录
5. 选 commit type → 输入 subject → 选工时类型 → 输入工时 → 输入完成度
6. 预览确认 / 复制

### 工时类型特殊处理
- 工时类型名称含 "AI" 时，commit template 中 `-h:` 自动替换为 `-aih:`

## DevOps API 认证

- 登录: `POST {DEVOPS_BASE_URL}/login` (FormData: username, password, loginType=password)
- 会话: 从 Set-Cookie 解析 cookie + 从响应体递归查找 userId
- 凭据: 通过 VS Code SecretStorage 安全存储

## 开发指南

```bash
# 编译
npm run compile      # tsc -p ./

# 监视模式
npm run watch        # tsc -watch -p ./

# 调试: F5 → 启动 Extension Development Host
```

### 新增命令的标准改动清单

经过 3 个功能的实际开发验证，每个新增命令都需要改动以下 5 个文件：

| 文件 | 改动内容 |
|---|---|
| `src/core/DevOpsProvider.ts` | 新增必要的数据接口（数据模型）+ 在 `DevOpsProvider` 接口上添加 optional 方法（`?`），保持向后兼容 |
| `src/core/providers/CompanyDevOpsAdapter.ts` | 实现接口方法：声明 `pageId` 常量 → 构造 headers → 调用 `fetchJson` → 解析返回 |
| `src/vscode/{Feature}Flow.ts` | 新文件：导出单个 `async function collectXxx()` 作为交互流程入口，返回 `Result \| undefined`（`undefined` = 用户取消） |
| `src/extension.ts` | 注册命令 + 添加 runner 函数（创建 adapter → 调用 Flow → 处理返回结果 → 错误处理/输出） |
| `package.json` | 添加 `activationEvent`、`commands` 条目、`commandPalette` 条目；视需要添加 `scm/title` 菜单项 |

新功能需要新的 API 端点时，在 `CompanyDevOpsAdapter.ts` 中：
- 复用 `getSession()` 获取 `{cookie, userId}`（自动处理登录状态）
- 复用 `fetchJson<T>()` 发起请求（自动处理超时、abort、非标准 JSON 解析）
- 复用 `dailyHeaders(session)` 或参考其模式构造带 `user-context` 的请求头

## 代码标记约定

所有 AI 生成的代码变更使用 `@AI-Begin <ID5> <DATE8> @@claudeCode` / `@AI-End <ID5> <DATE8> @@claudeCode` 标记，日期为 `Asia/Shanghai` 时区。

## 注意事项

- DevOps API 部分响应不是标准 JSON（可能是 JS 对象字面量），`http.ts` 的 `parseResponsePayload` 使用 `Function()` 作为回退解析
- 推送失败时会尝试恢复（amend 模式用 `git reset --soft HEAD@{1}`，commit 模式用 `git reset --soft HEAD~1`）
- 配置变更或账号重新初始化时会清空缓存
- `fetchTaskByCode` 是两步查询：Step1 查 groupFieldValue → Step2 用 code+groupFieldValue 查具体任务

## 踩坑记录

### DevOps 按条件查询 Task 必须走两次接口

**场景**：按 `devprojId` + `prodId` 拉取某个产品下的所有 Task，本以为一次 `loadTaskListWithGroup` 调用就行。

**踩坑**：第一次调用返回的是**分组摘要**（group summaries），不是具体 Task。字段 `taskName` 是如 `"今天(5)"`，`taskNo` 为 `undefined`，`groupTaskCount` 表示该组下有 N 条。

**正确做法**：必须两步走：

1. **Step 1 — 获取分组摘要**：`POST /devops-server/config/v3/task/query/loadTaskListWithGroup`，body 中 `groupId: '1'`（按创建时间分组），`progressStatus: ''`（空字符串 = 全部状态，不传则只返回未完成）。返回按时间分组的摘要列表。

2. **Step 2 — 展开每个分组**：对 Step 1 返回的每个分组，再次调用同一接口，body 中额外传入 `parentId`、`groupField`、`groupFieldValue`、`parentGroupInfos`、`groupTaskCount` 等字段，才能拿到该分组下的具体 Task 列表。

```typescript
// Step 1: 分组摘要
const step1Body = {
  current: '1', size: '50',
  simpleFieldCondition: { ...baseCondition },
  groupId: '1'  // 按创建时间分组
};

// Step 2: 展开分组（对每个本周分组）
const step2Body = {
  simpleFieldCondition: { ...baseCondition, parentId: groupFieldValue },
  groupId: '1',
  groupField: 'createTime',
  groupFieldValue,
  parentGroupInfos: [],
  groupTaskCount
};
```

### `progressStatus` 传空字符串返回全部状态

`progressStatus` 字段控制任务状态过滤：
- `'incomplete'` — 只返回未完成的任务
- `'complete'` — 只返回已完成的任务
- **`''`（空字符串）— 返回全部状态的任务**

之前尝试用双调用（incomplete + complete）合并去重，后来发现直接传空字符串即可一次获取全部。

### 区域合规检查的地名匹配坑

**误伤 1 — 省份名修饰自己的城市**：实施项目 primary="柳州"（所属广西），任务内容中出现"广西"不应算违规。"广西柳州"是正常的省份+城市修饰关系。修复：如果检测到的地名本身是省份级地名（`LOCATION_MAP[name] === name`）且其 province 等于 primary 的 province，跳过。

**误伤 2 — 城市名"市"后缀不匹配**："开封" vs "开封市" 被当不同地点。修复：比较前统一去掉"市"/"省"后缀再比较。

### API 响应的 IIFE 格式

部分 DevOps API 响应体格式为 `{"status_code":"0000","data":(function(){var N=null,$0="冯彩云",...;function dd(d){return {...}};for(var i=0;i<6;i++){rs.push(dd(data[i]))};return rs;})(),"runtime":1228}`，是 JavaScript 自执行函数而非标准 JSON。`http.ts` 的 `parseResponsePayload` 通过 `Function()` 构造器回退解析这种格式。

### DevOps 各功能模块使用不同的 `pageId`

DevOps 后端通过请求头 `user-context` 中的 `pageId` 字段路由到不同功能模块。**每个模块的 `pageId` 都是独立的，不能复用**：

| 功能模块 | `pageId` | 说明 |
|---|---|---|
| Task 管理 (部门工作项) | `h7BdNkJ` | 任务查询、工时记录等 |
| 研发任务创建 | `AbY8d4R` | 运维工时补录中的创建 Task |
| 日报 | `wlrFlaF` | 日报的查询和提交 |

**发现新模块 `pageId` 的方法**：从浏览器 DevTools 抓取对应页面的 HAR 文件，在请求的 `user-context` 头中提取 `pageId` 值。猜测或复用旧值会导致接口调用失败。
