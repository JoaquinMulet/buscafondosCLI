import axios from 'axios';

const BASE_URL = process.env.BUSCAFONDOS_API_URL || 'https://api.buscafondos.com';

export default class BuscaFondosClient {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl;
    this.client = axios.create({ timeout: 30000 });
  }

  async _get(path, params = {}) {
    try {
      const resp = await this.client.get(`${this.baseUrl}${path}`, { params });
      return { success: true, data: resp.data };
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        return { success: false, error: { type: 'timeout', message: 'Request timed out after 30s' } };
      }
      if (err.response) {
        const status = err.response.status;
        const messages = {
          404: `Resource not found: ${path}`,
          500: 'API server error. Try again later.',
          502: 'API gateway error. Try again later.',
          503: 'API temporarily unavailable.'
        };
        return { success: false, error: { type: 'http', status, message: messages[status] || `HTTP ${status}` } };
      }
      if (err.code === 'ENOTFOUND') {
        return { success: false, error: { type: 'network', message: 'Cannot reach API. Check internet connection.' } };
      }
      return { success: false, error: { type: 'unknown', message: err.message } };
    }
  }

  async health() { return this._get('/health'); }
  async listProviders() { return this._get('/api/asset_providers'); }
  async listFunds(providerId) { return this._get(`/api/asset_providers/${providerId}/conceptual_assets`); }
  async listSeries(conceptId) { return this._get(`/api/conceptual_assets/${conceptId}/real_assets`); }
  async getDays(assetId, fromDate = null) {
    const params = fromDate ? { from_date: fromDate } : {};
    return this._get(`/api/real_assets/${assetId}/days`, params);
  }
  async getExpenseRatio(assetId) { return this._get(`/api/real_assets/${assetId}/expense_ratio`); }
  async getRiskMetrics(assetId) { return this._get(`/api/real_assets/${assetId}/risk_metrics`); }
  async getExpenseRatioHistory(assetId, fromDate = null) {
    const params = fromDate ? { from_date: fromDate } : {};
    return this._get(`/api/real_assets/${assetId}/expense_ratio/history`, params);
  }
  async ranking(metric = 'patrimony', date = null) {
    const params = { metric };
    if (date) params.date = date;
    return this._get('/api/agf_stats/ranking', params);
  }
  async evolution(administrators, metric = 'patrimony', fromMonth = null, toMonth = null) {
    const params = { administrator: administrators, metric };
    if (fromMonth) params.from_month = fromMonth;
    if (toMonth) params.to_month = toMonth;
    return this._get('/api/agf_stats/evolution', params);
  }
  async listAllFunds(category = null, date = null) {
    const params = {};
    if (category) params.category = category;
    if (date) params.date = date;
    return this._get('/api/all-funds', params);
  }
  async carteraResumen(run, month = null) {
    const params = month ? { month } : {};
    return this._get(`/api/funds/${run}/cartera/resumen`, params);
  }
  async carteraHoldings(run, month = null, market = 'all') {
    const params = { market };
    if (month) params.month = month;
    return this._get(`/api/funds/${run}/cartera/holdings`, params);
  }
}