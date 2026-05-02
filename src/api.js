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
  async listProviders({ limit = null, offset = null, search = null } = {}) {
    const params = {};
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;
    if (search) params.search = search;
    return this._get('/api/asset_providers', params);
  }

  async listFunds(providerId, { limit = null, offset = null } = {}) {
    const params = {};
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;
    return this._get(`/api/asset_providers/${providerId}/conceptual_assets`, params);
  }

  async listSeries(conceptId, { limit = null, offset = null } = {}) {
    const params = {};
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;
    return this._get(`/api/conceptual_assets/${conceptId}/real_assets`, params);
  }

  async getDays(assetId, fromDate = null, { limit = null, offset = null } = {}) {
    const params = {};
    if (fromDate) params.from_date = fromDate;
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;
    return this._get(`/api/real_assets/${assetId}/days`, params);
  }

  async getExpenseRatio(assetId) { return this._get(`/api/real_assets/${assetId}/expense_ratio`); }

  async getRiskMetrics(assetId) { return this._get(`/api/real_assets/${assetId}/risk_metrics`); }

  async getExpenseRatioHistory(assetId, { limit = null, offset = null } = {}) {
    const params = {};
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;
    return this._get(`/api/real_assets/${assetId}/expense_ratio/history`, params);
  }

  async ranking(metric = 'patrimony', date = null, { limit = null, offset = null } = {}) {
    const params = { metric };
    if (date) params.date = date;
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;
    return this._get('/api/agf_stats/ranking', params);
  }

  async evolution(administrators, metric = 'patrimony', fromMonth = null, toMonth = null) {
    const params = { administrator: administrators, metric };
    if (fromMonth) params.from_month = fromMonth;
    if (toMonth) params.to_month = toMonth;
    return this._get('/api/agf_stats/evolution', params);
  }

  async listAllFunds({ category = null, date = null, limit = null, offset = null, search = null, maxTac = null, minPatrimony = null, agf = null, sortBy = null, order = null } = {}) {
    const params = {};
    if (category) params.category = category;
    if (date) params.date = date;
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;
    if (search) params.search = search;
    if (maxTac != null) params.max_tac = maxTac;
    if (minPatrimony != null) params.min_patrimony = minPatrimony;
    if (agf) params.agf = agf;
    if (sortBy) params.sort_by = sortBy;
    if (order) params.order = order;
    return this._get('/api/all-funds', params);
  }

  async carteraResumen(run, month = null) {
    const params = month ? { month } : {};
    return this._get(`/api/funds/${run}/cartera/resumen`, params);
  }

  async carteraHoldings(run, month = null, market = 'all', { limit = null, offset = null } = {}) {
    const params = { market };
    if (month) params.month = month;
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;
    return this._get(`/api/funds/${run}/cartera/holdings`, params);
  }
}