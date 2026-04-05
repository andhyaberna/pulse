var APP = APP || {};
APP.ReportHandlers = APP.ReportHandlers || {};

APP.ReportHandlers.runReportTopAdsWinner = function (ctx) {
  var threshold = ctx.thresholdMap || {};
  var minSpend = APP.ReportHelpers.getThreshold(threshold, 'MIN_SPEND', 10000);
  var topLimit = APP.ReportHelpers.getThreshold(threshold, 'TOP_LIMIT', 10);
  var winnerMinSpend = APP.ReportHelpers.getThreshold(threshold, 'WINNER_MIN_SPEND', 30000);
  var winnerMinBuy = APP.ReportHelpers.getThreshold(threshold, 'WINNER_MIN_BUY', 2);
  var winnerMinRoas = APP.ReportHelpers.getThreshold(threshold, 'WINNER_MIN_ROAS', 2);

  var account = APP.ReportHelpers.getAccountInfoSafe();
  var campaigns = APP.ReportHelpers.getActiveCampaigns();
  var adsData = [];
  var winnerAlerts = [];

  if (!campaigns.length) {
    return {
      messageText: 'ℹ️ Tidak ada campaign ACTIVE.',
      summary: 'Campaign aktif tidak ditemukan',
      additionalMessages: []
    };
  }

  campaigns.forEach(function (c) {
    var rows = APP.MetaService.getInsightsByLevel({
      campaignId: c.id,
      level: 'ad',
      fields: 'ad_id,ad_name,adset_name,campaign_name,spend,cpm,actions,action_values'
    });

    rows.forEach(function (d) {
      var spend = APP.Util.num(d.spend);
      if (!d.ad_id || spend < minSpend) return;

      var purchase = APP.Util.actionValue(d.actions, 'purchase');
      var revenue = APP.Util.actionValue(d.action_values, 'purchase');
      var profit = revenue - spend;
      var roas = spend > 0 ? revenue / spend : 0;
      var cpr = purchase > 0 ? spend / purchase : spend;

      var adObj = {
        ad_id: d.ad_id,
        campaign: d.campaign_name || c.name,
        adset: d.adset_name || '-',
        ad: d.ad_name || '-',
        spend: spend,
        purchase: purchase,
        revenue: revenue,
        profit: profit,
        roas: roas,
        cpr: cpr,
        cpm: APP.Util.num(d.cpm)
      };

      adsData.push(adObj);

      var winner =
        adObj.spend >= winnerMinSpend &&
        adObj.purchase >= winnerMinBuy &&
        adObj.roas >= winnerMinRoas &&
        adObj.profit > 0;

      if (!winner) return;

      var key = 'WINNER_' + adObj.ad_id;
      if (APP.ReportHandlers._winnerAlreadyAlerted(key)) return;

      winnerAlerts.push(
        '🏆 *WINNER ADS TERDETEKSI*\n\n' +
        'Campaign : *' + adObj.campaign + '*\n' +
        'AdSet    : *' + adObj.adset + '*\n' +
        'Ads      : *' + adObj.ad + '*\n\n' +
        '💸 Spend   : Rp' + APP.Util.rp(adObj.spend) + '\n' +
        '💰 Revenue : Rp' + APP.Util.rp(adObj.revenue) + '\n' +
        '📈 Profit  : Rp' + APP.Util.rp(adObj.profit) + '\n' +
        '📊 ROAS    : ' + adObj.roas.toFixed(2) + '\n' +
        '🎯 CPR     : Rp' + APP.Util.rp(adObj.cpr) + '\n\n' +
        '🚀 *ACTION*\n' +
        '• Scale budget bertahap\n' +
        '• Duplikat ads\n' +
        '• Amankan creative'
      );

      APP.ReportHandlers._winnerMarkAlerted(key);
    });
  });

  if (!adsData.length) {
    return {
      messageText: 'ℹ️ Tidak ada ads memenuhi filter.',
      summary: 'Ads tidak lolos filter',
      additionalMessages: winnerAlerts
    };
  }

  adsData.sort(function (a, b) { return b.profit - a.profit; });
  var topAds = adsData.slice(0, topLimit);

  var report =
    '🏆 *#5. TOP ' + topLimit + ' ADS BY PROFIT*\n\n' +
    '🏦 Account : *' + account.name + '*\n' +
    '🆔 ID      : ' + account.id + '\n' +
    '🕒 ' + APP.Util.formatWIB(new Date()) + '\n\n';

  topAds.forEach(function (a, i) {
    var medal = i === 0 ? '🥇 *BEST*' : (i === 1 ? '🥈 #2' : (i === 2 ? '🥉 #3' : '#' + (i + 1)));
    report +=
      '━━━━━━━━━━━━━━━━━━\n' +
      medal + '\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '*' + a.ad + '*\n' +
      'Campaign : ' + a.campaign + '\n' +
      'AdSet    : ' + a.adset + '\n\n' +
      '💸 Rp' + APP.Util.rp(a.spend) + ' → 💰 Rp' + APP.Util.rp(a.revenue) + '\n' +
      '📈 ' + (a.profit >= 0 ? '+' : '') + 'Rp' + APP.Util.rp(a.profit) + ' | ROAS ' + a.roas.toFixed(2) + '\n' +
      '🎯 CPR Rp' + APP.Util.rp(a.cpr) + ' | CPM Rp' + APP.Util.rp(a.cpm) + '\n' +
      '🛒 Purchase ' + a.purchase + '\n\n';
  });

  return {
    messageText: report,
    summary: 'Top ads ranking selesai. Winner alert baru: ' + winnerAlerts.length,
    additionalMessages: winnerAlerts
  };
};

APP.ReportHandlers._winnerAlreadyAlerted = function (key) {
  var p = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), APP.getAppConfig().timezone, 'yyyy-MM-dd');
  return p.getProperty(key) === today;
};

APP.ReportHandlers._winnerMarkAlerted = function (key) {
  var p = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), APP.getAppConfig().timezone, 'yyyy-MM-dd');
  p.setProperty(key, today);
};
