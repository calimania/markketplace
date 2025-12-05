/**
 * Odoo API Partner Service
 *
 * Odoo Extension syncs contacts, marketing lists & orders to streamline operations for compatible stores
 * @NOTE: Abstract as markket.extensions in separate packages
 * @WIP: API in active development, attributes and workflows might change drastically before v1
 */

interface OdooCredentials {
  url: string;
  database: string;
  api_key: string;
}

interface OdooConfig {
  company_id: number;
}

interface OdooTestResult {
  success: boolean;
  message: string;
  data?: {
    partner_id: number;
    partner_name: string;
    partner_email: string | null;
    partner_phone: string | null;
    company_id: any;
    configured_company_id: number;
    company_id_matches: boolean;
    odoo_url: string;
    odoo_database: string;
  };
  error?: string;
  tested_company_id?: number;
  odoo_url?: string;
  odoo_database?: string;
}

/**
 * Test Odoo API connection and authentication
 */
export async function testOdooConnection(
  credentials: OdooCredentials,
  config: OdooConfig
): Promise<OdooTestResult> {
  try {
    console.log('[ODOO_TEST] Testing connection', {
      url: credentials.url,
      database: credentials.database,
      company_id: config.company_id
    });

    const response = await fetch(`${credentials.url}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute',
          args: [
            credentials.database,
            2,
            credentials.api_key,
            'res.partner',
            'search_read',
            [['id', '=', config.company_id]],
            ['id', 'name', 'email', 'phone', 'company_id']
          ]
        },
        id: Date.now()
      })
    });

    if (!response.ok) {
      return {
        success: false,
        message: 'Failed to connect to Odoo server',
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const result = await response.json() as {
      error?: {
        message?: string;
        code?: number;
        data?: { message?: string };
      };
      result?: any[];
      id?: number;
    };

    console.log('[ODOO_TEST] Response received', {
      success: !result.error,
      hasResult: !!result.result,
      resultCount: Array.isArray(result.result) ? result.result.length : 0
    });

    if (result.error) {
      console.error('[ODOO_TEST] Odoo error:', result.error);
      return {
        success: false,
        message: 'Authentication failed or invalid credentials',
        error: result.error.message || result.error.data?.message || 'Unknown Odoo error'
      };
    }

    if (!result.result || !Array.isArray(result.result) || result.result.length === 0) {
      return {
        success: false,
        message: `Company ID ${config.company_id} not found in Odoo database`,
        tested_company_id: config.company_id,
        odoo_url: credentials.url,
        odoo_database: credentials.database
      };
    }

    const partner = result.result[0];

    console.log('[ODOO_TEST] Connection successful:', {
      partner_id: partner.id,
      partner_name: partner.name
    });

    return {
      success: true,
      message: 'Odoo connection successful',
      data: {
        partner_id: partner.id,
        partner_name: partner.name,
        partner_email: partner.email || null,
        partner_phone: partner.phone || null,
        company_id: partner.company_id,
        configured_company_id: config.company_id,
        company_id_matches: partner.id === config.company_id,
        odoo_url: credentials.url,
        odoo_database: credentials.database
      }
    };

  } catch (error: any) {
    console.error('[ODOO_TEST] Test failed:', error.message);
    return {
      success: false,
      message: 'Failed to connect to Odoo - check URL and network connectivity',
      error: error.message
    };
  }
}
