// === S&A 4D Viewer Main Script ===
let viewer;
let currentUrn = null;
let schedule = null;
let fourdExt = null;

function showOverlay(msg, duration = 2000) {
  let overlay = document.getElementById("overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "20px";
    overlay.style.right = "20px";
    overlay.style.background = "rgba(0,0,0,0.7)";
    overlay.style.color = "#fff";
    overlay.style.padding = "10px 20px";
    overlay.style.borderRadius = "8px";
    overlay.style.zIndex = "999";
    document.body.appendChild(overlay);
  }
  overlay.innerText = msg;
  overlay.style.display = "block";
  setTimeout(() => (overlay.style.display = "none"), duration);
}

function showGlobalOverlay(title = "Loading...", startPercent = 0) {
  const overlay = document.getElementById("globalOverlay");
  const bar = document.getElementById("overlayBar");
  const text = document.getElementById("overlayTitle");
  const percent = document.getElementById("overlayPercent");
  overlay.style.display = "flex";
  text.textContent = title;
  bar.style.width = `${startPercent}%`;
  percent.textContent = `${startPercent}%`;
}

function updateGlobalProgress(progress, text = null) {
  const bar = document.getElementById("overlayBar");
  const title = document.getElementById("overlayTitle");
  const percent = document.getElementById("overlayPercent");
  if (text) title.textContent = text;
  bar.style.width = `${progress}%`;
  percent.textContent = `${Math.floor(progress)}%`;
}

function hideGlobalOverlay(delay = 800) {
  setTimeout(() => {
    document.getElementById("globalOverlay").style.display = "none";
  }, delay);
}

async function loadModelList() {
  const select = document.getElementById("modelSelect");
  select.innerHTML = '<option value="">Select Model</option>';
  const res = await fetch("/api/models");
  if (!res.ok) return console.warn("⚠️ Failed to fetch models list");
  const models = await res.json();
  models.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.urn;
    opt.textContent = m.name;
    select.appendChild(opt);
  });
}

document.getElementById("modelSelect").onchange = (e) => {
  const urn = e.target.value;
  if (urn) {
    currentUrn = urn;
    showGlobalOverlay("Loading selected model...", 0);
    initViewer(urn);
  }
};

window.addEventListener("DOMContentLoaded", loadModelList);
document.getElementById("refreshModels").onclick = loadModelList;

async function initViewer(urn) {
  const tokenResponse = await fetch("/api/auth/token");
  const token = await tokenResponse.json();
  const options = {
    env: "AutodeskProduction",
    api: "derivativeV2",
    getAccessToken: (onTokenReady) => {
      onTokenReady(token.access_token, token.expires_in);
    },
  };

  Autodesk.Viewing.Initializer(options, async () => {
    const container = document.getElementById("viewer");
    viewer = new Autodesk.Viewing.GuiViewer3D(container);
    viewer.start();
    window.myViewer = viewer;

    // FIXED: Attach selection event listener after viewer is created
    viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, (e) => {
      const count = e.dbIdArray?.length || 0;

      // Update modal selected count
      const span = document.getElementById("selectedCount");
      if (span) {
        span.textContent = count;
        // Add animation feedback
        span.parentElement.classList.add('pulse');
        setTimeout(() => span.parentElement.classList.remove('pulse'), 300);
      }
    });

    Autodesk.Viewing.Document.load(
      "urn:" + urn,
      (doc) => {
        const defaultModel = doc.getRoot().getDefaultGeometry();
        showGlobalOverlay("Loading model geometry...", 0);
        const modelPromise = viewer.loadDocumentNode(doc, defaultModel);
        modelPromise.then(() => {
          viewer.addEventListener(
            Autodesk.Viewing.GEOMETRY_LOADED_EVENT,
            () => {
              updateGlobalProgress(100, "Model loaded successfully!");
              hideGlobalOverlay();
            }
          );
        }).catch((err) => {
          console.error(err);
          hideGlobalOverlay();
          showOverlay("Error loading model");
        });
      },
      (err) => {
        console.error(err);
        hideGlobalOverlay();
        showOverlay("Error loading document");
      }
    );
  });
}

// === 4D Manual Task Creation ===
let taskList = [];
let nextTaskId = 1;
let editingTaskId = null;

// Gantt timeline data for playback
let ganttTimelineData = null;

