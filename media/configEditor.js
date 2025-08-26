(function() {
  const vscode = acquireVsCodeApi();

  // Special GUID marker for new environment variable inputs to avoid conflicts with actual var names
  const NEW_ENV_GUID = 'DE25C9C6-DAAE-41FE-A658-027F9CE5AD8B';

  let config = {
    version: '1.0',
    workspaces: {}
  };

  let scannerData = {}; // { workspaceName: { targets: [targetNames], defaultConfigs: { targetName: { configName: config } } } }
  let isLocalConfig = false; // Whether we're editing local.json
  let selectedWorkspace = null;
  let selectedTarget = null;
  let selectionState = { selectedWorkspace: null, selectedConfiguration: null, debugTargets: [] };
  let isFiltered = true;
  let skipNextChange = false; // Flag to skip change event after merge operations
  let focusState = null; // Store focus state for restoration after re-render
  let lastSavedConfig = null; // Track last saved config to prevent unnecessary saves
  let lastSavedCleanConfig = null; // Parsed clean config snapshot for quick access
  let activeTabIndex = 0; // Track which tab is currently active
  let isProcessingEnvKey = false; // Flag to prevent double processing of env key changes

  // Store event handler references to properly remove them
  let contentContainerHandlers = {
    click: null,
    change: null,
    input: null,
    keydown: null
  };
  let tabsContainerHandler = null;

  // Helper function to get default config from scanner data
  function getDefaultConfig(workspaceName, targetName, configName) {
    const wsData = scannerData[workspaceName];
    if (!wsData || !wsData.defaultConfigs) return null;
    const targetConfigs = wsData.defaultConfigs[targetName];
    if (!targetConfigs) return null;
    const defaultedConfigName = configName || selectionState.selectedConfiguration || 'default';
    if (targetConfigs[defaultedConfigName])
      return targetConfigs[defaultedConfigName];

    for (const [, defaultConfig] of Object.entries(targetConfigs))
      return defaultConfig;

    return null;
  }

  // Get the comparison config for a launch - either expanded base launch or scanner defaults
  function getComparisonConfig(workspaceName, targetName, launchIndex) {
    if (!isLocalConfig) {
      // For base malterlib.json, just use scanner defaults
      return getDefaultConfig(workspaceName, targetName) || {};
    }

    // For local.json, check if this is a base launch
    const launches = config?.workspaces?.[workspaceName]?.targets?.[targetName]?.launches || [];
    const launch = launches[launchIndex];
    if (!launch)
      return getDefaultConfig(workspaceName, targetName) || {};

    // If it's marked as from base, get the expanded base launch
    if (launch.isFromBase) {
      const baseLaunches = scannerData[workspaceName]?.baseLaunches?.[targetName] || [];
      const baseLaunch = baseLaunches.find(b => (b.name || getDefaultConfig(workspaceName, targetName)?.name || targetName) === launch.name);

      if (baseLaunch) {
        const defaultConfig = getDefaultConfig(workspaceName, targetName) || {};
        // Return expanded base launch (base values with scanner defaults as fallback)
        return {
          name: baseLaunch.name || defaultConfig.name || targetName,
          executablePath: baseLaunch.executablePath || defaultConfig.executablePath || '',
          workingDirectory: baseLaunch.workingDirectory || defaultConfig.workingDirectory || '',
          arguments: baseLaunch.arguments || defaultConfig.arguments || [],
          environment: baseLaunch.environment || defaultConfig.environment || {}
        };
      }
    }

    // For local-only launches, use scanner defaults
    return getDefaultConfig(workspaceName, targetName) || {};
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupResizeHandle();
    vscode.postMessage({ command: 'load' });
  });

  // Handle messages from extension
  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
      case 'loadConfig':
        // Store current selection and UI state before updating config
        const previousWorkspace = selectedWorkspace;
        const previousTarget = selectedTarget;
        const previousTabIndex = activeTabIndex;

        // Only update properties that are included in the message
        if (message.hasOwnProperty('config'))
          config = message.config || { version: '1.0', workspaces: {} };
        else if (!config)
          config = { version: '1.0', workspaces: {} };

        if (message.hasOwnProperty('isLocalConfig'))
          isLocalConfig = message.isLocalConfig || false;
        if (message.hasOwnProperty('selectionState'))
          selectionState = message.selectionState;
        if (message.hasOwnProperty('scannerData'))
          scannerData = message.scannerData || {};

        // For local.json: ensure base launch names are in the config
        // This ensures proper matching and saving
        if ((message.hasOwnProperty('scannerData') || message.hasOwnProperty('config')) && isLocalConfig && scannerData) {
          for (const workspaceName in scannerData) {
            const wsData = scannerData[workspaceName];
            if (wsData.baseLaunches) {
              for (const targetName in wsData.baseLaunches) {
                const baseLaunches = wsData.baseLaunches[targetName];
                if (baseLaunches && baseLaunches.length > 0) {
                  // Ensure config structure exists
                  if (!config.workspaces) config.workspaces = {};
                  if (!config.workspaces[workspaceName])
                    config.workspaces[workspaceName] = { targets: {} };
                  if (!config.workspaces[workspaceName].targets[targetName])
                    config.workspaces[workspaceName].targets[targetName] = { launches: [] };
                  if (!config.workspaces[workspaceName].targets[targetName].launches)
                    config.workspaces[workspaceName].targets[targetName].launches = [];

                  const localLaunches = config.workspaces[workspaceName].targets[targetName].launches;

                  // Get default config for generating names
                  const defaultConfig = getDefaultConfig(workspaceName, targetName, selectionState?.selectedConfiguration || 'default') || {};
                  // Use target name as default (which is what scanner provides)
                  const defaultName = defaultConfig.name || targetName;

                  // Add name entries for base launches that don't have local entries
                  for (let i = 0; i < baseLaunches.length; i++) {
                    const baseLaunch = baseLaunches[i];
                    // Use base launch name, or default if it doesn't have one
                    const baseName = baseLaunch.name || defaultName;
                    const hasLocal = localLaunches.some(l => l.name === baseName);
                    if (!hasLocal) {
                      // Add minimal entry with just the name
                      // This will be filtered out when saving if no actual overrides are made
                      localLaunches.push({ name: baseName, isFromBase: true });
                    }
                  }
                }
              }
            }
          }
        }

        // Update lastSavedConfig when loading a new config (only if config was actually updated)
        if (message.hasOwnProperty('config')) {
          lastSavedCleanConfig = generateCleanConfig(config);
          lastSavedConfig = JSON.stringify(lastSavedCleanConfig);
        }
        renderTree();

        // Restore previous selection if it still exists
        // Don't restore if the selection was cleared due to workspace context change
        if (previousWorkspace && previousTarget && (!isFiltered || selectionState.selectedWorkspace === previousWorkspace)) {
          // Check if the workspace and target still exist in the new config
          if (scannerData[previousWorkspace] &&
              scannerData[previousWorkspace].targets &&
              scannerData[previousWorkspace].targets.includes(previousTarget)) {
            // Restore the active tab index if it's still valid
            const launches = config.workspaces[previousWorkspace]?.targets?.[previousTarget]?.launches || [];
            if (previousTabIndex < launches.length)
              activeTabIndex = previousTabIndex;
            selectTarget(previousWorkspace, previousTarget);
          } else
            selectedWorkspace = selectedTarget = null;
            autoSelectFirstDebugTarget();
        } else {
          selectedWorkspace = selectedTarget = null;
          autoSelectFirstDebugTarget();
        }
        break;
      case 'postCopyDestinations':
        // Handle PostCopy destinations response
        if (message.destinations)
          createPostCopyDropdown(message.destinations);
        break;
    }
  });

  function setupEventListeners() {
    document.getElementById('filter-tree-btn').addEventListener('click', toggleFilter);
    document.getElementById('add-launch-btn').addEventListener('click', () => {
      addLaunchConfig();
    });

    // PostCopy Add Launch button
    document.getElementById('add-postcopy-launch-btn').addEventListener('click', () => {
      showPostCopyDropdownForNewLaunch();
    });

    // Debug target selection buttons
    document.getElementById('select-multi-debug-btn').addEventListener('click', () => {
      vscode.postMessage({ command: 'selectDebugTargets' });
    });

    document.getElementById('select-single-debug-btn').addEventListener('click', () => {
      vscode.postMessage({ command: 'selectSingleDebugTarget' });
    });

  }

  function setupResizeHandle() {
    const resizeHandle = document.getElementById('resize-handle');
    const treePanel = document.getElementById('tree-panel');
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = treePanel.offsetWidth;
      resizeHandle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const newWidth = Math.min(Math.max(200, startWidth + deltaX), 600);
      treePanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizeHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  function toggleFilter() {
    isFiltered = !isFiltered;
    const btn = document.getElementById('filter-tree-btn');
    if (isFiltered)
      btn.classList.add('active');
    else
      btn.classList.remove('active');
    renderTree();
  }

  function getFilteredWorkspaces() {
    let workspacesToShow = {};

    if (isFiltered && selectionState.selectedWorkspace) {
      // Show only selected workspace and its targets
      if (scannerData[selectionState.selectedWorkspace]) {
        const wsData = scannerData[selectionState.selectedWorkspace];
        workspacesToShow[selectionState.selectedWorkspace] = {
          targets: selectionState.debugTargets && selectionState.debugTargets.length > 0
            ? wsData.targets.filter(t => selectionState.debugTargets.includes(t))
            : wsData.targets,
          defaultConfigs: wsData.defaultConfigs
        };
      }
    } else {
      // Show all
      workspacesToShow = scannerData;
    }

    return workspacesToShow;
  }

  function autoSelectFirstDebugTarget() {
    // Clear selection if current target is not in the tree
    if (selectedTarget) {
      const workspacesToShow = getFilteredWorkspaces();

      // Check if selected target exists in what will be shown
      let targetExists = false;
      for (const ws in workspacesToShow) {
        if (workspacesToShow[ws].targets && workspacesToShow[ws].targets.includes(selectedTarget)) {
          targetExists = true;
          break;
        }
      }

      if (!targetExists)
        selectedTarget = null;
    }

    if (!selectedTarget && selectionState.debugTargets && selectionState.debugTargets.length > 0) {
      const firstTarget = selectionState.debugTargets[0];
      // Find workspace for this target
      // If filtering is enabled, only look in the selected workspace
      const workspacesToSearch = isFiltered && selectionState.selectedWorkspace
        ? [selectionState.selectedWorkspace]
        : [selectionState.selectedWorkspace, ...Object.keys(scannerData)];

      for (const ws of workspacesToSearch) {
        if (scannerData[ws] && scannerData[ws].targets && scannerData[ws].targets.includes(firstTarget)) {
          selectTarget(ws, firstTarget);
          break;
        }
      }
    }
  }

  function renderTree() {
    // Preserve current selection
    const currentWorkspace = selectedWorkspace;
    const currentTarget = selectedTarget;

    // Preserve expansion states
    const expandedWorkspaces = new Set();
    document.querySelectorAll('.tree-item.workspace.expanded').forEach(item => {
      expandedWorkspaces.add(item.dataset.workspace);
    });

    const container = document.getElementById('tree-container');
    container.innerHTML = '';

    const workspacesToShow = getFilteredWorkspaces();

    // Build tree from filtered data
    Object.keys(workspacesToShow).sort().forEach(workspaceName => {
      const workspaceItem = createWorkspaceTreeItem(workspaceName);
      container.appendChild(workspaceItem);

      const targets = workspacesToShow[workspaceName].targets || [];
      targets.sort().forEach(targetName => {
        const targetItem = createTargetTreeItem(workspaceName, targetName);
        container.appendChild(targetItem);
      });
    });

    // Add configured items that don't exist in scanner data (if not filtered)
    if (!isFiltered) {
      Object.keys(config?.workspaces).forEach(workspaceName => {
        if (!scannerData[workspaceName]) {
          // Workspace exists in config but not in scanner - mark as missing
          const workspaceItem = createWorkspaceTreeItem(workspaceName, true);
          container.appendChild(workspaceItem);

          // Add its targets as missing too
          const workspace = config?.workspaces?.[workspaceName];
          Object.keys(workspace.targets || {}).forEach(targetName => {
            const targetItem = createTargetTreeItem(workspaceName, targetName, true);
            container.appendChild(targetItem);
          });
        } else {
          // Check for missing targets in existing workspace
          const workspace = config?.workspaces?.[workspaceName];
          const scannedTargets = scannerData[workspaceName]?.targets || [];
          Object.keys(workspace.targets || {}).forEach(targetName => {
            if (!scannedTargets.includes(targetName)) {
              // Target exists in config but not in scanner
              const targetItem = createTargetTreeItem(workspaceName, targetName, true);
              // Find and insert after workspace item
              const workspaceEl = container.querySelector(`[data-workspace="${workspaceName}"]:not([data-target])`);
              if (workspaceEl) {
                let nextEl = workspaceEl.nextSibling;
                while (nextEl && nextEl.dataset && nextEl.dataset.workspace === workspaceName)
                  nextEl = nextEl.nextSibling;
                container.insertBefore(targetItem, nextEl);
              } else
                container.appendChild(targetItem);
            }
          });
        }
      });
    }

    // Restore expansion states
    document.querySelectorAll('.tree-item.workspace').forEach(item => {
      if (expandedWorkspaces.has(item.dataset.workspace)) {
        item.classList.remove('collapsed');
        item.classList.add('expanded');
        // Show the targets for expanded workspaces
        document.querySelectorAll(`.tree-item.target[data-workspace="${item.dataset.workspace}"]`).forEach(target => {
          target.style.display = '';
        });
      }
    });

    // Restore selection if it still exists
    if (currentWorkspace && currentTarget) {
      // Update visual selection without triggering a full re-render
      document.querySelectorAll('.tree-item').forEach(item => {
        item.classList.remove('selected');
        if (item.dataset.workspace === currentWorkspace &&
            item.dataset.target === currentTarget)
          item.classList.add('selected');
      });
    }
  }

  function createWorkspaceTreeItem(workspaceName, isMissing = false) {
    const div = document.createElement('div');
    // Start collapsed unless it's the selected workspace
    const isSelected = workspaceName === selectionState.selectedWorkspace;
    div.className = `tree-item workspace ${isSelected ? 'expanded' : 'collapsed'}`;
    div.dataset.workspace = workspaceName;

    // Determine configured state from last saved clean config (or cleaned current)
    const wsSource = lastSavedCleanConfig || generateCleanConfig(config);
    const wsEntry = wsSource?.workspaces?.[workspaceName];
    const isConfigured = wsEntry ? Object.values(wsEntry.targets || {})
      .some((t) => (t.launches?.length || 0) > 0) : false;

    if (isMissing)
      div.classList.add('missing');
    else if (isConfigured)
      div.classList.add('configured');
    else
      div.classList.add('unconfigured');

    const chevron = document.createElement('span');
    chevron.className = 'tree-chevron';

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = '📁';

    const label = document.createElement('span');
    label.textContent = workspaceName;

    div.appendChild(chevron);
    div.appendChild(icon);
    div.appendChild(label);

    // Add config count using last saved clean config if available
    if (isConfigured) {
      const source = lastSavedCleanConfig || generateCleanConfig(config);
      const ws = source?.workspaces?.[workspaceName];
      const count = ws ? Object.values(ws.targets || {})
        .reduce((sum, target) => sum + (target.launches?.length || 0), 0) : 0;
      if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'config-count';
        badge.textContent = count.toString();
        div.appendChild(badge);
      }
    }

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWorkspace(workspaceName);
      selectWorkspace(workspaceName);
    });

    return div;
  }

  function createTargetTreeItem(workspaceName, targetName, isMissing = false) {
    const div = document.createElement('div');
    div.className = 'tree-item target';
    div.dataset.workspace = workspaceName;
    div.dataset.target = targetName;
    div.dataset.workspaceTarget = `${workspaceName}|${targetName}`;

    // Determine configured state from last saved clean config (or cleaned current)
    const tgtSource = lastSavedCleanConfig || generateCleanConfig(config);
    const isConfigured = ((tgtSource?.workspaces?.[workspaceName]?.targets?.[targetName]?.launches?.length) || 0) > 0;

    if (isMissing)
      div.classList.add('missing');
    else if (isConfigured)
      div.classList.add('configured');
    else
      div.classList.add('unconfigured');

    // Initially hide if workspace is collapsed
    const workspaceEl = document.querySelector(`[data-workspace="${workspaceName}"]:not([data-target])`);
    if (workspaceEl && workspaceEl.classList.contains('collapsed'))
      div.style.display = 'none';

    const chevron = document.createElement('span');
    chevron.className = 'tree-chevron';

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = '🎯';

    const label = document.createElement('span');
    label.textContent = targetName;

    div.appendChild(chevron);
    div.appendChild(icon);
    div.appendChild(label);

    // Add config count using last saved clean config if available
    if (isConfigured) {
      const source = lastSavedCleanConfig || generateCleanConfig(config);
      const count = source?.workspaces?.[workspaceName]?.targets?.[targetName]?.launches?.length || 0;
      if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'config-count';
        badge.textContent = count.toString();
        div.appendChild(badge);
      }
    }

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      selectTarget(workspaceName, targetName);
    });

    return div;
  }

  function toggleWorkspace(workspaceName) {
    const workspaceEl = document.querySelector(`[data-workspace="${workspaceName}"]:not([data-target])`);
    if (!workspaceEl) return;

    const isCollapsed = workspaceEl.classList.contains('collapsed');

    if (isCollapsed) {
      workspaceEl.classList.remove('collapsed');
      workspaceEl.classList.add('expanded');
    } else {
      workspaceEl.classList.remove('expanded');
      workspaceEl.classList.add('collapsed');
    }

    // Show/hide targets
    const targets = document.querySelectorAll(`[data-workspace="${workspaceName}"][data-target]`);
    targets.forEach(target => {
      target.style.display = isCollapsed ? '' : 'none';
    });
  }

  function selectWorkspace(workspaceName) {
    selectedWorkspace = workspaceName;
    selectedTarget = null;

    // Update selection in tree
    document.querySelectorAll('.tree-item').forEach(item => {
      item.classList.remove('selected');
    });
    const workspaceEl = document.querySelector(`[data-workspace="${workspaceName}"]:not([data-target])`);
    if (workspaceEl)
      workspaceEl.classList.add('selected');

    // Hide config panel - show empty state
    document.getElementById('config-title').textContent = 'Select a target to configure';
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('target-config').style.display = 'none';
  }

  function selectTarget(workspaceName, targetName) {
    selectedWorkspace = workspaceName;
    selectedTarget = targetName;

    // Expand parent workspace if collapsed
    const workspaceEl = document.querySelector(`[data-workspace="${workspaceName}"]:not([data-target])`);
    if (workspaceEl && workspaceEl.classList.contains('collapsed')) {
      workspaceEl.classList.remove('collapsed');
      workspaceEl.classList.add('expanded');
      // Show all targets under this workspace
      document.querySelectorAll(`[data-workspace="${workspaceName}"][data-target]`).forEach(target => {
        target.style.display = '';
      });
    }

    // Update selection in tree
    document.querySelectorAll('.tree-item').forEach(item => {
      item.classList.remove('selected');
    });
    const targetEl = document.querySelector(`[data-workspace-target="${workspaceName}|${targetName}"]`);
    if (targetEl)
      targetEl.classList.add('selected');


    // Show config panel for this target
    showTargetConfig(workspaceName, targetName);
  }

  function showTargetConfig(workspaceName, targetName) {
    document.getElementById('config-title').textContent = `${workspaceName} / ${targetName}`;
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('target-config').style.display = 'block';

    // Only reset active tab when switching to a different target
    if (selectedWorkspace !== workspaceName || selectedTarget !== targetName)
      activeTabIndex = 0;
    renderLaunchConfigs(workspaceName, targetName);
  }

  function saveFocusState() {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'BUTTON')) {
      focusState = {
        type: activeEl.tagName,
        field: activeEl.dataset.field,
        action: activeEl.dataset.action,
        launchIndex: activeEl.dataset.launchIndex || activeEl.dataset.index,
        argIndex: activeEl.dataset.argIndex,
        envKey: activeEl.dataset.envKey,
        selectionStart: activeEl.selectionStart,
        selectionEnd: activeEl.selectionEnd,
        value: activeEl.value,
        textContent: activeEl.textContent,
        tabIndex: activeTabIndex  // Save current tab
      };
    } else
      focusState = null;
  }

  function restoreFocusState() {
    if (!focusState) return;

    setTimeout(() => {
      let selector = '';

      // Build selector based on what was focused
      if (focusState.type === 'BUTTON') {
        // Handle button focus
        if (focusState.action === 'remove-launch')
          selector = `button[data-action="remove-launch"][data-index="${focusState.launchIndex}"]`;
        else if (focusState.action === 'add-argument')
          selector = `button[data-action="add-argument"][data-index="${focusState.launchIndex}"]`;
        else if (focusState.action === 'add-env')
          selector = `button[data-action="add-env"][data-index="${focusState.launchIndex}"]`;
        else if (focusState.action === 'remove-arg')
          selector = `button[data-action="remove-arg"][data-launch-index="${focusState.launchIndex}"][data-arg-index="${focusState.argIndex}"]`;
        else if (focusState.action === 'remove-env')
          selector = `button[data-action="remove-env"][data-launch-index="${focusState.launchIndex}"][data-env-key="${focusState.envKey}"]`;
        else if (focusState.textContent) {
          // Fallback: find button by text content
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            if (btn.textContent === focusState.textContent) {
              btn.focus();
              break;
            }
          }
          focusState = null;
          return;
        }
      } else if (focusState.field === 'bash-line')
        selector = `textarea[data-launch-index="${focusState.launchIndex}"][data-field="bash-line"]`;
      else if (focusState.argIndex !== undefined)
        selector = `input[data-launch-index="${focusState.launchIndex}"][data-arg-index="${focusState.argIndex}"]`;
      else if (focusState.envKey !== undefined)
        selector = `input[data-launch-index="${focusState.launchIndex}"][data-env-key="${focusState.envKey}"][data-field="${focusState.field}"]`;
      else if (focusState.field)
        selector = `.launch-config[data-index="${focusState.launchIndex}"] input[data-field="${focusState.field}"]`;

      if (selector) {
        const element = document.querySelector(selector);
        if (element) {
          element.focus();
          if ((element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') && focusState.selectionStart !== undefined && focusState.selectionEnd !== undefined)
            element.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
        }
      }

      focusState = null;
    }, 0);
  }

  function renderLaunchConfigs(workspaceName, targetName) {
    // Save focus state before re-rendering
    saveFocusState();

    // Cleanup old event listeners FIRST before any DOM manipulation
    cleanupEventListeners();

    const tabsContainer = document.getElementById('tabs-container');
    const contentContainer = document.getElementById('launch-content');

    if (!tabsContainer || !contentContainer) return;

    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';

    // Ensure structure exists
    if (!config?.workspaces)
      config.workspaces = {};
    if (!config?.workspaces?.[workspaceName])
      config.workspaces[workspaceName] = { targets: {} };
    if (!config?.workspaces?.[workspaceName]?.targets?.[targetName])
      config.workspaces[workspaceName].targets[targetName] = { launches: [] };

    // Get both local launches and base launches (if editing local.json)
    let launches = config.workspaces[workspaceName].targets[targetName].launches || [];
    const baseLaunches = (isLocalConfig && scannerData[workspaceName]?.baseLaunches?.[targetName]) || [];

    // Get default config for this workspace/target
    const defaultConfig = getDefaultConfig(workspaceName, targetName);

    if (isLocalConfig && baseLaunches.length > 0) {
      // Editing local.json with base configs
      // Ensure base launches have explicit names (using default if needed)
      const namedBaseLaunches = baseLaunches.map((launch) => {
        if (!launch.name) {
          // Use the target name as default (which is what scanner provides)
          return {
            ...launch,
            name: defaultConfig?.name || targetName,
            isFromBase: true
          };
        }
        return { ...launch, isFromBase: true };
      });

      // Build a map of existing launches by name
      const launchMap = new Map();
      for (const launch of launches)
        launchMap.set(launch.name, launch);

      // Start with base launches
      const mergedLaunches = [];
      for (const baseLaunch of namedBaseLaunches) {
        const localOverride = launchMap.get(baseLaunch.name);
        if (localOverride) {
          // Merge base with local override
          mergedLaunches.push({ ...baseLaunch, ...localOverride, isFromBase: true });
          launchMap.delete(baseLaunch.name); // Remove so we don't add it again
        } else {
          // Just the base launch
          mergedLaunches.push(baseLaunch);
        }
      }

      // Add any remaining local-only launches
      for (const [, launch] of launchMap)
        mergedLaunches.push({ ...launch, isFromBase: false });

      // Update the config's launches array with the merged result
      config.workspaces[workspaceName].targets[targetName].launches = mergedLaunches;
      launches = mergedLaunches;
    }

    if (launches.length === 0) {
      // Get default configuration
      if (defaultConfig) {
        // Prepopulate the model with default values
        config.workspaces[workspaceName].targets[targetName].launches.push({
          name: defaultConfig.name || targetName,
          executablePath: defaultConfig.executablePath || '',
          workingDirectory: defaultConfig.workingDirectory || '',
          arguments: defaultConfig.arguments ? [...defaultConfig.arguments] : [],
          environment: defaultConfig.environment ? {...defaultConfig.environment} : {}
        });
        launches = config.workspaces[workspaceName].targets[targetName].launches;
      }
    } else if (defaultConfig) {
      for (const launch of launches) {
        if (!launch.isFromBase) {  // Only apply defaults to local launches
          launch.name = launch.name || (defaultConfig.name || targetName);
          launch.executablePath = launch.executablePath || (defaultConfig.executablePath || '');
          launch.workingDirectory = launch.workingDirectory || (defaultConfig.workingDirectory || '');
          launch.arguments = launch.arguments || (defaultConfig.arguments ? [...defaultConfig.arguments] : []);
          launch.environment = launch.environment || (defaultConfig.environment ? {...defaultConfig.environment} : {});
        }
      }
    }

    // Create tabs for each launch configuration
    launches.forEach((launch, index) => {
      const isFromBase = launch.isFromBase;
      const tab = createTab(launch.name || `Config ${index + 1}`, index, index === activeTabIndex, launch.enabled === false, isFromBase);
      tabsContainer.appendChild(tab);
    });

    // Render the active tab's content
    if (launches.length > 0 && activeTabIndex < launches.length) {
      const activeLaunch = launches[activeTabIndex];
      const isFromBase = activeLaunch.isFromBase;
      const launchElement = createLaunchElement(workspaceName, targetName, activeLaunch, activeTabIndex, isFromBase);
      contentContainer.appendChild(launchElement);
    }

    // Setup event listeners for dynamic content
    setupDynamicEventListeners();

    // Auto-resize all bash line textareas
    // Do it immediately and also after a small delay to ensure DOM is ready
    autoResizeBashLineTextareas();
    setTimeout(() => autoResizeBashLineTextareas(), 0);

    // Restore focus after re-rendering
    restoreFocusState();
  }

  function createTab(name, index, isActive, isDisabled = false, isFromBase = false) {
    const tab = document.createElement('div');
    tab.className = 'tab' + (isActive ? ' active' : '') + (isDisabled ? ' disabled' : '') + (isFromBase ? ' from-base' : '');
    tab.dataset.index = index;
    tab.dataset.fromBase = isFromBase;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = name || `Config ${index + 1}`;
    tab.appendChild(nameSpan);

    // Only add close button for non-base configs
    if (!isFromBase) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '×';
      closeBtn.dataset.action = 'remove-launch';
      closeBtn.dataset.index = index;
      tab.appendChild(closeBtn);
    } else {
      // Add a badge for base configs
      const baseBadge = document.createElement('span');
      baseBadge.className = 'tab-badge';
      baseBadge.textContent = 'base';
      baseBadge.title = 'From base configuration';
      tab.appendChild(baseBadge);
    }

    // Don't add event listener here - we'll use event delegation instead

    return tab;
  }

  function selectTab(index) {
    if (activeTabIndex !== index) {
      activeTabIndex = index;
      renderLaunchConfigs(selectedWorkspace, selectedTarget);
    }
  }

  function createLaunchElement(workspaceName, targetName, launch, index, isFromBase = false) {
    const div = document.createElement('div');
    div.className = 'launch-config' + (isFromBase ? ' from-base' : '');
    div.dataset.index = index;
    div.dataset.workspace = workspaceName;
    div.dataset.target = targetName;
    div.dataset.fromBase = isFromBase;
    div.dataset.launchName = launch.name || '';

    const compareConfig = getComparisonConfig(workspaceName, targetName, index);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'launch-content';

    // Add disabled class if configuration is disabled
    if (launch.enabled === false)
      div.classList.add('disabled');

    // Add notice for base configs
    if (isFromBase) {
      const notice = document.createElement('div');
      notice.className = 'base-config-notice';

      // Create the text with a clickable link
      const textBefore = document.createTextNode('This configuration is from the base ');
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'malterlib.json';
      link.className = 'base-config-link';
      link.title = 'Open base configuration file';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        vscode.postMessage({ command: 'openBaseConfig' });
      });
      const textAfter = document.createTextNode(' file. You can override values by editing fields below.');

      notice.appendChild(textBefore);
      notice.appendChild(link);
      notice.appendChild(textAfter);
      contentDiv.appendChild(notice);
    }

    // Enabled checkbox and PostCopy button group
    const controlGroup = document.createElement('div');
    controlGroup.className = 'control-group';
    controlGroup.style.display = 'flex';
    controlGroup.style.alignItems = 'center';
    controlGroup.style.gap = '16px';

    // Enabled checkbox
    const enabledGroup = document.createElement('div');
    enabledGroup.className = 'form-group checkbox-group';
    enabledGroup.style.margin = '0';

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'checkbox-label';

    const enabledCheckbox = document.createElement('input');
    enabledCheckbox.type = 'checkbox';
    enabledCheckbox.checked = launch.enabled !== false;
    enabledCheckbox.dataset.field = 'enabled';
    enabledCheckbox.dataset.launchIndex = index;

    const enabledText = document.createElement('span');
    enabledText.textContent = 'Enabled';

    enabledLabel.appendChild(enabledCheckbox);
    enabledLabel.appendChild(enabledText);
    enabledGroup.appendChild(enabledLabel);
    controlGroup.appendChild(enabledGroup);

    // PostCopy destination button
    const postCopyButton = document.createElement('button');
    postCopyButton.className = 'postcopy-button';
    postCopyButton.textContent = 'Populate from PostCopy.MConfig';
    postCopyButton.dataset.action = 'selectPostCopy';
    postCopyButton.dataset.launchIndex = index;
    postCopyButton.title = 'Select a PostCopy destination to auto-populate executable path and working directory';

    // Tone down the button styling
    postCopyButton.style.background = 'var(--vscode-button-secondaryBackground)';
    postCopyButton.style.color = 'var(--vscode-button-secondaryForeground)';
    postCopyButton.style.border = '1px solid var(--vscode-button-secondaryHoverBackground)';
    postCopyButton.style.opacity = '0.9';
    postCopyButton.style.padding = '4px 12px';
    postCopyButton.style.borderRadius = '3px';
    postCopyButton.style.cursor = 'pointer';
    postCopyButton.style.fontSize = '12px';

    postCopyButton.onmouseover = () => {
      postCopyButton.style.background = 'var(--vscode-button-secondaryHoverBackground)';
    };
    postCopyButton.onmouseout = () => {
      postCopyButton.style.background = 'var(--vscode-button-secondaryBackground)';
    };

    controlGroup.appendChild(postCopyButton);

    contentDiv.appendChild(controlGroup);

    // Name field - check if it matches default for styling
    const nameMatchesDefault = launch.name === compareConfig.name;
    const nameGroup = createFormGroup('Name:',
      launch.name || '',
      'Enter configuration name',
      `name-${index}`,
      'name',
      nameMatchesDefault,
      isFromBase);  // Make name readonly for base configs

    contentDiv.appendChild(nameGroup);

    // Executable Path field - check if it matches default for styling
    const execMatchesDefault = launch.executablePath === compareConfig.executablePath;
    const execGroup = createFormGroup('Executable Path:',
      launch.executablePath || '',
      'Enter executable path',
      `exec-${index}`,
      'executablePath',
      execMatchesDefault);

    contentDiv.appendChild(execGroup);

    // Working Directory field - check if it matches default for styling
    const wdMatchesDefault = launch.workingDirectory === compareConfig.workingDirectory;
    const wdGroup = createFormGroup('Working Directory:',
      launch.workingDirectory || '',
      'Enter working directory',
      `wd-${index}`,
      'workingDirectory',
      wdMatchesDefault);

    contentDiv.appendChild(wdGroup);

    // Arguments
    const argsGroup = document.createElement('div');
    argsGroup.className = 'form-group';

    // Create label and bash input on same line
    const argsHeader = document.createElement('div');
    argsHeader.className = 'args-header';

    const argsLabel = document.createElement('label');
    argsLabel.textContent = 'Arguments:';
    argsHeader.appendChild(argsLabel);

    // Bash command line input
    const bashLineInput = document.createElement('textarea');
    bashLineInput.className = 'bash-line-input';
    bashLineInput.placeholder = 'Enter arguments as a bash command line...';
    bashLineInput.value = argumentsToBashLine(launch.arguments || []);
    bashLineInput.dataset.launchIndex = index;
    bashLineInput.dataset.field = 'bash-line';
    bashLineInput.dataset.index = index; // Add index for focus restoration
    bashLineInput.rows = 1;
    bashLineInput.spellcheck = false;

    // Check if arguments match default for styling
    const argsMatchDefault = JSON.stringify(launch.arguments || []) === JSON.stringify(compareConfig.arguments || []);
    if (argsMatchDefault)
      bashLineInput.classList.add('default-value');

    // Auto-resize textarea
    bashLineInput.style.resize = 'none';
    bashLineInput.style.overflow = 'hidden';
    bashLineInput.style.height = '15px';  // Initial height to match other inputs
    bashLineInput.addEventListener('input', () => {
      // Reset to min height to get accurate scrollHeight
      bashLineInput.style.height = '15px';
      // Set to scrollHeight if content needs more space
      if (bashLineInput.scrollHeight > 25) {  // Account for padding
        bashLineInput.style.height = bashLineInput.scrollHeight + 'px';
      }
    });

    // Handle Enter key to update arguments
    bashLineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Trigger the change event to update arguments
        bashLineInput.dispatchEvent(new Event('change', { bubbles: true }));
        // Don't blur - let the user continue editing
      }
    });

    argsHeader.appendChild(bashLineInput);
    argsGroup.appendChild(argsHeader);

    const argsList = document.createElement('div');
    argsList.className = 'args-list';
    argsList.id = `args-${index}`;
    argsList.innerHTML = renderArguments(launch.arguments || [], index, compareConfig.arguments || []);
    argsGroup.appendChild(argsList);

    const addArgBtn = document.createElement('button');
    addArgBtn.className = 'btn btn-small';
    addArgBtn.textContent = 'Add Argument';
    addArgBtn.dataset.action = 'add-argument';
    addArgBtn.dataset.index = index;

    const addArgRow = document.createElement('div');
    addArgRow.className = 'add-item-row';
    addArgRow.appendChild(addArgBtn);
    argsGroup.appendChild(addArgRow);

    contentDiv.appendChild(argsGroup);

    // Environment Variables
    const envGroup = document.createElement('div');
    envGroup.className = 'form-group';
    envGroup.innerHTML = '<label>Environment Variables:</label>';

    const envVars = document.createElement('div');
    envVars.className = 'env-vars';
    envVars.id = `env-${index}`;
    envVars.innerHTML = renderEnvVars(launch.environment || {}, index, launch._showNewEnvInput);
    envGroup.appendChild(envVars);

    const addEnvBtn = document.createElement('button');
    addEnvBtn.className = 'btn btn-small';
    addEnvBtn.textContent = 'Add Variable';
    addEnvBtn.dataset.action = 'add-env';
    addEnvBtn.dataset.index = index;

    const addEnvRow = document.createElement('div');
    addEnvRow.className = 'add-item-row';
    addEnvRow.appendChild(addEnvBtn);
    envGroup.appendChild(addEnvRow);

    contentDiv.appendChild(envGroup);
    div.appendChild(contentDiv);

    // Auto-size env var keys after rendering
    setTimeout(() => autoSizeEnvKeys(index), 0);

    return div;
  }

  function createFormGroup(label, value, placeholder, id, field, matchesDefault = false, isReadonly = false) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    group.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.id = id;
    input.dataset.field = field;
    // Extract launch index from id (e.g., "name-0" -> "0")
    const indexMatch = id.match(/-(\d+)$/);
    if (indexMatch)
      input.dataset.launchIndex = indexMatch[1];
    if (matchesDefault)
      input.className = 'default-value';
    if (isReadonly) {
      input.readOnly = true;
      input.title = 'Name cannot be changed for base configurations';
    }

    group.appendChild(input);
    return group;
  }

  function renderArguments(args, launchIndex, defaultArgs = []) {
    let html = '';
    args.forEach((arg, i) => {
      const isDefault = arg === defaultArgs[i];
      html += `<div class="arg-item">
        <input type="text" value="${arg}" placeholder="Argument ${i + 1}" data-arg-index="${i}" data-launch-index="${launchIndex}" ${isDefault ? 'class="default-value"' : ''}>
        <button class="btn btn-icon" data-action="remove-arg" data-launch-index="${launchIndex}" data-arg-index="${i}">×</button>
      </div>`;
    });
    return html;
  }

  // Convert arguments array to bash command line string
  function argumentsToBashLine(args) {
    if (!args || args.length === 0) return '';

    return args.map(arg => {
      // Check if argument needs quoting
      if (arg === '')
        return '""';  // Empty argument
      else if (/[^a-zA-Z0-9_\-\.\/=]/.test(arg)) {
        // Contains special characters, needs quoting
        // Escape special characters for double quotes: \, ", $, `
        const escaped = arg
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\$/g, '\\$')
          .replace(/`/g, '\\`');
        return '"' + escaped + '"';
      } else {
        // Simple argument, no quoting needed
        return arg;
      }
    }).join(' ');
  }

  // Parse bash command line string to arguments array
  function bashLineToArguments(line) {
    const args = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (escaped) {
        // In double quotes, only certain escapes are processed
        if (inDoubleQuote) {
          if (char === '\\' || char === '"' || char === '$' || char === '`')
            current += char;
          else
            current += '\\' + char;
        } else
          current += char;
        escaped = false;
        continue;
      }

      if (char === '\\') {
        if (inSingleQuote)
          current += char;
        else
          escaped = true;
        continue;
      }

      if (char === "'" && !inDoubleQuote && !escaped) {
        if (inSingleQuote) {
          // Check for escaped single quote pattern '\'
          if (i + 3 < line.length && line.substring(i, i + 4) === "'\\''") {
            current += "'";
            i += 3;
            continue;
          }
        }
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (char === '"' && !inSingleQuote && !escaped) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (char === ' ' && !inSingleQuote && !inDoubleQuote && !escaped) {
        if (current !== '' || args.length === 0) {
          args.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    // Add the last argument if any
    if (current !== '' || inSingleQuote || inDoubleQuote)
      args.push(current);

    return args;
  }

  function renderEnvVars(environment, launchIndex, showNewInput) {
    let html = '';
    Object.keys(environment).forEach(key => {
      // Skip completely empty environment variables
      if (!key && !environment[key])
        return;
      html += `<div class="env-var-item">
        <input type="text" class="env-key" value="${key}" placeholder="Variable name" data-env-key="${key}" data-launch-index="${launchIndex}" data-field="key">
        <input type="text" class="env-value" value="${environment[key]}" placeholder="Value" data-env-key="${key}" data-launch-index="${launchIndex}" data-field="value">
        <button class="btn btn-icon" data-action="remove-env" data-launch-index="${launchIndex}" data-env-key="${key}">×</button>
      </div>`;
    });

    // Add a new empty input row if requested
    if (showNewInput) {
      html += `<div class="env-var-item new-env">
        <input type="text" class="env-key" value="" placeholder="Variable name" data-env-key="${NEW_ENV_GUID}" data-launch-index="${launchIndex}" data-field="key">
        <input type="text" class="env-value" value="" placeholder="Value" data-env-key="${NEW_ENV_GUID}" data-launch-index="${launchIndex}" data-field="value">
        <button class="btn btn-icon" data-action="remove-env" data-launch-index="${launchIndex}" data-env-key="${NEW_ENV_GUID}" style="visibility: hidden;">×</button>
      </div>`;
    }

    return html;
  }

  function cleanupEventListeners() {
    const contentContainer = document.getElementById('launch-content');
    const tabsContainer = document.getElementById('tabs-container');

    // Remove old event listeners from content container
    if (contentContainer && contentContainerHandlers.click) {
      contentContainer.removeEventListener('click', contentContainerHandlers.click);
      contentContainer.removeEventListener('change', contentContainerHandlers.change);
      contentContainer.removeEventListener('input', contentContainerHandlers.input);
      contentContainer.removeEventListener('keydown', contentContainerHandlers.keydown);
    }

    // Remove old event listener from tabs container
    if (tabsContainer && tabsContainerHandler) {
      tabsContainer.removeEventListener('click', tabsContainerHandler);
      tabsContainerHandler = null;
    }
  }

  function setupDynamicEventListeners() {
    const contentContainer = document.getElementById('launch-content');
    const tabsContainer = document.getElementById('tabs-container');

    // First, cleanup any existing listeners
    cleanupEventListeners();

    // Store references to the handlers
    contentContainerHandlers.click = handleContainerClick;
    contentContainerHandlers.change = handleContainerChange;
    contentContainerHandlers.input = handleContainerInput;
    contentContainerHandlers.keydown = handleContainerKeydown;

    // Add new event listeners to content container
    if (contentContainer) {
      contentContainer.addEventListener('click', contentContainerHandlers.click);
      contentContainer.addEventListener('change', contentContainerHandlers.change);
      contentContainer.addEventListener('input', contentContainerHandlers.input);
      contentContainer.addEventListener('keydown', contentContainerHandlers.keydown);
    }

    // Create and store the tabs container handler
    tabsContainerHandler = (e) => {
      // Handle close button clicks
      if (e.target.classList.contains('tab-close')) {
        const index = parseInt(e.target.dataset.index);
        removeLaunchConfig(index);
        e.stopPropagation(); // Prevent tab selection
      }
      // Handle tab clicks (but not on close button)
      else {
        const tab = e.target.closest('.tab');
        if (tab && !e.target.classList.contains('tab-close')) {
          const index = parseInt(tab.dataset.index);
          selectTab(index);
        }
      }
    };

    // Add new event listener to tabs container
    if (tabsContainer)
      tabsContainer.addEventListener('click', tabsContainerHandler);
  }

  function handleContainerClick(e) {
    const action = e.target.dataset.action;
    if (!action) return;

    // For tab close button, use the index from the button
    // For other actions, use activeTabIndex since we only show one config
    const index = (action === 'remove-launch' && e.target.classList.contains('tab-close'))
      ? parseInt(e.target.dataset.index)
      : activeTabIndex;

    switch (action) {
      case 'remove-launch':
        removeLaunchConfig(index);
        break;
      case 'add-argument':
        addArgument(index);
        break;
      case 'add-env':
        addEnvVar(index);
        break;
      case 'remove-arg':
        removeArgument(index, parseInt(e.target.dataset.argIndex));
        break;
      case 'remove-env':
        removeEnvVar(index, e.target.dataset.envKey);
        break;
      case 'selectPostCopy':
        showPostCopyDropdown(e.target, index);
        break;
    }
  }

  function handleContainerInput(e) {
    // Handle real-time input changes for immediate saving
    // Use activeTabIndex since we only show one config at a time
    const index = activeTabIndex;

    // Skip inputs that will be handled by change event to avoid double processing
    // We want input event for text fields but not for complex operations

    // Handle checkbox inputs (enabled field)
    if (e.target.type === 'checkbox' && e.target.dataset.field === 'enabled') {
      updateLaunchConfig(index, 'enabled', e.target.checked);
      // Update visual state of the container
      const container = e.target.closest('.launch-config');
      if (container) {
        if (e.target.checked)
          container.classList.remove('disabled');
        else
          container.classList.add('disabled');
      }
    }
    // Handle regular text field inputs (name, executablePath, workingDirectory)
    else if (e.target.dataset.field && !e.target.dataset.envKey && e.target.dataset.field !== 'bash-line' && e.target.dataset.argIndex === undefined)
      updateLaunchConfig(index, e.target.dataset.field, e.target.value);
    // Handle environment variable value changes (not key changes which need special handling)
    else if (e.target.dataset.envKey !== undefined && e.target.dataset.field === 'value') {
      const key = e.target.dataset.envKey;
      updateEnvVarValue(index, key, e.target.value);
    }
    // Handle argument changes
    else if (e.target.dataset.argIndex !== undefined) {
      const argIndex = parseInt(e.target.dataset.argIndex);
      updateArgument(index, argIndex, e.target.value);
    }
    // Handle bash line changes
    else if (e.target.dataset.field === 'bash-line')
      updateBashLine(index, e.target.value);
  }

  function handleContainerChange(e) {
    // Skip this change event if flagged (used after merge operations)
    if (skipNextChange && e.target.dataset.argIndex !== undefined) {
      skipNextChange = false;
      return;
    }

    // Use activeTabIndex since we only show one config at a time
    const index = activeTabIndex;

    // Handle env var KEY changes (special handling needed)
    if (e.target.dataset.envKey !== undefined && e.target.dataset.field === 'key' && !isProcessingEnvKey) {
      const key = e.target.dataset.envKey;
      updateEnvVarKey(index, key, e.target.value, false);
    }
    // Other changes are already handled by input event
  }

  function handleContainerKeydown(e) {
    // Handle Tab key for env key fields (forward tab only, let Shift+Tab work normally)
    if (e.key === 'Tab' && !e.shiftKey && e.target.dataset.envKey !== undefined && e.target.dataset.field === 'key') {
      const index = activeTabIndex;
      const oldKey = e.target.dataset.envKey;
      const newKey = e.target.value;

      // Only prevent default and handle manually if the key changed
      if (oldKey !== newKey && !isProcessingEnvKey) {
        e.preventDefault();
        isProcessingEnvKey = true;
        updateEnvVarKey(index, oldKey, newKey, true);
        // Reset flag after a short delay
        setTimeout(() => { isProcessingEnvKey = false; }, 100);
      }
    }
    // Handle Enter key for env key fields - focus on value
    else if (e.key === 'Enter' && e.target.dataset.envKey !== undefined && e.target.dataset.field === 'key') {
      e.preventDefault();
      const index = activeTabIndex;
      const oldKey = e.target.dataset.envKey;
      const newKey = e.target.value;

      // Update the key if it changed
      if (oldKey !== newKey && !isProcessingEnvKey) {
        // Update the data attribute to the new key to prevent double rename on blur
        e.target.dataset.envKey = newKey;
        isProcessingEnvKey = true;
        updateEnvVarKey(index, oldKey, newKey, true);
        setTimeout(() => { isProcessingEnvKey = false; }, 100);
      }
      else {
        // Just focus on the value field
        const valueInput = e.target.parentElement.querySelector('input[data-field="value"]');
        if (valueInput) valueInput.focus();
      }
    }
    // Handle Enter key for env value fields
    else if (e.key === 'Enter' && e.target.dataset.envKey !== undefined && e.target.dataset.field === 'value') {
      e.preventDefault();
      const index = activeTabIndex;

      // Check if this is the last env var
      const envContainer = e.target.closest('.env-vars');
      const allEnvRows = envContainer.querySelectorAll('.env-var-item');
      const currentRow = e.target.closest('.env-var-item');
      const currentIndex = Array.from(allEnvRows).indexOf(currentRow);

      if (currentIndex < allEnvRows.length - 1) {
        // Not the last one, go to next env key
        const nextKeyInput = allEnvRows[currentIndex + 1].querySelector('input[data-field="key"]');
        if (nextKeyInput) nextKeyInput.focus();
      } else {
        // Last one, add a new environment variable and focus on it
        addEnvVar(index);
      }
    }
    // Handle Enter key for arguments
    else if (e.key === 'Enter' && e.target.dataset.argIndex !== undefined) {
      e.preventDefault();
      const launchIndex = activeTabIndex;
      const argIndex = parseInt(e.target.dataset.argIndex);

      // Shift+Enter: Split the current line at cursor position
      if (e.shiftKey) {
        const cursorPos = e.target.selectionStart;
        const currentValue = e.target.value;
        const beforeCursor = currentValue.substring(0, cursorPos);
        const afterCursor = currentValue.substring(cursorPos);

        // First, update the current input to only have the text before cursor
        e.target.value = beforeCursor;

        const launch = config.workspaces?.[selectedWorkspace].targets?.[selectedTarget].launches?.[launchIndex];
        if (!launch.arguments) launch.arguments = [];

        // Check if this argument exists in the data model
        if (argIndex >= launch.arguments.length) {
          // This is a new argument that hasn't been saved yet
          // Add both parts as new arguments
          launch.arguments.push(beforeCursor);
          launch.arguments.push(afterCursor);
        } else {
          // Update current argument with text before cursor
          launch.arguments[argIndex] = beforeCursor;
          // Insert new argument with text after cursor
          launch.arguments.splice(argIndex + 1, 0, afterCursor);
        }

        saveConfiguration();
        renderLaunchConfigs(selectedWorkspace, selectedTarget);

        // Focus on the new line at the beginning
        setTimeout(() => {
          const newArgsContainer = document.getElementById(`args-${launchIndex}`);
          const newInput = newArgsContainer.querySelector(`input[data-arg-index="${argIndex + 1}"]`);
          if (newInput) {
            newInput.focus();
            newInput.setSelectionRange(0, 0);
          }
        }, 0);
      }
      // Regular Enter: Navigate to next or add new
      else {
        // Check if this is the last argument
        const argsContainer = document.getElementById(`args-${launchIndex}`);
        const allArgInputs = argsContainer.querySelectorAll('input[data-arg-index]');

        if (argIndex < allArgInputs.length - 1) {
          // Not the last one, focus on the next argument
          allArgInputs[argIndex + 1].focus();
        } else {
          // Last one, add a new argument
          addArgument(launchIndex);
        }
      }
    }
    // Handle Delete key for arguments
    else if (e.key === 'Delete' && e.target.dataset.argIndex !== undefined) {
      const launchIndex = activeTabIndex;
      const argIndex = parseInt(e.target.dataset.argIndex);

      // If the field is empty, remove it
      if (e.target.value === '') {
        e.preventDefault();

        // Remove the argument
        removeArgument(launchIndex, argIndex);

        // Focus on the next argument or previous if this was the last
        setTimeout(() => {
          const newArgsContainer = document.getElementById(`args-${launchIndex}`);
          const newArgInputs = newArgsContainer.querySelectorAll('input[data-arg-index]');
          if (newArgInputs.length > 0) {
            if (argIndex < newArgInputs.length)
              newArgInputs[argIndex].focus();
            else if (argIndex > 0)
              newArgInputs[argIndex - 1].focus();
          }
        }, 0);
      }
      // If cursor is at the end of the field and there's a next argument, merge them
      else if (e.target.selectionStart === e.target.value.length && e.target.selectionEnd === e.target.value.length) {
        const argsContainer = document.getElementById(`args-${launchIndex}`);
        const allArgInputs = argsContainer.querySelectorAll('input[data-arg-index]');

        if (argIndex < allArgInputs.length - 1) {
          e.preventDefault();

          // Get the next argument value
          const nextInput = argsContainer.querySelector(`input[data-arg-index="${argIndex + 1}"]`);
          const currentValue = e.target.value;
          const nextValue = nextInput ? nextInput.value : '';

          // Immediately update the current input to show the merged value
          e.target.value = currentValue + nextValue;
          const cursorPos = currentValue.length;

          // Set flag to skip change events during re-render
          skipNextChange = true;

          // Merge next value into current and remove next
          if (selectedWorkspace && selectedTarget) {
            const launch = config.workspaces?.[selectedWorkspace].targets?.[selectedTarget].launches?.[launchIndex];
            if (!launch.arguments) launch.arguments = [];

            // Ensure current argument exists
            while (launch.arguments.length <= argIndex)
              launch.arguments.push('');

            // Merge values
            launch.arguments[argIndex] = currentValue + nextValue;
            // Remove next argument if it exists
            if (launch.arguments.length > argIndex + 1)
              launch.arguments.splice(argIndex + 1, 1);

            saveConfiguration();
            renderLaunchConfigs(selectedWorkspace, selectedTarget);

            // Focus on the current field at the join point
            setTimeout(() => {
              const newArgsContainer = document.getElementById(`args-${launchIndex}`);
              const mergedInput = newArgsContainer.querySelector(`input[data-arg-index="${argIndex}"]`);
              if (mergedInput) {
                mergedInput.focus();
                mergedInput.setSelectionRange(cursorPos, cursorPos);
              }
            }, 0);
          }
        }
      }
    }
    // Handle Backspace key for arguments - remove previous entry and merge if at beginning
    else if (e.key === 'Backspace' && e.target.dataset.argIndex !== undefined) {
      const launchIndex = activeTabIndex;
      const argIndex = parseInt(e.target.dataset.argIndex);

      // If cursor is at the beginning of the field and there's a previous argument
      if (e.target.selectionStart === 0 && e.target.selectionEnd === 0 && argIndex > 0) {
        e.preventDefault();

        // Get the previous argument value
        const argsContainer = document.getElementById(`args-${launchIndex}`);
        const prevInput = argsContainer.querySelector(`input[data-arg-index="${argIndex - 1}"]`);
        const prevValue = prevInput ? prevInput.value : '';
        const currentValue = e.target.value;

        // Immediately update the previous input to show the merged value
        if (prevInput)
          prevInput.value = prevValue + currentValue;

        // Set flag to skip the next change event for this input
        skipNextChange = true;

        // Merge current value into previous and remove current
        if (selectedWorkspace && selectedTarget) {
          const launch = config.workspaces?.[selectedWorkspace].targets?.[selectedTarget].launches?.[launchIndex];
          if (!launch.arguments) launch.arguments = [];

          // Check if current argument is uncommitted (doesn't exist in data model)
          const isUncommitted = argIndex >= launch.arguments.length;

          if (isUncommitted) {
            // For uncommitted lines, just update the previous argument with the merged value
            if (argIndex > 0 && launch.arguments.length >= argIndex)
              launch.arguments[argIndex - 1] = prevValue + currentValue;
            // Don't add the current line since it was uncommitted
          } else {
            // For committed lines, ensure previous exists and then merge
            while (launch.arguments.length <= argIndex - 1)
              launch.arguments.push('');

            // Merge values
            launch.arguments[argIndex - 1] = prevValue + currentValue;
            // Remove current argument
            launch.arguments.splice(argIndex, 1);
          }

          saveConfiguration();
          renderLaunchConfigs(selectedWorkspace, selectedTarget);

          // Focus on the merged field at the join point
          setTimeout(() => {
            const newArgsContainer = document.getElementById(`args-${launchIndex}`);
            const mergedInput = newArgsContainer.querySelector(`input[data-arg-index="${argIndex - 1}"]`);
            if (mergedInput) {
              mergedInput.focus();
              mergedInput.setSelectionRange(prevValue.length, prevValue.length);
            }
          }, 0);
        }
      }
      // If the field is empty and cursor at beginning, just remove it
      else if (e.target.value === '' && argIndex > 0) {
        e.preventDefault();
        removeArgument(launchIndex, argIndex);

        // Focus on the previous argument
        setTimeout(() => {
          const argsContainer = document.getElementById(`args-${launchIndex}`);
          const prevInput = argsContainer.querySelector(`input[data-arg-index="${argIndex - 1}"]`);
          if (prevInput) {
            prevInput.focus();
            // Put cursor at the end
            prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
          }
        }, 0);
      }
    }
  }

  function autoSizeEnvKeys(launchIndex) {
    const container = document.getElementById(`env-${launchIndex}`);
    if (!container) return;

    const keys = container.querySelectorAll('.env-key');
    let maxWidth = 100;

    // Measure text width
    keys.forEach(input => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      context.font = window.getComputedStyle(input).font;
      const width = context.measureText(input.value || input.placeholder).width + 20;
      maxWidth = Math.max(maxWidth, width);
    });

    // Apply width
    keys.forEach(input => {
      input.style.width = maxWidth + 'px';
    });
  }

  function autoResizeBashLineTextareas() {
    // Auto-resize all bash line textareas to fit their content
    const textareas = document.querySelectorAll('textarea.bash-line-input');
    textareas.forEach(textarea => {
      // Reset to min height to get accurate scrollHeight
      textarea.style.height = '15px';
      // Set to scrollHeight if content needs more space
      if (textarea.scrollHeight > 25) {  // Account for padding
        textarea.style.height = textarea.scrollHeight + 'px';
      }
    });
  }

  function addLaunchConfig() {
    if (!selectedWorkspace || !selectedTarget) return;

    // Get default config to suggest a default name
    const defaultConfig = getDefaultConfig(selectedWorkspace, selectedTarget) || {};

    // Convert default to real config
    if (!config?.workspaces)
      config.workspaces = {};
    if (!config?.workspaces?.[selectedWorkspace])
      config.workspaces[selectedWorkspace] = { targets: {} };
    if (!config?.workspaces?.[selectedWorkspace].targets?.[selectedTarget])
      config.workspaces[selectedWorkspace].targets[selectedTarget] = { launches: [] };

    const launches = config.workspaces[selectedWorkspace].targets[selectedTarget].launches;

    // Get all existing names including base launches
    const existingNames = launches.map(l => l.name);

    // Also consider base launch names if editing local.json
    if (isLocalConfig && scannerData?.[selectedWorkspace]?.baseLaunches?.[selectedTarget]) {
      const baseLaunches = scannerData[selectedWorkspace].baseLaunches[selectedTarget];
      for (const baseLaunch of baseLaunches) {
        // Expand base launch name with default if not set
        const baseName = baseLaunch.name || defaultConfig.name || selectedTarget;
        if (!existingNames.includes(baseName))
          existingNames.push(baseName);
      }
    }

    // Create name for new config
    // Never use the default name to avoid conflicting with the implicit default slot
    const baseName = defaultConfig.name || selectedTarget;

    const launch = {
      name: generateUniqueLaunchName(baseName, existingNames),
    };
    launches.push(launch);

    // Switch to the newly added tab
    activeTabIndex = launches.length - 1;

    saveConfiguration();
    renderLaunchConfigs(selectedWorkspace, selectedTarget);
    renderTree(); // Update tree to show config count
  }

  function removeLaunchConfig(index) {
    if (!selectedWorkspace || !selectedTarget) return;

    const launches = config.workspaces[selectedWorkspace].targets[selectedTarget].launches;

    if (launches.length === 1) {
      // Can't remove the last launch config, just clear it
      config.workspaces[selectedWorkspace].targets[selectedTarget].launches[0] = {};
    } else {
      // Remove the launch config
      config.workspaces[selectedWorkspace].targets[selectedTarget].launches.splice(index, 1);

      // Adjust activeTabIndex if necessary
      if (activeTabIndex >= launches.length - 1)
        activeTabIndex = Math.max(0, launches.length - 2);
      else if (activeTabIndex > index)
        activeTabIndex--;
    }

    saveConfiguration();
    renderLaunchConfigs(selectedWorkspace, selectedTarget);
    renderTree(); // Update tree to show config count
  }

  function updateLaunchConfig(index, field, value) {
    if (!selectedWorkspace || !selectedTarget) return;

    const launch = getOrCreateLaunchForEdit(index);
    if (!launch) return;

    // Update the field
    launch[field] = value;

    // Get comparison config for visual comparison
    const compareConfig = getComparisonConfig(selectedWorkspace, selectedTarget, index);

    // Update visual state based on whether value matches comparison config
    const input = document.querySelector(`.launch-config[data-index="${index}"] input[data-field="${field}"]`);
    if (input) {
      if (value === compareConfig[field] || (!value && !compareConfig[field]))
        input.classList.add('default-value');
      else
        input.classList.remove('default-value');
    }

    // Update the tab if the name or enabled field changed
    if (field === 'name' || field === 'enabled') {
      // Find the tab with the matching index
      const tabs = document.querySelectorAll('.tab');
      tabs.forEach((tab) => {
        if (parseInt(tab.dataset.index) === index) {
          if (field === 'name') {
            const nameEl = tab.querySelector('.tab-name');
            if (nameEl)
              nameEl.textContent = value || `Config ${index + 1}`;
          } else if (field === 'enabled') {
            if (value === false)
              tab.classList.add('disabled');
            else
              tab.classList.remove('disabled');
          }
        }
      });
    }

    saveConfiguration();
    // Update tree to show config count
    renderTree();
  }

  function getOrCreateLaunchForEdit(launchIndex) {
    if (!selectedWorkspace || !selectedTarget) return null;

    // Ensure workspace and target structure exists
    if (!config.workspaces) config.workspaces = {};
    if (!config.workspaces[selectedWorkspace])
      config.workspaces[selectedWorkspace] = { targets: {} };
    if (!config.workspaces[selectedWorkspace].targets[selectedTarget])
      config.workspaces[selectedWorkspace].targets[selectedTarget] = { launches: [] };

    // Ensure launches array exists
    if (!config.workspaces[selectedWorkspace].targets[selectedTarget].launches)
      config.workspaces[selectedWorkspace].targets[selectedTarget].launches = [];

    let launches = config.workspaces[selectedWorkspace].targets[selectedTarget].launches;

    // Simple direct access now that launches array contains everything
    if (launchIndex >= 0 && launchIndex < launches.length)
      return launches[launchIndex];

    return null;
  }

  function updateArgument(launchIndex, argIndex, value) {
    if (!selectedWorkspace || !selectedTarget) return;

    const launch = getOrCreateLaunchForEdit(launchIndex);
    if (!launch) return;

    if (!launch.arguments) launch.arguments = [];

    // Always set the value, even if it's empty (empty arguments are valid)
    if (argIndex < launch.arguments.length)
      launch.arguments[argIndex] = value;
    else if (argIndex === launch.arguments.length) {
      // Adding a new argument
      launch.arguments.push(value);
    }

    // Get comparison config for visual comparison
    const compareConfig = getComparisonConfig(selectedWorkspace, selectedTarget, launchIndex);
    const defaultArgs = compareConfig.arguments || [];

    // Update the bash line input to reflect the change
    const bashLineInput = document.querySelector(`.launch-config[data-index="${launchIndex}"] textarea.bash-line-input`);
    if (bashLineInput) {
      bashLineInput.value = argumentsToBashLine(launch.arguments);
      // Trigger resize
      bashLineInput.style.height = '15px';
      if (bashLineInput.scrollHeight > 25)
        bashLineInput.style.height = bashLineInput.scrollHeight + 'px';

      // Update visual state of bash line
      const argsMatchDefault = JSON.stringify(launch.arguments) === JSON.stringify(defaultArgs);
      if (argsMatchDefault)
        bashLineInput.classList.add('default-value');
      else
        bashLineInput.classList.remove('default-value');
    }

    // Update visual state of argument inputs
    const argInputs = document.querySelectorAll(`.launch-config[data-index="${launchIndex}"] .arg-item input`);
    argInputs.forEach((input, idx) => {
      const argMatchesDefault = launch.arguments[idx] === defaultArgs[idx];
      if (argMatchesDefault)
        input.classList.add('default-value');
      else
        input.classList.remove('default-value');
    });

    saveConfiguration();
    // Don't re-render on every keystroke, let the change event handle it
    // Update tree to show config count
    renderTree();
  }

  function updateBashLine(launchIndex, bashLine) {
    if (!selectedWorkspace || !selectedTarget) return;

    // Parse the bash line into arguments
    const newArgs = bashLineToArguments(bashLine);

    const launch = getOrCreateLaunchForEdit(launchIndex);
    if (!launch) return;

    // Update arguments
    launch.arguments = newArgs;

    // Get comparison config for visual comparison
    const compareConfig = getComparisonConfig(selectedWorkspace, selectedTarget, launchIndex);
    const defaultArgs = compareConfig.arguments || [];

    // Update the arguments list UI
    const argsList = document.getElementById(`args-${launchIndex}`);
    if (argsList)
      argsList.innerHTML = renderArguments(newArgs, launchIndex, defaultArgs);

    // Update visual state
    const argsMatchDefault = JSON.stringify(newArgs) === JSON.stringify(defaultArgs);

    // Update visual state of argument inputs
    const argInputs = document.querySelectorAll(`.launch-config[data-index="${launchIndex}"] .arg-item input`);
    argInputs.forEach((input, idx) => {
      const argMatchesDefault = newArgs[idx] === defaultArgs[idx];
      if (argMatchesDefault)
        input.classList.add('default-value');
      else
        input.classList.remove('default-value');
    });

    // Update visual state of bash line itself
    const bashLineInput = document.querySelector(`.launch-config[data-index="${launchIndex}"] textarea.bash-line-input`);
    if (bashLineInput) {
      if (argsMatchDefault)
        bashLineInput.classList.add('default-value');
      else
        bashLineInput.classList.remove('default-value');
    }

    saveConfiguration();
    // Update tree to show config count
    renderTree();
  }

  function addArgument(launchIndex) {
    if (!selectedWorkspace || !selectedTarget) return;

    const launch = getOrCreateLaunchForEdit(launchIndex);
    if (!launch) return;

    if (!launch.arguments) launch.arguments = [];

    // Add an empty argument
    launch.arguments.push('');
    saveConfiguration();
    renderLaunchConfigs(selectedWorkspace, selectedTarget);

    // Focus on the new empty field
    setTimeout(() => {
      const container = document.getElementById(`args-${launchIndex}`);
      const inputs = container.querySelectorAll('input');
      if (inputs.length > 0)
        inputs[inputs.length - 1].focus();
    }, 0);
  }

  function removeArgument(launchIndex, argIndex) {
    if (!selectedWorkspace || !selectedTarget) return;

    const launch = getOrCreateLaunchForEdit(launchIndex);
    if (!launch) return;

    launch.arguments.splice(argIndex, 1);
    saveConfiguration();
    renderLaunchConfigs(selectedWorkspace, selectedTarget);
  }

  function addEnvVar(index) {
    if (!selectedWorkspace || !selectedTarget) return;

    const launch = getOrCreateLaunchForEdit(index);
    if (!launch) return;
    if (!launch.environment) launch.environment = {};

    // Don't actually add an empty key, just mark that we need to show an empty input
    launch._showNewEnvInput = true;
    saveConfiguration();
    renderLaunchConfigs(selectedWorkspace, selectedTarget);

    // Focus on the new empty key input
    setTimeout(() => {
      const newInput = document.querySelector(`.launch-config[data-index="${index}"] .env-var-item.new-env input.env-key`);
      if (newInput) newInput.focus();
    }, 0);
  }

  function updateEnvVarKey(index, oldKey, newKey, shouldFocusValue = false) {
    if (!selectedWorkspace || !selectedTarget) return;

    const launch = getOrCreateLaunchForEdit(index);
    if (!launch) return;

    // Handle new environment variable creation
    if (oldKey === NEW_ENV_GUID) {
      if (newKey) {
        // Add the new environment variable
        if (!launch.environment) launch.environment = {};
        launch.environment[newKey] = '';
        // Clear the flag to show new input
        delete launch._showNewEnvInput;
        // Make other fields non-default
        if (!launch.hasOwnProperty('executablePath')) launch.executablePath = '';
        if (!launch.hasOwnProperty('workingDirectory')) launch.workingDirectory = '';

        renderLaunchConfigs(selectedWorkspace, selectedTarget);

        if (shouldFocusValue) {
          // Focus on the corresponding value field after render
          setTimeout(() => {
            const valueInput = document.querySelector(`.launch-config[data-index="${index}"] input[data-env-key="${newKey}"][data-field="value"]`);
            if (valueInput) valueInput.focus();
          }, 0);
        }
      } else {
        // User didn't enter a key, just clear the new input flag
        delete launch._showNewEnvInput;
        renderLaunchConfigs(selectedWorkspace, selectedTarget);
      }
    }
    // Handle existing environment variable key change
    else if (oldKey !== newKey) {
      // If the new key is empty and old key wasn't, remove the env var
      if (!newKey && oldKey) {
        delete launch.environment[oldKey];
        renderLaunchConfigs(selectedWorkspace, selectedTarget);
      } else if (newKey) {
        // Otherwise rename the key - preserve the existing value and position
        const existingValue = launch.environment[oldKey] || '';

        // Rebuild the environment object to maintain key order
        const newEnvironment = {};
        for (const key in launch.environment) {
          if (key === oldKey) {
            // Replace old key with new key at the same position
            newEnvironment[newKey] = existingValue;
          } else
            newEnvironment[key] = launch.environment[key];
        }

        // Replace the entire environment object
        launch.environment = newEnvironment;
        // Make other fields non-default
        if (!launch.hasOwnProperty('executablePath')) launch.executablePath = '';
        if (!launch.hasOwnProperty('workingDirectory')) launch.workingDirectory = '';

        renderLaunchConfigs(selectedWorkspace, selectedTarget);

        if (shouldFocusValue && newKey) {
          // Focus on the corresponding value field after render
          setTimeout(() => {
            const valueInput = document.querySelector(`.launch-config[data-index="${index}"] input[data-env-key="${newKey}"][data-field="value"]`);
            if (valueInput) valueInput.focus();
          }, 0);
        }
      }
    }

    // Update tree to show config count
    saveConfiguration();
    renderTree();
  }

  function updateEnvVarValue(index, key, value) {
    if (!selectedWorkspace || !selectedTarget) return;

    // Don't update value for new env vars that don't have a key yet
    if (key === NEW_ENV_GUID)
      return;

    const launch = getOrCreateLaunchForEdit(index);
    if (!launch) return;

    launch.environment[key] = value;

    saveConfiguration();
    // Update tree to show config count
    renderTree();
  }

  function removeEnvVar(index, key) {
    if (!selectedWorkspace || !selectedTarget) return;

    const launch = getOrCreateLaunchForEdit(index);
    if (!launch) return;
    delete launch.environment[key];
    saveConfiguration();
    renderLaunchConfigs(selectedWorkspace, selectedTarget);
  }

  function showPostCopyDropdown(button, launchIndex) {
    if (!selectedWorkspace || !selectedTarget) return;

    // Get the default executable path to extract the executable name
    const defaultConfig = getDefaultConfig(selectedWorkspace, selectedTarget, selectionState?.selectedConfiguration || 'default') || {};
    const defaultExecutablePath = defaultConfig.executablePath || '';

    // Extract executable name from the default path (everything after last /)
    const lastSlash = defaultExecutablePath.lastIndexOf('/');
    const executableName = lastSlash >= 0 ? defaultExecutablePath.substring(lastSlash + 1) : defaultExecutablePath;

    // Store executable name for use when applying destination
    window.postCopyExecutableName = executableName;

    // Request PostCopy destinations from the extension
    vscode.postMessage({
      command: 'getPostCopyDestinations',
      workspace: selectedWorkspace,
      target: selectedTarget,
      launchIndex: launchIndex
    });

    // Store button reference for positioning dropdown
    window.postCopyButton = button;
    window.postCopyLaunchIndex = launchIndex;
  }

  function showPostCopyDropdownForNewLaunch() {
    if (!selectedWorkspace || !selectedTarget) return;

    const button = document.getElementById('add-postcopy-launch-btn');
    if (!button) return;

    // Get the default executable path to extract the executable name
    const defaultConfig = getDefaultConfig(selectedWorkspace, selectedTarget, selectionState?.selectedConfiguration || 'default') || {};
    const defaultExecutablePath = defaultConfig.executablePath || '';

    // Extract executable name from the default path (everything after last /)
    const lastSlash = defaultExecutablePath.lastIndexOf('/');
    const executableName = lastSlash >= 0 ? defaultExecutablePath.substring(lastSlash + 1) : defaultExecutablePath;

    // Store executable name for use when applying destination
    window.postCopyExecutableName = executableName;
    window.postCopyForNewLaunch = true; // Flag to indicate we're creating a new launch

    // Request PostCopy destinations from the extension
    vscode.postMessage({
      command: 'getPostCopyDestinations',
      workspace: selectedWorkspace,
      target: selectedTarget
    });

    // Store button reference for positioning dropdown
    window.postCopyButton = button;
  }

  function createPostCopyDropdown(destinations) {
    // Remove any existing dropdown
    const existingDropdown = document.querySelector('.postcopy-dropdown-container');
    if (existingDropdown)
      existingDropdown.remove();

    if (!destinations || destinations.length === 0) {
      alert('No PostCopy destinations available. Configure postCopyProject and ensure PostCopy.MConfig exists.');
      return;
    }

    const button = window.postCopyButton;
    if (!button) return;

    // Create dropdown container that will handle positioning
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'postcopy-dropdown-container';

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'postcopy-dropdown';

    // Position container at button
    const rect = button.getBoundingClientRect();

    // Append early (hidden) so we can measure actual dropdown width
    dropdownContainer.style.visibility = 'hidden';
    dropdownContainer.style.pointerEvents = 'none';
    dropdownContainer.appendChild(dropdown);
    document.body.appendChild(dropdownContainer);

    // Measure the dropdown width (respects CSS min/max-width)
    const dropdownWidth = dropdown.offsetWidth || 250; // fallback to min width

    // Decide horizontal alignment based on actual width
    if (rect.left + dropdownWidth > window.innerWidth - 10) {
      // Position from right edge instead
      dropdownContainer.style.right = '10px';
      dropdownContainer.style.left = 'auto';
      // Ensure the dropdown itself anchors to the right inside the container
      dropdownContainer.classList.add('align-right');
    } else {
      // Normal left positioning
      dropdownContainer.style.left = rect.left + 'px';
      dropdownContainer.style.right = 'auto';
      dropdownContainer.classList.remove('align-right');
    }

    // Check if dropdown would go off bottom of screen
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < 320 && spaceAbove > spaceBelow) {
      // Position above the button instead
      dropdownContainer.classList.add('dropdown-above');
      dropdownContainer.style.bottom = (window.innerHeight - rect.top) + 'px';
      dropdownContainer.style.top = 'auto';
    } else {
      // Normal top positioning
      dropdownContainer.style.top = rect.bottom + 'px';
      dropdownContainer.style.bottom = 'auto';
    }

    // Add destinations
    destinations.forEach(destPath => {
      const item = document.createElement('div');
      item.className = 'postcopy-dropdown-item';

      // Display the destination path with executable name if available
      const executableName = window.postCopyExecutableName || '';
      const displayText = executableName ? `${destPath}/${executableName}` : destPath;
      item.textContent = displayText;
      item.title = displayText; // Show full path in tooltip

      item.onclick = () => {
        applyPostCopyDestination(destPath);
        dropdownContainer.remove();
      };

      dropdown.appendChild(item);
    });

    // Add click outside handler to close dropdown
    setTimeout(() => {
      const closeDropdown = (e) => {
        if (!dropdownContainer.contains(e.target) && e.target !== button) {
          dropdownContainer.remove();
          document.removeEventListener('click', closeDropdown);
        }
      };
      document.addEventListener('click', closeDropdown);
    }, 0);

    // Reveal and enable interaction now that positioning is set
    dropdownContainer.style.visibility = '';
    dropdownContainer.style.pointerEvents = '';
  }

  function generateUniqueLaunchName(baseName, existingLaunches) {
    // Check if the base name is already unique
    const idealName = isLocalConfig ? `${baseName} (Local)` : baseName;

    if (!existingLaunches.some(launch => launch === idealName))
      return idealName;

    // Try adding numbers until we find a unique name
    let counter = 2;
    let uniqueName;
    do {
      if (isLocalConfig)
        uniqueName = `${baseName} (Local ${counter})`;
      else
        uniqueName = `${baseName} (${counter})`;
      counter++;
    } while (existingLaunches.some(launch => launch === uniqueName));

    return uniqueName;
  }

  function applyPostCopyDestination(destPath) {
    const executableName = window.postCopyExecutableName || '';
    const isNewLaunch = window.postCopyForNewLaunch;

    if (!selectedWorkspace || !selectedTarget) return;

    // Append executable name to destination path if we have one
    const fullExecutablePath = executableName ? `${destPath}/${executableName}` : destPath;

    if (isNewLaunch) {
      // Create a new launch configuration with PostCopy destination
      const defaultConfig = getDefaultConfig(selectedWorkspace, selectedTarget, selectionState?.selectedConfiguration || 'default') || {};

      // Extract a name from the destination path (last component)
      const pathParts = destPath.split('/');
      const destName = pathParts[pathParts.length - 1] || 'PostCopy';

      // Ensure we have the launches array
      if (!config.workspaces[selectedWorkspace])
        config.workspaces[selectedWorkspace] = { targets: {} };
      if (!config.workspaces[selectedWorkspace].targets[selectedTarget])
        config.workspaces[selectedWorkspace].targets[selectedTarget] = { launches: [] };

      const launches = config.workspaces[selectedWorkspace].targets[selectedTarget].launches;

      // Generate a unique name
      const baseName = `${defaultConfig.name || selectedTarget} - ${destName}`;
      const uniqueName = generateUniqueLaunchName(baseName, launches.map(l => l.name));

      const newLaunch = {
        name: uniqueName,
        executablePath: fullExecutablePath,
        workingDirectory: destPath,
        arguments: defaultConfig.arguments ? [...defaultConfig.arguments] : [],
        environment: defaultConfig.environment ? {...defaultConfig.environment} : {},
        enabled: true
      };

      // Add the new launch configuration
      launches.push(newLaunch);

      // Switch to the new tab
      activeTabIndex = launches.length - 1;

      saveConfiguration();
    } else {
      // Update existing launch configuration
      const launchIndex = window.postCopyLaunchIndex;
      if (launchIndex === undefined) return;

      const launch = getOrCreateLaunchForEdit(launchIndex);
      if (!launch) return;

      // Apply the executable path and working directory
      launch.executablePath = fullExecutablePath;
      launch.workingDirectory = destPath;

      saveConfiguration();
    }

    // Re-render the UI
    renderLaunchConfigs(selectedWorkspace, selectedTarget);

    // Clean up references
    delete window.postCopyButton;
    delete window.postCopyLaunchIndex;
    delete window.postCopyExecutableName;
    delete window.postCopyForNewLaunch;
  }



  function generateCleanConfig(configToClean) {
    // Deep clone the config for cleanup
    const cleanConfig = JSON.parse(JSON.stringify(configToClean));

    // Clean up empty workspaces and targets
    Object.keys(cleanConfig?.workspaces || {}).forEach(ws => {
      const workspace = cleanConfig?.workspaces?.[ws];
      Object.keys(workspace?.targets || {}).forEach(tg => {
        const target = workspace.targets[tg];

        // Get default config for this workspace/target
        const defaultConfig = getDefaultConfig(ws, tg) || {};

        // Get base launches if editing local.json
        const baseLaunches = (isLocalConfig && scannerData[ws]?.baseLaunches?.[tg]) || [];

        // Expand base launches with default values for proper comparison
        const expandedBaseLaunches = baseLaunches.map((launch) => ({
          name: launch.name || defaultConfig.name || tg,
          executablePath: launch.executablePath || defaultConfig.executablePath || '',
          workingDirectory: launch.workingDirectory || defaultConfig.workingDirectory || '',
          arguments: launch.arguments || defaultConfig.arguments || [],
          environment: launch.environment || defaultConfig.environment || {}
        }));

        // Clean empty fields from launches; keep entries, then drop only
        // those that came from base and became empty after cleanup.
        if (target?.launches) {
          target.launches = target.launches.filter((launch) => {
            // Clean up internal flags first, but capture base origin before deleting
            const isFromBase = launch.isFromBase;
            delete launch.isFromBase;
            delete launch._showNewEnvInput;

            // Find corresponding base launch by name
            const baseLaunch = expandedBaseLaunches.find(b => b.name === launch.name);

            // Use base launch as the comparison if it exists, otherwise use scanner defaults
            const compareConfig = baseLaunch || defaultConfig;

            // For base malterlib.json, remove name if it matches default.
            // For local.json base entries we keep name for identification during comparison.
            if (!isLocalConfig || !(isFromBase && baseLaunch)) {
              if (launch.name === compareConfig.name || launch.name === '')
                delete launch.name;
            }

            if (launch.executablePath === compareConfig.executablePath || launch.executablePath === '')
              delete launch.executablePath;

            if (launch.workingDirectory === compareConfig.workingDirectory || launch.workingDirectory === '')
              delete launch.workingDirectory;

            // Check if arguments match default
            if (launch.arguments) {
              const argsMatchDefault = JSON.stringify(launch.arguments) === JSON.stringify(compareConfig.arguments || []);
              if (argsMatchDefault)
                delete launch.arguments;
            }

            // Check if environment matches default
            if (launch.environment) {
              // First clean up empty environment variables
              Object.keys(launch.environment).forEach(key => {
                if (!key && !launch.environment[key])
                  delete launch.environment[key];
              });

              // Then check if it matches the base/default
              const envMatchesDefault = JSON.stringify(launch.environment || {}) === JSON.stringify(compareConfig.environment || {});
              if (envMatchesDefault || Object.keys(launch.environment).length === 0)
                delete launch.environment;
            }

            // Check enabled field
            // - Keep only if it differs from base (for local overrides)
            // - For non-overrides, keep only if explicitly false
            if (isLocalConfig && baseLaunch) {
              // For local overrides of base configs
              if (launch.enabled === false && baseLaunch.enabled !== false) {
                // Keep it - disabling an enabled base
              } else if (launch.enabled === true && baseLaunch.enabled === false) {
                // Keep it - enabling a disabled base
              } else {
                // Remove it - matches base state (including both disabled)
                delete launch.enabled;
              }
            } else {
              // For non-override launches or base configs
              if (launch.enabled === true || launch.enabled === undefined)
                delete launch.enabled;
            }

            // If this was a base entry and now it's empty, mark it for removal
            if (isLocalConfig && isFromBase && baseLaunch) {
              if (Object.keys(launch).length === 0)
                dropIndices.add(idx);
            }

            // For local.json: decide whether to keep the launch
            if (isLocalConfig && isFromBase && baseLaunch) {
              // This is a base config (potentially with local overrides)
              // Keep it only if there are actual overrides (more than just name)
              // If only name remains, it means all values match base - no need to store
              return Object.keys(launch).length > 1;
            }

            return true;
          });

          // If every remaining launch object ended up empty, clear the array entirely
          if (target.launches.length === 1 && target.launches.every(l => Object.keys(l).length === 0))
            target.launches = [];
        }

        if (!target.launches || target.launches.length === 0)
          delete workspace.targets[tg];
      });
      if (!workspace.targets || Object.keys(workspace.targets).length === 0)
        delete cleanConfig.workspaces[ws];
    });

    return cleanConfig;
  }

  function saveConfiguration() {
    const cleanConfig = generateCleanConfig(config);

    // Check if config has actually changed
    const cleanConfigStr = JSON.stringify(cleanConfig);
    if (lastSavedConfig === cleanConfigStr) {
      // No changes, don't send save message
      return false;
    }

    // Update last saved config
    lastSavedConfig = cleanConfigStr;
    lastSavedCleanConfig = cleanConfig;

    // Send save message
    vscode.postMessage({
      command: 'save',
      config: cleanConfig
    });

    return true;
  }
})();
