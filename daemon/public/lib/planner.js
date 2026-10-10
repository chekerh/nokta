(function () {
  'use strict';

  var MAX_CARDS_PER_COL = 40;

  var plannerState = {
    items: [],
    sprints: [],
    epics: [],
    activeSprint: null,
    selectedItem: null,
  };

  // --- Sprint selector ---
  async function refreshSprintSelector() {
    var sel = $('plannerSprintSelect');
    if (!sel) return;
    try {
      var data = await api('GET', '/api/v1/planner/sprints');
      plannerState.sprints = data.sprints || [];
      sel.innerHTML = '<option value="">All Backlog</option>';
      plannerState.sprints.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s.id;
        // Trim the goal: an untrimmed goal makes the <select> (and the whole panel)
        // as wide as its longest option.
        var goal = String(s.goal || 'Untitled');
        opt.textContent =
          s.id + ': ' + (goal.length > 40 ? goal.slice(0, 40) + '…' : goal) + (s.status === 'active' ? ' ★' : '');
        opt.title = s.id + ': ' + goal;
        sel.appendChild(opt);
      });
      var active = plannerState.sprints.find(function (s) {
        return s.status === 'active';
      });
      if (active) {
        sel.value = active.id;
        plannerState.activeSprint = active;
      }
    } catch (e) {
      sel.innerHTML = '<option value="">Failed to load</option>';
    }
  }

  // --- Kanban board ---
  async function refreshBoard() {
    var board = $('plannerBoard');
    if (!board) return;
    var sprintFilter = $('plannerSprintSelect')?.value || '';
    try {
      var params = sprintFilter ? '?sprint=' + encodeURIComponent(sprintFilter) : '';
      var data = await api('GET', '/api/v1/planner/items' + params);
      plannerState.items = data.items || [];
    } catch (e) {
      board.innerHTML = '<div class="error-banner">Failed to load: ' + escHtml(e.message) + '</div>';
      return;
    }

    var columns = [
      { id: 'backlog', label: 'Backlog', items: [] },
      { id: 'ready', label: 'Ready', items: [] },
      { id: 'in-progress', label: 'In Progress', items: [] },
      { id: 'review', label: 'Review', items: [] },
      { id: 'done', label: 'Done', items: [] },
    ];

    plannerState.items.forEach(function (item) {
      var col = columns.find(function (c) {
        return c.id === item.status;
      });
      if (col) col.items.push(item);
      else columns[0].items.push(item);
    });

    board.innerHTML = columns
      .map(function (col) {
        // ponytail: cap rendered cards per column. A 2000-item backlog otherwise builds
        // 2000 DOM nodes on every refresh. Raise MAX_CARDS_PER_COL when the backend
        // paginates instead.
        var shown = col.items.slice(0, MAX_CARDS_PER_COL);
        var hidden = col.items.length - shown.length;
        return (
          '<div class="planner-col" data-status="' +
          col.id +
          '" ondragover="plannerDragOver(event)" ondragleave="plannerDragLeave(event)" ondrop="plannerDrop(event,\'' +
          col.id +
          '\')">' +
          '<div class="planner-col-header">' +
          escHtml(col.label) +
          ' <span class="badge badge-accent">' +
          col.items.length +
          '</span></div>' +
          '<div class="planner-col-items">' +
          shown
            .map(function (item) {
              return renderItemCard(item);
            })
            .join('') +
          (hidden > 0
            ? '<div class="planner-empty">Showing ' +
              shown.length +
              ' of ' +
              col.items.length +
              ' — use the sprint filter to narrow</div>'
            : '') +
          (col.items.length === 0 ? '<div class="planner-empty">Drop items here</div>' : '') +
          '</div></div>'
        );
      })
      .join('');
  }

  function renderItemCard(item) {
    var priorityColor = { P0: 'badge-red', P1: 'badge-orange', P2: 'badge-yellow', P3: 'badge-accent', P4: '' };
    var typeIcon = { story: '📖', task: '🔧', bug: '🐛', subtask: '·' };
    var icon = typeIcon[item.type] || '📋';
    var labels = (item.labels || [])
      .slice(0, 2)
      .map(function (l) {
        return (
          '<span class="badge" style="background:var(--surface-2);color:var(--text-3);font-size:.65rem">' +
          escHtml(l) +
          '</span>'
        );
      })
      .join('');
    return (
      '<div class="planner-card" draggable="true" ondragstart="plannerDragStart(event,this.dataset.id)" onclick="plannerSelectItem(this.dataset.id)" data-id="' +
      escHtml(item.id) +
      '">' +
      '<div style="display:flex;justify-content:space-between;align-items:start;gap:4px">' +
      '<span style="font-size:.82rem;font-weight:600;color:var(--text)">' +
      icon +
      ' ' +
      escHtml(item.title.slice(0, 60)) +
      '</span>' +
      '<span class="badge ' +
      (priorityColor[item.priority] || 'badge-accent') +
      '" style="font-size:.65rem;flex-shrink:0">' +
      item.priority +
      '</span>' +
      '</div>' +
      (labels ? '<div style="margin-top:4px">' + labels + '</div>' : '') +
      (item.autoGenerated
        ? '<div style="margin-top:2px"><span class="badge badge-green" style="font-size:.6rem">AI</span></div>'
        : '') +
      '<div style="display:flex;gap:6px;margin-top:4px;font-size:.7rem;color:var(--text-3)">' +
      (item.storyPoints ? '<span>⚡' + item.storyPoints + '</span>' : '') +
      '<span>' +
      escHtml(item.id) +
      '</span>' +
      '</div></div>'
    );
  }

  // --- Drag and drop ---
  var draggedItemId = null;

  window.plannerDragStart = function (ev, itemId) {
    draggedItemId = itemId;
    ev.dataTransfer.effectAllowed = 'move';
    ev.currentTarget.classList.add('dragging');
  };

  window.plannerDragOver = function (ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    ev.currentTarget.classList.add('drag-over');
  };

  window.plannerDragLeave = function (ev) {
    ev.currentTarget.classList.remove('drag-over');
  };

  window.plannerDrop = async function (ev, newStatus) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    document.querySelectorAll('.planner-card.dragging').forEach(function (n) {
      n.classList.remove('dragging');
    });
    if (!draggedItemId) return;
    try {
      await api('PATCH', '/api/v1/planner/items/' + draggedItemId, { status: newStatus });
      window.toast('Moved to ' + newStatus, 'success');
      refreshBoard();
    } catch (e) {
      window.toast('Failed: ' + e.message, 'error');
    }
    draggedItemId = null;
  };

  // --- Item detail ---
  window.plannerSelectItem = async function (itemId) {
    try {
      var item = await api('GET', '/api/v1/planner/items/' + itemId);
      plannerState.selectedItem = item;
      renderItemDetail(item);
    } catch (e) {
      window.toast('Failed: ' + e.message, 'error');
    }
  };

  function renderItemDetail(item) {
    var detail = $('plannerDetail');
    if (!detail) return;
    var typeIcon = { story: '📖', task: '🔧', bug: '🐛', subtask: '·' };
    detail.style.display = 'block';
    detail.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">' +
      '<div><strong style="font-size:.9rem">' +
      (typeIcon[item.type] || '') +
      ' ' +
      escHtml(item.title) +
      '</strong>' +
      '<span style="font-size:.7rem;color:var(--text-3);margin-left:6px">' +
      escHtml(item.id) +
      '</span></div>' +
      '<button class="btn btn-sm btn-ghost" onclick="plannerCloseDetail()">✕</button></div>' +
      '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">' +
      '<span class="badge ' +
      (item.status === 'done' ? 'badge-green' : item.status === 'in-progress' ? 'badge-yellow' : 'badge-accent') +
      '">' +
      item.status +
      '</span>' +
      '<span class="badge badge-orange">' +
      item.priority +
      '</span>' +
      (item.autoGenerated ? '<span class="badge badge-green">AI Generated</span>' : '') +
      (item.storyPoints ? '<span class="badge badge-accent">⚡' + item.storyPoints + 'pts</span>' : '') +
      '</div>' +
      (item.description
        ? '<div class="section-title">Description</div><p style="color:var(--text-2);font-size:.82rem;margin-bottom:8px">' +
          escHtml(item.description.slice(0, 500)) +
          '</p>'
        : '') +
      (item.acceptanceCriteria && item.acceptanceCriteria.length
        ? '<div class="section-title">Acceptance Criteria <button class="btn btn-sm btn-ghost" data-id="' +
          escHtml(item.id) +
          '" onclick="plannerEditCriteria(this.dataset.id)" style="font-size:.65rem;height:20px;padding:0 6px">✎</button></div><ul style="color:var(--text-2);font-size:.82rem;margin-bottom:8px;padding-left:16px">' +
          item.acceptanceCriteria
            .map(function (c) {
              return '<li>' + escHtml(c) + '</li>';
            })
            .join('') +
          '</ul>'
        : '<div class="section-title">Acceptance Criteria <button class="btn btn-sm btn-ghost" data-id="' +
          escHtml(item.id) +
          '" onclick="plannerEditCriteria(this.dataset.id)" style="font-size:.65rem;height:20px;padding:0 6px">+ Add</button></div>') +
      (item.relatedFiles && item.relatedFiles.length
        ? '<div class="section-title">Related Files</div><div style="margin-bottom:8px">' +
          item.relatedFiles
            .slice(0, 5)
            .map(function (f) {
              return '<div style="font-size:.78rem;color:var(--accent);padding:2px 0">📄 ' + escHtml(f) + '</div>';
            })
            .join('') +
          '</div>'
        : '') +
      (item.evidence && item.evidence.length
        ? '<div class="section-title">Evidence</div><div class="code-block" style="max-height:120px;font-size:.72rem">' +
          escHtml(item.evidence.slice(0, 3).join('\n')) +
          '</div>'
        : '') +
      (item.dependencies && item.dependencies.length
        ? '<div class="section-title">Depends On</div><div style="font-size:.78rem;color:var(--text-3)">' +
          item.dependencies.join(', ') +
          '</div>'
        : '') +
      '<div style="margin-top:10px;display:flex;gap:4px">' +
      '<select class="planner-status-select" data-id="' +
      escHtml(item.id) +
      '" onchange="plannerQuickStatus(this.dataset.id,this.value)" style="width:auto;font-size:.75rem;padding:3px 6px;height:26px">' +
      ['backlog', 'ready', 'in-progress', 'review', 'done']
        .map(function (s) {
          return '<option value="' + s + '"' + (s === item.status ? ' selected' : '') + '>' + s + '</option>';
        })
        .join('') +
      '</select>' +
      '<button class="btn btn-sm btn-danger" data-id="' +
      escHtml(item.id) +
      '" onclick="plannerDeleteItem(this.dataset.id)">🗑 Delete</button></div>';
  }

  window.plannerQuickStatus = async function (itemId, status) {
    try {
      await api('PATCH', '/api/v1/planner/items/' + itemId, { status: status });
      window.toast('Status updated to ' + status, 'success');
      refreshBoard();
      var item = await api('GET', '/api/v1/planner/items/' + itemId);
      renderItemDetail(item);
    } catch (e) {
      window.toast('Failed: ' + e.message, 'error');
    }
  };

  window.plannerEditCriteria = async function (itemId) {
    try {
      var item = await api('GET', '/api/v1/planner/items/' + itemId);
      var current = (item.acceptanceCriteria || []).join('\n');
      var input = prompt('Edit acceptance criteria (one per line):', current);
      if (input === null) return;
      var criteria = input
        .split('\n')
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      await api('PATCH', '/api/v1/planner/items/' + itemId, { acceptanceCriteria: criteria });
      window.toast('Acceptance criteria updated', 'success');
      plannerSelectItem(itemId);
    } catch (e) {
      window.toast('Failed: ' + e.message, 'error');
    }
  };

  window.plannerDeleteItem = async function (itemId) {
    if (!confirm('Delete ' + itemId + '?')) return;
    try {
      await api('DELETE', '/api/v1/planner/items/' + itemId);
      window.toast('Deleted ' + itemId, 'success');
      plannerCloseDetail();
      refreshBoard();
    } catch (e) {
      window.toast('Failed: ' + e.message, 'error');
    }
  };

  window.plannerCloseDetail = function () {
    var detail = $('plannerDetail');
    if (detail) detail.style.display = 'none';
    plannerState.selectedItem = null;
  };

  // --- New item ---
  window.plannerShowNewItem = function () {
    var form = $('plannerNewItemForm');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };

  window.plannerCreateItem = async function () {
    var type = $('plannerNewType')?.value || 'task';
    var title = $('plannerNewTitle')?.value?.trim();
    var priority = $('plannerNewPriority')?.value || 'P2';
    if (!title) {
      window.toast('Title is required', 'error');
      return;
    }
    var sprintFilter = $('plannerSprintSelect')?.value || '';
    try {
      var body = { type: type, title: title, priority: priority };
      if (sprintFilter) body.sprint = sprintFilter;
      await api('POST', '/api/v1/planner/items', body);
      window.toast('Created ' + title, 'success');
      $('plannerNewTitle').value = '';
      $('plannerNewItemForm').style.display = 'none';
      refreshBoard();
    } catch (e) {
      window.toast('Failed: ' + e.message, 'error');
    }
  };

  // --- Brainstorm ---
  window.plannerShowBrainstorm = function () {
    var modal = $('plannerBrainstormModal');
    if (modal) modal.style.display = 'flex';
  };

  window.plannerCloseBrainstorm = function () {
    var modal = $('plannerBrainstormModal');
    if (modal) modal.style.display = 'none';
  };

  window.plannerRunBrainstorm = async function () {
    var input = $('plannerBrainstormInput');
    var prompt = input?.value?.trim() || 'feature';
    var btn = $('plannerBrainstormBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Thinking...';
    }
    try {
      var result = await api('POST', '/api/v1/planner/brainstorm', {
        context: { stacks: [], files: [] },
        prompts: { features: prompt },
      });
      window.toast('Created ' + (result.suggestions?.length || 0) + ' suggestions', 'success');
      plannerCloseBrainstorm();
      refreshBoard();
    } catch (e) {
      window.toast('Brainstorm failed: ' + e.message, 'error');
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate';
    }
  };

  // --- New Sprint ---
  window.plannerShowNewSprint = function () {
    var form = $('plannerNewSprintForm');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  };

  window.plannerCreateSprint = async function () {
    var goal = $('plannerSprintGoal')?.value?.trim();
    if (!goal) {
      window.toast('Sprint goal is required', 'error');
      return;
    }
    try {
      await api('POST', '/api/v1/planner/sprints', { goal: goal, status: 'planning' });
      window.toast('Sprint created: ' + goal, 'success');
      $('plannerSprintGoal').value = '';
      $('plannerNewSprintForm').style.display = 'none';
      refreshSprintSelector();
    } catch (e) {
      window.toast('Failed: ' + e.message, 'error');
    }
  };

  // --- Init ---
  // index.html wires onchange="refreshBoard()" and ondrag* inline handlers, so both
  // must be reachable as globals — an IIFE-scoped function throws ReferenceError there.
  window.refreshBoard = refreshBoard;
  window.refreshPlanner = async function () {
    await Promise.all([refreshSprintSelector(), refreshBoard()]);
  };
})();
