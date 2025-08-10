import { ConfigurationReader } from './config';
import { StatusBarButton } from './statusButton';

export class WorkspaceButton extends StatusBarButton {
  settingsName = 'workspace';
  
  constructor(config: ConfigurationReader, priority: number) {
    super(config, priority);
    this.command = 'malterlib.selectWorkspace';
    this.icon = 'folder';
    this.tooltip = 'Click to select workspace';
    this.text = 'No Workspace';
  }

  // Override for compact mode
  protected getTextShort(): string {
    const maxLength = this.config.options.advanced[this.settingsName]?.statusBarLength || 20;
    let text = this.getTextNormal();
    
    if (text.length > maxLength + 3) {
      text = `${text.substring(0, maxLength)}...`;
      if (text.startsWith('['))
        text = `${text}]`;
    }
    
    return text;
  }
}