// Modal Management
const taskModal = document.getElementById("taskModal");
const addTaskFloatingBtn = document.getElementById("addTaskFloatingBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelTaskBtn = document.getElementById("cancelTaskBtn");
const deleteTaskBtn = document.getElementById("deleteTaskBtn");

function openTaskModal(taskId = null) {
  editingTaskId = taskId;

  const modalTitle = document.getElementById("modalTitle");
  const createBtnText = document.getElementById("createTaskBtnText");
  const createBtnIcon = document.querySelector("#createTaskBtn i");

  if (taskId) {
    // Edit mode
    const task = taskList.find(t => t.id === taskId);
    if (task) {
      document.getElementById("taskName").value = task.name;
      document.getElementById("taskType").value = task.type;
      document.getElementById("taskStart").value = task.start.toISOString().split('T')[0];
      document.getElementById("taskEnd").value = task.end.toISOString().split('T')[0];
      document.getElementById("taskDependencies").value = task.dependencies ? task.dependencies.join(', ') : '';
      const progress = task.percentComplete || 0;
      document.getElementById("taskProgress").value = progress;
      document.getElementById("taskProgressValue").textContent = `${progress}%`;

      modalTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Task';
      createBtnText.textContent = 'Save Changes';
      createBtnIcon.className = 'fas fa-save';
      deleteTaskBtn.style.display = 'flex';
    }
  } else {
    // Create mode
    modalTitle.innerHTML = '<i class="fas fa-tasks"></i> Create Task';
    createBtnText.textContent = 'Create Task';
    createBtnIcon.className = 'fas fa-plus-circle';
    deleteTaskBtn.style.display = 'none';
  }

  taskModal.classList.add("active");
}

function closeTaskModal() {
  taskModal.classList.remove("active");
  editingTaskId = null;
  clearTaskForm();
}

function clearTaskForm() {
  document.getElementById("taskName").value = "";
  document.getElementById("taskStart").value = "";
  document.getElementById("taskEnd").value = "";
  document.getElementById("taskDependencies").value = "";
  document.getElementById("taskProgress").value = "0";
  document.getElementById("taskProgressValue").textContent = "0%";
  if (viewer) viewer.clearSelection();
}

// Progress slider handler
const progressSlider = document.getElementById("taskProgress");
const progressValue = document.getElementById("taskProgressValue");

if (progressSlider && progressValue) {
  progressSlider.addEventListener('input', (e) => {
    progressValue.textContent = `${e.target.value}%`;
  });
}

addTaskFloatingBtn.onclick = () => openTaskModal();
closeModalBtn.onclick = closeTaskModal;
cancelTaskBtn.onclick = closeTaskModal;

// Close modal when clicking outside
taskModal.onclick = (e) => {
  if (e.target === taskModal) {
    closeTaskModal();
  }
};

// Helper function to update debug info panel (no-op now, debug panel removed)
function updateDebugInfo() {
  // Debug panel removed, this is now a no-op
}

// Attach modal create button handler
const createTaskBtn = document.getElementById("createTaskBtn");
console.log('Modal create button found:', !!createTaskBtn);

if (!createTaskBtn) {
  console.error('ERROR: Could not find createTaskBtn element!');
}

createTaskBtn.onclick = () => {
  console.log('=== MODAL FORM SUBMISSION ===');

  const nameInput = document.getElementById("taskName");
  const typeInput = document.getElementById("taskType");
  const startInput = document.getElementById("taskStart");
  const endInput = document.getElementById("taskEnd");
  const dependenciesInput = document.getElementById("taskDependencies");

  console.log('Form elements found:', {
    nameInput: !!nameInput,
    typeInput: !!typeInput,
    startInput: !!startInput,
    endInput: !!endInput,
    dependenciesInput: !!dependenciesInput
  });

  const name = nameInput.value.trim();
  const type = typeInput.value;
  const start = startInput.value;
  const end = endInput.value;
  const selected = viewer?.getSelection() || [];

  // Parse dependencies (comma-separated task IDs)
  const dependenciesStr = dependenciesInput.value.trim();
  const dependencies = dependenciesStr ?
    dependenciesStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) :
    [];

  // Get P6 fields
  const percentComplete = parseInt(document.getElementById("taskProgress").value) || 0;

  console.log('Form values:', { name, type, start, end, selected, percentComplete });
  console.log('Editing task ID:', editingTaskId);
  console.log('Current taskList length BEFORE:', taskList.length);

  if (!name || !start || !end) {
    console.log('Validation failed: missing required fields');
    showOverlay("⚠ Please fill all required fields (name, start, end).");
    return;
  }

  // Validate dates
  const startDate = new Date(start);
  const endDate = new Date(end);
  console.log('Parsed dates:', { startDate, endDate });
  if (endDate < startDate) {
    showOverlay("⚠ End date must be after start date.");
    return;
  }

  // Calculate durations
  const durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const remainingDays = Math.ceil(durationDays * (1 - percentComplete / 100));

  if (editingTaskId) {
    console.log('EDIT MODE - Updating existing task');
    // Edit existing task
    const task = taskList.find(t => t.id === editingTaskId);
    if (task) {
      console.log('Found task to edit:', task);
      task.name = name;
      task.type = type;
      task.start = startDate;
      task.end = endDate;
      task.dependencies = dependencies;
      task.percentComplete = percentComplete;
      task.originalDuration = durationDays;
      task.remainingDuration = remainingDays;
      task.elements = selected.length > 0 ? selected : task.elements;

      console.log('Task updated:', task);
      showOverlay(`✓ Task "${name}" updated successfully`);
    } else {
      console.error('ERROR: Could not find task with ID:', editingTaskId);
    }
  } else {
    console.log('CREATE MODE - Adding new task');
    // Create new task
    const newTask = {
      id: nextTaskId++,
      name,
      type,
      start: startDate,
      end: endDate,
      dependencies: dependencies,
      percentComplete: percentComplete,
      originalDuration: durationDays,
      remainingDuration: remainingDays,
      elements: selected
    };

    console.log('New task object created:', newTask);

    taskList.push(newTask);

    console.log('Task added to taskList!');
    console.log('Total tasks AFTER:', taskList.length);
    console.log('Full taskList:', taskList);

    showOverlay(`✓ Task "${name}" created with ${selected.length} object(s)`);
  }

  console.log('Closing modal...');
  // Close modal and update UI
  closeTaskModal();

  console.log('Calling renderGanttChart from modal...');
  renderGanttChart();

  // Update task count
  const taskCountElement = document.getElementById("taskCount");
  if (taskCountElement) {
    taskCountElement.textContent = taskList.length;
    console.log('Updated task count display to:', taskList.length);
  }

  // Update debug info
  updateDebugInfo();
  console.log('Modal submission complete!');
};

