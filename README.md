# Issue Link Push

在 VS Code 中推送 Git 代码时，自动关联 DevOps 工作项、生成规范的 commit message，并将本次工时和完成度登记到对应任务下。

## 功能

1. **登录 DevOps** — 通过用户名 + 密码密文完成插件初始化，凭据加密存储在 VS Code SecretStorage 中。
2. **关联 DevOps 任务** — 推送代码时选择工作项（Task / Bug），按产品线分组展示。
3. **规范化提交信息** — 按固定模板生成 commit message，统一团队提交格式。
4. **工时自动登记** — 推送完成后自动将投入工时和完成度写入 DevOps 对应任务。
5. **运维任务自动生成并登记** — 方便支持项目后的任务创建和工时登记。

## 使用教程

### 0. 插件配置

![插件配置](https://raw.githubusercontent.com/liukuankuan2136/git-push/main/imgs/settings.gif)

三种写入模式支持独立配置：

| 参数 | 作用 | 默认值 |
|------|------|--------|
| `workHourMode` | 工时：`append` 累加 / `overwrite` 替换 | `append` |
| `workContentMode` | 描述：`append` 追加 / `overwrite` 替换 | `append` |
| `progressMode` | 完成度：`append` 累加（上限100%）/ `overwrite` 替换 | `overwrite` |

### 1. 初始化 DevOps 账号

打开命令面板（`Ctrl+Shift+P`），搜索并执行 **Issue Link Push: 初始化 DevOps 账号**。

依次输入：
- **用户名** — DevOps 登录账号
- **密码** — DevOps 密码密文

初始化后凭据会存储在 VS Code SecretStorage 中，后续无需重复输入。

#### 步骤演示

![初始化](https://raw.githubusercontent.com/liukuankuan2136/git-push/main/imgs/login.gif)

#### 结果示例

![初始化成功](https://raw.githubusercontent.com/liukuankuan2136/git-push/main/imgs/login-success.png)

### 2. 推送代码并登记 DevOps

插件提供三种推送模式：

| 模式 | 命令 | 说明 |
|------|------|------|
| 仅提交 | **Issue Link Push: 关联 DevOps 任务仅提交** | 只 commit 到本地，不推送 |
| 仅推送 | **Issue Link Push: 关联 DevOps 任务并推送** | 将本地已有 commit 推送到远端（会重写 commit 描述） |
| 提交并推送 | **Issue Link Push: 关联 DevOps 任务提交并推送** | commit 到本地并推送到远端（推荐） |
| 提交代码&创建task&登记工时 | **Issue Link Push: 运维工时补录** | 提交代码&创建task&登记工时 |

三种模式操作步骤一致，仅使用场景不同：

1. 执行对应命令，唤出插件界面
2. 选择任务类型（Task 或 Bug），需 DevOps 平台有未完成的工作项
3. 选择具体工作项（实时从 DevOps 平台同步）
4. 输入代码提交描述及工时登记内容
5. 输入本次工时（小时）
6. 输入本次任务完成度
7. 确认提交

#### 步骤演示

![代码推送&DevOps平台登记](https://raw.githubusercontent.com/liukuankuan2136/git-push/main/imgs/push-and-devops.gif)

#### 结果示例

**代码推送日志：**

![代码推送日志](https://raw.githubusercontent.com/liukuankuan2136/git-push/main/imgs/push-log.png)

**DevOps 平台工时登记：**

![DevOps工时登记](https://raw.githubusercontent.com/liukuankuan2136/git-push/main/imgs/devops-workhour.png)
