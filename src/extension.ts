import * as cp from 'node:child_process';
import * as util from 'node:util';
import * as vscode from 'vscode';
import { DevOpsCache } from './core/DevOpsCache';
import { ConfigManager, ExtensionConfig } from './vscode/ConfigManager';
import { AmendStrategy, checkBranchState } from './vscode/AmendStrategy';
import { DevOpsCommitMetadata, DevOpsProvider } from './core/DevOpsProvider';
import { formatDevOpsCommitMetadata } from './core/DevOpsCommitFormatter';
import { getGitApi, getCurrentBranchName, hasStagedChanges, listRemotes, pickRepository, Repository } from './vscode/git';
import { createProvider,outputChannel } from './vscode/providerFactory';
import { collectDevOpsCommitMetadata, collectOpsWorkHourRecord, OpsWorkHourInput } from './vscode/QuickPickFlow';
import { RepoProductMappingStore } from './vscode/RepoProductMapping';

const execFile = util.promisify(cp.execFile);

export function activate(context: vscode.ExtensionContext): void {
  const configManager = new ConfigManager(context.secrets);
  let cache: DevOpsCache | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('issueLinkPush')) {
        cache = undefined;
      }
    }),
    vscode.commands.registerCommand('issueLinkPush.initializeDevOps', async () => {
      await configManager.initializeDevOpsAccount();
      cache = undefined;
    }),
    // @AI-Begin W3F6G 20260518 @@clearCache
    vscode.commands.registerCommand('issueLinkPush.clearCache', () => {
      const parts: string[] = [];
      if (cache) {
        cache.clear();
        parts.push('DevOps 缓存');
      }
      // @AI-Begin V5W2X 20260606 @@claudeCode
      context.globalState.update('issueLinkPush.lastVersion', undefined);
      parts.push('版本记录');
      // @AI-End V5W2X 20260606 @@claudeCode
      // @AI-Begin C6D9E 20260720 @@claudeCode
      const repoMappingStore = new RepoProductMappingStore(context.globalState);
      repoMappingStore.clear();
      parts.push('仓库映射');
      // @AI-End C6D9E 20260720 @@claudeCode
      if (parts.length > 0) {
        vscode.window.showInformationMessage(`${parts.join('、')}已清除。`);
      } else {
        vscode.window.showInformationMessage('缓存为空，无需清除。');
      }
    }),
    // @AI-End W3F6G 20260518 @@cc
    vscode.commands.registerCommand('issueLinkPush.submitWithDevOpsTask', async () => {
      const config = await configManager.load();
      cache ??= new DevOpsCache(config.cacheTtlMs);
      await runSubmitWithDevOpsTask(config, cache);
    }),
    // @AI-Begin B6C7D 20260520 @@cc
    vscode.commands.registerCommand('issueLinkPush.commitAndPush', async () => {
      const config = await configManager.load();
      cache ??= new DevOpsCache(config.cacheTtlMs);
      await runCommitAndPush(config, cache);
    }),
    vscode.commands.registerCommand('issueLinkPush.commitOnly', async () => {
      const config = await configManager.load();
      cache ??= new DevOpsCache(config.cacheTtlMs);
      await runCommitOnly(config, cache);
    }),
    // @AI-End B6C7D 20260520 @@cc
    // @AI-Begin C6D9E 20260720 @@claudeCode
    vscode.commands.registerCommand('issueLinkPush.opsWorkHourRecord', async () => {
      const config = await configManager.load();
      cache ??= new DevOpsCache(config.cacheTtlMs);
      await runOpsWorkHourRecord(config, cache, context);
    })
    // @AI-End C6D9E 20260720 @@claudeCode
  );

  // @AI-Begin V5W2X 20260606 @@claudeCode
  const currentVersion = context.extension.packageJSON.version as string;
  const storedVersion = context.globalState.get<string>('issueLinkPush.lastVersion');
  outputChannel.appendLine(`[versionCheck] currentVersion: ${currentVersion}`);
  outputChannel.appendLine(`[versionCheck] storedVersion: ${storedVersion ?? '<none>'}`);
  outputChannel.appendLine(`[versionCheck] isUpgrade: ${currentVersion !== storedVersion}`);
  if (currentVersion !== storedVersion) {
    context.globalState.update('issueLinkPush.lastVersion', currentVersion);
    vscode.window.showInformationMessage(
      `Issue Link Push 已更新至 v${currentVersion}`,
      '查看变更'
    ).then((selection) => {
      if (selection === '查看变更') {
        vscode.env.openExternal(vscode.Uri.parse(
          'https://github.com/liukuankuan2136/git-push/releases'
        ));
      }
    });
  }
  // @AI-End V5W2X 20260606 @@claudeCode
}

