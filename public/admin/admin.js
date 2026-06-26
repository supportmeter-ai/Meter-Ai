// Meter AI Admin Dashboard Controller
document.addEventListener('DOMContentLoaded', () => {
  // Navigation & State
  let currentPane = 'overview';
  let autoRefreshInterval = null;
  const refreshRateMs = 30000; // 30 seconds
  let cachedTasks = [];
  
  let feedbackCurrentPage = 1;
  const feedbackPageSize = 5;

  let allOverviewEvents = [];
  let overviewEventsCurrentPage = 1;
  const overviewEventsPageSize = 5;

  let allOverviewTickets = [];
  let overviewTicketsCurrentPage = 1;
  const overviewTicketsPageSize = 5;

  let usersCurrentPage = 1;
  const usersPageSize = 10;

  let eventsCurrentPage = 1;
  const eventsPageSize = 20;

  let supportCurrentPage = 1;
  const supportPageSize = 5;

  // Initialize
  checkSession().then(authenticated => {
    if (authenticated) {
      initApp();
    }
  });

  // ─── SESSION VERIFICATION ───────────────────────────────────────────
  async function checkSession() {
    try {
      const res = await fetch('/api/admin/me');
      if (res.status === 401) {
        window.location.href = '/admin/login';
        return false;
      }
      const data = await res.json();
      if (data && data.email) {
        document.getElementById('adminEmailDisplay').innerText = data.email;
        return true;
      }
      window.location.href = '/admin/login';
      return false;
    } catch (err) {
      console.error('Session check failed:', err);
      window.location.href = '/admin/login';
      return false;
    }
  }

  // ─── APP INITIALIZATION ─────────────────────────────────────────────
  function initApp() {
    // 1. Setup Navigation Links
    window.addEventListener('hashchange', handleRouting);
    handleRouting(); // trigger on initial load


    // 3. Setup Button Event Listeners
    document.getElementById('manualRefreshBtn').addEventListener('click', () => {
      fetchPaneData(currentPane, true);
    });
    
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Manual Activation Modal Setup
    const activateModal = document.getElementById('activateModalOverlay');
    document.getElementById('openActivateModalBtn').addEventListener('click', () => {
      activateModal.style.display = 'flex';
    });
    document.getElementById('closeActivateModalBtn').addEventListener('click', () => {
      activateModal.style.display = 'none';
    });
    document.getElementById('cancelActivateBtn').addEventListener('click', () => {
      activateModal.style.display = 'none';
    });
    document.getElementById('activateUserForm').addEventListener('submit', handleManualActivation);

    // Support Reply Modal Setup
    const replyModal = document.getElementById('replyModalOverlay');
    document.getElementById('closeReplyModalBtn').addEventListener('click', () => {
      replyModal.style.display = 'none';
    });
    document.getElementById('cancelReplyBtn').addEventListener('click', () => {
      replyModal.style.display = 'none';
    });
    document.getElementById('replyTicketForm').addEventListener('submit', handleSendReply);

    // Search and Filters
    document.getElementById('userSearchInput').addEventListener('input', debounce(filterUsers, 300));
    document.getElementById('userPlanFilter').addEventListener('change', filterUsers);
    document.getElementById('userStatusFilter').addEventListener('change', filterUsers);
    document.getElementById('ticketStatusFilter').addEventListener('change', () => {
      supportCurrentPage = 1;
      fetchSupportData();
    });

    // Feedback Pagination Event Listeners
    document.getElementById('btn-feedback-prev').addEventListener('click', () => {
      if (feedbackCurrentPage > 1) {
        feedbackCurrentPage--;
        fetchFeedbackData();
      }
    });
    document.getElementById('btn-feedback-next').addEventListener('click', () => {
      const maxPages = Math.ceil(feedbackTotalCount / feedbackPageSize);
      if (feedbackCurrentPage < maxPages) {
        feedbackCurrentPage++;
        fetchFeedbackData();
      }
    });

    // Users Pagination Event Listeners
    document.getElementById('btn-users-prev').addEventListener('click', () => {
      if (usersCurrentPage > 1) {
        usersCurrentPage--;
        fetchUsersData();
      }
    });
    document.getElementById('btn-users-next').addEventListener('click', () => {
      const maxPages = Math.ceil(usersTotalCount / usersPageSize);
      if (usersCurrentPage < maxPages) {
        usersCurrentPage++;
        fetchUsersData();
      }
    });

    // Webhook Events Pagination Event Listeners
    document.getElementById('btn-events-prev').addEventListener('click', () => {
      if (eventsCurrentPage > 1) {
        eventsCurrentPage--;
        fetchEventsData();
      }
    });
    document.getElementById('btn-events-next').addEventListener('click', () => {
      const maxPages = Math.ceil(eventsTotalCount / eventsPageSize);
      if (eventsCurrentPage < maxPages) {
        eventsCurrentPage++;
        fetchEventsData();
      }
    });

    // Support Tickets Pagination Event Listeners
    document.getElementById('btn-support-prev').addEventListener('click', () => {
      if (supportCurrentPage > 1) {
        supportCurrentPage--;
        fetchSupportData();
      }
    });
    document.getElementById('btn-support-next').addEventListener('click', () => {
      const maxPages = Math.ceil(supportTotalCount / supportPageSize);
      if (supportCurrentPage < maxPages) {
        supportCurrentPage++;
        fetchSupportData();
      }
    });

    // Overview Events Pagination Event Listeners
    document.getElementById('btn-overview-events-prev').addEventListener('click', () => {
      if (overviewEventsCurrentPage > 1) {
        overviewEventsCurrentPage--;
        renderOverviewEventsPage(overviewEventsCurrentPage);
      }
    });
    document.getElementById('btn-overview-events-next').addEventListener('click', () => {
      const maxPages = Math.ceil(allOverviewEvents.length / overviewEventsPageSize);
      if (overviewEventsCurrentPage < maxPages) {
        overviewEventsCurrentPage++;
        renderOverviewEventsPage(overviewEventsCurrentPage);
      }
    });

    // Overview Tickets Pagination Event Listeners
    document.getElementById('btn-overview-tickets-prev').addEventListener('click', () => {
      if (overviewTicketsCurrentPage > 1) {
        overviewTicketsCurrentPage--;
        renderOverviewTicketsPage(overviewTicketsCurrentPage);
      }
    });
    document.getElementById('btn-overview-tickets-next').addEventListener('click', () => {
      const maxPages = Math.ceil(allOverviewTickets.length / overviewTicketsPageSize);
      if (overviewTicketsCurrentPage < maxPages) {
        overviewTicketsCurrentPage++;
        renderOverviewTicketsPage(overviewTicketsCurrentPage);
      }
    });

    // Scratchpad & Todo List
    const notepad = document.getElementById('founderNotepad');
    if (notepad) {
      notepad.addEventListener('input', debounceAutosaveNotes);
    }
    // Initialize Kanban Board Workspace
    initKanbanBoard();

    // Quick Actions
    document.getElementById('btnSyncWebhooks').addEventListener('click', triggerWebhookSync);

    // Setup column visibility for user profile table
    setupColumnVisibilityDropdown();

    // Setup sidebar collapse behavior
    setupSidebarCollapse();

    // 4. Start Auto Refresh Timer
    startAutoRefresh();
  }

  // ─── ROUTING & VIEW CONTROLS ───────────────────────────────────────
  function handleRouting() {
    const hash = window.location.hash.substring(1) || 'overview';
    currentPane = hash;

    // Update active class in sidebar links
    document.querySelectorAll('.menu-link').forEach(link => {
      link.classList.remove('active');
    });
    const activeLink = document.getElementById(`link-${hash}`);
    if (activeLink) activeLink.classList.add('active');

    // Update Page Header Title
    const headers = {
      overview: 'Overview Dashboard',
      users: 'User Profiles Database',
      revenue: 'Revenue & Payments Control',
      events: 'Activity & Webhook Logs',
      feedback: 'Feedback & Support Queue',
      health: 'System Infrastructure Health',
      notes: 'Founder Notes & Tasks',
      settings: 'Settings & Security Panel'
    };
    document.getElementById('pageTitle').innerText = headers[hash] || 'Admin';

    // Show/Hide section panes
    document.querySelectorAll('.section-pane').forEach(pane => {
      pane.classList.remove('active');
    });
    const targetPane = document.getElementById(`pane-${hash}`);
    if (targetPane) targetPane.classList.add('active');

    // Toggle scrollbar in content-area
    const contentArea = document.querySelector('.content-area');
    if (contentArea) {
      if (hash === 'notes') {
        contentArea.style.overflowY = 'hidden';
      } else {
        contentArea.style.overflowY = 'auto';
      }
    }

    // Fetch and populate data for the active view
    fetchPaneData(hash);
  }

  // ─── DATA FETCHING ROUTER ──────────────────────────────────────────
  function fetchPaneData(pane, isManual = false) {
    if (isManual) {
      showToast('Refreshing data...');
    }

    switch (pane) {
      case 'overview':
        fetchOverviewData();
        break;
      case 'users':
        fetchUsersData();
        break;
      case 'revenue':
        fetchRevenueData();
        break;
      case 'events':
        fetchEventsData();
        break;
      case 'feedback':
        fetchFeedbackAndSupportData();
        break;
      case 'health':
        fetchHealthData();
        break;
      case 'notes':
        fetchNotesAndTasksData();
        break;
      case 'settings':
        fetchSettingsData();
        break;
    }
  }

  // ─── PANE 1: OVERVIEW CONTROLLER ────────────────────────────────────
  async function fetchOverviewData() {
    try {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error('Failed to fetch overview metrics');
      const data = await res.json();

      // Render Stats
      const grid = document.getElementById('overview-stats-grid');
      grid.innerHTML = `
        <div class="stat-card">
          <span class="stat-label">Total MRR</span>
          <div class="stat-value-container">
            <span class="stat-value">₹${(data.mrr || 0).toLocaleString()}</span>
          </div>
          <span class="stat-subtext">Estimated based on active subscriptions</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Total Users</span>
          <div class="stat-value-container">
            <span class="stat-value">${data.totalUsers || 0}</span>
          </div>
          <span class="stat-subtext">All time accounts signed up</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Active Pro Plans</span>
          <div class="stat-value-container">
            <span class="stat-value">${data.proUsers || 0}</span>
          </div>
          <span class="stat-subtext">${data.lifetimeUsers || 0} lifetime / ${data.monthlyProUsers || 0} monthly</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Webhook Status</span>
          <div class="stat-value-container">
            <span class="stat-value" style="color: var(--success);">${data.webhookSuccessCount || 0}</span>
          </div>
          <span class="stat-subtext">${data.webhookErrorCount || 0} failed / logs recorded</span>
        </div>
      `;

      // Populate globals and render via pagination
      allOverviewEvents = data.recentEvents || [];
      overviewEventsCurrentPage = 1;
      renderOverviewEventsPage(1);

      allOverviewTickets = data.pendingTickets || [];
      overviewTicketsCurrentPage = 1;
      renderOverviewTicketsPage(1);

    } catch (err) {
      console.error(err);
      showToast('Error loading overview data', true);
    }
  }

  function renderOverviewEventsPage(page) {
    const tbody = document.getElementById('overview-events-table');
    const mobileList = document.getElementById('overview-events-mobile-list');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';

    const paginationContainer = document.getElementById('overview-events-pagination');
    const paginationInfo = document.getElementById('overview-events-pagination-info');
    const btnPrev = document.getElementById('btn-overview-events-prev');
    const btnNext = document.getElementById('btn-overview-events-next');

    if (allOverviewEvents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No webhook events recorded.</td></tr>`;
      if (mobileList) mobileList.innerHTML = `<div style="text-align: center; color: var(--text-muted);">No webhook events recorded.</div>`;
      if (paginationContainer) paginationContainer.style.display = 'none';
      return;
    }

    if (paginationContainer) paginationContainer.style.display = 'flex';

    const maxPages = Math.ceil(allOverviewEvents.length / overviewEventsPageSize);
    if (page > maxPages) {
      overviewEventsCurrentPage = Math.max(1, maxPages);
      page = overviewEventsCurrentPage;
    }

    const startIdx = (page - 1) * overviewEventsPageSize;
    const endIdx = Math.min(startIdx + overviewEventsPageSize, allOverviewEvents.length);
    const pageData = allOverviewEvents.slice(startIdx, endIdx);

    if (btnPrev) btnPrev.disabled = (page === 1);
    if (btnNext) btnNext.disabled = (page === maxPages);
    if (paginationInfo) paginationInfo.innerText = `Showing ${startIdx + 1}-${endIdx} of ${allOverviewEvents.length}`;

    pageData.forEach(e => {
      tbody.appendChild(createEventRow(e));
      if (mobileList) mobileList.appendChild(createEventCard(e));
    });
  }

  function renderOverviewTicketsPage(page) {
    const ticketsList = document.getElementById('overview-tickets-list');
    if (!ticketsList) return;
    ticketsList.innerHTML = '';

    const paginationContainer = document.getElementById('overview-tickets-pagination');
    const paginationInfo = document.getElementById('overview-tickets-pagination-info');
    const btnPrev = document.getElementById('btn-overview-tickets-prev');
    const btnNext = document.getElementById('btn-overview-tickets-next');

    if (allOverviewTickets.length === 0) {
      ticketsList.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 8px;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <span>All customer tickets resolved!</span></div>`;
      if (paginationContainer) paginationContainer.style.display = 'none';
      return;
    }

    if (paginationContainer) paginationContainer.style.display = 'flex';

    const maxPages = Math.ceil(allOverviewTickets.length / overviewTicketsPageSize);
    if (page > maxPages) {
      overviewTicketsCurrentPage = Math.max(1, maxPages);
      page = overviewTicketsCurrentPage;
    }

    const startIdx = (page - 1) * overviewTicketsPageSize;
    const endIdx = Math.min(startIdx + overviewTicketsPageSize, allOverviewTickets.length);
    const pageData = allOverviewTickets.slice(startIdx, endIdx);

    if (btnPrev) btnPrev.disabled = (page === 1);
    if (btnNext) btnNext.disabled = (page === maxPages);
    if (paginationInfo) paginationInfo.innerText = `Showing ${startIdx + 1}-${endIdx} of ${allOverviewTickets.length}`;

    pageData.forEach(t => {
      const item = document.createElement('div');
      item.className = 'ticket-item';
      item.style.padding = '12px';
      item.innerHTML = `
        <div class="ticket-header" style="margin-bottom: 4px;">
          <span class="ticket-user" style="font-size: 13px;">${escapeHtml(t.user_name || 'Anonymous')}</span>
          <span class="badge ${t.status}">${t.status}</span>
        </div>
        <div class="ticket-subject" style="font-size: 13px; font-weight: 500; margin-bottom: 4px;">${escapeHtml(t.subject)}</div>
        <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
          <span>${escapeHtml(t.user_email)}</span>
          <span>${formatDate(t.created_at)}</span>
        </div>
      `;
      ticketsList.appendChild(item);
    });
  }

  // ─── PANE 2: USER DATABASE CONTROLLER ───────────────────────────────
  let usersTotalCount = 0;

  async function fetchUsersData() {
    try {
      const searchVal = document.getElementById('userSearchInput').value;
      const planVal = document.getElementById('userPlanFilter').value;
      const statusVal = document.getElementById('userStatusFilter').value;
      
      const params = new URLSearchParams({
        page: usersCurrentPage,
        limit: usersPageSize,
        search: searchVal,
        plan: planVal,
        status: statusVal
      });

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch user database');
      const data = await res.json();
      
      const users = data.users || [];
      usersTotalCount = data.count || 0;
      
      renderUsersTable(users);
      renderUsersPagination();
    } catch (err) {
      console.error(err);
      showToast('Error loading user directory', true);
    }
  }

  function filterUsers() {
    usersCurrentPage = 1;
    fetchUsersData();
  }

  function renderUsersPagination() {
    const paginationContainer = document.getElementById('users-pagination');
    const paginationInfo = document.getElementById('users-pagination-info');
    const btnPrev = document.getElementById('btn-users-prev');
    const btnNext = document.getElementById('btn-users-next');

    if (!paginationContainer) return;

    if (usersTotalCount === 0) {
      paginationContainer.style.display = 'none';
      return;
    }

    paginationContainer.style.display = 'flex';
    const maxPages = Math.ceil(usersTotalCount / usersPageSize);
    
    if (btnPrev) btnPrev.disabled = (usersCurrentPage === 1);
    if (btnNext) btnNext.disabled = (usersCurrentPage === maxPages);

    const startIdx = (usersCurrentPage - 1) * usersPageSize + 1;
    const endIdx = Math.min(usersCurrentPage * usersPageSize, usersTotalCount);
    if (paginationInfo) {
      paginationInfo.innerText = `Showing ${startIdx}-${endIdx} of ${usersTotalCount}`;
    }
  }

  function renderUsersTable(users) {
    const tbody = document.getElementById('user-database-table');
    const mobileList = document.getElementById('users-mobile-list');
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No users match current filters.</td></tr>`;
      if (mobileList) mobileList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">No users match current filters.</div>`;
      return;
    }

    users.forEach(u => {
      const tr = document.createElement('tr');
      
      // Determine Action Button
      let actionBtn = '';
      if (u.plan === 'free') {
        actionBtn = `<button class="btn-action-sm activate-user-btn" data-email="${u.email}" style="color: var(--success); border-color: rgba(48,209,88,0.2);">Activate Pro</button>`;
      } else {
        actionBtn = `<button class="btn-action-sm downgrade-user-btn danger" data-email="${u.email}">Downgrade</button>`;
      }

      tr.innerHTML = `
        <td style="font-weight: 500;">
          <div>${escapeHtml(u.full_name || 'Unnamed')}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(u.email)}</div>
        </td>
        <td><span class="badge ${u.plan}">${u.plan}</span></td>
        <td><span class="badge ${u.subscription_status}">${u.subscription_status}</span></td>
        <td style="font-size: 12px; font-family: monospace;">${escapeHtml(u.razorpay_customer_id || '—')}</td>
        <td style="font-size: 12px; font-family: monospace;">${escapeHtml(u.razorpay_subscription_id || '—')}</td>
        <td style="font-size: 12px;">${u.subscription_end ? formatDate(u.subscription_end) : '—'}</td>
        <td style="font-size: 12px; color: var(--text-muted);">${formatDate(u.created_at)}</td>
        <td>${actionBtn}</td>
      `;
      tbody.appendChild(tr);

      // Render Mobile Card
      if (mobileList) {
        const card = document.createElement('div');
        card.className = 'mobile-card';
        card.innerHTML = `
          <div class="card-header-row">
            <div class="user-details">
              <div class="user-name">${escapeHtml(u.full_name || 'Unnamed')}</div>
              <div class="user-email">${escapeHtml(u.email)}</div>
            </div>
            <div class="user-badges">
              <span class="badge ${u.plan}">${u.plan}</span>
              <span class="badge ${u.subscription_status}">${u.subscription_status}</span>
            </div>
          </div>
          <div class="card-details-row">
            <div class="detail-item">
              <span class="detail-label">Customer ID</span>
              <span class="detail-value font-mono">${escapeHtml(u.razorpay_customer_id || '—')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Subscription ID</span>
              <span class="detail-value font-mono">${escapeHtml(u.razorpay_subscription_id || '—')}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Expires On</span>
              <span class="detail-value">${u.subscription_end ? formatDate(u.subscription_end) : '—'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Signed Up</span>
              <span class="detail-value">${formatDate(u.created_at)}</span>
            </div>
          </div>
          <div class="card-actions-row">
            ${actionBtn}
          </div>
        `;
        mobileList.appendChild(card);
      }
    });

    // Wire up events
    document.querySelectorAll('.activate-user-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.getElementById('activateEmail').value = e.currentTarget.dataset.email;
        document.getElementById('activateModalOverlay').style.display = 'flex';
      });
    });

    document.querySelectorAll('.downgrade-user-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const email = e.currentTarget.dataset.email;
        const confirmed = await showConfirm(
          "Downgrade User Profile",
          `Are you absolutely sure you want to manually downgrade ${email} to the free tier immediately?`
        );
        if (confirmed) {
          await handleDowngrade(email);
        }
      });
    });

    updateColumnVisibility();
  }

  // ─── PANE 3: WEBHOOK LOGS CONTROLLER ───────────────────────────────
  let eventsTotalCount = 0;

  async function fetchEventsData() {
    try {
      const res = await fetch(`/api/admin/events?page=${eventsCurrentPage}&limit=${eventsPageSize}`);
      if (!res.ok) throw new Error('Failed to fetch webhook events');
      const data = await res.json();
      
      const events = data.events || [];
      eventsTotalCount = data.count || 0;

      const tbody = document.getElementById('full-events-table');
      const mobileList = document.getElementById('full-events-mobile-list');
      tbody.innerHTML = '';
      if (mobileList) mobileList.innerHTML = '';

      if (events.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No webhook event logs recorded.</td></tr>`;
        if (mobileList) mobileList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">No webhook event logs recorded.</div>`;
        renderEventsPagination();
        return;
      }

      events.forEach(e => {
        tbody.appendChild(createEventRow(e, true));
        if (mobileList) mobileList.appendChild(createEventCard(e));
      });

      renderEventsPagination();
    } catch (err) {
      console.error(err);
      showToast('Error loading webhook audit log', true);
    }
  }

  function renderEventsPagination() {
    const paginationContainer = document.getElementById('events-pagination');
    const paginationInfo = document.getElementById('events-pagination-info');
    const btnPrev = document.getElementById('btn-events-prev');
    const btnNext = document.getElementById('btn-events-next');

    if (!paginationContainer) return;

    if (eventsTotalCount === 0) {
      paginationContainer.style.display = 'none';
      return;
    }

    paginationContainer.style.display = 'flex';
    const maxPages = Math.ceil(eventsTotalCount / eventsPageSize);
    
    if (btnPrev) btnPrev.disabled = (eventsCurrentPage === 1);
    if (btnNext) btnNext.disabled = (eventsCurrentPage === maxPages);

    const startIdx = (eventsCurrentPage - 1) * eventsPageSize + 1;
    const endIdx = Math.min(eventsCurrentPage * eventsPageSize, eventsTotalCount);
    if (paginationInfo) {
      paginationInfo.innerText = `Showing ${startIdx}-${endIdx} of ${eventsTotalCount}`;
    }
  }

  function createEventRow(e, includeUserLink = false) {
    const tr = document.createElement('tr');
    
    // Status color
    let eventStyle = 'color: var(--text-main); font-weight: 500;';
    if (e.event.includes('failed') || e.event.includes('cancelled') || e.event.includes('expired')) {
      eventStyle = 'color: var(--danger); font-weight: 500;';
    } else if (e.event.includes('success') || e.event.includes('active') || e.event.includes('charged')) {
      eventStyle = 'color: var(--success); font-weight: 500;';
    }

    let userCol = '';
    if (includeUserLink) {
      userCol = `
        <td>
          <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">ID: ${escapeHtml(e.user_id || 'N/A')}</div>
          ${e.profiles ? `<div style="font-size: 13px; margin-top: 2px;">${escapeHtml(e.profiles.email)}</div>` : ''}
        </td>
      `;
    }

    tr.innerHTML = `
      <td><span style="${eventStyle}">${escapeHtml(e.event)}</span></td>
      <td style="font-size: 12px; font-family: monospace;">${escapeHtml(e.payment_id || '—')}</td>
      <td style="font-size: 12px; font-family: monospace;">${escapeHtml(e.subscription_id || '—')}</td>
      ${userCol}
      <td style="font-size: 12px; color: var(--text-muted);">${formatDate(e.created_at)}</td>
    `;
    return tr;
  }

  function createEventCard(e) {
    const card = document.createElement('div');
    card.className = 'mobile-card';
    
    let eventStyle = 'color: var(--text-main); font-weight: 500;';
    if (e.event.includes('failed') || e.event.includes('cancelled') || e.event.includes('expired')) {
      eventStyle = 'color: var(--danger); font-weight: 500;';
    } else if (e.event.includes('success') || e.event.includes('active') || e.event.includes('charged')) {
      eventStyle = 'color: var(--success); font-weight: 500;';
    }

    card.innerHTML = `
      <div class="card-header-row">
        <div class="event-name" style="${eventStyle}">${escapeHtml(e.event)}</div>
        <div class="event-date">${formatDate(e.created_at)}</div>
      </div>
      <div class="card-details-row">
        <div class="detail-item">
          <span class="detail-label">Payment ID</span>
          <span class="detail-value font-mono">${escapeHtml(e.payment_id || '—')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Subscription ID</span>
          <span class="detail-value font-mono">${escapeHtml(e.subscription_id || '—')}</span>
        </div>
        ${e.profiles ? `
        <div class="detail-item" style="grid-column: span 2;">
          <span class="detail-label">User Email</span>
          <span class="detail-value">${escapeHtml(e.profiles.email)}</span>
        </div>` : ''}
      </div>
    `;
    return card;
  }

  // ─── PANE 4: USER FEEDBACK CONTROLLER ──────────────────────────────
  // ─── PANE 4: USER FEEDBACK CONTROLLER ──────────────────────────────
  let feedbackTotalCount = 0;

  async function fetchFeedbackData() {
    try {
      const res = await fetch(`/api/admin/feedback?page=${feedbackCurrentPage}&limit=${feedbackPageSize}`);
      if (!res.ok) throw new Error('Failed to fetch user feedback');
      const data = await res.json();
      
      const feedback = data.feedback || [];
      feedbackTotalCount = data.count || 0;
      
      renderFeedbackPage(feedback);
    } catch (err) {
      console.error(err);
      showToast('Error loading feedback list', true);
    }
  }

  function renderFeedbackPage(feedback) {
    const tbody = document.getElementById('feedback-table');
    const mobileList = document.getElementById('feedback-mobile-list');
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';

    const paginationContainer = document.getElementById('feedback-pagination');
    const paginationInfo = document.getElementById('feedback-pagination-info');
    const btnPrev = document.getElementById('btn-feedback-prev');
    const btnNext = document.getElementById('btn-feedback-next');

    if (feedback.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">No feedback submissions recorded.</td></tr>`;
      if (mobileList) mobileList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">No feedback submissions recorded.</div>`;
      if (paginationContainer) paginationContainer.style.display = 'none';
      return;
    }

    if (paginationContainer) paginationContainer.style.display = 'flex';

    const maxPages = Math.ceil(feedbackTotalCount / feedbackPageSize);
    
    if (btnPrev) btnPrev.disabled = (feedbackCurrentPage === 1);
    if (btnNext) btnNext.disabled = (feedbackCurrentPage === maxPages);

    const startIdx = (feedbackCurrentPage - 1) * feedbackPageSize + 1;
    const endIdx = Math.min(feedbackCurrentPage * feedbackPageSize, feedbackTotalCount);
    if (paginationInfo) {
      paginationInfo.innerText = `Showing ${startIdx}-${endIdx} of ${feedbackTotalCount}`;
    }

    feedback.forEach(f => {
      const tr = document.createElement('tr');
      const starFilled = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="var(--warning)" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
      const starEmpty = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
      const ratingStars = starFilled.repeat(f.rating) + starEmpty.repeat(5 - f.rating);
      
      tr.innerHTML = `
        <td style="line-height: 1.4; vertical-align: middle;">
          <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(f.user_name || 'Anonymous')}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            ${f.user_email ? `<a href="mailto:${escapeHtml(f.user_email)}" style="color: var(--accent); text-decoration: none;">${escapeHtml(f.user_email)}</a>` : '—'}
          </div>
        </td>
        <td style="vertical-align: middle;">
          <div style="display: flex; align-items: center;">${ratingStars}</div>
        </td>
        <td style="max-width: 300px; word-wrap: break-word; line-height: 1.4; vertical-align: middle;">${escapeHtml(f.message)}</td>
        <td style="font-size: 12px; color: var(--text-muted); vertical-align: middle;">${formatDate(f.created_at)}</td>
      `;
      tbody.appendChild(tr);

      // Render Mobile Card
      if (mobileList) {
        const card = document.createElement('div');
        card.className = 'mobile-card';
        card.innerHTML = `
          <div class="card-header-row">
            <div class="user-details">
              <div class="user-name">${escapeHtml(f.user_name || 'Anonymous')}</div>
              <div class="user-email">${f.user_email ? escapeHtml(f.user_email) : '—'}</div>
            </div>
            <div class="user-rating" style="display: flex;">${ratingStars}</div>
          </div>
          <div class="card-message-row">
            <p class="card-message">${escapeHtml(f.message)}</p>
          </div>
          <div class="card-details-row">
            <div class="detail-item">
              <span class="detail-label">Submitted</span>
              <span class="detail-value">${formatDate(f.created_at)}</span>
            </div>
          </div>
        `;
        mobileList.appendChild(card);
      }
    });
  }

  // ─── PANE 5: SUPPORT QUEUE CONTROLLER ───────────────────────────────
  let supportTotalCount = 0;

  async function fetchSupportData() {
    try {
      const statusFilter = document.getElementById('ticketStatusFilter').value;
      const res = await fetch(`/api/admin/tickets?status=${statusFilter}&page=${supportCurrentPage}&limit=${supportPageSize}`);
      if (!res.ok) throw new Error('Failed to fetch tickets');
      const data = await res.json();
      
      const tickets = data.tickets || [];
      supportTotalCount = data.count || 0;

      const list = document.getElementById('full-support-list');
      list.innerHTML = '';

      if (tickets.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">No support tickets in this queue.</div>`;
        renderSupportPagination();
        return;
      }

      tickets.forEach(t => {
        const item = document.createElement('div');
        item.className = 'ticket-item';
        
        // Render actions based on status
        let statusActionsHtml = '';
        if (t.status === 'open') {
          statusActionsHtml += `<button class="btn-action-sm btn-status-change" data-id="${t.id}" data-status="in_progress">In Progress</button>`;
        }
        if (t.status !== 'resolved') {
          statusActionsHtml += `<button class="btn-action-sm btn-status-change" data-id="${t.id}" data-status="resolved" style="color: var(--success); border-color: rgba(48,209,88,0.2);">Resolve</button>`;
        }
        
        // Show Reply button
        statusActionsHtml += `<button class="btn-action-sm btn-reply-ticket" data-id="${t.id}" data-email="${t.user_email}" data-subject="${t.subject}">Reply via Email</button>`;

        item.innerHTML = `
          <div class="ticket-header">
            <div>
              <span class="ticket-user">${escapeHtml(t.user_name || 'Anonymous Customer')}</span>
              <span class="ticket-email">&lt;${escapeHtml(t.user_email)}&gt;</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge ${t.status}">${t.status}</span>
              <span class="ticket-date">${formatDate(t.created_at)}</span>
            </div>
          </div>
          <div class="ticket-subject">Subject: ${escapeHtml(t.subject)}</div>
          <div class="ticket-message">${escapeHtml(t.message).replace(/\n/g, '<br>')}</div>
          <div class="ticket-actions">
            ${statusActionsHtml}
          </div>
        `;
        
        list.appendChild(item);
      });

      // Status change handler
      document.querySelectorAll('.btn-status-change').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.dataset.id;
          const status = e.target.dataset.status;
          await updateTicketStatus(id, status);
        });
      });

      // Reply modal trigger
      document.querySelectorAll('.btn-reply-ticket').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.dataset.id;
          const email = e.target.dataset.email;
          const subject = e.target.dataset.subject;

          document.getElementById('replyTicketId').value = id;
          document.getElementById('replyRecipientDisplay').innerText = email;
          document.getElementById('replySubjectDisplay').innerText = subject;
          document.getElementById('replyMessage').value = ''; // clear previous
          
          document.getElementById('replyModalOverlay').style.display = 'flex';
        });
      });

      renderSupportPagination();
    } catch (err) {
      console.error(err);
      showToast('Error loading support queue', true);
    }
  }

  function renderSupportPagination() {
    const paginationContainer = document.getElementById('support-pagination');
    const paginationInfo = document.getElementById('support-pagination-info');
    const btnPrev = document.getElementById('btn-support-prev');
    const btnNext = document.getElementById('btn-support-next');

    if (!paginationContainer) return;

    if (supportTotalCount === 0) {
      paginationContainer.style.display = 'none';
      return;
    }

    paginationContainer.style.display = 'flex';
    const maxPages = Math.ceil(supportTotalCount / supportPageSize);
    
    if (btnPrev) btnPrev.disabled = (supportCurrentPage === 1);
    if (btnNext) btnNext.disabled = (supportCurrentPage === maxPages);

    const startIdx = (supportCurrentPage - 1) * supportPageSize + 1;
    const endIdx = Math.min(supportCurrentPage * supportPageSize, supportTotalCount);
    if (paginationInfo) {
      paginationInfo.innerText = `Showing ${startIdx}-${endIdx} of ${supportTotalCount}`;
    }
  }


  async function updateTicketStatus(ticketId, status) {
    try {
      const res = await fetch('/api/admin/ticket/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, status })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Ticket status set to ${status}!`);
        fetchSupportData();
        if (currentPane === 'overview') fetchOverviewData();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to update ticket status', true);
    }
  }

  async function handleSendReply(e) {
    e.preventDefault();
    const id = document.getElementById('replyTicketId').value;
    const message = document.getElementById('replyMessage').value;
    const submitBtn = document.getElementById('submitReplyBtn');

    submitBtn.disabled = true;
    submitBtn.innerText = 'Sending email...';

    try {
      const res = await fetch('/api/admin/ticket/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: id, replyText: message })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Reply email delivered successfully via Resend!');
        document.getElementById('replyModalOverlay').style.display = 'none';
        fetchSupportData();
      } else {
        throw new Error(data.error || 'Failed to deliver email reply.');
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error delivering reply', true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Send Reply via Resend';
    }
  }

  // ─── PANE 6: SYSTEM HEALTH CONTROLLER ───────────────────────────────
  async function fetchHealthData() {
    try {
      const res = await fetch('/api/admin/health');
      if (!res.ok) throw new Error('Health check responded with failure code');
      const health = await res.json();

      const list = document.getElementById('health-check-list');
      list.innerHTML = '';

      Object.entries(health.services || {}).forEach(([service, statusObj]) => {
        const item = document.createElement('div');
        item.className = 'health-item';
        
        let statusClass = 'healthy';
        if (statusObj.status === 'error' || statusObj.status === 'unhealthy') {
          statusClass = 'unhealthy';
        } else if (statusObj.status === 'degraded' || statusObj.status === 'warning') {
          statusClass = 'warning';
        }

        item.innerHTML = `
          <span class="health-name">${escapeHtml(service.toUpperCase())}</span>
          <div class="health-status">
            <span class="health-status-dot ${statusClass}"></span>
            <span style="text-transform: capitalize; font-weight: 500;">${escapeHtml(statusObj.status)}</span>
            <span style="color: var(--text-muted); font-size: 12px; margin-left: 8px;">(${statusObj.latencyMs ? `${statusObj.latencyMs}ms` : statusObj.message || 'Ok'})</span>
          </div>
        `;
        list.appendChild(item);
      });
    } catch (err) {
      console.error(err);
      showToast('Error performing system health audit', true);
    }
  }

  // ─── MANUAL ACTIVATION & DOWNGRADE ACTIONS ──────────────────────────
  async function handleManualActivation(e) {
    e.preventDefault();
    const email = document.getElementById('activateEmail').value;
    const plan = document.getElementById('activatePlan').value;
    const reason = document.getElementById('activateReason').value;
    const submitBtn = document.getElementById('submitActivateBtn');

    submitBtn.disabled = true;
    submitBtn.innerText = 'Activating...';

    try {
      const res = await fetch('/api/admin/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, plan, reason })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Manually activated ${plan} for ${email}!`);
        document.getElementById('activateModalOverlay').style.display = 'none';
        
        // Refresh appropriate views
        if (currentPane === 'users') fetchUsersData();
        if (currentPane === 'overview') fetchOverviewData();
      } else {
        throw new Error(data.error || 'Failed to activate user account.');
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error activating user', true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Activate User';
    }
  }

  async function handleDowngrade(email) {
    try {
      const res = await fetch('/api/admin/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`User ${email} downgraded to Free tier successfully.`);
        if (currentPane === 'users') fetchUsersData();
        if (currentPane === 'overview') fetchOverviewData();
      } else {
        throw new Error(data.error || 'Failed to downgrade user.');
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to downgrade user', true);
    }
  }

  // ─── ADMIN ACTIONS ──────────────────────────────────────────────────
  async function handleLogout() {
    const confirmed = await showConfirm("Sign Out", "Are you sure you want to sign out of the Founder Center?");
    if (!confirmed) return;
    try {
      const res = await fetch('/api/admin/logout', { method: 'POST' });
      if (res.ok) {
        window.location.href = '/admin/login';
      }
    } catch (err) {
      console.error('Logout error:', err);
      window.location.href = '/admin/login';
    }
  }

  async function triggerWebhookSync() {
    const btn = document.getElementById('btnSyncWebhooks');
    btn.disabled = true;
    btn.innerText = 'Syncing...';
    try {
      const res = await fetch('/api/admin/sync-webhooks', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Webhook sync run completed. Database updated!');
        if (currentPane === 'events') fetchEventsData();
        if (currentPane === 'overview') fetchOverviewData();
      } else {
        throw new Error(data.error || 'Sync failed.');
      }
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to synchronize webhooks', true);
    } finally {
      btn.disabled = false;
      btn.innerText = 'Trigger Webhook Scan';
    }
  }

  // ─── UTILITIES & TIMERS ─────────────────────────────────────────────
  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(() => {
      fetchPaneData(currentPane);
    }, refreshRateMs);
  }

  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    
    // Formatting: e.g. "20 Jun 2026, 14:32"
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n) => n.toString().padStart(2, '0');
    
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function showToast(message, isError = false) {
    // Basic toast overlay creation if it doesn't exist
    let toastContainer = document.getElementById('admin-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'admin-toast-container';
      toastContainer.style.position = 'fixed';
      toastContainer.style.bottom = '24px';
      toastContainer.style.right = '24px';
      toastContainer.style.zIndex = '9999';
      toastContainer.style.display = 'flex';
      toastContainer.style.flexDirection = 'column';
      toastContainer.style.gap = '8px';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.style.background = isError ? 'var(--danger)' : 'rgba(22, 22, 23, 0.9)';
    toast.style.border = isError ? 'none' : '1px solid var(--card-border)';
    toast.style.color = '#ffffff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '10px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '500';
    toast.style.backdropFilter = 'blur(10px)';
    toast.style.boxShadow = '0 8px 16px rgba(0,0,0,0.3)';
    toast.style.animation = 'toastIn 0.3s ease forwards';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    
    const iconHtml = isError 
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    
    toast.innerHTML = `${iconHtml} <span>${escapeHtml(message)}</span>`;

    // Animation keyframes injected dynamically
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.innerHTML = `
        @keyframes toastIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes toastOut {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(20px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  function showConfirm(title, message) {
    return new Promise((resolve) => {
      let overlay = document.getElementById('admin-confirm-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'admin-confirm-overlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
      }

      overlay.innerHTML = `
        <div class="modal" style="max-width: 400px; display: block;">
          <div class="modal-header" style="margin-bottom: 14px; padding-bottom: 10px;">
            <h3 class="modal-title" style="font-size: 16px;">${escapeHtml(title)}</h3>
          </div>
          <div class="modal-body" style="font-size: 13.5px; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px;">
            ${escapeHtml(message)}
          </div>
          <div class="modal-footer" style="gap: 10px;">
            <button type="button" class="btn-action-sm" id="confirm-cancel-btn">Cancel</button>
            <button type="button" class="btn-action-primary" id="confirm-ok-btn" style="background-color: var(--danger); box-shadow: 0 4px 10px rgba(224, 80, 80, 0.15);">Confirm</button>
          </div>
        </div>
      `;

      overlay.style.display = 'flex';

      const cleanup = (value) => {
        overlay.style.display = 'none';
        resolve(value);
      };

      document.getElementById('confirm-cancel-btn').addEventListener('click', () => cleanup(false));
      document.getElementById('confirm-ok-btn').addEventListener('click', () => cleanup(true));
    });
  }

  // ─── PANE 3: REVENUE & PAYMENTS CONTROLLER ──────────────────────────
  async function fetchRevenueData() {
    try {
      const res = await fetch('/api/admin/revenue');
      if (!res.ok) throw new Error('Failed to fetch revenue data');
      const data = await res.json();

      // Render stats counters
      document.getElementById('revenueTotalVal').innerText = `₹${(data.totalRevenue || 0).toLocaleString()}`;
      document.getElementById('revenueMRRVal').innerText = `₹${(data.mrr || 0).toLocaleString()}`;
      document.getElementById('revenueCountVal').innerText = (data.paymentsCount || 0).toString();

      // Render transactions table
      const tbody = document.getElementById('revenue-history-table');
      const mobileList = document.getElementById('revenue-history-mobile-list');
      tbody.innerHTML = '';
      if (mobileList) mobileList.innerHTML = '';

      if (!data.paymentHistory || data.paymentHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">No transaction logs recorded.</td></tr>`;
        if (mobileList) mobileList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">No transaction logs recorded.</div>`;
        return;
      }

      data.paymentHistory.forEach(p => {
        const tr = document.createElement('tr');
        
        let statusStyle = 'color: var(--text-main); font-weight: 500;';
        if (p.status === 'Successful' || p.status === 'Activated') {
          statusStyle = 'color: var(--success); font-weight: 500;';
        } else if (p.status === 'Failed' || p.status === 'Refunded') {
          statusStyle = 'color: var(--danger); font-weight: 500;';
        }

        tr.innerHTML = `
          <td style="font-weight: 500;">${escapeHtml(p.user_email)}</td>
          <td>${escapeHtml(p.description)}</td>
          <td style="font-family: monospace; font-weight: 600;">₹${p.amount}</td>
          <td style="font-size: 12px; font-family: monospace;">${escapeHtml(p.payment_id || '—')}</td>
          <td><span style="${statusStyle}">${escapeHtml(p.status)}</span></td>
          <td style="font-size: 12px; color: var(--text-muted);">${formatDate(p.created_at)}</td>
        `;
        tbody.appendChild(tr);

        // Render Mobile Card
        if (mobileList) {
          const card = document.createElement('div');
          card.className = 'mobile-card';
          card.innerHTML = `
            <div class="card-header-row">
              <div class="user-details">
                <div class="user-email" style="font-weight: 600; color: var(--text-main); font-size: 14px;">${escapeHtml(p.user_email)}</div>
                <div class="payment-desc" style="font-size: 12px; color: var(--text-muted);">${escapeHtml(p.description)}</div>
              </div>
              <div class="payment-amount-status">
                <div class="payment-amount">₹${p.amount}</div>
                <span class="payment-status-text" style="${statusStyle}">${escapeHtml(p.status)}</span>
              </div>
            </div>
            <div class="card-details-row">
              <div class="detail-item">
                <span class="detail-label">Payment ID</span>
                <span class="detail-value font-mono">${escapeHtml(p.payment_id || '—')}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Date</span>
                <span class="detail-value">${formatDate(p.created_at)}</span>
              </div>
            </div>
          `;
          mobileList.appendChild(card);
        }
      });
    } catch (err) {
      console.error(err);
      showToast('Error loading revenue metrics', true);
    }
  }

  // ─── PANE 5: COMBINED FEEDBACK & SUPPORT QUEUE ─────────────────────
  async function fetchFeedbackAndSupportData() {
    fetchFeedbackData();
    fetchSupportData();
  }

  // ─── PANE 7: FOUNDER NOTES & TASKS CONTROLLER ──────────────────────
  async function fetchNotesAndTasksData() {
    try {
      const res = await fetch('/api/admin/notes');
      if (!res.ok) throw new Error('Failed to fetch notes and tasks');
      const data = await res.json();

      // Populate Notepad
      const notepad = document.getElementById('founderNotepad');
      if (notepad) {
        notepad.value = data.notes_content || '';
      }

      // Reset Notepad Autosave Status
      const status = document.getElementById('notepadAutosaveStatus');
      if (status) {
        status.innerText = 'All notes saved.';
        status.style.color = 'var(--success)';
      }

      // Populate and Render Kanban Board
      cachedTasks = data.tasks || [];
      renderKanbanBoard();

    } catch (err) {
      console.error(err);
      showToast('Error loading founder notes & tasks', true);
    }
  }

  const projectLabels = [
    'Website', 'Extension', 'Backend', 'Supabase', 'Razorpay', 'Resend',
    'Authentication', 'Billing', 'Chrome Store', 'Firefox', 'Deployment',
    'Bug', 'Feature', 'Design', 'Marketing', 'Documentation', 'Research', 'Personal'
  ];

  function mapOldColumn(col) {
    if (!col) return 'backlog';
    const lower = col.toLowerCase();
    if (lower === 'inbox') return 'backlog';
    if (lower === 'planned') return 'todo';
    if (lower === 'testing') return 'todo';
    if (lower === 'deploy') return 'todo';
    if (lower === 'completed') return 'done';
    if (lower === 'backlog' || lower === 'todo' || lower === 'in_progress' || lower === 'done') {
      return lower;
    }
    return 'backlog';
  }

  function initKanbanFilters() {
    // Labels are deprecated in favor of clean Heading and Problem Statement values
  }

  function initKanbanBoard() {
    initKanbanFilters();

    // Wire up filter inputs
    const searchInput = document.getElementById('kanbanSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderKanbanBoard());
    }
    const prioFilter = document.getElementById('kanbanPriorityFilter');
    if (prioFilter) {
      prioFilter.addEventListener('change', () => renderKanbanBoard());
    }
    const lblFilter = document.getElementById('kanbanLabelFilter');
    if (lblFilter) {
      lblFilter.addEventListener('change', () => renderKanbanBoard());
    }

    // Wire up Quick Action Add buttons
    document.querySelectorAll('.btn-quick-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        openKanbanModalForNew(type);
      });
    });

    // Wire up Modal controls
    const closeBtn = document.getElementById('closeKanbanModalBtn');
    const cancelBtn = document.getElementById('cancelKanbanBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeKanbanModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeKanbanModal);

    const form = document.getElementById('kanbanTaskForm');
    if (form) {
      form.addEventListener('submit', handleSaveKanbanCard);
    }

    // Initialize Column Drag & Drop
    setupColumnDragAndDrop();
  }

  function openKanbanModalForNew(type) {
    const modalOverlay = document.getElementById('kanbanModalOverlay');
    const form = document.getElementById('kanbanTaskForm');
    const titleInput = document.getElementById('kanbanTaskTitle');
    const prioInput = document.getElementById('kanbanTaskPriority');
    const colInput = document.getElementById('kanbanTaskColumn');
    const idInput = document.getElementById('kanbanTaskId');

    if (!form || !modalOverlay) return;

    form.reset();
    idInput.value = ''; // Indicates a new card

    let defaultTitle = '';
    let defaultPriority = 'medium';
    let defaultColumn = 'backlog';
    let prefilledLabels = [];

    switch (type) {
      case 'bug':
        defaultTitle = '[BUG] ';
        defaultPriority = 'critical';
        defaultColumn = 'backlog';
        break;
      case 'feature':
        defaultTitle = '[FEATURE] ';
        defaultPriority = 'high';
        defaultColumn = 'backlog';
        break;
      case 'deployment':
        defaultTitle = '[DEPLOY] ';
        defaultPriority = 'high';
        defaultColumn = 'todo';
        prefilledLabels = ['Deployment'];
        break;
      case 'meeting':
        defaultTitle = '[MEETING] ';
        defaultPriority = 'medium';
        defaultColumn = 'backlog';
        prefilledLabels = ['Research'];
        break;
      case 'note':
        defaultTitle = '[NOTE] ';
        defaultPriority = 'low';
        defaultColumn = 'backlog';
        prefilledLabels = ['Research'];
        break;
      case 'task':
      default:
        defaultTitle = '';
        defaultPriority = 'medium';
        defaultColumn = 'backlog';
        prefilledLabels = [];
        break;
    }

    titleInput.value = defaultTitle;
    prioInput.value = defaultPriority;
    colInput.value = defaultColumn;

    // Check pre-filled checkboxes
    document.querySelectorAll('input[name="kanbanLabel"]').forEach(cb => {
      cb.checked = prefilledLabels.includes(cb.value);
    });

    document.getElementById('kanbanModalTitle').innerText = 'Create Kanban Card';
    modalOverlay.style.display = 'flex';
    titleInput.focus();
  }

  function openKanbanModalForEdit(cardId) {
    const card = cachedTasks.find(t => t.id === cardId);
    if (!card) return;

    const modalOverlay = document.getElementById('kanbanModalOverlay');
    const form = document.getElementById('kanbanTaskForm');
    const titleInput = document.getElementById('kanbanTaskTitle');
    const descInput = document.getElementById('kanbanTaskDesc');
    const prioInput = document.getElementById('kanbanTaskPriority');
    const colInput = document.getElementById('kanbanTaskColumn');
    const idInput = document.getElementById('kanbanTaskId');

    if (!form || !modalOverlay) return;

    idInput.value = card.id;
    titleInput.value = card.title || '';
    descInput.value = card.desc || '';
    prioInput.value = card.priority || 'medium';
    colInput.value = mapOldColumn(card.column);

    document.getElementById('kanbanModalTitle').innerText = 'Edit Kanban Card';
    modalOverlay.style.display = 'flex';
  }

  function closeKanbanModal() {
    const modalOverlay = document.getElementById('kanbanModalOverlay');
    if (modalOverlay) {
      modalOverlay.style.display = 'none';
    }
  }

  async function handleSaveKanbanCard(e) {
    e.preventDefault();

    const idInput = document.getElementById('kanbanTaskId');
    const titleInput = document.getElementById('kanbanTaskTitle');
    const descInput = document.getElementById('kanbanTaskDesc');
    const prioInput = document.getElementById('kanbanTaskPriority');
    const colInput = document.getElementById('kanbanTaskColumn');

    const title = titleInput.value.trim();
    if (!title) return;

    const isEdit = idInput.value !== '';
    const now = Date.now();

    if (isEdit) {
      const card = cachedTasks.find(t => t.id === idInput.value);
      if (card) {
        card.title = title;
        card.desc = descInput.value.trim();
        card.priority = prioInput.value;
        card.column = colInput.value;
        card.updated = now;
      }
    } else {
      const newCard = {
        id: now.toString(),
        title,
        desc: descInput.value.trim(),
        priority: prioInput.value,
        column: colInput.value,
        created: now,
        updated: now
      };
      cachedTasks.push(newCard);
    }

    closeKanbanModal();
    renderKanbanBoard();
    await saveTasks();
  }

  async function handleDeleteKanbanCard(e, cardId) {
    e.stopPropagation();
    const confirmed = await showConfirm("Delete Kanban Card", "Are you sure you want to delete this card?");
    if (confirmed) {
      cachedTasks = cachedTasks.filter(t => t.id !== cardId);
      renderKanbanBoard();
      await saveTasks();
    }
  }

  function renderKanbanBoard() {
    const searchVal = document.getElementById('kanbanSearchInput')?.value.toLowerCase() || '';
    const prioVal = document.getElementById('kanbanPriorityFilter')?.value || 'all';
    const labelVal = document.getElementById('kanbanLabelFilter')?.value || 'all';

    const columns = {
      backlog: document.getElementById('cards-backlog'),
      todo: document.getElementById('cards-todo'),
      in_progress: document.getElementById('cards-in_progress'),
      done: document.getElementById('cards-done')
    };

    // Clear columns
    Object.values(columns).forEach(el => {
      if (el) el.innerHTML = '';
    });

    const counts = {
      backlog: 0,
      todo: 0,
      in_progress: 0,
      done: 0
    };

    // Filter cards
    const filtered = cachedTasks.filter(card => {
      if (searchVal) {
        const tLower = (card.title || '').toLowerCase();
        const dLower = (card.desc || '').toLowerCase();
        if (!tLower.includes(searchVal) && !dLower.includes(searchVal)) {
          return false;
        }
      }
      if (prioVal !== 'all') {
        if ((card.priority || '').toLowerCase() !== prioVal) {
          return false;
        }
      }
      if (labelVal !== 'all') {
        const labels = card.labels || [];
        if (!labels.includes(labelVal)) {
          return false;
        }
      }
      return true;
    });

    // Populate columns
    filtered.forEach(card => {
      const colKey = mapOldColumn(card.column);
      const container = columns[colKey];
      if (!container) return;

      counts[colKey]++;

      const cardEl = document.createElement('div');
      cardEl.className = `kanban-card prio-${card.priority}`;
      cardEl.draggable = true;
      cardEl.setAttribute('data-id', card.id);
      
      // Title & Description
      const titleHtml = `<div class="card-task-title">${escapeHtml(card.title)}</div>`;
      const descHtml = card.desc ? `<div class="card-task-desc">${escapeHtml(card.desc).replace(/\n/g, '<br>')}</div>` : '';

      // Actions Wrapper (Edit & Delete)
      const actionsEl = document.createElement('div');
      actionsEl.className = 'card-actions';

      // Edit Button
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit-card';
      editBtn.title = 'Edit Card';
      editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openKanbanModalForEdit(card.id);
      });

      // Delete Button
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete-card';
      delBtn.title = 'Delete Card';
      delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
      delBtn.addEventListener('click', (e) => handleDeleteKanbanCard(e, card.id));

      actionsEl.appendChild(editBtn);
      actionsEl.appendChild(delBtn);

      cardEl.innerHTML = `
        ${titleHtml}
        ${descHtml}
      `;

      cardEl.appendChild(actionsEl);

      cardEl.addEventListener('click', () => openKanbanModalForEdit(card.id));

      // Dragstart & Dragend listeners
      cardEl.addEventListener('dragstart', (e) => {
        cardEl.classList.add('dragging');
        e.dataTransfer.setData('text/plain', card.id);
      });
      cardEl.addEventListener('dragend', () => {
        cardEl.classList.remove('dragging');
      });

      container.appendChild(cardEl);
    });

    // Empty columns fallback message
    Object.entries(columns).forEach(([colKey, el]) => {
      if (el && el.children.length === 0) {
        el.innerHTML = `<div style="text-align: center; padding: 24px 10px; color: var(--text-dim); font-size: 12px; border: 1px dashed rgba(255,255,255,0.03); border-radius: var(--radius-md);">Empty zone</div>`;
      }
    });

    // Update column counters
    Object.entries(counts).forEach(([colKey, val]) => {
      const cntEl = document.getElementById(`count-${colKey}`);
      if (cntEl) cntEl.innerText = val.toString();
    });

    // Update stats row
    updateProductivityStats();
  }

  function updateProductivityStats() {
    let totalCount = cachedTasks.length;
    let inboxCount = 0;
    let todoCount = 0;
    let inProgressCount = 0;
    let urgentCount = 0;

    cachedTasks.forEach(card => {
      const colKey = mapOldColumn(card.column);
      if (colKey === 'backlog') {
        inboxCount++;
      } else if (colKey === 'todo') {
        todoCount++;
      } else if (colKey === 'in_progress') {
        inProgressCount++;
      }

      // Track uncompleted high priority focus tasks
      if ((card.priority === 'critical' || card.priority === 'high') && colKey !== 'done') {
        urgentCount++;
      }
    });

    const elTotal = document.getElementById('k-stat-total');
    const elInbox = document.getElementById('k-stat-inbox');
    const elTodo = document.getElementById('k-stat-todo-count');
    const elProgress = document.getElementById('k-stat-progress');
    const elUrgent = document.getElementById('k-stat-urgent');

    if (elTotal) elTotal.innerText = totalCount.toString();
    if (elInbox) elInbox.innerText = inboxCount.toString();
    if (elTodo) elTodo.innerText = todoCount.toString();
    if (elProgress) elProgress.innerText = inProgressCount.toString();
    if (elUrgent) elUrgent.innerText = urgentCount.toString();
  }

  function setupColumnDragAndDrop() {
    const columns = document.querySelectorAll('.kanban-column');
    columns.forEach(col => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
      });

      col.addEventListener('dragenter', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
      });

      col.addEventListener('dragleave', () => {
        col.classList.remove('drag-over');
      });

      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        
        const cardId = e.dataTransfer.getData('text/plain');
        const card = cachedTasks.find(t => t.id === cardId);
        const newCol = col.getAttribute('data-col');

        if (card && mapOldColumn(card.column) !== newCol) {
          card.column = newCol;
          card.updated = Date.now();
          
          renderKanbanBoard();
          await saveTasks();
        }
      });
    });
  }

  async function saveTasks() {
    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: cachedTasks })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save tasks');
      }
    } catch (err) {
      console.error('Error saving tasks:', err);
      showToast('Failed to save tasks list', true);
    }
  }

  let notesAutosaveTimeout = null;
  function debounceAutosaveNotes() {
    const status = document.getElementById('notepadAutosaveStatus');
    if (status) {
      status.innerText = 'Unsaved changes...';
      status.style.color = 'var(--warning)';
    }

    clearTimeout(notesAutosaveTimeout);
    notesAutosaveTimeout = setTimeout(async () => {
      try {
        if (status) {
          status.innerText = 'Saving...';
          status.style.color = 'var(--text-muted)';
        }
        
        const content = document.getElementById('founderNotepad').value;
        const res = await fetch('/api/admin/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes_content: content })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (status) {
            status.innerText = 'All notes saved.';
            status.style.color = 'var(--success)';
          }
        } else {
          throw new Error(data.error || 'Failed to save notes');
        }
      } catch (err) {
        console.error(err);
        if (status) {
          status.innerText = 'Save failed!';
          status.style.color = 'var(--danger)';
        }
        showToast('Autosave notes failed', true);
      }
    }, 1000);
  }

  // ─── PANE 8: SETTINGS & SECURITY CONTROLLER ─────────────────────────
  async function fetchSettingsData() {
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error('Failed to fetch settings configurations');
      const data = await res.json();

      const tbody = document.getElementById('settingsConfigTable');
      tbody.innerHTML = '';

      if (!data.settings) {
        tbody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-muted); padding: 24px;">No configuration parameters loaded.</td></tr>`;
        return;
      }

      const displayNames = {
        adminEmail: 'Admin Login Email',
        supabaseUrl: 'Supabase URL',
        supabasePublishableKey: 'Supabase Publishable Key',
        supabaseSecretKey: 'Supabase Secret Key (Masked)',
        razorpayKeyId: 'Razorpay Key ID (Masked)',
        razorpayPlanId: 'Razorpay Plan ID',
        resendConfigured: 'Resend Connection Status',
        resendSupportConfigured: 'Resend Support Channel Status',
        nodeEnv: 'Node Environment',
        jwtExpiration: 'Admin Session Expiration',
        autoRefreshRate: 'Dashboard Refresh Rate'
      };

      Object.entries(data.settings).forEach(([key, val]) => {
        const tr = document.createElement('tr');
        const label = displayNames[key] || key;
        
        let valStyle = '';
        if (val && (val.includes('Healthy') || val.includes('Connected'))) {
          valStyle = 'color: var(--success); font-weight: 500;';
        } else if (val && (val.includes('Missing') || val.includes('Error'))) {
          valStyle = 'color: var(--danger); font-weight: 500;';
        }

        tr.innerHTML = `
          <td style="font-weight: 600; color: var(--text-muted); font-family: monospace;">${escapeHtml(label)}</td>
          <td style="font-family: monospace; ${valStyle}">${escapeHtml(val)}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      showToast('Error loading settings', true);
    }
  }

  // ─── COLUMN VISIBILITY HANDLERS ──────────────────────────────────────
  const columnsList = [
    { key: 'email', label: 'User Email', index: 0, checked: true },
    { key: 'plan', label: 'Plan', index: 1, checked: true },
    { key: 'status', label: 'Status', index: 2, checked: true },
    { key: 'customer', label: 'Razorpay Customer', index: 3, checked: true },
    { key: 'subscription', label: 'Subscription ID', index: 4, checked: true },
    { key: 'expires', label: 'Expires On', index: 5, checked: true },
    { key: 'signup', label: 'Signed Up', index: 6, checked: true },
    { key: 'actions', label: 'Actions', index: 7, checked: true }
  ];

  function setupColumnVisibilityDropdown() {
    const btn = document.getElementById('btnColumnVisibility');
    const dropdown = document.getElementById('columnVisibilityDropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    dropdown.innerHTML = '';
    columnsList.forEach(col => {
      const label = document.createElement('label');
      label.className = 'dropdown-item-checkbox';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = col.checked;
      checkbox.addEventListener('change', (e) => {
        col.checked = e.target.checked;
        updateColumnVisibility();
      });

      const span = document.createElement('span');
      span.innerText = col.label;

      label.appendChild(checkbox);
      label.appendChild(span);
      dropdown.appendChild(label);
    });
  }

  function updateColumnVisibility() {
    const table = document.getElementById('user-table-element');
    if (!table) return;

    columnsList.forEach(col => {
      const th = table.querySelector(`thead th:nth-child(${col.index + 1})`);
      if (th) {
        th.style.display = col.checked ? '' : 'none';
      }
      const tds = table.querySelectorAll(`tbody tr td:nth-child(${col.index + 1})`);
      tds.forEach(td => {
        td.style.display = col.checked ? '' : 'none';
      });
    });
  }

  function setupSidebarCollapse() {
    const btn = document.getElementById('sidebarCollapseBtn');
    const sidebar = document.getElementById('sidebar');
    if (!btn || !sidebar) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('collapsed');
      const isCollapsed = sidebar.classList.contains('collapsed');
      localStorage.setItem('admin_sidebar_collapsed', isCollapsed);
    });

    // Check initial state from localStorage
    const savedState = localStorage.getItem('admin_sidebar_collapsed');
    if (savedState === 'true') {
      sidebar.classList.add('collapsed');
    }
  }

  // ─── Mobile Sidebar Toggle, Backdrop, Gestures & Inputs ──────────────────────────
  (function setupMobileUX() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!menuToggle || !sidebar) return;

    function openSidebar() {
      sidebar.classList.add('mobile-open');
      if (backdrop) backdrop.classList.add('active');
    }

    function closeSidebar() {
      sidebar.classList.remove('mobile-open');
      if (backdrop) backdrop.classList.remove('active');
    }

    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('mobile-open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });

    // Close sidebar when backdrop is tapped
    if (backdrop) {
      backdrop.addEventListener('click', closeSidebar);
    }

    // Close sidebar when a menu link is clicked (on mobile)
    sidebar.querySelectorAll('.menu-link').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      });
    });

    // Touch Swipe Gestures for Sidebar Drawer (optimized for 60fps GPU transforms)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoveX = 0;
    let isDraggingSidebar = false;

    document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      const isOpen = sidebar.classList.contains('mobile-open');
      
      // Edge drag start threshold (clientX < 40px)
      if (!isOpen && touchStartX < 40) {
        isDraggingSidebar = true;
        sidebar.style.transition = 'none';
        if (backdrop) {
          backdrop.style.visibility = 'visible';
          backdrop.style.transition = 'none';
        }
      }
      
      if (isOpen && touchStartX < 320) {
        isDraggingSidebar = true;
        sidebar.style.transition = 'none';
        if (backdrop) backdrop.style.transition = 'none';
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!isDraggingSidebar) return;
      touchMoveX = e.touches[0].clientX;
      const isOpen = sidebar.classList.contains('mobile-open');
      const width = sidebar.offsetWidth || 300;

      if (!isOpen) {
        const translate = Math.min(0, -width + touchMoveX);
        sidebar.style.transform = `translateX(${translate}px)`;
        sidebar.style.opacity = `${Math.min(1, touchMoveX / width)}`;
        if (backdrop) {
          backdrop.style.opacity = `${(Math.min(1, touchMoveX / width)) * 0.55}`;
        }
      } else {
        const dragDistance = touchStartX - touchMoveX;
        if (dragDistance > 0) {
          const translate = Math.max(-width, -dragDistance);
          sidebar.style.transform = `translateX(${translate}px)`;
          const ratio = (width - dragDistance) / width;
          sidebar.style.opacity = `${Math.max(0, ratio)}`;
          if (backdrop) {
            backdrop.style.opacity = `${Math.max(0, ratio * 0.55)}`;
          }
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!isDraggingSidebar) return;
      isDraggingSidebar = false;

      sidebar.style.transition = '';
      if (backdrop) backdrop.style.transition = '';

      const isOpen = sidebar.classList.contains('mobile-open');
      const currentX = e.changedTouches[0].clientX;

      if (!isOpen) {
        if (currentX > 100) {
          openSidebar();
        } else {
          closeSidebar();
        }
      } else {
        const dragDistance = touchStartX - currentX;
        if (dragDistance > 100) {
          closeSidebar();
        } else {
          openSidebar();
        }
      }

      sidebar.style.transform = '';
      sidebar.style.opacity = '';
      if (backdrop) {
        backdrop.style.opacity = '';
        backdrop.style.visibility = '';
      }
    }, { passive: true });

    // Pull-to-Refresh Gesture (rubber band effect scrolling contentArea)
    (function setupPullToRefresh() {
      const contentArea = document.querySelector('.content-area');
      if (!contentArea) return;

      let startY = 0;
      let currentPull = 0;
      let isPulling = false;
      const refreshIndicator = document.getElementById('refreshIndicator');

      contentArea.addEventListener('touchstart', (e) => {
        if (contentArea.scrollTop === 0 && e.touches.length === 1) {
          startY = e.touches[0].clientY;
          isPulling = true;
          contentArea.style.transition = 'none';
        }
      }, { passive: true });

      contentArea.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        if (diff > 0) {
          currentPull = Math.min(60, diff * 0.4);
          contentArea.style.transform = `translateY(${currentPull}px)`;
          if (refreshIndicator) {
            refreshIndicator.style.opacity = '1';
            refreshIndicator.querySelector('span:last-child').innerText = diff > 80 ? 'Release to refresh' : 'Pull to refresh';
          }
        } else {
          isPulling = false;
          contentArea.style.transform = '';
        }
      }, { passive: true });

      contentArea.addEventListener('touchend', () => {
        if (!isPulling) return;
        isPulling = false;

        contentArea.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        contentArea.style.transform = '';

        if (currentPull >= 30) {
          showToast('Refreshing dashboard...');
          fetchPaneData(currentPane, true);
        }

        currentPull = 0;
      });
    })();

    // Input keyboard scroll alignment to prevent soft keyboard overlap on iOS Safari
    document.addEventListener('focusin', (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        setTimeout(() => {
          e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 320); // Delay matches safe transition timing for virtual keyboard reveal
      }
    });
  })();
});
