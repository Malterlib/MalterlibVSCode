import { ConfigurationReader } from './config';
import { StatusBarButton } from './statusButton';

export class TargetButton extends StatusBarButton {
  settingsName = 'target';
  
  constructor(config: ConfigurationReader, priority: number) {
    super(config, priority);
    this.command = 'malterlib.selectTarget';
    this.icon = 'target';
    this.tooltip = 'Click to select build target';
    this.text = 'All Targets';
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