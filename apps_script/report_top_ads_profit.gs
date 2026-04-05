var APP = APP || {};
APP.ReportHandlers = APP.ReportHandlers || {};

APP.ReportHandlers.runReportTopAdsProfit = function (ctx) {
  var threshold = ctx.thresholdMap || {};
  var minSpend = APP.ReportHelpers.getThreshold(threshold, 'MIN_SPEND', 10000);
  var topLimit = APP.ReportHelpers.getThreshold(threshold, 'TOP_LIMIT', 10);

  var acc = APP.ReportHelpers.getAccountInfoSafe();
  var campaigns = APP.ReportHelpers.getActiveCampaigns();

  if (!campaigns.length) {
    return {
      messageText: 'ℹ️ Tidak ada campaign ACTIVE.',
      summary: 'Campaign aktif tidak ditemukan'
    };
  }

  var ads = [];

  campaigns.forEach(function (c) {
    var rows = APP.MetaService.getInsightsByLevel({
      campaignId: c.id,
      level: 'ad',
      fields: 'ad_name,adset_name,campaign_name,spend,ctr,cpm,actions,action_values'
    });

    rows.forEach(function (d) {
      var spend = APP.Util.num(d.spend);
      if (spend < minSpend) return;

      var purchase = APP.Util.actionValue(d.actions, 'purchase');
      var revenue = APP.Util.actionValue(d.action_values, 'purchase');
      var profit = revenue - spend;
      if (profit <= 0) return;

      ads.push({
        ad: d.ad_name || '-',
        adset: d.adset_name || '-',
        campaign: d.campaign_name || c.name,
        spend: spend,
        revenue: revenue,
        profit: profit,
        roas: spend > 0 ? revenue / spend : 0,
        ctr: APP.Util.num(d.ctr),
        cpm: APP.Util.num(d.cpm),
        purchase: purchase
      });
    });
  });

  if (!ads.length) {
    return {
      messageText: 'ℹ️ Tidak ada ads PROFITABLE hari ini.',
      summary: 'Ads profitable tidak ditemukan'
    };
  }

  ads.sort(function (a, b) { return b.profit - a.profit; });
  var topAds = ads.slice(0, topLimit);

  var report =
    '🏆 *#4. META ADS — TOP ADS PERFORMANCE*\n\n' +
    '🏢 Account : *' + acc.name + '*\n' +
    '🆔 ID      : ' + acc.id + '\n' +
    '🕒 ' + APP.Util.formatWIB(new Date()) + '\n\n';

  topAds.forEach(function (a, i) {
    var medal = i === 0 ? '🥇 *TOP PROFIT*' : (i === 1 ? '🥈 #2' : (i === 2 ? '🥉 #3' : '#' + (i + 1)));

    report +=
      '━━━━━━━━━━━━━━━━━━\n' +
      medal + '\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '*' + a.ad + '*\n\n' +
      '💸 Spend   : Rp' + APP.Util.rp(a.spend) + '\n' +
      '💰 Revenue : Rp' + APP.Util.rp(a.revenue) + '\n' +
      '📈 Profit  : Rp' + APP.Util.rp(a.profit) + ' | ROAS ' + a.roas.toFixed(2) + '\n\n' +
      '🧲 CTR ' + a.ctr.toFixed(2) + '% | CPM Rp' + APP.Util.rp(a.cpm) + '\n' +
      '🛒 Purchase ' + a.purchase + '\n\n' +
      'Campaign : ' + a.campaign + '\n' +
      'AdSet    : ' + a.adset + '\n\n';
  });

  return {
    messageText: report,
    summary: 'Top ads terkirim: ' + topAds.length
  };
};