// @AI-Begin C6D9E 20260720 @@claudeCode
async function runOpsWorkHourRecord(
  config: ExtensionConfig,
  cache: DevOpsCache,
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    // 检查 git
    const git = await getGitApi();
    const repository = await pickRepository(git);
    if (!repository) {
      vscode.window.showWarningMessage('当前没有打开 Git 仓库。');
      return;
    }
    const cwd = repository.rootUri.fsPath;

    if (!(await hasStagedChanges(cwd))) {
      vscode.window.showWarningMessage('当前没有已暂存的改动。请先 git add 暂存要提交的文件。');
      return;
    }

    const pushTarget = await resolvePushTarget(cwd, repository, false);
    if (!pushTarget) { return; }

    // 获取 origin URL 用于仓库映射
    const originUrl = await getOriginUrl(cwd);

    // 创建 provider
    const provider = createProvider(config);
    if (!provider.createTask || !provider.fetchDevProjects || !provider.fetchRegions
        || !provider.fetchProductsByProject || !provider.fetchOpsProjectsByRegion
        || !provider.getUserId || !provider.addWorkHour) {
      vscode.window.showErrorMessage('当前 DevOps 提供者不支持运维工时补录所需的功能。');
      return;
    }

    // 获取 userId（从 session 中）
    await provider.testConnection();

    // 仓库映射
    const repoMappingStore = new RepoProductMappingStore(context.globalState);
    const existingMapping = originUrl ? repoMappingStore.get(originUrl) : undefined;

    // 收集输入
    const collected = await collectOpsWorkHourRecord(
      provider, cache,
      originUrl ?? '',
      existingMapping,
      config.taskCreateMode
    );
    if (!collected) { return; }

    // 保存仓库映射
    if (originUrl && !existingMapping) {
      repoMappingStore.set({
        originUrl,
        devprojId: collected.taskInput.devprojId,
        devprojName: collected.devprojName,
        prodId: collected.taskInput.prodId,
        prodName: collected.prodName
      });
    }

    // 创建任务
    const taskResult = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '正在创建 DevOps 任务', cancellable: false },
      async () => provider.createTask!(collected.taskInput)
    );
    outputChannel.appendLine(`[opsWorkHourRecord] task created: code=${taskResult.code}, id=${taskResult.id}`);

    // 构建 commit message（使用 commitTemplate，SUBJECT 用任务标题）
    const metadata: DevOpsCommitMetadata = {
      project: { code: collected.taskInput.prodId, name: collected.taskInput.prodId },
      task: {
        code: taskResult.code,
        title: taskResult.title,
        type: 'task',
        status: '新增',
        projectCode: collected.taskInput.prodId,
        id: taskResult.id,
        url: taskResult.url
      },
      commitType: collected.commitType,
      subject: collected.taskInput.taskName,
      hours: collected.hours,
      progress: collected.progress,
      workHourTypeCode: collected.workHourTypeCode,
      workHourTypeName: collected.workHourTypeName
    };

    const message = formatDevOpsCommitMetadata(config.commitTemplate, metadata);
    outputChannel.appendLine(`[opsWorkHourRecord] commit message: ${message}`);

    // commit
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: '正在提交代码', cancellable: false },
      async () => { await execFile('git', ['commit', '-m', message], { cwd }); }
    );

    // push（失败不阻塞工时登记）
    let pushFailed = false;
    try {
      await doPush(repository, pushTarget);
    } catch (pushError) {
      pushFailed = true;
      outputChannel.appendLine(`[opsWorkHourRecord] push failed: ${pushError instanceof Error ? pushError.message : String(pushError)}`);
      vscode.window.showWarningMessage('代码推送失败，请手动推送。工时将继续登记。');
    }

    // 登记工时：日期当天、类型默认"代码编写"、工时=用户输入的本次投入工时
    outputChannel.appendLine('[opsWorkHourRecord] recording work hours...');
    const today = new Date().toISOString().split('T')[0];
    const calcHours = Number(collected.hours);

    if (calcHours <= 0) {
      outputChannel.appendLine(`[opsWorkHourRecord] calculated hours is ${calcHours}, skipping work hour registration`);
      vscode.window.showWarningMessage(`工时登记已跳过：当前完成度 ${collected.progress}% 下计算工时为 0。`);
    } else {
      const codeWritingType = await findCodeWritingType(provider, cache);
      const workContent = collected.taskDesc
        || collected.taskInput.taskName;

      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: '正在登记工时到 DevOps', cancellable: false },
          async () => {
            await provider.addWorkHour!(
              taskResult.id,
              today,
              calcHours,
              `${collected.progress}%`,
              workContent,
              codeWritingType
            );
          }
        );
        outputChannel.appendLine(`[opsWorkHourRecord] work hours registered: ${calcHours}h on task=${taskResult.id}`);
      } catch (whError) {
        outputChannel.appendLine(`[opsWorkHourRecord] work hour registration failed: ${whError instanceof Error ? whError.message : String(whError)}`);
        vscode.window.showWarningMessage(`工时登记失败: ${whError instanceof Error ? whError.message : String(whError)}`);
      }
    }

    const pushStatus = pushFailed ? '（推送失败，请手动 git push）' : '已推送';
    const openLabel = '在浏览器中打开';
    vscode.window.showInformationMessage(
      `运维工时补录完成: ${taskResult.code}，代码已提交。${pushStatus}`,
      openLabel
    ).then((selection) => {
      if (selection === openLabel) {
        const url = taskResult.url ?? `https://devops.ctjsoft.com/devops-web4/linkIframe/HNoGJlq`;
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
    });
  } catch (error) {
    vscode.window.showErrorMessage(
      `运维工时补录失败: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function findCodeWritingType(provider: DevOpsProvider, cache: DevOpsCache): Promise<string> {
  try {
    const types = await cache.getWorkHourTypes(provider);
    const codeWriting = types.find((t) => t.eleName === '代码编写');
    if (codeWriting) {
      return codeWriting.eleCode;
    }
  } catch { /* ignore */ }
  return '24'; // fallback default
}

async function getOriginUrl(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFile('git', ['remote', 'get-url', 'origin'], { cwd });
    return stdout.trim();
  } catch {
    return undefined;
  }
}
// @AI-End C6D9E 20260720 @@claudeCode

export function deactivate(): void { }

// @AI-Begin D8E4F 20260520 @@cc
interface PushTarget {
  hasUpstream: boolean;
  remoteName?: string;
  branchName?: string;
}
// @AI-End D8E4F 20260520 @@cc

async function runSubmitWithDevOpsTask(config: ExtensionConfig, cache: DevOpsCache): Promise<void> {
  try {
    const git = await getGitApi();
    const repository = await pickRepository(git);
    if (!repository) {
      vscode.window.showWarningMessage('当前没有打开 Git 仓库。');
      return;
    }

    const cwd = repository.rootUri.fsPath;

    // @AI-Begin F1G3H 20260520 @@cc
    const pushTarget = await resolvePushTarget(cwd, repository);
    if (!pushTarget) {
      return;
    }
    // @AI-End F1G3H 20260520 @@cc

    const provider = createProvider(config);
    const metadata = await collectDevOpsCommitMetadata(provider, cache, config);
    if (!metadata) {
      return;
    }

    const strategy = new AmendStrategy(cwd);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在写入 DevOps 信息到 commit',
        cancellable: false
      },
      () => strategy.apply(metadata, config.commitTemplate)
    );

    await pushAndRecordHours({
      repository,
      cwd,
      pushTarget,
      provider,
      metadata,
      config,
      onPushFailure: () => recoverAmend(cwd),
      successMessage: 'DevOps 信息已写入，推送并登记工时完成。'
    });
  } catch (error) {
    vscode.window.showErrorMessage(formatGitError(error));
  }
}

// @AI-Begin E8F9G 20260520 @@cc
async function runCommitAndPush(config: ExtensionConfig, cache: DevOpsCache): Promise<void> {
  try {
    const git = await getGitApi();
    const repository = await pickRepository(git);
    if (!repository) {
      vscode.window.showWarningMessage('当前没有打开 Git 仓库。');
      return;
    }

    const cwd = repository.rootUri.fsPath;

    if (!(await hasStagedChanges(cwd))) {
      vscode.window.showWarningMessage('当前没有已暂存的改动。请先 git add 暂存要提交的文件。');
      return;
    }

    const pushTarget = await resolvePushTarget(cwd, repository, false);
    if (!pushTarget) {
      return;
    }

    const provider = createProvider(config);
    const metadata = await collectDevOpsCommitMetadata(provider, cache, config);
    if (!metadata) {
      return;
    }

    const message = formatDevOpsCommitMetadata(config.commitTemplate, metadata);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在提交代码',
        cancellable: false
      },
      async () => {
        await execFile('git', ['commit', '-m', message], { cwd });
      }
    );

    await pushAndRecordHours({
      repository,
      cwd,
      pushTarget,
      provider,
      metadata,
      config,
      onPushFailure: () => recoverCommit(cwd),
      successMessage: '代码已提交，推送并登记工时完成。'
    });
  } catch (error) {
    vscode.window.showErrorMessage(formatGitError(error));
  }
}

async function runCommitOnly(config: ExtensionConfig, cache: DevOpsCache): Promise<void> {
  try {
    const git = await getGitApi();
    const repository = await pickRepository(git);
    if (!repository) {
      vscode.window.showWarningMessage('当前没有打开 Git 仓库。');
      return;
    }

    const cwd = repository.rootUri.fsPath;

    if (!(await hasStagedChanges(cwd))) {
      vscode.window.showWarningMessage('当前没有已暂存的改动。请先 git add 暂存要提交的文件。');
      return;
    }

    const provider = createProvider(config);
    const metadata = await collectDevOpsCommitMetadata(provider, cache, config);
    if (!metadata) {
      return;
    }

    const message = formatDevOpsCommitMetadata(config.commitTemplate, metadata);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在提交代码',
        cancellable: false
      },
      async () => {
        await execFile('git', ['commit', '-m', message], { cwd });
      }
    );

    await recordHours(provider, metadata, config);
    vscode.window.showInformationMessage('代码已提交到本地，工时已登记。');
  } catch (error) {
    vscode.window.showErrorMessage(formatGitError(error));
  }
}

async function recoverCommit(cwd: string): Promise<void> {
  try {
    await execFile('git', ['reset', '--soft', 'HEAD~1'], { cwd });
  } catch {
    // 恢复失败不掩盖原始错误
  }
}
// @AI-End E8F9G 20260520 @@cc

// @AI-Begin H0I1J 20260520 @@cc
interface PushAndRecordOptions {
  repository: Repository;
  cwd: string;
  pushTarget: PushTarget;
  provider: DevOpsProvider;
  metadata: DevOpsCommitMetadata;
  config: ExtensionConfig;
  onPushFailure: () => Promise<void>;
  successMessage: string;
}

async function doPush(repository: Repository, pushTarget: PushTarget): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: '正在推送代码',
      cancellable: false
    },
    () => {
      if (pushTarget.hasUpstream) {
        return repository.push();
      }
      return repository.push(pushTarget.remoteName, pushTarget.branchName, true);
    }
  );
}

async function pushAndRecordHours(options: PushAndRecordOptions): Promise<void> {
  const { repository, cwd, pushTarget, provider, metadata, config, onPushFailure } = options;

  try {
    await doPush(repository, pushTarget);
  } catch (pushError) {
    await onPushFailure();
    throw pushError;
  }

  await recordHours(provider, metadata, config);
  vscode.window.showInformationMessage(options.successMessage);
}

async function recordHours(
  provider: DevOpsProvider,
  metadata: DevOpsCommitMetadata,
  config: ExtensionConfig
): Promise<void> {
  const createTime = new Date().toISOString().split('T')[0];
  const spendTaskTime = calcSpendTaskTime(metadata, config.workHourMode);
  const dayCompletion = calcDayCompletion(metadata, config.progressMode);
  const taskId = metadata.task.id || metadata.task.code;

  if (metadata.todayWorkHour && provider.modifyWorkHour) {
    const workContent = calcWorkContent(metadata, config.workContentMode);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在更新今日工时到 DevOps',
        cancellable: false
      },
      async () => {
        await provider.modifyWorkHour!(
          metadata.todayWorkHour!.taskWorkhourId,
          taskId,
          createTime,
          spendTaskTime,
          dayCompletion,
          workContent,
          metadata.workHourTypeCode
        );
      }
    );
  } else if (provider.addWorkHour) {
    // @AI-Begin X5Y6Z 20260526 @@cc
    const sanitizedSubject = metadata.subject.replace(/^[•\-\*\+]\s*/, '');
    const workContent = `• ${sanitizedSubject}`;
    // @AI-End X5Y6Z 20260526 @@cc
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在登记工时到 DevOps',
        cancellable: false
      },
      async () => {
        await provider.addWorkHour!(
          taskId,
          createTime,
          spendTaskTime,
          dayCompletion,
          workContent,
          metadata.workHourTypeCode
        );
      }
    );
  }
}

function calcSpendTaskTime(metadata: DevOpsCommitMetadata, mode: 'append' | 'overwrite'): number {
  const input = Number(metadata.hours);
  if (mode === 'append' && metadata.todayWorkHour) {
    return metadata.todayWorkHour.spendTaskTime + input;
  }
  return input;
}

function calcDayCompletion(metadata: DevOpsCommitMetadata, mode: 'append' | 'overwrite'): string {
  const input = Number(metadata.progress);
  if (mode === 'append' && metadata.todayWorkHour) {
    const existing = parseFloat(metadata.todayWorkHour.dayCompletion) || 0;
    return `${Math.min(existing + input, 100)}%`;
  }
  return `${input}%`;
}

function calcWorkContent(metadata: DevOpsCommitMetadata, mode: 'append' | 'overwrite'): string {
  // @AI-Begin X5Y6Z 20260526 @@cc
  const sanitizedSubject = metadata.subject.replace(/^[•\-\*\+]\s*/, '');
  const entry = `• ${sanitizedSubject}`;
  // @AI-End X5Y6Z 20260526 @@cc
  if (mode === 'append' && metadata.todayWorkHour) {
    return metadata.todayWorkHour.workContent + '\n' + entry;
  }
  return entry;
}

function formatGitError(error: unknown): string {
  if (error instanceof Error) {
    const execError = error as Error & { stderr?: string; stdout?: string };
    if (execError.stderr) {
      return execError.stderr.trim();
    }
    return error.message;
  }
  return String(error);
}

// @AI-Begin P2Q4R 20260520 @@cc
async function resolvePushTarget(cwd: string, repository: Repository, requireUnpushedCommits = true): Promise<PushTarget | null> {
  const state = await checkBranchState(cwd);

  if (requireUnpushedCommits && !state.hasUnpushedCommits) {
    vscode.window.showWarningMessage('当前没有未推送的 commit。');
    return null;
  }

  if (state.hasUpstream) {
    return { hasUpstream: true };
  }

  const remotes = await listRemotes(cwd);
  if (remotes.length === 0) {
    vscode.window.showErrorMessage('当前仓库没有配置 remote，请先执行 git remote add 添加远程仓库。');
    return null;
  }

  let remoteName: string;
  if (remotes.length === 1) {
    remoteName = remotes[0];
  } else {
    const picked = await vscode.window.showQuickPick(
      remotes.map((r) => ({ label: r })),
      { placeHolder: '当前分支没有 upstream，请选择要推送到的远程仓库' }
    );
    if (!picked) {
      return null;
    }
    remoteName = picked.label;
  }

  const localBranch = getCurrentBranchName(repository) ?? 'main';

  const remoteBranch = await vscode.window.showInputBox({
    prompt: `将推送到 ${remoteName}，请输入远程分支名`,
    value: localBranch,
    validateInput: (value) => {
      if (!value.trim()) {
        return '远程分支名不能为空';
      }
      return null;
    }
  });
  if (!remoteBranch) {
    return null;
  }

  return {
    hasUpstream: false,
    remoteName,
    branchName: remoteBranch.trim()
  };
}
// @AI-End P2Q4R 20260520 @@cc

async function recoverAmend(cwd: string): Promise<void> {
  try {
    const { stdout } = await execFile('git', ['rev-parse', 'HEAD@{1}'], { cwd });
    const prevCommit = stdout.trim();
    if (prevCommit) {
      await execFile('git', ['reset', '--soft', 'HEAD@{1}'], { cwd });
    }
  } catch {
    // 恢复失败不掩盖原始错误
  }
}
