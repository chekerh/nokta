(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function createSVG(width, height) {
    return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  }

  function createLinePath(points, xScale, yScale) {
    if (points.length === 0) return '';
    var d = 'M ' + points[0].x + ' ' + points[0].y;
    for (var i = 1; i < points.length; i++) {
      d += ' L ' + points[i].x + ' ' + points[i].y;
    }
    return d;
  }

  function createAreaPath(points, baseline, xScale, yScale) {
    if (points.length === 0) return '';
    var d = 'M ' + points[0].x + ' ' + baseline;
    for (var i = 0; i < points.length; i++) {
      d += ' L ' + points[i].x + ' ' + points[i].y;
    }
    d += ' L ' + points[points.length - 1].x + ' ' + baseline;
    d += ' Z';
    return d;
  }

  function renderBurndownChart(container, report) {
    if (!report.sprint.startDate || !report.sprint.endDate) {
      container.innerHTML = '<p style="color:var(--text-3);font-size:0.85rem">Sprint has no start/end date set.</p>';
      return;
    }

    var burndown = report.burndown || [];
    if (burndown.length === 0) {
      container.innerHTML = '<p style="color:var(--text-3);font-size:0.85rem">No burndown data yet.</p>';
      return;
    }

    var width = 560;
    var height = 140;
    var padding = { top: 10, right: 10, bottom: 25, left: 35 };
    var chartW = width - padding.left - padding.right;
    var chartH = height - padding.top - padding.bottom;

    var svg = createSVG(width, height);
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    var maxRemaining = Math.max.apply(
      null,
      burndown.map(function (d) {
        return d.remaining;
      }),
    );
    maxRemaining = Math.max(maxRemaining, 1);

    var xScale = function (i) {
      return padding.left + (i / Math.max(burndown.length - 1, 1)) * chartW;
    };
    var yScale = function (v) {
      return padding.top + chartH - (v / maxRemaining) * chartH;
    };

    // Grid lines
    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartH / 4) * i;
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padding.left);
      line.setAttribute('y1', y);
      line.setAttribute('x2', padding.left + chartW);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', 'rgba(255,255,255,0.05)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
    }

    // Axes
    var axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', padding.left);
    axis.setAttribute('y1', padding.top);
    axis.setAttribute('x2', padding.left);
    axis.setAttribute('y2', padding.top + chartH);
    axis.setAttribute('stroke', 'rgba(255,255,255,0.18)');
    axis.setAttribute('stroke-width', '1');
    svg.appendChild(axis);

    var xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', padding.left);
    xAxis.setAttribute('y1', padding.top + chartH);
    xAxis.setAttribute('x2', padding.left + chartW);
    xAxis.setAttribute('y2', padding.top + chartH);
    xAxis.setAttribute('stroke', 'rgba(255,255,255,0.18)');
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);

    // Area + line
    var points = burndown.map(function (d, i) {
      return { x: xScale(i), y: yScale(d.remaining) };
    });

    var def = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    var grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', 'burndownGrad-' + Math.random().toString(36).slice(2));
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0');
    grad.setAttribute('y2', '1');
    var stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#8b5cf6');
    stop1.setAttribute('stop-opacity', '0.3');
    var stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#8b5cf6');
    stop2.setAttribute('stop-opacity', '0');
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    def.appendChild(grad);
    svg.appendChild(def);

    var area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute(
      'd',
      createAreaPath(points, padding.top + chartH, xScale, yScale),
    );
    area.setAttribute('fill', 'url(#' + grad.id + ')');
    svg.appendChild(area);

    var line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', createLinePath(points, xScale, yScale));
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#8b5cf6');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);

    // X-axis labels (first, middle, last)
    var labelIndices = [0, Math.floor(burndown.length / 2), burndown.length - 1];
    for (var j = 0; j < labelIndices.length; j++) {
      var idx = labelIndices[j];
      if (idx < 0 || idx >= burndown.length) continue;
      var lx = xScale(idx);
      var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', lx);
      label.setAttribute('y', padding.top + chartH + 15);
      label.setAttribute('fill', 'var(--text-3)');
      label.setAttribute('font-size', '10');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = burndown[idx].date.slice(5);
      svg.appendChild(label);
    }

    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderVelocityChart(container, report) {
    var velocity = report.velocity || 0;
    var avgVelocity = velocity || 0;

    var width = 560;
    var height = 80;
    var padding = { top: 5, right: 10, bottom: 25, left: 35 };
    var chartH = height - padding.top - padding.bottom;

    var svg = createSVG(width, height);
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    var barHeight = Math.max((avgVelocity / Math.max(avgVelocity * 1.5, 10)) * chartH * 0.6, 2);
    var barY = padding.top + chartH * 0.2;

    var bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', padding.left);
    bar.setAttribute('y', barY);
    bar.setAttribute('width', padding.left + 200);
    bar.setAttribute('height', barHeight);
    bar.setAttribute('fill', 'var(--accent-grad)');
    svg.appendChild(bar);

    var value = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    value.setAttribute('x', padding.left + 210);
    value.setAttribute('y', barY + barHeight / 2 + 4);
    value.setAttribute('fill', 'var(--text)');
    value.setAttribute('font-size', '12');
    value.setAttribute('font-weight', '600');
    value.textContent = avgVelocity > 0 ? avgVelocity + ' pts' : 'Set after first sprint';
    svg.appendChild(value);

    var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', padding.left);
    label.setAttribute('y', barY + barHeight + 15);
    label.setAttribute('fill', 'var(--text-3)');
    label.setAttribute('font-size', '10');
    label.textContent = 'Velocity';
    svg.appendChild(label);

    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderTypeChart(container, report) {
    var byType = report.byType || { stories: 0, tasks: 0, bugs: 0 };
    var types = [
      { label: 'Stories', value: byType.stories, color: '#8b5cf6' },
      { label: 'Tasks', value: byType.tasks, color: '#3b82f6' },
      { label: 'Bugs', value: byType.bugs, color: '#f43f5e' },
    ];
    var total = types.reduce(function (sum, t) {
      return sum + t.value;
    }, 0);
    total = Math.max(total, 1);

    var width = 560;
    var height = 120;
    var padding = 20;
    var radius = 40;

    var svg = createSVG(width, height);
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    var cx = width / 2;
    var cy = height / 2;
    var offset = 0;

    types.forEach(function (t) {
      if (t.value === 0) return;
      var startAngle = (offset / total) * 2 * Math.PI;
      var endAngle = ((offset + t.value) / total) * 2 * Math.PI;
      var x1 = cx + radius * Math.sin(startAngle);
      var y1 = cy - radius * Math.cos(startAngle);
      var x2 = cx + radius * Math.sin(endAngle);
      var y2 = cy - radius * Math.cos(endAngle);
      var largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z',
      );
      path.setAttribute('fill', t.color);
      path.setAttribute('stroke', 'var(--bg)');
      path.setAttribute('stroke-width', '2');
      svg.appendChild(path);

      offset += t.value;
    });

    // Legend
    types.forEach(function (t, i) {
      if (t.value === 0) return;
      var y = height - 30 + (i % 3) * 16;
      var x = padding + (i % 3) * 120;

      var swatch = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      swatch.setAttribute('x', x);
      swatch.setAttribute('y', y);
      swatch.setAttribute('width', 10);
      swatch.setAttribute('height', 10);
      swatch.setAttribute('fill', t.color);
      swatch.setAttribute('rx', 2);
      svg.appendChild(swatch);

      var lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.setAttribute('x', x + 15);
      lbl.setAttribute('y', y + 8);
      lbl.setAttribute('fill', 'var(--text-2)');
      lbl.setAttribute('font-size', '10');
      lbl.textContent = t.label + ' (' + t.value + ')';
      svg.appendChild(lbl);
    });

    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderSprintReport(container, report) {
    if (!report) {
      container.innerHTML = '<p style="color:var(--text-3)">No report data available.</p>';
      return;
    }

    var html =
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">' +
      '<div class="stat"><div class="stat-value">' +
      report.totalItems +
      '</div><div class="stat-label">Total Items</div></div>' +
      '<div class="stat"><div class="stat-value">' +
      report.completedItems +
      '</div><div class="stat-label">Completed</div></div>' +
      '<div class="stat"><div class="stat-value">' +
      (report.completionRate || 0) +
      '%</div><div class="stat-label">Completion</div></div>' +
      '<div class="stat"><div class="stat-value">' +
      (report.velocity || '—') +
      '</div><div class="stat-label">Velocity</div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">' +
      '<div><div class="stat-value" style="font-size:1rem">Stories: ' +
      (report.byType?.stories || 0) +
      '</div><div class="stat-value" style="font-size:1rem">Tasks: ' +
      (report.byType?.tasks || 0) +
      '</div><div class="stat-value" style="font-size:1rem">Bugs: ' +
      (report.byType?.bugs || 0) +
      '</div></div>' +
      '<div><div class="stat-value" style="font-size:1rem">Auto-gen: ' +
      (report.autoGeneratedCount || 0) +
      '</div><div class="stat-value" style="font-size:1rem">Bugs found: ' +
      (report.bugsFound || 0) +
      '</div></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">Burndown Chart</div><div id="reportBurndown"></div></div>' +
      '<div class="card"><div class="card-title">Item Distribution</div><div id="reportTypes"></div></div>' +
      '<div class="card"><div class="card-title">Velocity</div><div id="reportVelocity"></div></div>';

    container.innerHTML = html;
    renderBurndownChart($('reportBurndown'), report);
    renderTypeChart($('reportTypes'), report);
    renderVelocityChart($('reportVelocity'), report);
  }

  window.renderSprintReport = renderSprintReport;
  window.reports = {
    renderSprintReport: renderSprintReport,
    renderBurndownChart: renderBurndownChart,
    renderVelocityChart: renderVelocityChart,
    renderTypeChart: renderTypeChart,
  };
})();
