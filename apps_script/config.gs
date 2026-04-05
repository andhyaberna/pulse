var APP = APP || {};

APP.VERSION = '1.0.0';

APP.SHEETS = {
  APP_REPORTS: 'app_reports',
  REPORT_THRESHOLDS: 'report_thresholds',
  TELEGRAM_TARGETS: 'telegram_targets',
  RUN_LOGS: 'run_logs',
  MANUAL_RUN_QUEUE: 'manual_run_queue',
  APP_USERS: 'app_users'
};

APP.REPORT_IDS = {
  META_FULL_METRICS: 'META_FULL_METRICS',
  META_ADSET_BREAKDOWN: 'META_ADSET_BREAKDOWN',
  META_ADSET_PERFORMANCE: 'META_ADSET_PERFORMANCE',
  META_TOP_ADS_PROFIT: 'META_TOP_ADS_PROFIT',
  META_TOP_ADS_WINNER: 'META_TOP_ADS_WINNER',
  META_FUNNEL_ALERT: 'META_FUNNEL_ALERT',
  META_CREATIVE_FATIGUE: 'META_CREATIVE_FATIGUE'
};

APP.REPORT_FUNCTION_MAP = {
  META_FULL_METRICS: 'runReportFullMetrics',
  META_ADSET_BREAKDOWN: 'runReportAdsetBreakdown',
  META_ADSET_PERFORMANCE: 'runReportAdsetPerformance',
  META_TOP_ADS_PROFIT: 'runReportTopAdsProfit',
  META_TOP_ADS_WINNER: 'runReportTopAdsWinner',
  META_FUNNEL_ALERT: 'runReportFunnelAlert',
  META_CREATIVE_FATIGUE: 'runReportCreativeFatigue'
};

APP.Util = {
  nowIso: function () {
    return new Date().toISOString();
  },

  formatWIB: function (dateObj) {
    var tz = APP.getAppConfig().timezone;
    return Utilities.formatDate(dateObj || new Date(), tz, 'dd/MM/yyyy HH:mm');
  },

  num: function (value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  },

  rp: function (value) {
    return Math.round(APP.Util.num(value)).toLocaleString('id-ID');
  },

  bool: function (value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    var v = String(value || '').toLowerCase().trim();
    return v === '1' || v === 'true' || v === 'yes' || v === 'aktif';
  },

  actionValue: function (actionList, actionType) {
    if (!Array.isArray(actionList)) return 0;
    var found = actionList.find(function (item) {
      return item && item.action_type === actionType;
    });
    return APP.Util.num(found && found.value);
  },

  sleep: function (ms) {
    Utilities.sleep(APP.Util.num(ms));
  },

  mdSafe: function (text) {
    return String(text || '')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/`/g, '\\`');
  },

  jsonResponse: function (obj, statusCode) {
    var payload = {
      ok: obj && obj.ok !== false,
      statusCode: statusCode || 200,
      data: obj || {}
    };
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  }
};

APP.ReportHelpers = APP.ReportHelpers || {
  getThreshold: function (thresholdMap, key, fallback) {
    var value = thresholdMap && thresholdMap.hasOwnProperty(key) ? thresholdMap[key] : fallback;
    return APP.Util.num(value);
  },

  getActiveCampaigns: function () {
    return APP.MetaService.getActiveCampaigns().map(function (c) {
      return { id: c.id, name: c.name || 'Unnamed Campaign' };
    });
  },

  getAccountInfoSafe: function () {
    return APP.MetaService.getAdAccountInfo();
  }
};

APP.getAppConfig = function () {
  var p = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: p.getProperty('TARGET_SHEET_ID') || '',
    metaAccessToken: p.getProperty('META_ACCESS_TOKEN') || '',
    metaAdAccountId: p.getProperty('META_AD_ACCOUNT_ID') || '',
    telegramBotToken: p.getProperty('TELEGRAM_BOT_TOKEN') || '',
    timezone: p.getProperty('APP_TIMEZONE') || 'Asia/Jakarta',
    defaultDatePreset: p.getProperty('META_DATE_PRESET') || 'today',
    webhookApiKey: p.getProperty('WEBHOOK_API_KEY') || '',
    internalUiKey: p.getProperty('INTERNAL_UI_KEY') || '',
    authPepper: p.getProperty('AUTH_PEPPER') || '',
    authSessionTtlSec: APP.Util.num(p.getProperty('AUTH_SESSION_TTL_SEC') || 21600),
    allowAdminRegister: APP.Util.bool(p.getProperty('ALLOW_ADMIN_REGISTER') || false)
  };
};

APP.assertRequiredSecrets = function () {
  var cfg = APP.getAppConfig();
  var missing = [];
  if (!cfg.spreadsheetId) missing.push('TARGET_SHEET_ID');
  if (!cfg.metaAccessToken) missing.push('META_ACCESS_TOKEN');
  if (!cfg.metaAdAccountId) missing.push('META_AD_ACCOUNT_ID');
  if (!cfg.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN');

  if (missing.length > 0) {
    throw new Error('Script Properties belum lengkap: ' + missing.join(', '));
  }
};
