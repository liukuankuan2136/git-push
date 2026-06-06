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
│   └── providers/
│       └── CompanyDevOpsAdapter.ts  # DevOps API 适配器实现（登录、CRUD、字段映射）
└── vscode/
    ├── ConfigManager.ts      # 配置加载 + SecretStorage 凭据管理
    ├── git.ts                # Git 操作封装（获取API、分支、remote、staged检查）
    ├── AmendStrategy.ts      # git commit --amend 策略 + 分支状态检查
    ├── QuickPickFlow.ts      # 多步骤 QuickPick 交互流程（选类型→选任务→选工时类型→填工时→填进度→确认）
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

## 配置项 (`issueLinkPush.*`)

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `commitTemplate` | string | `${COMMIT_TYPE}:${SUBJECT} scrum -e ${CODE} -h:${HOURS} -s:${PROGRESS}` | 提交信息模板 |
| `requestTimeoutMs` | number | 10000 | API 请求超时 (ms) |
| `cacheTtlMs` | number | 300000 | 缓存 TTL (ms) |
| `workHourMode` | enum | `append` | 工时记录模式: append / overwrite |
| `workContentMode` | enum | `append` | 工时描述模式: append / overwrite |
| `progressMode` | enum | `overwrite` | 百分比模式: append / overwrite |

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

## 代码标记约定

所有 AI 生成的代码变更使用 `@AI-Begin <ID5> <DATE8> @@claudeCode` / `@AI-End <ID5> <DATE8> @@claudeCode` 标记，日期为 `Asia/Shanghai` 时区。

## 注意事项

- DevOps API 部分响应不是标准 JSON（可能是 JS 对象字面量），`http.ts` 的 `parseResponsePayload` 使用 `Function()` 作为回退解析
- 推送失败时会尝试恢复（amend 模式用 `git reset --soft HEAD@{1}`，commit 模式用 `git reset --soft HEAD~1`）
- 配置变更或账号重新初始化时会清空缓存
- `fetchTaskByCode` 是两步查询：Step1 查 groupFieldValue → Step2 用 code+groupFieldValue 查具体任务