// Delete Task
deleteTaskBtn.onclick = () => {
  if (!editingTaskId) return;

  const task = taskList.find(t => t.id === editingTaskId);
  if (!task) return;

  if (confirm(`Are you sure you want to delete task "${task.name}"?`)) {
    // Remove task from list
    taskList = taskList.filter(t => t.id !== editingTaskId);

    closeTaskModal();
    renderGanttChart();
    updateDebugInfo();
    showOverlay(`✓ Task "${task.name}" deleted`);
  }
};

// Current view state
let currentView = "gantt"; // Always gantt view now

// renderTimeline function removed - using Gantt view only

// Calculate Critical Path
// Note: Without dependencies, critical path calculation is simplified
function calculateCriticalPath() {
  // Without dependencies, we return an empty array
  // Critical path requires task dependencies to determine the longest path
  return [];
}

function renderGanttChart() {
  console.log('renderGanttChart called. Tasks:', taskList.length);

  const ganttBody = document.getElementById("ganttBody");
  const ganttBodyFixed = document.getElementById("ganttBodyFixed");
  const ganttHeader = document.getElementById("ganttTimelineHeader");

  if (!ganttBody || !ganttBodyFixed || !ganttHeader) {
    console.error('Gantt elements not found');
    return;
  }

  // Clear existing content
  const svg = document.getElementById("ganttDependencyLines");
  ganttBody.innerHTML = "";
  if (svg) ganttBody.appendChild(svg);
  ganttBodyFixed.innerHTML = "";
  ganttHeader.innerHTML = "";

  if (taskList.length === 0) {
    ganttBodyFixed.innerHTML = `
      <div class="gantt-empty">
        <i class="fas fa-chart-gantt"></i>
        <p>No tasks created yet. Create your first task above!</p>
      </div>
    `;
    return;
  }

  // Calculate critical path
  const criticalPath = calculateCriticalPath();

  // Calculate date range
  const allDates = taskList.flatMap((t) => [t.start, t.end]);
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));

  // Generate date columns
  const dateColumns = [];
  const currentDate = new Date(minDate);

  while (currentDate <= maxDate) {
    dateColumns.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Render header dates
  dateColumns.forEach((date) => {
    const dateCol = document.createElement("div");
    dateCol.className = "gantt-date-column";
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      dateCol.classList.add("weekend");
    }
    dateCol.innerHTML = `
      <div>${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
      <div style="font-size: 0.65rem; color: #9CA3AF;">${date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
    `;
    ganttHeader.appendChild(dateCol);
  });

  // Calculate today's position
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = dateColumns.length;
  const todayIndex = dateColumns.findIndex(d => d.toDateString() === today.toDateString());
  const todayPosition = todayIndex >= 0 ? ((todayIndex + 0.5) / totalDays) * 100 : null;

  // Render tasks
  taskList.forEach((task, index) => {
    // Create fixed columns row
    const rowFixed = document.createElement("div");
    rowFixed.className = "gantt-row-fixed";
    rowFixed.style.animationDelay = `${index * 0.05}s`;
    rowFixed.dataset.taskId = task.id;

    // Activity ID column
    const taskIdCell = document.createElement("div");
    taskIdCell.className = "gantt-row-cell";
    taskIdCell.textContent = task.id;

    // Activity Name column
    const taskNameCell = document.createElement("div");
    taskNameCell.className = "gantt-row-cell";
    taskNameCell.style.justifyContent = "flex-start";
    taskNameCell.innerHTML = `
      <span class="task-type-badge ${task.type.toLowerCase()}" style="margin-right: 4px; font-size: 0.7rem;">${task.type === 'Build' ? '🏗️' : '💥'}</span>
      <span style="font-weight: 500; color: #1F2937; font-size: 0.75rem;">${task.name}</span>
    `;

    // Orig Dur column
    const origDurCell = document.createElement("div");
    origDurCell.className = "gantt-row-cell";
    origDurCell.textContent = task.originalDuration || 0;

    // Rem Dur column
    const remDurCell = document.createElement("div");
    remDurCell.className = "gantt-row-cell";
    remDurCell.textContent = task.remainingDuration || 0;

    // % Comp column
    const pctCompCell = document.createElement("div");
    pctCompCell.className = "gantt-row-cell";
    pctCompCell.textContent = `${task.percentComplete || 0}%`;

    // Start column
    const startCell = document.createElement("div");
    startCell.className = "gantt-row-cell";
    startCell.textContent = task.start.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

    // Finish column
    const finishCell = document.createElement("div");
    finishCell.className = "gantt-row-cell";
    finishCell.textContent = task.end.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

    // Total Float column (simplified - 0 for critical, calculated for non-critical)
    const totalFloatCell = document.createElement("div");
    totalFloatCell.className = "gantt-row-cell";
    const isCritical = criticalPath.includes(task.id);
    totalFloatCell.textContent = isCritical ? '0' : '-';

    // Predecessors column
    const predsCell = document.createElement("div");
    predsCell.className = "gantt-row-cell";
    predsCell.textContent = task.dependencies && task.dependencies.length > 0 ? task.dependencies.join(', ') : '-';

    // Append cells to fixed row
    rowFixed.appendChild(taskIdCell);
    rowFixed.appendChild(taskNameCell);
    rowFixed.appendChild(origDurCell);
    rowFixed.appendChild(remDurCell);
    rowFixed.appendChild(pctCompCell);
    rowFixed.appendChild(startCell);
    rowFixed.appendChild(finishCell);
    rowFixed.appendChild(totalFloatCell);
    rowFixed.appendChild(predsCell);

    // Create timeline row
    const rowTimeline = document.createElement("div");
    rowTimeline.className = "gantt-row-timeline";
    rowTimeline.style.animationDelay = `${index * 0.05}s`;
    rowTimeline.dataset.taskId = task.id;

    // Timeline content
    const timelineDiv = document.createElement("div");
    timelineDiv.className = "gantt-timeline";

    const timelineGrid = document.createElement("div");
    timelineGrid.className = "gantt-timeline-grid";

    // Create cells for each date
    dateColumns.forEach((date) => {
      const cell = document.createElement("div");
      cell.className = "gantt-timeline-cell";
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        cell.classList.add("weekend");
      }
      timelineGrid.appendChild(cell);
    });

    // Create bar container
    const barContainer = document.createElement("div");
    barContainer.className = "gantt-bar-container";

    // Calculate bar position and width
    const totalDays = dateColumns.length;
    const taskStartIndex = dateColumns.findIndex(d => d.toDateString() === task.start.toDateString());
    const taskEndIndex = dateColumns.findIndex(d => d.toDateString() === task.end.toDateString());

    const startIndex = taskStartIndex >= 0 ? taskStartIndex : 0;
    const endIndex = taskEndIndex >= 0 ? taskEndIndex : dateColumns.length - 1;
    const duration = endIndex - startIndex + 1;

    const bar = document.createElement("div");
    bar.className = `gantt-bar ${task.type.toLowerCase()}`;
    bar.style.left = `${(startIndex / totalDays) * 100}%`;
    bar.style.width = `${(duration / totalDays) * 100}%`;
    bar.dataset.taskId = task.id;
    bar.dataset.rowIndex = index;

    // Mark critical path tasks
    if (criticalPath.includes(task.id)) {
      bar.classList.add('critical');
    }

    // Add progress indicator
    if (task.percentComplete && task.percentComplete > 0) {
      const progressBar = document.createElement("div");
      progressBar.className = "gantt-bar-progress";
      progressBar.style.width = `${task.percentComplete}%`;
      bar.appendChild(progressBar);
    }

    const barLabel = document.createElement("span");
    barLabel.className = "gantt-bar-label";
    barLabel.textContent = task.name;
    bar.appendChild(barLabel);

    const criticalLabel = criticalPath.includes(task.id) ? ' [CRITICAL PATH]' : '';
    bar.title = `${task.name}${criticalLabel}: ${task.start.toDateString()} → ${task.end.toDateString()} (${task.elements.length} objects)\nClick to isolate objects | Double-click to edit`;
    bar.onclick = () => {
      if (task.elements && task.elements.length > 0) {
        viewer.isolate(task.elements);
        showOverlay(`✓ Viewing task: ${task.name} (${task.elements.length} objects)`);
      } else {
        showOverlay(`⚠ No objects associated with task: ${task.name}`);
      }
    };

    bar.ondblclick = (e) => {
      e.stopPropagation();
      openTaskModal(task.id);
    };

    barContainer.appendChild(bar);
    timelineGrid.appendChild(barContainer);

    // Add "Today" marker if today is within the date range
    if (todayPosition !== null) {
      const todayMarker = document.createElement("div");
      todayMarker.className = "gantt-today-marker";
      todayMarker.style.left = `${todayPosition}%`;

      const todayLabel = document.createElement("div");
      todayLabel.className = "gantt-today-label";
      todayLabel.textContent = "Today";
      todayMarker.appendChild(todayLabel);

      timelineGrid.appendChild(todayMarker);
    }

    timelineDiv.appendChild(timelineGrid);
    rowTimeline.appendChild(timelineDiv);

    // Append rows to respective containers
    ganttBodyFixed.appendChild(rowFixed);
    ganttBody.appendChild(rowTimeline);
  });

  // Store gantt timeline data for playback
  ganttTimelineData = {
    dateColumns,
    minDate,
    maxDate,
    totalDays
  };

  // Add playback marker (initially hidden)
  const existingPlaybackMarker = document.getElementById('ganttPlaybackMarker');
  if (existingPlaybackMarker) {
    existingPlaybackMarker.remove();
  }

  const playbackMarker = document.createElement("div");
  playbackMarker.id = "ganttPlaybackMarker";
  playbackMarker.className = "gantt-playback-marker";
  playbackMarker.style.display = "none";

  const playbackLabel = document.createElement("div");
  playbackLabel.className = "gantt-playback-label";
  playbackLabel.id = "ganttPlaybackLabel";
  playbackMarker.appendChild(playbackLabel);

  ganttBody.appendChild(playbackMarker);

  // Draw dependency lines
  drawDependencyLines(criticalPath);
}

