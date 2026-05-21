
// Markketplace API Explorer JavaScript
function saveStoreId(storeId) {
  if (storeId) localStorage.setItem('last_store_id', storeId);
}

function loadStoreId() {
  return localStorage.getItem('last_store_id') || '';
}

async function apiCall(path, token, options) {
  const requestOptions = options || {};
  const method = (requestOptions.method || 'GET').toUpperCase();
  const body = requestOptions.body;
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
  responseTitle.textContent = method + ' ' + path;
  responseStatus.innerHTML = '';

  console.log('API Request:', method, path);

  try {
    const fetchOptions = { method, headers };
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(body);
    }

    const res = await fetch(path, fetchOptions);
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

function testCustomRequest() {
  const method = (document.getElementById('custom-method').value || 'GET').toUpperCase();
  const token = document.getElementById('custom-token').value.trim();
  const pathInput = document.getElementById('custom-path').value.trim();
  const bodyInput = document.getElementById('custom-body').value.trim();

  if (!pathInput) {
    return alert('Path required');
  }

  const path = pathInput.startsWith('/') ? pathInput : '/' + pathInput;
  let parsedBody;
  if (bodyInput) {
    try {
      parsedBody = JSON.parse(bodyInput);
    } catch {
      return alert('Body must be valid JSON');
    }
  }

  if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && parsedBody === undefined) {
    return alert(method + ' requests usually need a JSON body');
  }

  apiCall(path, token, { method, body: parsedBody });
}

function clearCustomRequest() {
  document.getElementById('custom-method').value = 'GET';
  document.getElementById('custom-token').value = '';
  document.getElementById('custom-path').value = '';
  document.getElementById('custom-body').value = '';
  const explainer = document.getElementById('custom-explainer');
  if (explainer) {
    explainer.textContent = 'Choose a preset below or type your own path. Supports query params like ?populate=SEO,SEO.socialImage.';
  }
}

function applyCustomPreset(button) {
  const method = button.dataset.method || 'GET';
  const path = button.dataset.path || '';
  const note = button.dataset.note || 'Preset applied. Edit placeholders and run request.';

  document.getElementById('custom-method').value = method;
  document.getElementById('custom-path').value = path;
  if (method === 'PUT' || method === 'POST' || method === 'PATCH') {
    document.getElementById('custom-body').value = '{\n  "Title": "Updated title"\n}';
  }

  const explainer = document.getElementById('custom-explainer');
  if (explainer) {
    explainer.textContent = note;
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

function testExtensionsDebug() {
  const storeId = document.getElementById('ext-store-id').value;
  const token = document.getElementById('ext-token').value;
  if (!storeId) return alert('Store ID required');
  saveStoreId(storeId);

  console.log('🔍 Testing Extensions Debug Endpoint');
  console.log('Store ID:', storeId);
  console.log('Auth:', token ? '✅ Authenticated (full access)' : '⚠️  Unauthenticated (limited view)');
  console.log('Watch console for detailed encryption analysis...');

  apiCall('/api/stores/' + storeId + '/extensions-debug', token);
}

async function testExtension() {
  const storeId = document.getElementById('extensionStoreId').value.trim();
  const extensionKey = document.getElementById('extensionKey').value.trim();
  const token = document.getElementById('extensionToken').value.trim();

  if (!storeId || !extensionKey || !token) {
    return alert('Please fill in all fields (Store ID, Extension Key, and Token)');
  }

  saveStoreId(storeId);

  const responseEl = document.getElementById('response');
  const responseBody = document.getElementById('response-body');
  const responseTitle = document.getElementById('response-title');
  const responseStatus = document.getElementById('response-status');

  responseEl.classList.add('show');
  responseEl.classList.remove('minimized');
  document.getElementById('response-toggle').textContent = 'Minimize';

  responseBody.innerHTML = '<p style="color: #64748b;">Testing extension credentials...</p>';
  responseTitle.textContent = 'Extension Test Response';
  responseStatus.innerHTML = '';

  console.log('Testing Extension:', extensionKey);

  try {
    const res = await fetch('/api/stores/' + storeId + '/test-extension', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        extensionKey: extensionKey
      })
    });

    const data = await res.json();

    const statusClass = data.success ? 'status-success' : 'status-error';
    const statusIcon = data.success ? '✅' : '❌';

    responseStatus.innerHTML = '<span class="status-badge ' + statusClass + '">' +
      statusIcon + ' ' + res.status + ' ' + res.statusText + '</span>';

    if (data.success) {
      responseBody.innerHTML = '<div style="background: #d1fae5; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">' +
        '<h4 style="color: #065f46; margin: 0 0 0.5rem 0;">✅ Connection Successful!</h4>' +
        '<p style="color: #047857; margin: 0;"><strong>Message:</strong> ' + data.message + '</p>' +
        '</div>' +
        '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
    } else {
      responseBody.innerHTML = '<div style="background: #fee2e2; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">' +
        '<h4 style="color: #991b1b; margin: 0 0 0.5rem 0;">❌ Connection Failed</h4>' +
        '<p style="color: #dc2626; margin: 0 0 0.5rem 0;"><strong>Message:</strong> ' + (data.message || 'Unknown error') + '</p>' +
        (data.error ? '<p style="color: #dc2626; margin: 0;"><strong>Error:</strong> ' + data.error + '</p>' : '') +
        '</div>' +
        '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
    }

    console.log('Extension Test Response:', data);
  } catch (err) {
    responseStatus.innerHTML = '<span class="status-badge status-error">Network Error</span>';
    responseBody.innerHTML = '<div style="background: #fee2e2; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">' +
      '<h4 style="color: #991b1b; margin: 0 0 0.5rem 0;">Network Error</h4>' +
      '<p style="color: #dc2626; margin: 0;">' + err.message + '</p>' +
      '</div>';
    console.error('Extension Test Error:', err);
  }
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
      case 'testExtensionsDebug': testExtensionsDebug(); break;
      case 'testExtension': testExtension(); break;
      case 'testCustomRequest': testCustomRequest(); break;
      case 'clearCustomRequest': clearCustomRequest(); break;
      case 'applyCustomPreset': applyCustomPreset(button); break;
    }
  });
});