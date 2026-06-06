import * as vscode from 'vscode';
import { DevOpsProvider } from '../core/DevOpsProvider';
import { CompanyDevOpsAdapter } from '../core/providers/CompanyDevOpsAdapter';
import { ExtensionConfig } from './ConfigManager';

// @AI-Begin M7N8K 20260605 @@claudeCode
export const outputChannel = vscode.window.createOutputChannel('Issue Link Push');
// @AI-End M7N8K 20260605 @@claudeCode

export function createProvider(config: ExtensionConfig): DevOpsProvider {
  if (!config.username || !config.password) {
    throw new Error('请先执行”初始化 DevOps 账号”，保存用户名和密码。');
  }
  for (const variable of ['${COMMIT_TYPE}', '${SUBJECT}', '${CODE}', '${HOURS}', '${PROGRESS}']) {
    if (!config.commitTemplate.includes(variable)) {
      throw new Error(`issueLinkPush.commitTemplate must include ${variable}.`);
    }
  }

  return new CompanyDevOpsAdapter({
    username: config.username,
    password: config.password,
    timeoutMs: config.requestTimeoutMs,
    // @AI-Begin M7N8K 20260605 @@claudeCode
    log: config.debugMode ? (msg: string) => outputChannel.appendLine(msg) : undefined
    // @AI-End M7N8K 20260605 @@claudeCode
  });
}
