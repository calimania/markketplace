export const ApiExplorerHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markketplace API Explorer</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f7fa;
      min-height: 100vh;
      padding-bottom: 400px;
    }
    .header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid #ffd100;
    }
    h1 {
      color: #003893;
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 600;
    }
    .subtitle {
      color: #64748b;
      margin: 0;
      font-size: 15px;
    }
    .section {
      background: white;
      padding: 25px;
      margin-bottom: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .section h2 {
      margin: 0 0 20px 0;
      color: #003893;
      font-size: 18px;
      font-weight: 600;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 10px;
    }
    .endpoint {
      background: #f8fafc;
      padding: 20px;
      margin: 15px 0;
      border-radius: 6px;
      border-left: 3px solid #003893;
    }
    .method {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      margin-right: 10px;
      letter-spacing: 0.5px;
    }
    .get { background: #003893; color: white; }
    .post { background: #ce1126; color: white; }
    .put { background: #ffd100; color: #003893; }
    .path {
      font-family: 'Monaco', 'Courier New', monospace;
      background: white;
      padding: 6px 10px;
      border-radius: 4px;
      display: inline-block;
      font-size: 13px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      margin-left: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .public { background: #d1fae5; color: #065f46; }
    .protected { background: #fed7aa; color: #9a3412; }
    .description {
      color: #64748b;
      margin: 12px 0;
      font-size: 14px;
      line-height: 1.5;
    }
    .input-group {
      margin: 12px 0;
    }
    .input-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #334155;
      font-size: 13px;
    }
    .input-group input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s;
    }
    .input-group input:focus {
      outline: none;
      border-color: #003893;
      box-shadow: 0 0 0 3px rgba(0,56,147,0.1);
    }
    button {
      background: #003893;
      color: white;
      border: none;
      padding: 10px 18px;
      cursor: pointer;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
      margin-top: 8px;
    }
    button:hover {
      background: #002366;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,56,147,0.2);
    }
    button:active {
      transform: translateY(0);
    }
    #response {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: white;
      padding: 0;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.15);
      transform: translateY(100%);
      transition: transform 0.3s ease;
      max-height: 60vh;
      overflow: hidden;
      z-index: 1000;
    }
    #response.show {
      transform: translateY(0);
    }
    #response-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background: #003893;
      color: white;
      cursor: pointer;
      user-select: none;
    }
    #response-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    #response-toggle {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
    }
    #response-toggle:hover {
      background: rgba(255,255,255,0.3);
    }
    #response-body {
      padding: 20px;
      overflow-y: auto;
      max-height: calc(60vh - 50px);
    }
    #response.minimized #response-body {
      display: none;
    }
    pre {
      background: #1e293b;
      color: #e2e8f0;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.6;
      margin: 0;
      border: 1px solid #334155;
      white-space: pre-wrap;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 10px;
    }
    .status-success { background: #d1fae5; color: #065f46; }
    .status-error { background: #fee2e2; color: #991b1b; }
    .dev-tools-hint {
      background: #fef3c7;
      border: 2px solid #fbbf24;
      border-radius: 6px;
      padding: 16px;
      margin: 20px 0;
      color: #92400e;
    }
    .dev-tools-hint strong {
      color: #78350f;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Markketplace API Explorer</h1>
    <p class="subtitle">Interactive testing for dashboard, payments, and store APIs</p>
  </div>

  <div class="dev-tools-hint">
    <strong>💡 Developer Tip:</strong> Open your browser's Network tab (F12 → Network) for full request/response details including headers, timing, and raw JSON.
  </div>

  <div class="section">
    <h2>Public Endpoints - No Auth Required</h2>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/stores/:id/content-counts</span>
      <span class="badge public">Public</span>
      <p class="description">Get counts of articles, pages, events, products, and categories</p>
      <p class="description" style="font-size: 12px; color: #94a3b8;">
        <strong>Example response:</strong> <code>{ articles: 5, pages: 3, events: 2, products: 10, categories: 4 }</code>
      </p>
      <div class="input-group">
        <label>Store ID:</label>
        <input type="text" id="counts-store-id" placeholder="Store document ID">
      </div>
      <button data-action="testContentCounts">Test Endpoint</button>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/stores/:id/quick-stats</span>
      <span class="badge public">Public</span>
      <p class="description">Homepage hero stats: content, products, categories</p>
      <p class="description" style="font-size: 12px; color: #94a3b8;">
        <strong>Example response:</strong> <code>{ total_content: 8, total_products: 10, has_content: true, has_products: true }</code>
      </p>
      <div class="input-group">
        <label>Store ID:</label>
        <input type="text" id="stats-store-id" placeholder="Store document ID">
      </div>
      <button data-action="testQuickStats">Test Endpoint</button>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/stores/:id/visibility</span>
      <span class="badge public">Public</span>
      <p class="description">UI visibility flags for conditional rendering (only shows active categories)</p>
      <p class="description" style="font-size: 12px; color: #94a3b8;">
        <strong>Example response:</strong> <code>{ show_blog: true, show_shop: false, show_categories: true, active_category_count: 3 }</code>
      </p>
      <div class="input-group">
        <label>Store ID:</label>
        <input type="text" id="vis-store-id" placeholder="Store document ID">
      </div>
      <button data-action="testVisibility">Test Endpoint</button>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/stores/:id/stripe-status</span>
      <span class="badge public">Public</span>
      <p class="description">Stripe Connect account status for UI badges</p>
      <p class="description" style="font-size: 12px; color: #94a3b8;">
        <strong>Example response:</strong> <code>{ connected: true, charges_enabled: true, payouts_enabled: true }</code>
      </p>
      <div class="input-group">
        <label>Store ID:</label>
        <input type="text" id="stripe-store-id" placeholder="Store document ID">
      </div>
      <button data-action="testStripeStatus">Test Endpoint</button>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/stores/:slug/info</span>
      <span class="badge public">Public</span>
      <p class="description">Get store info by slug (no auth required)</p>
      <p class="description" style="font-size: 12px; color: #94a3b8;">
        <strong>Example response:</strong> <code>{ title: "My Store", slug: "next", Logo: {...}, settings: {...} }</code>
      </p>
      <div class="input-group">
        <label>Store Slug:</label>
        <input type="text" id="info-slug" placeholder="next" value="next">
      </div>
      <button data-action="testStoreInfo">Test Endpoint</button>
    </div>
  </div>

  <div class="section">
    <h2>🔐 Debug & Security Endpoints</h2>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/stores/:id/extensions-debug</span>
      <span class="badge" style="background: #8b5cf6;">Hybrid</span>
      <p class="description">🔍 Debug extension encryption - Public: Limited info | Auth: Full details</p>
      <p class="description" style="font-size: 12px; color: #94a3b8;">
        <strong>Without auth:</strong> Extension count + public info<br>
        <strong>With auth:</strong> Full credentials analysis showing 🔐 ENCRYPTED vs ⚠️ PLAIN TEXT status
      </p>
      <div class="input-group">
        <label>Store ID:</label>
        <input type="text" id="ext-store-id" placeholder="Store document ID">
      </div>
      <div class="input-group">
        <label>JWT Token (optional for full access):</label>
        <input type="password" id="ext-token" placeholder="Leave empty for public view">
      </div>
      <button data-action="testExtensionsDebug">Test Endpoint</button>
      <p class="description" style="font-size: 11px; color: #f59e0b; margin-top: 10px;">
        💡 <strong>Tip:</strong> Check console logs for detailed encryption analysis!
      </p>
    </div>
  </div>

  <div class="section">
    <h2>Protected Endpoints - Owner Access Only</h2>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/stores/:id/dashboard</span>
      <span class="badge protected">Protected</span>
      <p class="description">Complete dashboard: content counts + sales + recent orders</p>
      <p class="description" style="font-size: 12px; color: #94a3b8;">
        <strong>Includes:</strong> Revenue breakdown, order counts, platform fees, recent transactions
      </p>
      <div class="input-group">
        <label>Store ID:</label>
        <input type="text" id="dash-store-id" placeholder="Store document ID">
      </div>
      <div class="input-group">
        <label>JWT Token:</label>
        <input type="password" id="dash-token" placeholder="Bearer token">
      </div>
      <button data-action="testDashboard">Test Endpoint</button>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/stores/:id/sales-summary</span>
      <span class="badge protected">Protected</span>
      <p class="description">Revenue breakdown with platform + Stripe fees (default: 30 days)</p>
      <p class="description" style="font-size: 12px; color: #94a3b8;">
        <strong>Example response:</strong> <code>{ total_revenue_usd: "1234.56", total_orders: 45, avg_order_usd: "27.43", fees_collected_usd: "123.45" }</code>
      </p>
      <div class="input-group">
        <label>Store ID:</label>
        <input type="text" id="sales-store-id" placeholder="Store document ID">
      </div>
      <div class="input-group">
        <label>Days Back (optional):</label>
        <input type="number" id="sales-days" placeholder="30">
      </div>
      <div class="input-group">
        <label>JWT Token:</label>
        <input type="password" id="sales-token" placeholder="Bearer token">
      </div>
      <button data-action="testSalesSummary">Test Endpoint</button>
    </div>
  </div>

  <div id="response">
    <div id="response-header">
      <h3>
        <span id="response-title">Response</span>
        <span id="response-status"></span>
      </h3>
      <button id="response-toggle">Minimize</button>
    </div>
    <div id="response-body"></div>
  </div>

  <script src="/api/api-explorer.js"></script>
</body>
</html>
`;
