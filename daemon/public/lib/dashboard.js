      (function () {
        'use strict';
        // $, escHtml, api come from /lib/ui.js
        const API = window.location.origin;

        function toast(msg, type) {
          type = type || 'info';
          const icons = { info: 'ℹ', success: '✓', error: '✗', warning: '⚠' };
          const c = $('toastContainer');
          const e = document.createElement('div');
          e.className = 'toast';
          e.innerHTML =
            '<span class="icon">' + (icons[type] || icons.info) + '</span><span>' + escHtml(msg) + '</span>';
          e.style.borderLeft =
            '4px solid ' +
            (type === 'error'
              ? '#f43f5e'
              : type === 'success'
                ? '#10b981'
                : type === 'warning'
                  ? '#f59e0b'
                  : '#8b5cf6');
          c.appendChild(e);
          setTimeout(() => {
            e.style.opacity = '0';
            e.style.transition = 'opacity .3s';
            setTimeout(() => e.remove(), 300);
          }, 3500);
        }
        window.toast = toast;

        // Sidebar mobile toggle
        var sidebarOpen = false;
        function toggleSidebar(force) {
          sidebarOpen = force !== undefined ? force : !sidebarOpen;
          var sb = document.querySelector('.sidebar');
          var bb = document.getElementById('sidebarBackdrop');
          var btn = document.getElementById('sidebarToggle');
          if (sb) {
            sb.classList.toggle('open', sidebarOpen);
          }
          if (bb) {
            bb.classList.toggle('active', sidebarOpen);
          }
          if (btn) {
            btn.setAttribute('aria-expanded', String(sidebarOpen));
          }
        }
        window.toggleSidebar = toggleSidebar;
        document.getElementById('sidebarToggle')?.addEventListener('click', function () {
          toggleSidebar();
        });
        document.getElementById('sidebarBackdrop')?.addEventListener('click', function () {
          toggleSidebar(false);
        });

        // Auth state
        var authToken = localStorage.getItem('nokta-token');
        var authRefreshToken = localStorage.getItem('nokta-refresh');
        var authUser = null;
        try {
          var storedUser = localStorage.getItem('nokta-user');
          if (storedUser) authUser = JSON.parse(storedUser);
        } catch (e) {}

        function hasToken() {
          return !!authToken;
        }

        function setAuth(token, user, refreshToken) {
          authToken = token;
          authUser = user;
          if (refreshToken !== undefined) authRefreshToken = refreshToken;
          if (token) {
            localStorage.setItem('nokta-token', token);
            localStorage.setItem('nokta-user', JSON.stringify(user));
            if (authRefreshToken) localStorage.setItem('nokta-refresh', authRefreshToken);
            scheduleTokenRefresh();
          } else {
            authToken = null;
            authRefreshToken = null;
            localStorage.removeItem('nokta-token');
            localStorage.removeItem('nokta-user');
            localStorage.removeItem('nokta-refresh');
          }
        }

        // Exchange the stored refresh token for a new access token, rotating the
        // refresh token. Concurrent callers share one in-flight request so a burst
        // of 401s triggers a single refresh. The token is read from storage at call
        // time so another tab's rotation is picked up here.
        //
        // Resolution contract used by lib/ui.js api():
        //   true  - refreshed, caller should retry the original request
        //   false - the refresh token is rejected (401): the session is gone
        //   null  - transient failure (429/5xx/network): keep the session
        var refreshInFlight = null;
        function sleep(ms) {
          return new Promise(function (resolve) {
            setTimeout(resolve, ms);
          });
        }
        // A concurrent rotation in another tab answers 409. The winner stores
        // the successor milliseconds later, so poll storage briefly instead of
        // treating the 409 as an expired session.
        async function awaitOtherTabRotation(current) {
          for (var i = 0; i < 8; i++) {
            await sleep(75);
            var stored = localStorage.getItem('nokta-refresh');
            if (stored && stored !== current) return true;
            var access = localStorage.getItem('nokta-token');
            if (access && access !== authToken) return true;
          }
          return false;
        }
        function refreshAccessToken() {
          if (refreshInFlight) return refreshInFlight;
          refreshInFlight = (async function () {
            for (var attempt = 0; attempt < 2; attempt++) {
              var current = localStorage.getItem('nokta-refresh') || authRefreshToken;
              if (!current) return false;
              var res;
              try {
                res = await fetch(API + '/api/v1/auth/refresh', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ refreshToken: current }),
                });
              } catch (e) {
                // A network hiccup is not a dead session; do not log the user out.
                return null;
              }
              if (res.status === 409) {
                return (await awaitOtherTabRotation(current)) ? true : false;
              }
              if (res.status === 401) {
                // Another tab may have rotated while this request was in flight
                // and already stored the successor; retry once with it before
                // declaring the session over.
                var latest = localStorage.getItem('nokta-refresh');
                if (latest && latest !== current) continue;
                return false;
              }
              if (!res.ok) return null;
              var data;
              try {
                data = await res.json();
              } catch (e) {
                return null;
              }
              setAuth(data.token, data.user || authUser, data.refreshToken);
              return true;
            }
            return false;
          })().finally(function () {
            refreshInFlight = null;
          });
          return refreshInFlight;
        }

        // Renew shortly before the access token expires so panel loads never
        // meet a 401 in the first place.
        var refreshTimer = null;
        function accessTokenMsLeft() {
          if (!authToken) return null;
          try {
            var part = authToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            var payload = JSON.parse(atob(part + '==='.slice((part.length + 3) % 4)));
            return Number.isFinite(payload.exp) ? payload.exp * 1000 - Date.now() : null;
          } catch (e) {
            return null;
          }
        }
        function scheduleTokenRefresh() {
          if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
          }
          var left = accessTokenMsLeft();
          if (left === null) return;
          if (left <= 0) {
            runScheduledRefresh();
            return;
          }
          var lead = Math.min(60 * 1000, left / 3);
          refreshTimer = setTimeout(runScheduledRefresh, Math.max(1000, left - lead));
        }
        function runScheduledRefresh() {
          refreshTimer = null;
          refreshAccessToken().then(function (outcome) {
            // Transient failure: the session is alive, so try again shortly.
            if (outcome === null) refreshTimer = setTimeout(runScheduledRefresh, 15000);
            else if (outcome === true) scheduleTokenRefresh();
          });
        }

        // Decode (without verifying) the access token's exp so the SSE reconnect
        // path only refreshes when the token is actually stale, instead of on
        // every transient stream error.
        function accessTokenExpired() {
          if (!authToken) return true;
          try {
            var part = authToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            var padded = part + '==='.slice((part.length + 3) % 4);
            var payload = JSON.parse(atob(padded));
            return !payload.exp || payload.exp * 1000 <= Date.now();
          } catch (e) {
            return true;
          }
        }

        // Auth
        function showAuthOverlay() {
          var overlay = $('authOverlay');
          if (overlay) overlay.style.display = 'flex';
        }
        function hideAuthOverlay() {
          var overlay = $('authOverlay');
          if (overlay) overlay.style.display = 'none';
        }
        // Shared api() lives in /lib/ui.js; give it the session-expiry behaviour it needs.
        window.setOnUnauthorized(function () {
          setAuth(null, null);
          showAuthOverlay();
        });
        // ...and let it silently refresh a short-lived access token before giving up.
        window.setOnRefresh(refreshAccessToken);
        scheduleTokenRefresh();
        // A laptop waking from sleep can outlive the timer; refresh immediately
        // if the tab becomes visible with a dead access token.
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible' && accessTokenExpired()) refreshAccessToken();
        });
        function authShowLogin() {
          $('authRegisterBox').style.display = 'none';
          $('authLoginBox').style.display = 'block';
          $('authError').style.display = 'none';
        }
        function authShowRegister() {
          $('authLoginBox').style.display = 'none';
          $('authRegisterBox').style.display = 'block';
          $('authRegError').style.display = 'none';
        }
        window.authShowLogin = authShowLogin;
        window.authShowRegister = authShowRegister;

        async function authLogin() {
          var email = $('authEmail').value.trim();
          var password = $('authPassword').value;
          var btn = $('authBtn');
          var err = $('authError');
          err.style.display = 'none';
          if (!email || !password) {
            err.textContent = 'Email and password required';
            err.style.display = 'block';
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Signing in...';
          try {
            var res = await fetch(API + '/api/v1/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email, password: password }),
            });
            if (!res.ok) {
              var e = await res.json();
              throw new Error(e.error || 'Login failed');
            }
            var data = await res.json();
            setAuth(data.token, data.user, data.refreshToken);
            hideAuthOverlay();
            toast('Welcome back!', 'success');
            afterAuth();
          } catch (e) {
            err.textContent = e.message;
            err.style.display = 'block';
          }
          btn.disabled = false;
          btn.textContent = 'Sign In';
        }
        window.authLogin = authLogin;

        async function authRegister() {
          var name = $('authRegName').value.trim();
          var email = $('authRegEmail').value.trim();
          var password = $('authRegPassword').value;
          var btn = $('authRegBtn');
          var err = $('authRegError');
          err.style.display = 'none';
          if (!email || !password) {
            err.textContent = 'Email and password required';
            err.style.display = 'block';
            return;
          }
          if (password.length < 8) {
            err.textContent = 'Password must be at least 8 characters';
            err.style.display = 'block';
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Creating account...';
          try {
            var res = await fetch(API + '/api/v1/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email, password: password, name: name }),
            });
            if (!res.ok) {
              var e = await res.json();
              throw new Error(e.error || 'Registration failed');
            }
            var data = await res.json();
            setAuth(data.token, data.user, data.refreshToken);
            hideAuthOverlay();
            toast('Account created successfully!', 'success');
            afterAuth();
          } catch (e) {
            err.textContent = e.message;
            err.style.display = 'block';
          }
          btn.disabled = false;
          btn.textContent = 'Create Account';
        }
        window.authRegister = authRegister;

        function authLogout() {
          // Let the server revoke the refresh token (and refresh a stale access
          // token first if needed) before clearing local state.
          api('POST', '/api/v1/auth/logout')
            .catch(function () {})
            .finally(function () {
              setAuth(null, null);
              location.reload();
            });
        }
        window.authLogout = authLogout;

        function toggleUserMenu(event) {
          event.stopPropagation();
          var menu = $('userDropdown');
          menu.classList.toggle('active');
        }
        window.toggleUserMenu = toggleUserMenu;
        document.addEventListener('click', function () {
          var dd = $('userDropdown');
          if (dd && dd.classList.contains('active')) dd.classList.remove('active');
        });

        function afterAuth() {
          $('userMenu').style.display = 'flex';
          var avatar = $('userAvatar');
          avatar.textContent = (authUser.name || authUser.email || '?')[0].toUpperCase();
          $('userName').textContent = authUser.name || authUser.email;
          $('settingsEmail').value = authUser.email || '';
          $('settingsName').value = authUser.name || '';
          $('settingsTier').textContent = authUser.tier || 'free';
          var adminTab = $('adminNavTab');
          if (adminTab) adminTab.style.display = authUser && authUser.role === 'admin' ? 'flex' : 'none';
          refreshDashboard();
        }

        function showSettings() {
          window.switchTab('settings');
        }
        window.showSettings = showSettings;

        window.changePassword = async function () {
          var cur = $('settingsCurPw').value;
          var nue = $('settingsNewPw').value;
          if (!cur || !nue) {
            toast('Fill in both password fields', 'error');
            return;
          }
          if (nue.length < 8) {
            toast('New password must be at least 8 characters', 'error');
            return;
          }
          try {
            await api('POST', '/api/v1/auth/change-password', { currentPassword: cur, newPassword: nue });
            toast('Password updated', 'success');
            $('settingsCurPw').value = '';
            $('settingsNewPw').value = '';
          } catch (e) {
            toast('Failed: ' + e.message, 'error');
          }
        };

        window.loadBillingInfo = async function () {
          try {
            var config = await api('GET', '/api/v1/billing/config');
            var features = config.tiers[config.currentTier || authUser?.tier || 'free'];
            $('billingTier').textContent = config.currentTier || authUser?.tier || 'free';
            if (features) {
              $('billingFeatures').innerHTML =
                '<span style="margin-right:12px">🔁 ' +
                features.requestsPerMin +
                ' req/min</span><span>🤖 ' +
                (features.maxAgents === -1 ? '∞' : features.maxAgents) +
                ' active agents</span>';
            }
            if (config.configured) {
              $('billingNote').textContent = 'Stripe connected. Billing portal is active.';
            } else {
              $('billingNote').textContent = 'Manual billing/self-hosted tier changes.';
            }
          } catch (e) {
            $('billingNote').textContent = 'Billing details unavailable: ' + e.message;
          }
        };

        window.upgradeTier = async function (tier) {
          try {
            var result = await api('POST', '/api/v1/billing/upgrade', { tier: tier });
            if (result.url) {
              window.open(result.url, '_blank');
              toast('Opening secure Stripe payment checkout...', 'info');
            } else if (result.success) {
              toast('Plan upgraded to ' + tier.toUpperCase() + '!', 'success');
              if (authUser) {
                authUser.tier = tier;
                setAuth(authToken, authUser);
              }
              loadBillingInfo();
            }
          } catch (e) {
            toast('Upgrade failed: ' + e.message, 'error');
          }
        };

        async function loadAdminData() {
          try {
            var metricsResp = await api('GET', '/api/v1/admin/metrics');
            if (metricsResp && metricsResp.metrics) {
              var m = metricsResp.metrics;
              $('adminStatUsers').textContent = m.users?.total ?? 0;
              $('adminStatProjects').textContent = m.projects?.total ?? 0;
              $('adminStatRuns').textContent = m.agentRuns?.total ?? 0;
              var cost = Number(m.costs?.totalCost || 0);
              $('adminStatCost').textContent = '$' + cost.toFixed(2);
            }

            var usersResp = await api('GET', '/api/v1/admin/users');
            var tbody = $('adminUsersTbody');
            if (usersResp && usersResp.users) {
              if (usersResp.users.length === 0) {
                tbody.innerHTML =
                  '<tr><td colspan="6" style="text-align:center;color:var(--text-3)">No users registered yet</td></tr>';
              } else {
                tbody.innerHTML = usersResp.users
                  .map(function (u) {
                    var isSelf = authUser && authUser.id === u.id;
                    return (
                      '<tr>' +
                      '<td><strong>' +
                      escHtml(u.email) +
                      '</strong>' +
                      (isSelf ? ' <span class="badge badge-accent">You</span>' : '') +
                      '</td>' +
                      '<td>' +
                      escHtml(u.name || '-') +
                      '</td>' +
                      '<td><select class="input" style="padding:4px 8px;font-size:0.8rem" onchange="updateUserRole(\'' +
                      u.id +
                      '\', this.value)"' +
                      (isSelf ? ' disabled title="Cannot change own role"' : '') +
                      '>' +
                      '<option value="user"' +
                      (u.role === 'user' ? ' selected' : '') +
                      '>user</option>' +
                      '<option value="admin"' +
                      (u.role === 'admin' ? ' selected' : '') +
                      '>admin</option>' +
                      '</select></td>' +
                      '<td><select class="input" style="padding:4px 8px;font-size:0.8rem" onchange="updateUserTier(\'' +
                      u.id +
                      '\', this.value)">' +
                      '<option value="free"' +
                      (u.tier === 'free' ? ' selected' : '') +
                      '>free</option>' +
                      '<option value="pro"' +
                      (u.tier === 'pro' ? ' selected' : '') +
                      '>pro</option>' +
                      '<option value="enterprise"' +
                      (u.tier === 'enterprise' ? ' selected' : '') +
                      '>enterprise</option>' +
                      '</select></td>' +
                      '<td style="color:var(--text-3);font-size:0.75rem">' +
                      (u.created_at ? new Date(u.created_at).toLocaleDateString() : '-') +
                      '</td>' +
                      '<td><span style="font-size:0.75rem;color:var(--text-3)">' +
                      escHtml(u.id) +
                      '</span></td>' +
                      '</tr>'
                    );
                  })
                  .join('');
              }
            }
          } catch (e) {
            toast('Admin access failed: ' + e.message, 'error');
          }
        }
        window.loadAdminData = loadAdminData;

        async function updateUserRole(userId, newRole) {
          try {
            await api('PATCH', '/api/v1/admin/users/' + encodeURIComponent(userId) + '/role', { role: newRole });
            toast('User role updated to ' + newRole, 'success');
          } catch (e) {
            toast('Failed to update role: ' + e.message, 'error');
            loadAdminData();
          }
        }
        window.updateUserRole = updateUserRole;

        async function updateUserTier(userId, newTier) {
          try {
            await api('PATCH', '/api/v1/admin/users/' + encodeURIComponent(userId) + '/tier', { tier: newTier });
            toast('User tier updated to ' + newTier, 'success');
          } catch (e) {
            toast('Failed to update tier: ' + e.message, 'error');
            loadAdminData();
          }
        }
        window.updateUserTier = updateUserTier;

        // Tab switching
        var tabs = document.querySelectorAll('.nav-tab');
        var panels = {};
        document.querySelectorAll('.panel').forEach(function (p) {
          panels[p.id.replace('panel-', '')] = p;
        });
        window.switchTab = function (name) {
          tabs.forEach(function (t) {
            t.classList.toggle('active', t.dataset.tab === name);
          });
          Object.values(panels).forEach(function (p) {
            p.classList.remove('active');
          });
          if (panels[name]) panels[name].classList.add('active');
          if (name === 'discover' && !discoveryData) refreshDiscovery();
          if (name === 'chat') renderChatHistory();
          if (name === 'planner') window.refreshPlanner();
          if (name === 'reports') loadReport();
          if (name === 'agents') refreshAgentRuns();
          if (name === 'settings') loadSettings();
          if (name === 'skills') loadLearnedSkills();
          if (name === 'admin') loadAdminData();
        };
        tabs.forEach(function (t) {
          t.addEventListener('click', function () {
            window.switchTab(t.dataset.tab);
          });
        });

        async function refreshReportSprintSelector() {
          var select = $('reportSprintSelect');
          if (!select) return;
          try {
            var summary = await api('GET', '/api/v1/planner/sprints');
            var sprints = summary.sprints || [];
            select.innerHTML = '<option value="">Select Sprint</option>';
            sprints.forEach(function (s) {
              var opt = document.createElement('option');
              opt.value = s.id;
              opt.textContent = s.name || s.id;
              select.appendChild(opt);
            });
          } catch (e) {}
        }

        async function loadReport() {
          var select = $('reportSprintSelect');
          var container = $('reportContainer');
          if (!select || !container) return;
          var sprintId = select.value;
          if (!sprintId) {
            if (select.options.length <= 1) refreshReportSprintSelector();
            return;
          }
          try {
            var report = await api('GET', '/api/v1/planner/sprints/' + encodeURIComponent(sprintId) + '/report');
            if (window.renderSprintReport) {
              window.renderSprintReport(container, report);
            }
          } catch (e) {
            container.innerHTML = '<p style="color:var(--red)">Failed to load report.</p>';
          }
        }
        refreshReportSprintSelector();
        function loadSettings() {
          if (authUser) {
            $('settingsEmail').value = authUser.email || '';
            $('settingsName').value = authUser.name || '';
            $('settingsTier').textContent = authUser.tier || 'free';
            loadBillingInfo();
          }
        }

        // Log
        var logs = [];
        function addLog(msg, type) {
          var c = $('logContainer');
          if (!c) return;
          var time = new Date().toLocaleTimeString();
          logs.push({ msg: msg, type: type || 'info', time: time });
          var d = document.createElement('div');
          var clr =
            type === 'error'
              ? 'var(--red)'
              : type === 'success'
                ? 'var(--green)'
                : type === 'warning'
                  ? 'var(--yellow)'
                  : 'var(--text-3)';
          d.innerHTML =
            '<span style="color:var(--text-3)">' +
            escHtml(time) +
            '</span> &middot; <span style="color:' +
            clr +
            '">' +
            escHtml(msg) +
            '</span>';
          c.appendChild(d);
          c.scrollTop = c.scrollHeight;
          var count = $('logCount');
          if (count) count.textContent = logs.length;
        }

        // Dashboard
        async function refreshDashboard() {
          try {
            var health = await api('GET', '/health');
            var badge = $('daemonStatusBadge');
            badge.className = 'badge badge-green';
            badge.textContent = '● Online';
            $('statProvidersValue').textContent = (health.providers && health.providers.length) || 0;
            $('statVersionValue').textContent = health.version || '—';
            var defProv = health.defaultProvider || 'auto';
            var activeCount = health.providers ? health.providers.filter((p) => p.enabled).length : 0;
            $('daemonDetail').innerHTML =
              '<span style="color:var(--green)">✔</span> ' +
              activeCount +
              (activeCount === 1 ? ' active model' : ' active models') +
              ' &middot; default: ' +
              escHtml(defProv);
          } catch (e) {
            var badge = $('daemonStatusBadge');
            badge.className = 'badge badge-red';
            badge.textContent = '● Offline';
            $('daemonDetail').innerHTML = 'Daemon unreachable: ' + escHtml(e.message);
          }
          refreshAgentRunCounts();
          refreshCosts();
        }

        async function refreshCosts() {
          try {
            var data = await api('GET', '/api/v1/costs/summary');
            var monthly = data.monthly || {};
            $('costMonthValue').textContent = '$' + Number(monthly.totalCost || 0).toFixed(2);
            $('costRequestsValue').textContent = Number(monthly.requestCount || 0).toLocaleString();
            $('costAllTimeValue').textContent = '$' + Number(data.allTimeCost || 0).toFixed(2);
            $('costNote').textContent =
              monthly.requestCount > 0
                ? 'Recorded for ' + monthly.month + '.'
                : 'No model spend recorded this month yet.';
          } catch (e) {
            $('costNote').textContent = 'Cost ledger unavailable: ' + e.message;
          }
        }

        async function refreshAgentRunCounts() {
          try {
            var runsRes = await api('GET', '/api/v1/agent-runs?limit=100');
            var runs = runsRes.runs || [];
            $('statAgentsValue').textContent = runs.length;
            $('statActiveRuns').textContent = runs.filter(function (r) {
              return r.status === 'running' || r.status === 'created';
            }).length;
          } catch (e) {
            $('statAgentsValue').textContent = '?';
            $('statActiveRuns').textContent = '?';
          }
        }

        // ---- Agent Runs ----
        function showNewAgentRun() {
          var form = $('agentRunForm');
          form.style.display = form.style.display === 'none' ? 'block' : 'none';
          if (form.style.display === 'block') $('agentGoalInput').focus();
        }
        window.showNewAgentRun = showNewAgentRun;

        function closeAgentDetail() {
          $('agentRunDetail').style.display = 'none';
        }
        window.closeAgentDetail = closeAgentDetail;

        async function refreshAgentRuns() {
          var c = $('agentRunsContainer');
          var err = $('agentError');
          try {
            var data = await api('GET', '/api/v1/agent-runs?limit=50');
            var runs = data.runs || [];
            err.style.display = 'none';
            if (runs.length === 0) {
              c.innerHTML = '<div class="kanban-empty">No active loops running. Launch one to watch.</div>';
              return;
            }
            c.innerHTML = runs
              .map(function (run) {
                var statusDot =
                  run.status === 'running' || run.status === 'created'
                    ? '<span style="color:var(--yellow)">●</span>'
                    : run.status === 'completed'
                      ? '<span style="color:var(--green)">●</span>'
                      : run.status === 'failed'
                        ? '<span style="color:var(--red)">●</span>'
                        : '<span style="color:var(--text-3)">●</span>';
                var badgeClass =
                  run.status === 'running'
                    ? 'badge-yellow'
                    : run.status === 'completed'
                      ? 'badge-green'
                      : run.status === 'failed'
                        ? 'badge-red'
                        : 'badge-accent';
                var stepInfo = run.steps ? run.steps.length + ' steps' : '0 steps';
                var triggerIcon = run.trigger === 'automatic' ? '⚙' : '▶';
                return (
                  '<div class="kanban-card" style="margin-bottom:8px" onclick="showAgentRunDetail(\'' +
                  run.id +
                  '\')">' +
                  '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">' +
                  '<span style="font-size:0.85rem;font-weight:700;color:#fff">' +
                  escHtml(run.goal || run.id) +
                  '</span>' +
                  '<span class="badge ' +
                  badgeClass +
                  '" style="font-size:0.65rem">' +
                  statusDot +
                  ' ' +
                  escHtml(run.status) +
                  '</span>' +
                  '</div>' +
                  '<div style="display:flex;gap:8px;font-size:0.75rem;color:var(--text-3)">' +
                  '<span>' +
                  triggerIcon +
                  ' ' +
                  escHtml(run.trigger || 'manual') +
                  '</span>' +
                  '<span>&middot;</span>' +
                  '<span>' +
                  stepInfo +
                  '</span>' +
                  '<span>&middot;</span>' +
                  '<span>step ' +
                  (run.currentStep || 0) +
                  '</span>' +
                  '</div>' +
                  '</div>'
                );
              })
              .join('');
            refreshAgentRunCounts();
          } catch (e) {
            err.textContent = 'Failed to load agent runs: ' + e.message;
            err.style.display = 'block';
            c.innerHTML = '';
          }
        }

        async function createAgentRun() {
          var goal = $('agentGoalInput').value.trim();
          if (!goal) {
            toast('Please describe agent task/goals', 'error');
            return;
          }
          var btn = $('agentRunBtn');
          btn.disabled = true;
          btn.textContent = 'Compiling workspace context...';
          try {
            var result = await api('POST', '/api/v1/agent-runs/auto', { goal: goal });
            var run = result.run;
            toast('Agent loop successfully launched!', 'success');
            addLog('Agent run triggered: ' + run.goal, 'success');
            $('agentGoalInput').value = '';
            $('agentRunForm').style.display = 'none';
            refreshAgentRuns();
            showAgentRunDetail(run.id);
          } catch (e) {
            toast('Failed: ' + e.message, 'error');
          }
          btn.disabled = false;
          btn.textContent = 'Launch Agent Loop';
        }
        window.createAgentRun = createAgentRun;

        async function showAgentRunDetail(runId) {
          try {
            var res = await api('GET', '/api/v1/agent-runs/' + runId);
            var run = res.run;
            if (!run) {
              toast('Run not found', 'error');
              return;
            }
            $('agentDetailTitle').textContent = 'Execution Log: ' + (run.goal || run.id);
            var body = $('agentDetailBody');
            var stepsHtml = '';
            if (run.steps && run.steps.length) {
              run.steps.forEach(function (step, i) {
                var output = run.output && run.output[i];
                var stepStatus = output ? output.status : 'pending';
                var statusClass =
                  stepStatus === 'completed'
                    ? 'completed'
                    : stepStatus === 'running'
                      ? 'running'
                      : stepStatus === 'failed'
                        ? 'failed'
                        : '';
                var statusBadge =
                  stepStatus === 'completed'
                    ? '<span class="badge badge-green">✓</span>'
                    : stepStatus === 'running'
                      ? '<span class="badge badge-yellow">▶</span>'
                      : stepStatus === 'failed'
                        ? '<span class="badge badge-red">✗</span>'
                        : '<span class="badge badge-accent">○</span>';
                var outputText = '';
                if (output) {
                  if (output.output)
                    outputText = escHtml(
                      typeof output.output === 'object'
                        ? JSON.stringify(output.output, null, 2)
                        : String(output.output).slice(0, 500),
                    );
                  else if (output.error)
                    outputText = '<span style="color:var(--red)">Error: ' + escHtml(output.error) + '</span>';
                }
                stepsHtml +=
                  '<div class="card" style="margin-bottom:10px;background:var(--surface-2)">' +
                  '<div style="display:flex;justify-content:space-between;align-items:center">' +
                  '<span style="font-weight:600">' +
                  (step.name || step.type || 'Step ' + (i + 1)) +
                  '</span>' +
                  '<span><span class="badge badge-accent" style="font-size:0.65rem">' +
                  escHtml(step.type || '?') +
                  '</span> ' +
                  statusBadge +
                  '</span>' +
                  '</div>' +
                  (output && output.durationMs
                    ? '<div style="font-size:.7rem;color:var(--text-3);margin-top:2px">' +
                      output.durationMs +
                      'ms</div>'
                    : '') +
                  (outputText ? '<div class="code-block" style="margin-top:8px">' + outputText + '</div>' : '') +
                  '</div>';
              });
            }
            var metaHtml =
              '<div style="display:flex;gap:10px;margin-bottom:14px">' +
              '<span class="badge ' +
              (run.status === 'completed'
                ? 'badge-green'
                : run.status === 'failed'
                  ? 'badge-red'
                  : run.status === 'running'
                    ? 'badge-yellow'
                    : 'badge-accent') +
              '">' +
              escHtml(run.status) +
              '</span>' +
              '<span style="color:var(--text-3);font-size:0.8rem">' +
              escHtml(run.trigger || 'manual') +
              '</span>' +
              '<span style="color:var(--text-3);font-size:0.8rem">' +
              escHtml(new Date(run.createdAt).toLocaleString()) +
              '</span>' +
              '</div>';
            body.innerHTML =
              metaHtml + stepsHtml + (run.error ? '<div class="error-banner">' + escHtml(run.error) + '</div>' : '');
            $('agentRunDetail').style.display = 'block';
          } catch (e) {
            toast('Failed to load run logs: ' + e.message, 'error');
          }
        }
        window.showAgentRunDetail = showAgentRunDetail;

        // UI/UX Search Engine Integration
        window.runUiUxSearch = async function () {
          var query = $('uiuxQuery').value.trim();
          var domain = $('uiuxDomain').value;
          var results = $('uiuxResults');
          if (!query) {
            toast('Type search keywords or style description', 'error');
            return;
          }
          results.innerHTML = '<div class="kanban-empty">Searching BM25 reasoning database...</div>';
          try {
            var res = await api('POST', '/api/v1/uiux/search', { query: query, domain: domain });
            if (!res.results || res.results.length === 0) {
              results.innerHTML = '<div class="kanban-empty">No design results found.</div>';
              return;
            }
            var html = '<div style="display:flex;flex-direction:column;gap:10px">';
            res.results.forEach(function (item, i) {
              var inner = '';
              Object.keys(item).forEach(function (k) {
                inner +=
                  '<div style="margin-top:4px;font-size:0.82rem"><strong style="color:var(--accent)">' +
                  k +
                  ':</strong> <span style="color:var(--text-2)">' +
                  escHtml(item[k]) +
                  '</span></div>';
              });
              html +=
                '<div class="card" style="background:var(--surface-2)">' +
                '<div style="font-weight:700;font-size:0.9rem;color:#fff;border-bottom:1px solid var(--border);padding-bottom:6px">Result #' +
                (i + 1) +
                ' (' +
                escHtml(res.domain) +
                ')</div>' +
                inner +
                '</div>';
            });
            html += '</div>';
            results.innerHTML = html;
          } catch (e) {
            results.innerHTML =
              '<div class="error-banner" style="color:var(--red)">Search failed: ' + escHtml(e.message) + '</div>';
          }
        };

        window.runDesignSystemGen = async function () {
          var query = $('uiuxQuery').value.trim();
          var results = $('uiuxResults');
          if (!query) {
            toast('Type keywords to generate custom design system (e.g. Wellness Spa, Trading App)', 'error');
            return;
          }
          results.innerHTML =
            '<div class="kanban-empty">Querying design intelligence engine... (this can take ~100ms)</div>';
          try {
            var res = await api('POST', '/api/v1/uiux/design-system', { query: query, format: 'markdown' });
            var system = res.designSystem || '';
            // Format headers and color hex codes to copy; escape first so any
            // HTML in the model output is inert, then let our own <code>/<h1>/... tags through.
            var formatted = escHtml(system)
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
              .replace(/^# (.*)$/gm, '<h1 style="font-size:1.4rem;color:#fff;margin:12px 0 6px">$1</h1>')
              .replace(/^## (.*)$/gm, '<h2 style="font-size:1.15rem;color:var(--accent);margin:10px 0 6px">$1</h2>')
              .replace(/^### (.*)$/gm, '<h3 style="font-size:0.95rem;color:#fff;margin:8px 0 4px">$1</h3>')
              .replace(/\n/g, '<br>');
            results.innerHTML = '<div class="card" style="line-height:1.7;font-size:0.85rem">' + formatted + '</div>';
            toast('Design system generated successfully!', 'success');
          } catch (e) {
            results.innerHTML =
              '<div class="error-banner" style="color:var(--red)">Generation failed: ' + escHtml(e.message) + '</div>';
          }
        };

        // Providers
        async function refreshProviders() {
          var body = $('providersBody');
          var errDiv = $('providersError');
          try {
            var [provRes, healthRes] = await Promise.all([api('GET', '/api/v1/providers'), api('GET', '/health')]);
            var list = provRes.providers || [];
            var health = healthRes || {};
            body.innerHTML =
              list.length === 0
                ? '<tr><td colspan="4" style="text-align:center;color:var(--text-3)">No encrypted keys configured.</td></tr>'
                : list
                    .map(function (p) {
                      var isHealthy = health.providers ? health.providers.find((h) => h.id === p.id)?.healthy : false;
                      var statusHtml =
                        '<span class="badge ' +
                        (p.enabled ? 'badge-green' : 'badge-red') +
                        '">' +
                        (p.enabled ? 'Active' : 'Disabled') +
                        '</span>';
                      var healthIcon = p.enabled
                        ? isHealthy
                          ? '<span class="badge badge-green">✓ Secure & Verified</span>'
                          : '<span class="badge badge-red">✗ Key Missing/Invalid</span>'
                        : '<span class="badge badge-orange">● Standby</span>';
                      return (
                        '<tr><td><strong>' +
                        escHtml(p.name || p.id || '?') +
                        '</strong></td>' +
                        '<td>' +
                        statusHtml +
                        '</td>' +
                        '<td>' +
                        healthIcon +
                        '</td>' +
                        '<td>' +
                        (p.models ? p.models.length : '<span style="color:var(--text-3)">0</span>') +
                        '</td></tr>'
                      );
                    })
                    .join('');
            $('statProvidersValue').textContent = list.length;
            errDiv.style.display = 'none';
          } catch (e) {
            body.innerHTML =
              '<tr><td colspan="4" style="text-align:center;color:var(--red)">Failed to sync keys: ' +
              e.message +
              '</td></tr>';
          }
        }

        function toggleAddProvider() {
          var form = $('addProviderForm');
          form.style.display = form.style.display === 'none' ? 'block' : 'none';
        }
        window.toggleAddProvider = toggleAddProvider;

        window.addProvider = async function () {
          var type = $('providerType').value;
          var key = $('providerKey').value.trim();
          if (!type || !key) {
            toast('Provider type and API key required', 'error');
            return;
          }
          try {
            await api('POST', '/api/v1/providers/configure', {
              id: type,
              apiKey: key,
              baseUrl: $('providerUrl').value.trim() || undefined,
            });
            toast('API Key encrypted and configured successfully!', 'success');
            $('providerType').value = '';
            $('providerKey').value = '';
            $('providerUrl').value = '';
            $('addProviderForm').style.display = 'none';
            refreshProviders();
          } catch (e) {
            toast('Failed: ' + e.message, 'error');
          }
        };

        // Gates Check
        window.checkGates = async function () {
          var target = $('gateTarget').value.trim() || '.';
          var btn = $('gateCheckBtn');
          btn.disabled = true;
          btn.textContent = 'Auditing code quality...';
          var errDiv = $('gatesError');
          errDiv.style.display = 'none';
          var c = $('gatesContainer');
          try {
            var result = await api('POST', '/api/v1/gates', { target: target });
            var gates = Array.isArray(result) ? result : result.gates || [];
            if (gates.length === 0) {
              c.innerHTML = '<p style="color:var(--text-3)">No quality gates found to audit.</p>';
              return;
            }
            var passed = gates.filter(function (g) {
              return g.passed || g.status === 'pass';
            }).length;
            c.innerHTML =
              '<div style="margin-bottom:12px;font-size:0.9rem">Compliance rate: <strong style="color:var(--green)">' +
              passed +
              '</strong> / ' +
              gates.length +
              ' passed</div>' +
              gates
                .map(function (g) {
                  return (
                    '<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:var(--surface-2);margin-bottom:8px"><span style="font-weight:600">' +
                    escHtml(g.id || g.name || 'Gate Check') +
                    '</span><span class="badge ' +
                    (g.passed || g.status === 'pass' ? 'badge-green' : 'badge-red') +
                    '">' +
                    (g.passed || g.status === 'pass' ? 'PASS' : 'FAIL') +
                    '</span></div>'
                  );
                })
                .join('');
            addLog(
              'Audited gates: ' + passed + '/' + gates.length + ' passed',
              passed === gates.length ? 'success' : 'warning',
            );
          } catch (e) {
            errDiv.textContent = 'Audit failed: ' + e.message;
            errDiv.style.display = 'block';
          }
          btn.disabled = false;
          btn.textContent = 'Run Audit';
        };

        // Chat
        var chatHistory = [];
        try {
          var stored = localStorage.getItem('nokta-chat');
          if (stored) chatHistory = JSON.parse(stored);
        } catch (e) {}

        function saveChatHistory() {
          try {
            localStorage.setItem('nokta-chat', JSON.stringify(chatHistory.slice(-50)));
          } catch (e) {}
        }

        function renderChatHistory() {
          var sidebar = $('chatSidebar');
          if (sidebar) {
            if (chatHistory.length === 0) {
              sidebar.style.display = 'none';
              return;
            }
            sidebar.style.display = 'flex';
          }
        }

        function renderMarkdown(text) {
          if (!text) return '';
          var html = escHtml(text);
          html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
            return (
              '<pre class="code-block"><code' +
              (lang ? ' class="language-' + escHtml(lang) + '"' : '') +
              '>' +
              escHtml(code.trim()) +
              '</code></pre>'
            );
          });
          html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
          html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
          html = html.replace(/^[\s]*[-*] (.+)$/gm, '<li>$1</li>');
          html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
          html = html.replace(/\n/g, '<br>');
          return html;
        }

        var chatAbortController = null;
        window.clearChat = function () {
          if (!confirm('Clear chat messages?')) return;
          abortChat();
          $('chatMessages').innerHTML = '';
          $('chatModel').textContent = 'auto';
        };

        function getConciseness() {
          var sel = $('concisenessMode');
          return sel ? sel.value : 'verbose';
        }
        function getSelectedModel() {
          var sel = $('chatModelSelect');
          return sel ? sel.value : '';
        }

        window.abortChat = function () {
          if (chatAbortController) {
            chatAbortController.abort();
            chatAbortController = null;
          }
          $('chatAbortBtn').style.display = 'none';
        };

        async function populateModels() {
          try {
            var data = await api('GET', '/api/v1/models');
            var sel = $('chatModelSelect');
            sel.innerHTML = '<option value="">Auto-select model</option>';
            if (data.models) {
              data.models.forEach(function (group) {
                if (group.models && group.models.length) {
                  group.models.forEach(function (m) {
                    var opt = document.createElement('option');
                    opt.value = group.provider + ':' + m;
                    opt.textContent = group.provider + ' — ' + m;
                    sel.appendChild(opt);
                  });
                }
              });
            }
          } catch (e) {}
        }

        window.sendChat = async function () {
          var input = $('chatInput');
          var msg = input.value.trim();
          if (!msg) return;
          if (chatAbortController) {
            toast('Another generation is already running', 'warn');
            return;
          }

          var container = $('chatMessages');
          container.innerHTML +=
            '<div class="chat-msg user"><div class="role">You</div><div class="content">' +
            renderMarkdown(msg) +
            '</div></div>';
          input.value = '';

          var assistantDiv = document.createElement('div');
          assistantDiv.className = 'chat-msg assistant';
          assistantDiv.innerHTML = '<div class="role">Nokta</div><div class="content">Thinking...</div>';
          container.appendChild(assistantDiv);
          container.scrollTop = container.scrollHeight;

          var btn = $('chatSendBtn');
          btn.disabled = true;
          var abortBtn = $('chatAbortBtn');
          abortBtn.style.display = 'inline-flex';
          chatAbortController = new AbortController();
          var fullReply = '';

          try {
            var conciseness = getConciseness();
            var modelInfo = getSelectedModel().split(':');
            var body = { messages: [{ role: 'user', content: msg }], stream: true };
            if (conciseness !== 'verbose') body.conciseness = conciseness;
            if (modelInfo[0]) body.provider = modelInfo[0];
            if (modelInfo[1]) body.model = modelInfo.slice(1).join(':');

            var chatHeaders = { 'Content-Type': 'application/json' };
            if (authToken) chatHeaders['Authorization'] = 'Bearer ' + authToken;
            var response = await fetch('/api/v1/chat', {
              method: 'POST',
              headers: chatHeaders,
              body: JSON.stringify(body),
              signal: chatAbortController.signal,
            });

            if (!response.ok) {
              var errData = await response.json().catch(function () {
                return { error: 'HTTP ' + response.status };
              });
              throw new Error(errData.error || 'HTTP ' + response.status);
            }

            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';
            var modelName = '';
            var finalTokens = null;

            while (true) {
              var readResult = await reader.read();
              if (readResult.done) break;
              buffer += decoder.decode(readResult.value, { stream: true });
              var lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line || !line.startsWith('data: ')) continue;
                try {
                  var data = JSON.parse(line.slice(6));
                  if (data.meta && !modelName && data.meta.model) {
                    modelName = String(data.meta.model);
                  }
                  if (data.content) {
                    fullReply += data.content;
                    assistantDiv.innerHTML =
                      '<div class="role">Nokta' +
                      (modelName
                        ? ' <span style="font-size:0.7rem;color:var(--text-3)">' + escHtml(modelName) + '</span>'
                        : '') +
                      '</div><div class="content">' +
                      renderMarkdown(fullReply) +
                      '</div>';
                    container.scrollTop = container.scrollHeight;
                  }
                  if (data.done) {
                    finalTokens = data;
                  }
                  if (data.error) {
                    throw new Error(data.error);
                  }
                } catch (e) {
                  if (e.message !== 'Unexpected end of JSON input') throw e;
                }
              }
            }

            var modelLabel = modelName || finalTokens?.model || '';
            assistantDiv.innerHTML =
              '<div class="role">Nokta' +
              (modelLabel
                ? ' <span style="font-weight:400;font-size:0.7rem;color:var(--text-3)">' +
                  escHtml(modelLabel) +
                  '</span>'
                : '') +
              '</div><div class="content">' +
              renderMarkdown(fullReply) +
              '</div>';
            if (modelLabel) $('chatModel').textContent = modelLabel;
            container.scrollTop = container.scrollHeight;

            chatHistory.push({
              messages: [
                { role: 'user', content: msg },
                { role: 'assistant', content: fullReply },
              ],
              time: new Date().toLocaleTimeString(),
              model: modelLabel,
            });
            saveChatHistory();
            renderChatHistory();
          } catch (e) {
            if (e.name === 'AbortError') {
              assistantDiv.innerHTML =
                '<div class="role" style="color:var(--text-3)">Aborted</div><div class="content">' +
                renderMarkdown(fullReply || '(aborted)') +
                '</div>';
            } else {
              assistantDiv.innerHTML =
                '<div class="role" style="color:var(--red)">Error</div><div class="content" style="color:var(--red)">' +
                escHtml(e.message) +
                '</div>';
              toast('Chat error: ' + e.message, 'error');
            }
          }

          btn.disabled = false;
          abortBtn.style.display = 'none';
          chatAbortController = null;
        };

        // Discovery
        var discoveryData = null;
        async function refreshDiscovery(force) {
          force = force || false;
          var status = $('discoveryStatus');
          var btn = $('discoverRefreshBtn');
          var results = $('discoveryResults');
          status.textContent = 'Scanning GitHub and npm repositories...';
          if (btn) btn.disabled = true;
          results.innerHTML = '<div class="kanban-empty">Querying web indexing registries...</div>';
          try {
            discoveryData = await api('GET', '/api/v1/discover' + (force ? '?force=true' : ''));
            renderDiscovery();
            var s = discoveryData.summary;
            var d = new Date(discoveryData.generatedAt);
            status.textContent = d.toLocaleString() + ' — ' + s.totalDiscovery + ' indices loaded';
            addLog(
              'Discovered skill additions: ' + s.githubRepos + ' repos, ' + s.npmPackages + ' npm libraries',
              'info',
            );
          } catch (e) {
            status.textContent = 'Offline fallback enabled.';
            results.innerHTML = '<div class="kanban-empty">Could not connect to online registries. Try again.</div>';
          }
          if (btn) btn.disabled = false;
        }

        function renderDiscovery() {
          var results = $('discoveryResults');
          if (!discoveryData || !discoveryData.discoveries || !discoveryData.discoveries.length) {
            results.innerHTML = '<div class="kanban-empty">Discovery logs empty. Trigger scan.</div>';
            return;
          }
          var groups = {};
          discoveryData.discoveries.forEach(function (d) {
            var key = d.type === 'update' ? 'Source Updates' : d.type === 'github' ? 'GitHub Trending' : 'npm Packages';
            if (!groups[key]) groups[key] = [];
            groups[key].push(d);
          });
          var typeColor = {
            'Source Updates': 'badge-orange',
            'GitHub Trending': 'badge-accent',
            'npm Packages': 'badge-green',
          };
          var html = '';
          Object.keys(groups).forEach(function (groupName) {
            var items = groups[groupName];
            html +=
              '<div style="font-weight:700;font-size:0.95rem;margin:16px 0 10px;color:#fff">' +
              groupName +
              ' (' +
              items.length +
              ')</div>';
            items.forEach(function (item) {
              var importUrl = item.url;
              var stars = item.stars
                ? '<span class="badge badge-yellow" style="font-size:.7rem">★ ' +
                  Number(item.stars).toLocaleString() +
                  '</span>'
                : '';
              var lang = item.language
                ? '<span class="badge badge-accent" style="font-size:.7rem">' + escHtml(item.language) + '</span>'
                : '';
              var skillBadge = item.skills
                ? '<span class="badge badge-blue" style="font-size:.7rem">' + item.skills + ' skills</span>'
                : '';
              html +=
                '<div class="card" style="background:var(--surface-2);margin-bottom:8px">' +
                '<div style="font-weight:600;font-size:0.88rem"><a href="' +
                escHtml(importUrl || '#') +
                '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">' +
                escHtml(item.name || '') +
                '</a></div>' +
                '<div style="font-size:0.8rem;color:var(--text-2);margin:4px 0 8px">' +
                escHtml((item.description || '').slice(0, 200)) +
                '</div>' +
                '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
                stars +
                lang +
                skillBadge +
                '<span class="badge ' +
                (typeColor[groupName] || 'badge-accent') +
                '">' +
                escHtml(item.reason || '') +
                '</span></div>' +
                '</div>';
            });
          });
          results.innerHTML = html;
        }

        // Live agent status updates
        var sseRetryDelay = 5000;
        function connectAgentEvents() {
          if (typeof EventSource === 'undefined') return;
          try {
            var es = new EventSource(
              API + '/api/v1/agent-runs/events' + (authToken ? '?' + 'token' + '=' + encodeURIComponent(authToken) : '')
            );
            es.onopen = function () {
              sseRetryDelay = 5000;
            };
            var handlers = [
              'run:created',
              'run:started',
              'run:completed',
              'run:updated',
              'run:step-start',
              'run:step-complete',
            ];
            handlers.forEach(function (evt) {
              es.addEventListener(evt, function (e) {
                try {
                  var data = JSON.parse(e.data);
                  if (data.id || data.runId) {
                    refreshAgentRuns();
                    refreshDashboard();
                    if (window.refreshPlanner) window.refreshPlanner();
                  }
                } catch (e) {}
              });
            });
            es.onerror = function () {
              es.close();
              // Anonymous visitors have no stream access; don't spin reconnecting.
              if (!authRefreshToken && !authToken) return;
              var reschedule = function () {
                setTimeout(connectAgentEvents, sseRetryDelay);
                sseRetryDelay = Math.min(sseRetryDelay * 2, 60000);
              };
              // Only mint a new access token when the current one is actually
              // stale; a transient stream error should not churn tokens.
              if (accessTokenExpired()) {
                refreshAccessToken().then(function (outcome) {
                  // false = token rejected, session gone: stop retrying (the
                  // next API call surfaces the login overlay). true/null =
                  // refreshed or transient failure: reconnect with backoff.
                  if (outcome !== false) reschedule();
                });
              } else {
                reschedule();
              }
            };
          } catch (e) {
            setTimeout(connectAgentEvents, 10000);
          }
        }

        // Escape a string for inclusion in a single-quoted JS string literal
        // inside an HTML attribute (used for onclick handlers taking a URL).
        function jsStr(s) {
          return String(s)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .replace(/</g, '\\u003c')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
        }

        // Skills Scan
        window.scanSkills = async function () {
          var url = $('scanRepoUrl').value.trim();
          if (!url) {
            toast('Please provide valid GitHub URL', 'error');
            return;
          }
          var btn = $('scanBtn');
          btn.disabled = true;
          btn.textContent = 'Scanning...';
          var errDiv = $('scanError');
          errDiv.style.display = 'none';
          var resultDiv = $('scanResult');
          try {
            var result = await api('POST', '/api/v1/skills/scan', { url: url });
            var r = result.result || result;
            var html =
              '<div class="card" style="background:var(--surface-2)"><div style="font-weight:700">' +
              escHtml(r.repo || url) +
              '</div>';
            if (r.error) {
              html += '<div class="error-banner" style="color:var(--red)">' + escHtml(r.error) + '</div>';
            } else {
              html +=
                '<div style="font-size:0.8rem;color:var(--text-2);margin:4px 0 10px">' +
                escHtml(r.description || '') +
                '</div>';
              html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
              if (r.skills) html += '<span class="badge badge-accent">' + r.skills + ' skills</span>';
              if (r.agents) html += '<span class="badge badge-blue">' + r.agents + ' agents</span>';
              if (r.packs) html += '<span class="badge badge-green">' + r.packs + ' packs</span>';
              html += '</div>';
              html +=
                '<button class="btn btn-sm" onclick="importSkills(\'' +
                jsStr(url) +
                '\')" style="margin-top:10px">📥 Import & Activate Pack</button>';
              html += '</div>';
            }
            resultDiv.innerHTML = html;
            addLog('Successfully scanned repository: ' + url, 'success');
          } catch (e) {
            errDiv.textContent = 'Scan failed: ' + e.message;
            errDiv.style.display = 'block';
          }
          btn.disabled = false;
          btn.textContent = 'Scan Repo';
        };

        window.importSkills = async function (url) {
          try {
            var res = await api('POST', '/api/v1/skills/import', { url: url });
            toast('Pack imported and fully activated!', 'success');
            addLog(res.message, 'success');
            refreshKnownSources();
          } catch (e) {
            toast('Import failed: ' + e.message, 'error');
          }
        };

        async function refreshKnownSources() {
          var c = $('knownSources');
          var err = $('knownSourcesError');
          try {
            var data = await api('GET', '/api/v1/skills/sources');
            var sources = data.sources || data || [];
            if (!Array.isArray(sources) || sources.length === 0) {
              c.innerHTML = '<div class="kanban-empty">No external skill packs imported yet.</div>';
              return;
            }
            c.innerHTML = sources
              .map(function (s) {
                return (
                  '<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--surface-2);margin-bottom:8px">' +
                  '<span><strong style="color:#fff">' +
                  escHtml(s.name || s.url || 'Source') +
                  '</strong><br><span style="font-size:.75rem;color:var(--text-3)">' +
                  escHtml(s.path || s.url || '') +
                  '</span></span>' +
                  '<span class="badge badge-accent">' +
                  (s.skills || 0) +
                  ' skills active</span></div>'
                );
              })
              .join('');
            err.style.display = 'none';
          } catch (e) {
            err.textContent = 'Failed to sync sources: ' + e.message;
            err.style.display = 'block';
          }
        }

        // Initialization
        async function init() {
          if (hasToken()) {
            try {
              var me = await api('GET', '/api/v1/auth/me');
              setAuth(authToken, me.user);
              hideAuthOverlay();
              afterAuth();
            } catch (e) {
              setAuth(null, null);
              showAuthOverlay();
            }
          } else {
            showAuthOverlay();
          }
          refreshDashboard();
          refreshProviders();
          connectAgentEvents();
          populateModels();
          setTimeout(refreshKnownSources, 500);
          loadAgentMonitorProjects();
          if (window.location.hash) {
            var targetTab = window.location.hash.replace('#', '');
            if (targetTab && panels[targetTab]) window.switchTab(targetTab);
          }
        }

        async function runSemanticSearch() {
          var query = $('searchQuery').value.trim();
          if (!query) return;
          var resultDiv = $('searchResults');
          resultDiv.innerHTML = '<div style="color:var(--text-2)">Searching...</div>';
          try {
            var resp = await api('POST', '/api/v1/search/semantic', { query: query, target: '.', maxResults: 20 });
            var html = '';
            if (resp.results && resp.results.length > 0) {
              resp.results.forEach(function (r) {
                html +=
                  '<div style="margin-bottom:12px"><div style="font-weight:600;color:var(--accent)">' +
                  escHtml(r.file) +
                  '</div>';
                html +=
                  '<div style="font-size:0.8rem;color:var(--text-2);margin-bottom:6px">Score: ' +
                  r.score +
                  '</div>';
                if (r.snippet)
                  html +=
                    '<pre style="font-size:0.8rem;background:var(--surface-2);padding:8px;border-radius:var(--radius);overflow-x:auto">' +
                    escHtml(r.snippet) +
                    '</pre>';
                html += '</div>';
              });
            } else {
              html = '<div style="color:var(--text-2)">No results found</div>';
            }
            resultDiv.innerHTML = html;
          } catch (e) {
            resultDiv.innerHTML = '<div class="error-banner">' + (e.message || 'Search failed') + '</div>';
          }
        }

        async function runSandbox() {
          var code = $('sandboxCode').value.trim();
          if (!code) return;
          var resultDiv = $('sandboxResult');
          resultDiv.innerHTML = '<div style="color:var(--text-2)">Executing...</div>';
          try {
            var resp = await api('POST', '/api/v1/sandbox/exec', { code: code, fileName: 'exec.mjs' });
            var passed = resp.passed ? '✅ Passed' : '❌ Failed';
            var html =
              '<div style="font-weight:600;margin-bottom:8px">' +
              passed +
              ' (exit: ' +
              resp.exitCode +
              ', ' +
              resp.durationMs +
              'ms)</div>';
            if (resp.stdout) html += '<div><strong>stdout:</strong><pre>' + escHtml(resp.stdout) + '</pre></div>';
            if (resp.stderr)
              html +=
                '<div><strong>stderr:</strong><pre style="color:#f871f1">' + escHtml(resp.stderr) + '</pre></div>';
            resultDiv.innerHTML = html;
          } catch (e) {
            resultDiv.innerHTML = '<div class="error-banner">' + (e.message || 'Execution failed') + '</div>';
          }
        }

        async function runAdversarialReview() {
          var code = $('adversarialCode').value.trim();
          if (!code) return;
          var resultDiv = $('adversarialResult');
          resultDiv.innerHTML = '<div style="color:var(--text-2)">Reviewing... this may take a while</div>';
          try {
            var resp = await api('POST', '/api/v1/adversarial/review', {
              code: code,
              file: 'reviewed.js',
              maxRounds: 1,
            });
            var html = '';
            if (resp.passed) {
              html = '<div style="color:#4ade80">✅ Review passed. No critical or high issues found.</div>';
            } else {
              var issues = resp.feedback?.issues || [];
              var criticalHigh = issues.filter(function (i) {
                return ['critical', 'high'].includes(i.severity);
              });
              html = '<div style="font-weight:600;margin-bottom:8px">❌ Found ' + criticalHigh.length + ' issues</div>';
              criticalHigh.forEach(function (issue) {
                html +=
                  '<div style="margin-bottom:12px"><span style="color:' +
                  (issue.severity === 'critical' ? '#f871f1' : '#fbbf24') +
                  ';font-weight:600">[' +
                  issue.severity.toUpperCase() +
                  ']</span> ' +
                  escHtml(issue.message);
                if (issue.suggestion)
                  html += '<br><span style="color:var(--text-2)">Fix: ' + escHtml(issue.suggestion) + '</span>';
                html += '</div>';
              });
            }
            resultDiv.innerHTML = html;
          } catch (e) {
            resultDiv.innerHTML = '<div class="error-banner">' + (e.message || 'Review failed') + '</div>';
          }
        }

        async function loadLearnedSkills() {
          var skillsDiv = document.getElementById('skillsContainer');
          if (!skillsDiv) return;
          try {
            var resp = await api('GET', '/api/v1/skills/ranked');
            var html = '';
            if (resp.skills && resp.skills.length > 0) {
              resp.skills.slice(0, 20).forEach(function (s) {
                var level = Math.min(5, Math.max(1, Math.round(s.rankingScore)));
                var stars = '★'.repeat(level) + '☆'.repeat(5 - level);
                html +=
                  '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><div><strong>' +
                  escHtml(s.name) +
                  '</strong><span style="color:var(--text-2);font-size:0.8rem"> (' +
                  (s.category || 'general') +
                  ')</span></div><span style="color:#fbbf24">' +
                  stars +
                  '</span></div>';
              });
            } else {
              html =
                '<div style="color:var(--text-2)">No learned skills yet. Run agents to build skills.</div>';
            }
            skillsDiv.innerHTML = html;
          } catch (e) {
            skillsDiv.innerHTML = '<div class="error-banner">Failed to load skills</div>';
          }
        }

        async function synthesizeSkills() {
          var errorDiv = document.getElementById('skillsError');
          var container = document.getElementById('skillsContainer');
          if (!errorDiv || !container) return;

          errorDiv.style.display = 'none';
          container.innerHTML =
            '<div style="color:var(--text-2)">Synthesizing skills from brainstorm, sprint items, and feedback...</div>';

          try {
            // Fetch source data from available APIs
            var sources = {};

            // Get sprint items (brainstorm data lives in sprint items)
            try {
              var sprintResp = await api(
                'GET',
                '/api/v1/planner/items?type=story&status=all&sortBy=createdAt&limit=100',
              );
              if (sprintResp.items && sprintResp.items.length > 0) {
                sources.sprintItems = sprintResp.items;
                sources.brainstorm = sprintResp.items
                  .filter(function (i) {
                    return i.title.includes('brainstorm') || i.description.includes('brainstorm');
                  })
                  .map(function (i) {
                    return { title: i.title, description: i.description };
                  });
              }
            } catch (e) {
              // Sprint items not available, continue with empty sources
            }

            // Get decision trail for feedback-like patterns
            try {
              var trailResp = await api('GET', '/api/v1/trail');
              if (trailResp && trailResp.items) {
                sources.feedback = trailResp.items.map(function (i) {
                  return { title: i.action || i.name, description: i.reasoning || '', type: 'trail' };
                });
              }
            } catch (e) {
              // Trail data not available
            }

            var resp = await api('POST', '/api/v1/skills/synthesize', { sources: sources });
            container.innerHTML = '';
            if (resp.skills && resp.skills.length > 0) {
              resp.skills.slice(0, 20).forEach(function (s) {
                var level = Math.min(5, Math.max(1, Math.round(s.confidence || 0.5)));
                var stars = '★'.repeat(level) + '☆'.repeat(5 - level);
                container.innerHTML +=
                  '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><div><strong>' +
                  escHtml(s.name) +
                  '</strong><span style="color:var(--text-2);font-size:0.8rem"> (' +
                  (s.category || 'general') +
                  ', ' +
                  (s.occurrences || 0) +
                  ' occurrences)</span></div><span style="color:#fbbf24">' +
                  stars +
                  '</span></div>';
              });
              container.innerHTML +=
                '<div style="margin-top:10px;color:var(--text-2)">Synthesized ' +
                resp.total +
                ' skills (' +
                resp.new +
                ' new).</div>';
            } else {
              container.innerHTML =
                '<div style="color:var(--text-2)">No learned patterns to synthesize yet.</div>';
            }
          } catch (e) {
            errorDiv.textContent = 'Failed to synthesize skills: ' + (e.message || 'Unknown error');
            errorDiv.style.display = 'block';
            container.innerHTML = '';
          }
        }

          // Agent Monitor functions
  async function refreshAgentMonitor() {
    const projectSelect = document.getElementById("projectSelect");
    const container = document.getElementById("agentMonitorContainer");
    if (!projectSelect || !container) return;

    const projectRoot = projectSelect.value;
    if (!projectRoot) {
      container.innerHTML = "<div style='color:var(--text-2)'>Select a project to view agents</div>";
      return;
    }

    container.innerHTML = "<div style='color:var(--text-2);text-align:center;padding:20px'>Loading agents...</div>";

    try {
      const resp = await api("GET", "/api/v1/agent-runs?projectRoot=" + encodeURIComponent(projectRoot));
      if (!resp.runs || resp.runs.length === 0) {
        container.innerHTML = "<div style='color:var(--text-2);text-align:center;padding:20px'>No agent runs found for this project</div>";
        return;
      }

      let html = "";
      resp.runs.forEach(function(run) {
        const status = run.status || "unknown";
        const id = run.id || "";
        const dotColor = { running: "#22c55e", completed: "#8b5cf6", failed: "#ef4444" }[status] || "#fbbf24";
        const runningActions = status === "running"
          ? `<button class="btn btn-sm btn-ghost" onclick="cancelAgentRun('${id}')">Cancel</button>
             <button class="btn btn-sm btn-yellow" onclick="approveAgentRun('${id}')">Approve</button>
             <button class="btn btn-sm btn-danger" onclick="rejectAgentRun('${id}')">Reject</button>`
          : "";

        const goal = run.goal ? (run.goal.length > 80 ? run.goal.slice(0, 80) + "..." : run.goal) : "No goal";
        const elapsed = run.startedAt ? Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000) : 0;
        const elapsedStr = elapsed > 60 ? Math.floor(elapsed/60) + "m " + (elapsed%60) + "s" : elapsed + "s";
        const tokens = run.tokensUsed || 0;
        const cost = run.costUsd || 0;

        html += `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;background:var(--surface-2)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${dotColor}"></span>${status.toUpperCase()}</span>
          <span style="font-family:monospace;font-size:0.75rem;color:var(--text-2)">${id.slice(0, 12)}</span>
          </div>
          <div style="font-weight:600;margin-bottom:4px;color:var(--accent)">${escHtml(goal)}</div>
          <div style="font-size:0.8rem;color:var(--text-2);margin-bottom:8px">Provider: ${escHtml(run.provider || 'unknown')} · Model: ${escHtml(run.model || 'unknown')}</div>
          <div style="display:flex;gap:16px;font-size:0.75rem;color:var(--text-2);flex-wrap:wrap">
          <span>⏱ ${elapsedStr}</span>
          <span>🔤 ${tokens.toLocaleString()} tokens</span>
          <span>💰 $${cost.toFixed(4)}</span>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" onclick="openAgentRun('${id}')">Open Details</button>
          ${runningActions}
          </div>
          </div>`;
      });
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div class="error-banner">Failed to load agents: ${escHtml(e.message || 'Unknown error')}</div>`;
    }
  }

  async function exportAgentMonitor() {
    const projectSelect = document.getElementById("projectSelect");
    if (!projectSelect) return;

    const projectRoot = projectSelect.value;
    if (!projectRoot) {
      alert("Select a project first");
      return;
    }

    try {
      const resp = await api("GET", "/api/v1/agent-runs?projectRoot=" + encodeURIComponent(projectRoot) + "&limit=1000");
      const data = {
        projectRoot,
        exportedAt: new Date().toISOString(),
        runs: resp.runs || []
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "agent-monitor-" + projectRoot.split("/").pop() + "-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + (e.message || "Unknown error"));
    }
  }

  async function openAgentRun(runId) {
    window.location.href = "/workspace.html?run=" + encodeURIComponent(runId);
  }

  async function cancelAgentRun(runId) {
    if (!confirm("Cancel this agent run?")) return;
    try {
      await api("POST", "/api/v1/agent-runs/" + runId + "/cancel");
      refreshAgentMonitor();
    } catch (e) {
      alert("Cancel failed: " + (e.message || "Unknown error"));
    }
  }

  async function approveAgentRun(runId) {
    try {
      await api("POST", "/api/v1/agent-runs/" + runId + "/approve");
      refreshAgentMonitor();
    } catch (e) {
      alert("Approve failed: " + (e.message || "Unknown error"));
    }
  }

  async function rejectAgentRun(runId) {
    if (!confirm("Reject this agent run? This will cancel the run and flag it for review.")) return;
    try {
      await api("POST", "/api/v1/agent-runs/" + runId + "/reject");
      refreshAgentMonitor();
    } catch (e) {
      alert("Reject failed: " + (e.message || "Unknown error"));
    }
  }

  // Populate project select with available projects
  async function loadAgentMonitorProjects() {
    const projectSelect = document.getElementById("projectSelect");
    if (!projectSelect) return;

    try {
      const resp = await api("GET", "/api/v1/projects");
      if (resp.projects && resp.projects.length > 0) {
        let html = "<option value=''>Select project...</option>";
        resp.projects.forEach(function(p) {
          html += "<option value='" + escHtml(p.rootPath) + "'>" + escHtml(p.name) + " (" + escHtml(p.rootPath) + ")</option>";
        });
        projectSelect.innerHTML = html;

        // Auto-load first project
        if (resp.projects[0]) {
          projectSelect.value = resp.projects[0].rootPath;
          refreshAgentMonitor();
        }
      } else {
        projectSelect.innerHTML = "<option value=''>No projects found</option>";
      }
    } catch (e) {
      projectSelect.innerHTML = "<option value=''>Error loading projects</option>";
    }
  }

  // Expose functions on window for inline event handlers
  window.refreshAgentMonitor = refreshAgentMonitor;
  window.exportAgentMonitor = exportAgentMonitor;
  window.openAgentRun = openAgentRun;
  window.cancelAgentRun = cancelAgentRun;
  window.approveAgentRun = approveAgentRun;
  window.rejectAgentRun = rejectAgentRun;
  window.loadAgentMonitorProjects = loadAgentMonitorProjects;

  init();
      })();
