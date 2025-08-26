import { ConfigurationReader } from './config';
import { StatusBarButton } from './statusButton';

export class DebugTargetsButton extends StatusBarButton {
  settingsName = 'debugTargets';
  
  constructor(config: ConfigurationReader, priority: number) {
    super(config, priority);
    this.command = 'malterlib.openLocalDebugConfigEditor';
    this.icon = 'debug-alt';
    this.tooltip = 'Click to open local debug configuration editor';
    this.text = 'No Debug Targets';
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