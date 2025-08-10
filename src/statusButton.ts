import * as vscode from 'vscode';
import { ConfigurationReader, StatusBarVisibility } from './config';
import { MalterlibProjectDetector } from './malterlibProject';

export abstract class StatusBarButton {
  readonly settingsName: string | null = null;
  protected readonly button: vscode.StatusBarItem;
  private _forceHidden: boolean = false;
  private _hidden: boolean = false;
  private _text: string = '';
  private _tooltip: string | null = null;
  private _icon: string | null = null;

  constructor(
    protected readonly config: ConfigurationReader,
    protected readonly priority: number
  ) {
    this.button = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      this.priority
    );
  }

  // Visibility control
  set forceHidden(v: boolean) {
    this._forceHidden = v;
    this.update();
  }

  get hidden(): boolean {
    return this._hidden;
  }
  
  set hidden(v: boolean) {
    this._hidden = v;
    this.update();
  }

  // Text management
  get text(): string {
    return this._text;
  }
  
  set text(v: string) {
    this._text = v;
    this.update();
  }

  get bracketText(): string {
    return `[${this._text}]`;
  }

  // Tooltip management
  get tooltip(): string | null {
    return this._tooltip;
  }
  
  set tooltip(v: string | null) {
    this._tooltip = v;
    this.update();
  }

  // Icon management
  protected set icon(v: string | null) {
    this._icon = v ? `$(${v})` : null;
  }

  // Command management
  protected set command(v: string | null) {
    this.button.command = v || undefined;
  }

  dispose(): void {
    this.button.dispose();
  }

  update(): void {
    if (!this._isVisible() || this._forceHidden) {
      this.button.hide();
      return;
    }
    
    const text = this._getText(true);
    if (text === '') {
      this.button.hide();
      return;
    }
    
    this.button.text = text;
    this.button.tooltip = this._getTooltip() || undefined;
    this.button.show();
  }

  // Text variations for different visibility modes
  protected getTextNormal(): string {
    if (this._text.length > 0)
      return this.bracketText;
    return '';
  }
  
  protected getTextShort(): string {
    return this.getTextNormal();
  }
  
  protected getTextIcon(): string {
    return '';
  }

  // Tooltip variations
  protected getTooltipNormal(): string | null {
    return this._tooltip;
  }
  
  protected getTooltipShort(): string | null {
    const tooltip = this.getTooltipNormal();
    const text = this.getTextNormal();
    if (!tooltip && !text)
      return null;
    if (!tooltip || !text)
      return `Malterlib: ${tooltip || text}`;
    return `Malterlib: ${text}\n${tooltip}`;
  }
  
  protected getTooltipIcon(): string | null {
    return this.getTooltipShort();
  }

  // Override in subclasses for custom visibility logic
  protected isVisible(): boolean {
    return !this.hidden && MalterlibProjectDetector.hasAnyMalterlibProject();
  }

  private _isVisible(): boolean {
    return this.isVisible() && this._getVisibilitySetting() !== 'hidden';
  }

  private _getVisibilitySetting(): StatusBarVisibility | null {
    if (this.settingsName) {
      let setting = this.config.options.advanced[this.settingsName]?.statusBarVisibility;
      
      if (setting === 'inherit')
        setting = this.config.options.statusBarVisibility;
      
      return setting || this.config.options.statusBarVisibility;
    }
    return this.config.options.statusBarVisibility;
  }

  private _getText(includeIcon: boolean = false): string {
    const visibility = this._getVisibilitySetting();
    let text: string;
    
    switch (visibility) {
      case 'icon':
        text = this.getTextIcon();
        break;
      case 'compact':
        text = this.getTextShort();
        break;
      default:
        text = this.getTextNormal();
        break;
    }
    
    if (!includeIcon || !this._icon)
      return text;
    
    if (text === '')
      return this._icon;
    
    return `${this._icon} ${text}`;
  }

  private _getTooltip(): string | null {
    const visibility = this._getVisibilitySetting();
    switch (visibility) {
      case 'hidden':
        return null;
      case 'icon':
        return this.getTooltipIcon();
      case 'compact':
        return this.getTooltipShort();
      default:
        return this.getTooltipNormal();
    }
  }
}