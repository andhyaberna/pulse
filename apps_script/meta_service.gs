var APP = APP || {};

APP.MetaService = {
  apiGet: function (path, query) {
    var cfg = APP.getAppConfig();
    var params = query || {};
    params.access_token = cfg.metaAccessToken;

    var queryString = Object.keys(params)
      .map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      })
      .join('&');

    var url = 'https://graph.facebook.com/v19.0/' + path + '?' + queryString;
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var body = response.getContentText();

    var json;
    try {
      json = JSON.parse(body);
    } catch (err) {
      throw new Error('Meta API invalid JSON: ' + body);
    }

    if (json && json.error) {
      throw new Error('Meta API error: ' + json.error.message);
    }

    return json;
  },

  getAdAccountInfo: function () {
    var cfg = APP.getAppConfig();
    var adAccountId = cfg.metaAdAccountId;
    var data = APP.MetaService.apiGet(adAccountId, { fields: 'name,account_id' });

    return {
      id: data.account_id || adAccountId,
      name: data.name || 'Unknown Account'
    };
  },

  getActiveCampaigns: function () {
    var cfg = APP.getAppConfig();
    var payload = APP.MetaService.apiGet(cfg.metaAdAccountId + '/campaigns', {
      fields: 'id,name',
      effective_status: '["ACTIVE"]',
      limit: 200
    });
    return payload.data || [];
  },

  getInsightsByLevel: function (options) {
    var cfg = APP.getAppConfig();
    var o = options || {};
    var baseId = o.campaignId || cfg.metaAdAccountId;
    var fields = o.fields || 'spend,impressions,reach,frequency,cpm,cpc,ctr,clicks,actions,action_values';

    var payload = APP.MetaService.apiGet(baseId + '/insights', {
      level: o.level || 'campaign',
      fields: fields,
      date_preset: o.datePreset || cfg.defaultDatePreset
    });

    return payload.data || [];
  }
};
