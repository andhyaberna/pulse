var APP = APP || {};
APP.ReportHandlers = APP.ReportHandlers || {};

APP.ReportHandlers.runReportAdsetBreakdown = function (ctx) {
  var threshold = ctx.thresholdMap || {};
  var minSpend = APP.ReportHelpers.getThreshold(threshold, 'MIN_SPEND', 10000);

  var acc = APP.ReportHelpers.getAccountInfoSafe();
  var campaigns = APP.ReportHelpers.getActiveCampaigns();

  if (!campaigns.length) {
    return {
      messageText: 'ℹ️ Tidak ada campaign ACTIVE.',
      summary: 'Campaign aktif tidak ditemukan'
    };
  }

  var report =
    '📊 *#2. META ADS — ADSET BREAKDOWN*\n\n' +
    '🏢 Account : *' + acc.name + '*\n' +
    '🆔 ID      : ' + acc.id + '\n' +
    '🕒 ' + APP.Util.formatWIB(new Date()) + '\n\n';

  var g = 0;
  var y = 0;
  var r = 0;
  var tSpend = 0;
  var tRev = 0;
  var tProfit = 0;

  campaigns.forEach(function (c) {
    var rows = APP.MetaService.getInsightsByLevel({
      campaignId: c.id,
      level: 'adset',
      fields: 'adset_name,spend,impressions,reach,frequency,ctr,cpc,cpm,actions,action_values'
    });

    if (!rows.length) return;

    report +=
      '━━━━━━━━━━━━━━━━━━\n' +
      '🎯 *Campaign: ' + c.name + '*\n' +
      '━━━━━━━━━━━━━━━━━━\n';

    rows.forEach(function (d) {
      var spend = APP.Util.num(d.spend);
      if (spend < minSpend) return;

      var impressions = APP.Util.num(d.impressions);
      var reach = APP.Util.num(d.reach);
      var freq = APP.Util.num(d.frequency);
      var ctr = APP.Util.num(d.ctr);
      var cpm = APP.Util.num(d.cpm);
      var cpc = APP.Util.num(d.cpc);

      var atc = APP.Util.actionValue(d.actions, 'add_to_cart');
      var ic = APP.Util.actionValue(d.actions, 'initiate_checkout');
      var purchase = APP.Util.actionValue(d.actions, 'purchase');
      var revenue = APP.Util.actionValue(d.action_values, 'purchase');

      var profit = revenue - spend;
      var roas = spend > 0 ? revenue / spend : 0;
      var cpr = purchase > 0 ? spend / purchase : spend;

      tSpend += spend;
      tRev += revenue;
      tProfit += profit;

      var status = APP.ReportHandlers._adsetStatus({
        spend: spend,
        purchase: purchase,
        profit: profit,
        roas: roas
      });

      if (status === '🟢') g += 1;
      if (status === '🟡') y += 1;
      if (status === '🔴') r += 1;

      report +=
        status + ' *' + (d.adset_name || '-') + '*\n' +
        '💸 Spend    : Rp' + APP.Util.rp(spend) + '\n' +
        '💰 Revenue  : Rp' + APP.Util.rp(revenue) + '\n' +
        '📈 Profit   : Rp' + APP.Util.rp(profit) + ' | ROAS ' + roas.toFixed(2) + '\n\n' +
        '👁 Impr     : ' + APP.Util.rp(impressions) + '\n' +
        '🎯 Reach    : ' + APP.Util.rp(reach) + '\n' +
        '🔁 Freq     : ' + freq.toFixed(2) + '\n' +
        '📉 CPM      : Rp' + APP.Util.rp(cpm) + '\n\n' +
        '🖱 CTR      : ' + ctr.toFixed(2) + '%\n' +
        '💰 CPC      : Rp' + APP.Util.rp(cpc) + '\n\n' +
        '🛒 ATC ' + atc + ' → IC ' + ic + ' → BUY ' + purchase + '\n' +
        '🎯 CPR      : Rp' + APP.Util.rp(cpr) + '\n\n';
    });
  });

  report +=
    '━━━━━━━━━━━━━━━━━━\n' +
    '📌 *ACCOUNT SUMMARY*\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '🟢 Profit  : ' + g + '\n' +
    '🟡 Warning : ' + y + '\n' +
    '🔴 Danger  : ' + r + '\n' +
    '💸 Spend   : Rp' + APP.Util.rp(tSpend) + '\n' +
    '💰 Revenue : Rp' + APP.Util.rp(tRev) + '\n' +
    '📈 Profit  : Rp' + APP.Util.rp(tProfit);

  return {
    messageText: report,
    summary: 'Adset breakdown selesai. Total adset status: ' + (g + y + r)
  };
};

APP.ReportHandlers._adsetStatus = function (obj) {
  if (obj.spend >= 30000 && obj.purchase === 0) return '🔴';
  if (obj.profit <= 0 || obj.roas < 1) return '🟡';
  return '🟢';
};
