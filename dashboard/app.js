const actions = {
  startAuth() {
    document.querySelector('#auth')?.scrollIntoView({ behavior: 'smooth' });
  },
  scrollSettings() {
    document.querySelector('#dashboard')?.scrollIntoView({ behavior: 'smooth' });
  },
  inviteBot() {
    alert('Invite flow will be handled by your backend.');
  },
  addCategory() {
    const list = document.querySelector('#categoryList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <input class="input-emoji" type="text" value="*" />
      <input class="input-name" type="text" value="New Category" />
      <button class="color-dot" style="background:#7c5cff"></button>
      <button class="icon-btn" data-action="remove-category">x</button>
    `;
    list.appendChild(row);
  },
  removeCategory(target) {
    const row = target.closest('.category-row');
    if (row) row.remove();
  },
  reset() {
    document.querySelector('#toast')?.classList.add('hidden');
    alert('Reset is a UI-only demo.');
  },
  save() {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 1500);
  },
};

async function loadDashboard() {
  try {
    const res = await fetch('http://localhost:8080/dashboard-data');
    if (!res.ok) return;
    const data = await res.json();
    const botTag = document.querySelector('#botTag');
    const statServers = document.querySelector('#statServers');
    const statLatency = document.querySelector('#statLatency');
    const statUptime = document.querySelector('#statUptime');
    const selectedGuild = document.querySelector('#selectedGuild');
    const staffRole = document.querySelector('#staffRole');
    const staffCount = document.querySelector('#staffCount');
    const statOpen = document.querySelector('#statOpen');
    const statClosed = document.querySelector('#statClosed');
    const inviteBtn = document.querySelector('#inviteBtn');
    const categoryList = document.querySelector('#categoryList');
    const serverGrid = document.querySelector('#serverGrid');

    if (botTag) botTag.textContent = data.botTag ?? 'SwiftTickets';
    if (statServers) statServers.textContent = String(data.guilds?.length ?? 0);
    if (statLatency) statLatency.textContent = `${data.latencyMs ?? 0}ms`;
    if (statUptime) statUptime.textContent = data.uptime ?? '0h';
    if (selectedGuild) selectedGuild.textContent = data.selectedGuild ?? 'None';
    if (staffRole) staffRole.textContent = data.staffRoleId ?? 'Not set';
    if (staffCount) staffCount.textContent = String(data.staffCount ?? 0);
    if (statOpen) statOpen.textContent = String(data.stats?.open ?? 0);
    if (statClosed) statClosed.textContent = String(data.stats?.closed ?? 0);
    if (inviteBtn && data.inviteUrl) inviteBtn.href = data.inviteUrl;

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
        const card = document.createElement('article');
        card.className = `server-card ${g.id === data.selectedGuild ? 'active' : ''}`;
        card.innerHTML = `
          <div class="server-icon ${g.iconURL ? '' : 'mute'}">${g.name?.[0] ?? 'S'}</div>
          <div class="server-info">
            <h3>${g.name}</h3>
            <p>Bot installed - ${g.memberCount ?? 0} members</p>
            <div class="card-actions">
              <button class="chip-btn" data-guild="${g.id}">Manage</button>
              <a class="chip-btn ghost" href="setup.html">Open setup</a>
            </div>
          </div>
        `;
        card.querySelector('button')?.addEventListener('click', () => {
          loadDashboardForGuild(g.id);
        });
        serverGrid.appendChild(card);
      });
    }
  } catch (_) {}
}

async function loadDashboardForGuild(guildId) {
  try {
    const res = await fetch(`http://localhost:8080/dashboard-data?guild_id=${guildId}`);
    if (!res.ok) return;
    const data = await res.json();
    const selectedGuild = document.querySelector('#selectedGuild');
    const staffRole = document.querySelector('#staffRole');
    const staffCount = document.querySelector('#staffCount');
    const statOpen = document.querySelector('#statOpen');
    const statClosed = document.querySelector('#statClosed');
    const categoryList = document.querySelector('#categoryList');
    if (selectedGuild) selectedGuild.textContent = data.selectedGuild ?? 'None';
    if (staffRole) staffRole.textContent = data.staffRoleId ?? 'Not set';
    if (staffCount) staffCount.textContent = String(data.staffCount ?? 0);
    if (statOpen) statOpen.textContent = String(data.stats?.open ?? 0);
    if (statClosed) statClosed.textContent = String(data.stats?.closed ?? 0);
    if (categoryList) {
      categoryList.innerHTML = '';
      (data.categories ?? []).forEach((c) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.textContent = c.name;
        categoryList.appendChild(chip);
      });
    }
  } catch (_) {}
}

loadDashboard();

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute('data-action');
  if (!action) return;
  if (action === 'start-auth') return actions.startAuth();
  if (action === 'scroll-settings') return actions.scrollSettings();
  if (action === 'invite-bot') return actions.inviteBot();
  if (action === 'add-category') return actions.addCategory();
  if (action === 'remove-category') return actions.removeCategory(target);
  if (action === 'reset') return actions.reset();
  if (action === 'save') return actions.save();
});

document.querySelector('#reloadBtn')?.addEventListener('click', () => loadDashboard());