function drawDependencyLines(criticalPath) {
  const svg = document.getElementById('ganttDependencyLines');
  if (!svg) return;

  // Clear existing content
  svg.innerHTML = '';

  // Add marker definitions for both regular and critical path arrows
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  // Regular arrow marker
  const regularMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  regularMarker.setAttribute('id', 'arrowhead-regular');
  regularMarker.setAttribute('markerWidth', '10');
  regularMarker.setAttribute('markerHeight', '10');
  regularMarker.setAttribute('refX', '9');
  regularMarker.setAttribute('refY', '3');
  regularMarker.setAttribute('orient', 'auto');
  const regularPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  regularPolygon.setAttribute('points', '0 0, 10 3, 0 6');
  regularPolygon.setAttribute('fill', '#6B7280');
  regularMarker.appendChild(regularPolygon);
  defs.appendChild(regularMarker);

  // Critical path arrow marker
  const criticalMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  criticalMarker.setAttribute('id', 'arrowhead-critical');
  criticalMarker.setAttribute('markerWidth', '10');
  criticalMarker.setAttribute('markerHeight', '10');
  criticalMarker.setAttribute('refX', '9');
  criticalMarker.setAttribute('refY', '3');
  criticalMarker.setAttribute('orient', 'auto');
  const criticalPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  criticalPolygon.setAttribute('points', '0 0, 10 3, 0 6');
  criticalPolygon.setAttribute('fill', '#DC2626');
  criticalMarker.appendChild(criticalPolygon);
  defs.appendChild(criticalMarker);

  svg.appendChild(defs);

  // Get scroll container for offset calculations
  const ganttBodyScrollable = document.querySelector('.gantt-body-scrollable');
  const scrollLeft = ganttBodyScrollable ? ganttBodyScrollable.scrollLeft : 0;
  const scrollTop = ganttBodyScrollable ? ganttBodyScrollable.scrollTop : 0;

  // Draw dependency arrows between tasks
  taskList.forEach(task => {
    if (!task.dependencies || task.dependencies.length === 0) return;

    task.dependencies.forEach(predId => {
      const predecessor = taskList.find(t => t.id === predId);
      if (!predecessor) return;

      // Find the bars for both tasks
      const predBar = document.querySelector(`.gantt-bar[data-task-id="${predId}"]`);
      const succBar = document.querySelector(`.gantt-bar[data-task-id="${task.id}"]`);

      if (!predBar || !succBar) return;

      // Get positions relative to the viewport
      const predRect = predBar.getBoundingClientRect();
      const succRect = succBar.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();

      // Calculate positions accounting for scroll
      const x1 = predRect.right - svgRect.left + scrollLeft;
      const y1 = predRect.top + predRect.height / 2 - svgRect.top + scrollTop;
      const x2 = succRect.left - svgRect.left + scrollLeft;
      const y2 = succRect.top + succRect.height / 2 - svgRect.top + scrollTop;

      // Determine if this is a critical path dependency
      const isCritical = criticalPath.includes(predId) && criticalPath.includes(task.id);
      const color = isCritical ? '#DC2626' : '#6B7280';
      const marker = isCritical ? 'url(#arrowhead-critical)' : 'url(#arrowhead-regular)';
      const strokeWidth = isCritical ? '2.5' : '2';

      // Create path with right angle connectors (P6 style)
      // Add some offset for better visibility
      const offsetX = 8;
      const midX = x1 + (x2 - x1) * 0.5;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      // Create a path that goes: right from predecessor -> down/up -> right to successor
      let pathData;
      if (Math.abs(y2 - y1) < 5) {
        // Tasks on same row - simple horizontal line
        pathData = `M ${x1 + offsetX} ${y1} L ${x2 - offsetX} ${y2}`;
      } else {
        // Tasks on different rows - use stepped path
        pathData = `M ${x1 + offsetX} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2 - offsetX} ${y2}`;
      }

      path.setAttribute('d', pathData);
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', strokeWidth);
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', marker);
      path.setAttribute('opacity', '0.8');
      path.classList.add('gantt-dependency-line');
      if (isCritical) {
        path.classList.add('critical');
      }

      // Add tooltip with task names
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${predecessor.name} → ${task.name}${isCritical ? ' (Critical Path)' : ''}`;
      path.appendChild(title);

      svg.appendChild(path);
    });
  });
}

// Synchronize scrolling between Gantt header and body
function setupGanttScrollSync() {
  const ganttFixedColumns = document.querySelector('.gantt-fixed-columns');
  const ganttScrollableTimeline = document.querySelector('.gantt-scrollable-timeline');
  const ganttBodyFixed = document.querySelector('.gantt-body-fixed');
  const ganttBodyScrollable = document.querySelector('.gantt-body-scrollable');

  if (!ganttScrollableTimeline || !ganttBodyScrollable || !ganttFixedColumns || !ganttBodyFixed) return;

  let isSyncingVertical = false;
  let scrollTimeout;

  // Debounced dependency redraw
  const redrawDependenciesDebounced = () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const criticalPath = calculateCriticalPath();
      drawDependencyLines(criticalPath);
    }, 100);
  };

  // Sync horizontal scroll within fixed columns section (header <-> body)
  ganttBodyFixed.addEventListener('scroll', (e) => {
    ganttFixedColumns.scrollLeft = e.target.scrollLeft;

    // Sync vertical scroll to timeline body (to keep rows aligned)
    if (!isSyncingVertical) {
      isSyncingVertical = true;
      ganttBodyScrollable.scrollTop = e.target.scrollTop;
      isSyncingVertical = false;
    }

    redrawDependenciesDebounced();
  });

  ganttFixedColumns.addEventListener('scroll', (e) => {
    ganttBodyFixed.scrollLeft = e.target.scrollLeft;
  });

  // Sync horizontal scroll within timeline section (header <-> body)
  ganttBodyScrollable.addEventListener('scroll', (e) => {
    // Sync horizontal scroll to timeline header
    ganttScrollableTimeline.scrollLeft = e.target.scrollLeft;

    // Sync vertical scroll to fixed columns body (to keep rows aligned)
    if (!isSyncingVertical) {
      isSyncingVertical = true;
      ganttBodyFixed.scrollTop = e.target.scrollTop;
      isSyncingVertical = false;
    }

    redrawDependenciesDebounced();
  });

  ganttScrollableTimeline.addEventListener('scroll', (e) => {
    // Sync horizontal scroll to timeline body
    ganttBodyScrollable.scrollLeft = e.target.scrollLeft;
  });
}

// Call setup after DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  setupGanttScrollSync();
});

// Redraw dependencies on window resize
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const criticalPath = calculateCriticalPath();
    drawDependencyLines(criticalPath);
  }, 200);
});

// Gantt view is always active now (task view removed)

let isPlaying = false;
let playInterval = null;

document.getElementById("play4dBtn").onclick = () => {
  const playBtn = document.getElementById("play4dBtn");

  if (isPlaying) {
    clearInterval(playInterval);
    isPlaying = false;
    playBtn.innerHTML = '<i class="fas fa-play"></i>';

    // Hide playback marker
    const playbackMarker = document.getElementById('ganttPlaybackMarker');
    if (playbackMarker) {
      playbackMarker.style.display = "none";
    }

    showOverlay("⏸ Playback paused");
    return;
  }

  if (taskList.length === 0) {
    showOverlay("⚠ No tasks available. Create or import a schedule first.");
    return;
  }

  const allDates = taskList.flatMap((t) => [t.start, t.end]);
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));
  let current = new Date(minDate);

  isPlaying = true;
  playBtn.innerHTML = '<i class="fas fa-pause"></i>';
  showOverlay("▶ Starting 4D playback...");

  // Show playback marker
  const playbackMarker = document.getElementById('ganttPlaybackMarker');
  const playbackLabel = document.getElementById('ganttPlaybackLabel');

  playInterval = setInterval(() => {
    const dateDisplay = document.getElementById("currentDate");
    dateDisplay.textContent = current.toDateString();

    // Update playback marker position
    if (playbackMarker && ganttTimelineData) {
      const currentIndex = ganttTimelineData.dateColumns.findIndex(
        d => d.toDateString() === current.toDateString()
      );
      if (currentIndex >= 0) {
        const position = ((currentIndex + 0.5) / ganttTimelineData.totalDays) * 100;
        playbackMarker.style.left = `${position}%`;
        playbackMarker.style.display = "block";
        if (playbackLabel) {
          playbackLabel.textContent = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
      }
    }

    // Find and isolate active tasks
    const activeTasks = taskList.filter(
      (task) => current >= task.start && current <= task.end
    );

    if (activeTasks.length > 0) {
      const allElements = activeTasks.flatMap((t) => t.elements);
      if (allElements.length > 0) {
        viewer.isolate(allElements);
      }
    } else {
      viewer.isolate([]);
    }

    current.setDate(current.getDate() + 1);

    if (current > maxDate) {
      clearInterval(playInterval);
      isPlaying = false;
      playBtn.innerHTML = '<i class="fas fa-play"></i>';

      // Hide playback marker
      if (playbackMarker) {
        playbackMarker.style.display = "none";
      }

      showOverlay("✓ Playback completed");
      viewer.isolate();
    }
  }, 500);
};

// Upload Schedule Functionality
document.getElementById("uploadScheduleBtn").onclick = async () => {
  if (!currentUrn) {
    showOverlay("⚠ Please select a model first before uploading a schedule.");
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showOverlay("⏳ Uploading schedule...");

    try {
      const form = new FormData();
      form.append("schedule-file", file);

      const resp = await fetch(`/api/schedule/${currentUrn}`, {
        method: "POST",
        body: form
      });

      const data = await resp.json();

      if (data.ok && data.tasks) {
        // Add uploaded tasks to taskList
        data.tasks.forEach(task => {
          taskList.push({
            id: task.id || nextTaskId++,
            name: task.name,
            type: task.type || "Build",
            start: new Date(task.start),
            end: new Date(task.end),
            dependencies: task.dependencies || [],
            elements: task.elements || []
          });
        });

        // Update Gantt view
        renderGanttChart();

        showOverlay(`✓ Uploaded ${data.tasks.length} task(s) from schedule`);
      } else {
        showOverlay("❌ Failed to upload schedule. Please check the file format.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      showOverlay("❌ Upload failed. Please try again.");
    }
  };

  input.click();
};

// Export Dropdown Toggle
const exportDropdown = document.querySelector('.export-dropdown');
const exportDropdownBtn = document.getElementById('exportDropdownBtn');
const exportMenu = document.getElementById('exportMenu');

exportDropdownBtn.onclick = (e) => {
  e.stopPropagation();
  exportDropdown.classList.toggle('active');
};

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!exportDropdown.contains(e.target)) {
    exportDropdown.classList.remove('active');
  }
});

// Excel Export Functionality
document.getElementById("exportExcelBtn").onclick = () => {
  exportDropdown.classList.remove('active');
  if (taskList.length === 0) {
    showOverlay("⚠ No tasks to export. Create some tasks first.");
    return;
  }

  try {
    // Prepare data for export
    const exportData = taskList.map((task) => ({
      "Task ID": task.id,
      "Task Name": task.name,
      "Type": task.type,
      "Start Date": task.start.toLocaleDateString('en-US'),
      "End Date": task.end.toLocaleDateString('en-US'),
      "Duration (days)": Math.ceil((task.end - task.start) / (1000 * 60 * 60 * 24)) + 1,
      "Dependencies": task.dependencies && task.dependencies.length > 0 ? task.dependencies.join(", ") : "None",
      "Objects Count": task.elements.length,
      "Object IDs": task.elements.join(", ") || "None"
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create Task List worksheet
    const ws1 = XLSX.utils.json_to_sheet(exportData);

    // Set column widths
    ws1['!cols'] = [
      { wch: 10 }, // Task ID
      { wch: 30 }, // Task Name
      { wch: 12 }, // Type
      { wch: 15 }, // Start Date
      { wch: 15 }, // End Date
      { wch: 15 }, // Duration
      { wch: 20 }, // Dependencies
      { wch: 15 }, // Objects Count
      { wch: 50 }  // Object IDs
    ];

    XLSX.utils.book_append_sheet(wb, ws1, "Task List");

    // Create Gantt Chart data worksheet
    const allDates = taskList.flatMap((t) => [t.start, t.end]);
    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));

    const dateColumns = [];
    const currentDate = new Date(minDate);
    while (currentDate <= maxDate) {
      dateColumns.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Build Gantt data
    const ganttData = [];

    taskList.forEach(task => {
      const row = {
        "Task Name": task.name,
        "Type": task.type,
        "Start": task.start.toLocaleDateString('en-US'),
        "End": task.end.toLocaleDateString('en-US'),
        "Objects": task.elements.length
      };

      // Add date columns
      dateColumns.forEach(date => {
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const isInRange = date >= task.start && date <= task.end;
        row[dateStr] = isInRange ? "■" : "";
      });

      ganttData.push(row);
    });

    const ws2 = XLSX.utils.json_to_sheet(ganttData);

    // Set column widths for Gantt
    ws2['!cols'] = [
      { wch: 30 }, // Task Name
      { wch: 12 }, // Type
      { wch: 15 }, // Start
      { wch: 15 }, // End
      { wch: 10 }, // Objects
      ...dateColumns.map(() => ({ wch: 8 })) // Date columns
    ];

    XLSX.utils.book_append_sheet(wb, ws2, "Gantt Chart");

    // Create summary worksheet
    const summary = [
      { "Metric": "Total Tasks", "Value": taskList.length },
      { "Metric": "Build Tasks", "Value": taskList.filter(t => t.type === "Build").length },
      { "Metric": "Demolish Tasks", "Value": taskList.filter(t => t.type === "Demolish").length },
      { "Metric": "Total Objects", "Value": taskList.reduce((sum, t) => sum + t.elements.length, 0) },
      { "Metric": "Project Start", "Value": minDate.toLocaleDateString('en-US') },
      { "Metric": "Project End", "Value": maxDate.toLocaleDateString('en-US') },
      { "Metric": "Project Duration", "Value": `${Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1} days` },
      { "Metric": "Export Date", "Value": new Date().toLocaleDateString('en-US') + " " + new Date().toLocaleTimeString('en-US') }
    ];

    const ws3 = XLSX.utils.json_to_sheet(summary);
    ws3['!cols'] = [{ wch: 25 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Summary");

    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `SA_4D_Schedule_${timestamp}.xlsx`;

    // Write file
    XLSX.writeFile(wb, filename);

    showOverlay(`✓ Exported to ${filename}`);

    // Add export animation
    const btn = document.getElementById("exportExcelBtn");
    btn.style.transform = "scale(0.95)";
    setTimeout(() => {
      btn.style.transform = "";
    }, 150);

  } catch (error) {
    console.error("Export error:", error);
    showOverlay("❌ Export failed. Please try again.");
  }
};

// ==========================================
// Resizable Timeline Section
// ==========================================

let isResizing = false;
let startY = 0;
let startHeight = 0;

const resizeHandle = document.getElementById('resizeHandle');
const timelineSection = document.querySelector('.timeline-section');

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  startY = e.clientY;
  startHeight = timelineSection.offsetHeight;

  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';

  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;

  const deltaY = startY - e.clientY;
  const newHeight = startHeight + deltaY;

  // Apply constraints
  const minHeight = 300;
  const maxHeight = window.innerHeight - 250;
  const constrainedHeight = Math.min(Math.max(newHeight, minHeight), maxHeight);

  timelineSection.style.height = `${constrainedHeight}px`;

  e.preventDefault();
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Save preference to localStorage
    localStorage.setItem('timelineHeight', timelineSection.offsetHeight);
  }
});

// Restore saved height on load
window.addEventListener('DOMContentLoaded', () => {
  const savedHeight = localStorage.getItem('timelineHeight');
  if (savedHeight) {
    timelineSection.style.height = `${savedHeight}px`;
  }
});

// 4D Animation Video Export
document.getElementById("export4DBtn").onclick = async () => {
  exportDropdown.classList.remove('active');

  if (taskList.length === 0) {
    showOverlay("⚠ No tasks to export. Create some tasks first.");
    return;
  }

  if (!viewer) {
    showOverlay("⚠ Please load a model first.");
    return;
  }

  try {
    showOverlay("🎬 Preparing to record 4D animation...");

    // Calculate date range
    const allDates = taskList.flatMap((t) => [t.start, t.end]);
    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;

    // Setup MediaRecorder
    const canvas = viewer.canvas;
    const stream = canvas.captureStream(30); // 30 FPS
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000 // 5 Mbps
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0, 10);
      a.download = `SA_4D_Animation_${timestamp}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Hide recording indicator
      document.getElementById('recordingIndicator').classList.remove('active');
      showOverlay("✓ 4D animation exported successfully!");

      // Restore viewer state
      viewer.isolate();
    };

    // Start recording
    mediaRecorder.start();

    // Show recording indicator
    document.getElementById('recordingIndicator').classList.add('active');
    showOverlay("🔴 Recording started...");

    // Animate through timeline
    let current = new Date(minDate);
    let frameCount = 0;
    const framesPerDay = 30; // 1 second per day at 30 FPS
    const totalFrames = totalDays * framesPerDay;

    const animate = () => {
      if (frameCount >= totalFrames) {
        // Stop recording
        mediaRecorder.stop();
        return;
      }

      // Update current date
      const progress = frameCount / totalFrames;
      const daysPassed = Math.floor(progress * totalDays);
      current = new Date(minDate);
      current.setDate(current.getDate() + daysPassed);

      // Find and isolate active tasks
      const activeTasks = taskList.filter(
        (task) => current >= task.start && current <= task.end
      );

      if (activeTasks.length > 0) {
        const allElements = activeTasks.flatMap((t) => t.elements);
        if (allElements.length > 0) {
          viewer.isolate(allElements);
        }
      } else {
        viewer.isolate([]);
      }

      frameCount++;
      requestAnimationFrame(animate);
    };

    // Start animation
    animate();

  } catch (error) {
    console.error("Video export error:", error);
    document.getElementById('recordingIndicator').classList.remove('active');

    if (error.name === 'NotSupportedError') {
      showOverlay("❌ Video recording not supported in this browser. Try Chrome or Edge.");
    } else {
      showOverlay("❌ Failed to export animation. Please try again.");
    }
  }
};
