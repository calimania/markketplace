export const ApiExplorerJS = `
// Markketplace API Explorer JavaScript
function saveStoreId(storeId) {
  if (storeId) localStorage.setItem('last_store_id', storeId);
}

function loadStoreId() {
  return localStorage.getItem('last_store_id') || '';
}

async function apiCall(path, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;

  const responseEl = document.getElementById('response');
  const responseBody = document.getElementById('response-body');
  const responseTitle = document.getElementById('response-title');
  const responseStatus = document.getElementById('response-status');

  responseEl.classList.add('show');
  responseEl.classList.remove('minimized');
  document.getElementById('response-toggle').textContent = 'Minimize';

  responseBody.innerHTML = '<p style="color: #64748b;">Loading...</p>';
  responseTitle.textContent = 'Response';
  responseStatus.innerHTML = '';

  console.log('API Request:', path);

  try {
    const res = await fetch(path, { headers });
    const data = await res.json();

    const statusClass = res.ok ? 'status-success' : 'status-error';
    responseStatus.innerHTML = '<span class="status-badge ' + statusClass + '">' + res.status + ' ' + res.statusText + '</span>';

    responseBody.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';

    console.log('API Response:', data);
  } catch (err) {
    responseStatus.innerHTML = '<span class="status-badge status-error">Error</span>';
    responseBody.innerHTML = '<pre style="background: #fee2e2; color: #991b1b; border-color: #fca5a5;">' + err.message + '</pre>';
    console.error('API Error:', err);
  }
}

function testDashboard() {
  const storeId = document.getElementById('dash-store-id').value;
  const token = document.getElementById('dash-token').value;
  if (!storeId || !token) return alert('Store ID and token required');
  saveStoreId(storeId);
  apiCall('/api/stores/' + storeId + '/dashboard', token);
}

function testContentCounts() {
  const storeId = document.getElementById('counts-store-id').value;
  if (!storeId) return alert('Store ID required');
  saveStoreId(storeId);
  apiCall('/api/stores/' + storeId + '/content-counts');
}

function testQuickStats() {
  const storeId = document.getElementById('stats-store-id').value;
  if (!storeId) return alert('Store ID required');
  saveStoreId(storeId);
  apiCall('/api/stores/' + storeId + '/quick-stats');
}

function testVisibility() {
  const storeId = document.getElementById('vis-store-id').value;
  if (!storeId) return alert('Store ID required');
  saveStoreId(storeId);
  apiCall('/api/stores/' + storeId + '/visibility');
}

function testSalesSummary() {
  const storeId = document.getElementById('sales-store-id').value;
  const days = document.getElementById('sales-days').value;
  const token = document.getElementById('sales-token').value;
  if (!storeId || !token) return alert('Store ID and token required');
  saveStoreId(storeId);
  const path = days ? '/api/stores/' + storeId + '/sales-summary?days=' + days : '/api/stores/' + storeId + '/sales-summary';
  apiCall(path, token);
}

function testStripeStatus() {
  const storeId = document.getElementById('stripe-store-id').value;
  if (!storeId) return alert('Store ID required');
  saveStoreId(storeId);
  apiCall('/api/stores/' + storeId + '/stripe-status');
}

function testStoreInfo() {
  const slug = document.getElementById('info-slug').value;
  if (!slug) return alert('Store slug required');
  apiCall('/api/stores/' + slug + '/info');
}

document.addEventListener('DOMContentLoaded', function() {
  const savedId = loadStoreId();
  if (savedId) {
    document.querySelectorAll('input[id$="-store-id"]').forEach(input => {
      input.value = savedId;
    });
  }

  document.getElementById('response-toggle').addEventListener('click', function(e) {
    e.stopPropagation();
    const panel = document.getElementById('response');
    panel.classList.toggle('minimized');
    this.textContent = panel.classList.contains('minimized') ? 'Expand' : 'Minimize';
  });

  document.getElementById('response-header').addEventListener('click', function() {
    const panel = document.getElementById('response');
    const toggle = document.getElementById('response-toggle');
    panel.classList.toggle('minimized');
    toggle.textContent = panel.classList.contains('minimized') ? 'Expand' : 'Minimize';
  });

  document.addEventListener('click', function(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;

    switch(action) {
      case 'testDashboard': testDashboard(); break;
      case 'testContentCounts': testContentCounts(); break;
      case 'testQuickStats': testQuickStats(); break;
      case 'testVisibility': testVisibility(); break;
      case 'testSalesSummary': testSalesSummary(); break;
      case 'testStripeStatus': testStripeStatus(); break;
      case 'testStoreInfo': testStoreInfo(); break;
    }
  });
});
`;

