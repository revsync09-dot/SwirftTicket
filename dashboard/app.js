const API_BASE = '';

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

function hydrateSettings(settings) {
  const parentCategoryId = document.querySelector('#parentCategoryId');
  const staffRoleId = document.querySelector('#staffRoleId');
  const timezone = document.querySelector('#timezone');
  const categorySlots = document.querySelector('#categorySlots');
  const warnThreshold = document.querySelector('#warnThreshold');
  const warnTimeout = document.querySelector('#warnTimeout');
  const toggleSmart = document.querySelector('#toggleSmart');
  const toggleAi = document.querySelector('#toggleAi');
  const togglePriority = document.querySelector('#togglePriority');

  if (parentCategoryId) parentCategoryId.value = settings.ticket_parent_channel_id ?? '';
  if (staffRoleId) staffRoleId.value = settings.staff_role_id ?? '';
  if (timezone) timezone.value = settings.timezone ?? 'UTC';
  if (categorySlots) categorySlots.value = settings.category_slots ?? 1;
  if (warnThreshold) warnThreshold.value = settings.warn_threshold ?? 3;
  if (warnTimeout) warnTimeout.value = settings.warn_timeout_minutes ?? 10;
  if (toggleSmart) toggleSmart.checked = Boolean(settings.enable_smart_replies ?? true);
  if (toggleAi) toggleAi.checked = Boolean(settings.enable_ai_suggestions ?? true);
  if (togglePriority) togglePriority.checked = Boolean(settings.enable_auto_priority ?? true);
}

async function loadDashboard() {
  try {
    const data = await apiGet('/api/dashboard-data');
    const botTag = document.querySelector('#botTag');
    const statServers = document.querySelector('#statServers');
    const statLatency = document.querySelector('#statLatency');
    const statUptime = document.querySelector('#statUptime');
    const selectedGuild = document.querySelector('#selectedGuild');
    const categoryList = document.querySelector('#categoryList');
    const serverGrid = document.querySelector('#serverGrid');

    if (botTag) botTag.textContent = data.botTag ?? 'SwiftTickets';
    if (statServers) statServers.textContent = String(data.guilds?.length ?? 0);
    if (statLatency) statLatency.textContent = `${data.latencyMs ?? 0}ms`;
    if (statUptime) statUptime.textContent = data.uptime ?? 'online';
    if (selectedGuild) selectedGuild.textContent = data.selectedGuild ?? 'Select server';

    if (categoryList) {
      categoryList.innerHTML = '';
      (data.categories ?? []).forEach((c) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.textContent = c.name;
        categoryList.appendChild(chip);
      });
    }

    if (serverGrid) {
      serverGrid.innerHTML = '';
      (data.guilds ?? []).forEach((g) => {
        const installed = g.status === 'installed';
        const row = document.createElement('div');
        row.className = `server-row ${installed ? 'installed' : 'invite'}`;
        row.innerHTML = `
          <div class="server-meta">
            <div class="server-icon ${g.iconURL ? '' : 'mute'}">${g.name?.[0] ?? 'S'}</div>
            <div>
              <h4>${g.name}</h4>
              <span class="muted">${installed ? 'Installed' : 'Invite required'}</span>
            </div>
          </div>
          <div class="server-action">
            ${installed ? `<a class="server-btn" href="/select/${g.id}">Manage</a>` : `<a class="server-btn" href="/invite/${g.id}">Invite</a>`}
          </div>
        `;
        serverGrid.appendChild(row);
      });
    }

    if (data.settings) hydrateSettings(data.settings);
  } catch (_) {}
}

async function saveSettings() {
  const selectedGuild = document.querySelector('#selectedGuild')?.textContent;
  if (!selectedGuild || selectedGuild === 'Select server') return;
  const payload = {
    guild_id: selectedGuild,
    ticket_parent_channel_id: document.querySelector('#parentCategoryId')?.value,
    staff_role_id: document.querySelector('#staffRoleId')?.value,
    timezone: document.querySelector('#timezone')?.value,
    category_slots: document.querySelector('#categorySlots')?.value,
    warn_threshold: document.querySelector('#warnThreshold')?.value,
    warn_timeout_minutes: document.querySelector('#warnTimeout')?.value,
    enable_smart_replies: document.querySelector('#toggleSmart')?.checked,
    enable_ai_suggestions: document.querySelector('#toggleAi')?.checked,
    enable_auto_priority: document.querySelector('#togglePriority')?.checked,
  };
  await apiPost('/api/settings', payload);
}

async function addCategory() {
  const selectedGuild = document.querySelector('#selectedGuild')?.textContent;
  const name = document.querySelector('#newCategoryName')?.value;
  const description = document.querySelector('#newCategoryDescription')?.value;
  if (!selectedGuild || selectedGuild === 'Select server' || !name) return;
  await apiPost('/api/categories', { guild_id: selectedGuild, name, description });
  await loadDashboard();
}

async function postPanel(kind) {
  const selectedGuild = document.querySelector('#selectedGuild')?.textContent;
  const channelId = document.querySelector('#panelChannelId')?.value;
  if (!selectedGuild || selectedGuild === 'Select server' || !channelId) return;
  if (kind === 'settings') {
    await apiPost('/api/post-panel', { guild_id: selectedGuild, channel_id: channelId });
  } else {
    await apiPost('/api/post-panelset', { guild_id: selectedGuild, channel_id: channelId });
  }
}

loadDashboard();

document.querySelector('#saveSettingsBtn')?.addEventListener('click', () => saveSettings());
document.querySelector('#addCategoryBtn')?.addEventListener('click', () => addCategory());
document.querySelector('#postPanelToChannelBtn')?.addEventListener('click', () => postPanel('settings'));
document.querySelector('#postPanelsetToChannelBtn')?.addEventListener('click', () => postPanel('public'));
