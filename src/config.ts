import * as vscode from 'vscode';

export type StatusBarVisibility = 'visible' | 'hidden' | 'compact' | 'icon';
export type StatusBarOptionVisibility = StatusBarVisibility | 'inherit';

export interface ConfigurationOptions {
  statusBarVisibility: StatusBarVisibility;
  clearTerminalOnBuild: boolean;
  advanced: {
    [key: string]: {
      statusBarVisibility?: StatusBarOptionVisibility;
      inheritDefault?: StatusBarVisibility;
      statusBarLength?: number;
    }
  };
}

export class ConfigurationReader {
  private _onChange = new vscode.EventEmitter<string>();
  readonly onChange = this._onChange.event;
  
  constructor(private readonly workspaceFolder?: vscode.WorkspaceFolder) {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('malterlib', this.workspaceFolder))
        this._onChange.fire('options');
    });
  }
  
  get options(): ConfigurationOptions {
    const config = vscode.workspace.getConfiguration('malterlib', this.workspaceFolder);
    return {
      statusBarVisibility: config.get('statusBarVisibility', 'visible'),
      clearTerminalOnBuild: config.get('clearTerminalOnBuild', true),
      advanced: config.get('advanced', {})
    };
  }
}