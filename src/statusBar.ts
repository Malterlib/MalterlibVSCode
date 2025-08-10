import * as vscode from 'vscode';
import { ConfigurationReader } from './config';
import { StatusBarButton } from './statusButton';
import { GeneratorButton } from './generatorButton';
import { WorkspaceButton } from './workspaceButton';
import { ConfigurationButton } from './configurationButton';
import { TargetButton } from './targetButton';
import { DebugTargetsButton } from './debugTargetsButton';
import { MalterlibProjectDetector } from './malterlibProject';

export class StatusBar implements vscode.Disposable {
  private readonly buttons: StatusBarButton[];
  private readonly generatorButton: GeneratorButton;
  private readonly workspaceButton: WorkspaceButton;
  private readonly configurationButton: ConfigurationButton;
  private readonly targetButton: TargetButton;
  private readonly debugTargetsButton: DebugTargetsButton;
  
  constructor(private readonly config: ConfigurationReader) {
    // Create all buttons here with correct priorities (higher = leftmost)
    this.generatorButton = new GeneratorButton(this.config, 10.5);
    this.workspaceButton = new WorkspaceButton(this.config, 10.4);
    this.configurationButton = new ConfigurationButton(this.config, 10.3);
    this.targetButton = new TargetButton(this.config, 10.2);
    this.debugTargetsButton = new DebugTargetsButton(this.config, 10.1);
    
    // Register all buttons
    this.buttons = [
      this.generatorButton,
      this.workspaceButton,
      this.configurationButton,
      this.targetButton,
      this.debugTargetsButton
    ];
    
    // Listen for configuration changes
    this.config.onChange(() => this.update());
    
    // Listen for Malterlib project detection changes (awaitable in scanner queue)
    MalterlibProjectDetector.onDidChangeDetectionAsync(() => this.update());
    
    // Initial update
    this.update();
  }
  
  dispose(): void {
    this.buttons.forEach(btn => btn.dispose());
  }
  
  update(): void {
    this.buttons.forEach(btn => btn.update());
  }
  
  // Control overall visibility
  setVisible(visible: boolean): void {
    this.buttons.forEach(btn => btn.forceHidden = !visible);
  }
  
  // Control methods for button states
  setGeneratorText(text: string): void {
    this.generatorButton.text = text;
  }
  
  setWorkspaceText(text: string): void {
    this.workspaceButton.text = text;
  }
  
  setConfigurationText(text: string): void {
    this.configurationButton.text = text;
  }
  
  setTargetText(text: string): void {
    this.targetButton.text = text;
  }
  
  setDebugTargetsText(text: string): void {
    this.debugTargetsButton.text = text;
  }
  
  setGeneratorTooltip(tooltip: string): void {
    this.generatorButton.tooltip = tooltip;
  }
  
  setWorkspaceTooltip(tooltip: string): void {
    this.workspaceButton.tooltip = tooltip;
  }
  
  setConfigurationTooltip(tooltip: string): void {
    this.configurationButton.tooltip = tooltip;
  }
  
  setTargetTooltip(tooltip: string): void {
    this.targetButton.tooltip = tooltip;
  }
  
  setDebugTargetsTooltip(tooltip: string): void {
    this.debugTargetsButton.tooltip = tooltip;
  }
}