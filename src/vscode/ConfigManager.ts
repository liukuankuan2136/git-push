import * as vscode from 'vscode';

export interface ExtensionConfig {
  commitTemplate: string;
  requestTimeoutMs: number;
  cacheTtlMs: number;
  workHourMode: 'append' | 'overwrite';
  workContentMode: 'append' | 'overwrite';
  // @AI-Begin L9P2R 20260606 @@claudeCode
  debugMode: boolean;
  // @AI-End L9P2R 20260606 @@claudeCode
  progressMode: 'append' | 'overwrite';
  // @AI-Begin T1U2V 20260721 @@claudeCode
  taskCreateMode: 'simple' | 'normal' | 'benchmark';
  // @AI-End T1U2V 20260721 @@claudeCode
  // @AI-Begin D5E6F 20260807 @@claudeCode
  upgradeReminder: boolean;
  // @AI-End D5E6F 20260807 @@claudeCode
  username?: string;
  password?: string;
}

export class ConfigManager {
  private static readonly usernameKey = 'issueLinkPush.devops.username';
  private static readonly passwordKey = 'issueLinkPush.devops.password';

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async load(): Promise<ExtensionConfig> {
    const config = vscode.workspace.getConfiguration('issueLinkPush');
    return {
      commitTemplate: config.get<string>(
        'commitTemplate',
        '${COMMIT_TYPE}:${SUBJECT} scrum -e ${CODE} -h:${HOURS} -s:${PROGRESS}'
      ),
      requestTimeoutMs: config.get<number>('requestTimeoutMs', 10000),
      cacheTtlMs: config.get<number>('cacheTtlMs', 300000),
      workHourMode: config.get<'append' | 'overwrite'>('workHourMode', 'append'),
      workContentMode: config.get<'append' | 'overwrite'>('workContentMode', 'append'),
      // @AI-Begin L9P2R 20260606 @@claudeCode
      debugMode: config.get<boolean>('debugMode', false),
      // @AI-End L9P2R 20260606 @@claudeCode
      progressMode: config.get<'append' | 'overwrite'>('progressMode', 'overwrite'),
      // @AI-Begin T1U2V 20260721 @@claudeCode
      taskCreateMode: config.get<'simple' | 'normal' | 'benchmark'>('taskCreateMode', 'simple'),
      // @AI-End T1U2V 20260721 @@claudeCode
      // @AI-Begin D5E6F 20260807 @@claudeCode
      upgradeReminder: config.get<boolean>('upgradeReminder', false),
      // @AI-End D5E6F 20260807 @@claudeCode
      username: await this.secrets.get(ConfigManager.usernameKey),
      password: await this.secrets.get(ConfigManager.passwordKey)
    };
  }

  async initializeDevOpsAccount(): Promise<void> {
    const username = await vscode.window.showInputBox({
      title: '初始化 DevOps 账号',
      prompt: '请输入公司 DevOps 用户名。',
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : '请输入用户名。')
    });

    if (username === undefined) {
      return;
    }

    const password = await vscode.window.showInputBox({
      title: '初始化 DevOps 账号',
      prompt: '请输入 DevOps 登录密码密文。可登录 DevOps 平台 F12，在 login 接口负载中获取 password 字段值。',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => (value ? undefined : '请输入密码密文。')
    });

    if (password === undefined) {
      return;
    }

    await this.secrets.store(ConfigManager.usernameKey, username.trim());
    await this.secrets.store(ConfigManager.passwordKey, password);
    vscode.window.showInformationMessage('DevOps 账号已安全保存。');
  }
}
