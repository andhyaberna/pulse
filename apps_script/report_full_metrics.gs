var APP = APP || {};
APP.ReportHandlers = APP.ReportHandlers || {};

APP.ReportHandlers.runReportFullMetrics = function (ctx) {
  var threshold = ctx.thresholdMap || {};
  var minSpend = APP.ReportHelpers.getThreshold(threshold, 'MIN_SPEND', 10000);
  var ctrLow = APP.ReportHelpers.getThreshold(threshold, 'CTR_LOW', 1);

  var campaigns = APP.ReportHelpers.getActiveCampaigns();
  if (!campaigns.length) {
    return {
      messageText: 'ℹ️ Tidak ada campaign ACTIVE.',
      summary: 'Campaign aktif tidak ditemukan'
    };
  }

  var acc = APP.ReportHelpers.getAccountInfoSafe();
  var report =
    '📊 *#1. META ADS INTELLIGENCE REPORT*\n\n' +
    '🏢 Account : *' + acc.name + '*\n' +
    '🆔 ID      : ' + acc.id + '\n' +
    '🕒 ' + APP.Util.formatWIB(new Date()) + '\n\n';

  var tSpend = 0;
  var tRev = 0;
  var tProfit = 0;

  campaigns.forEach(function (c) {
    var rows = APP.MetaService.getInsightsByLevel({
      campaignId: c.id,
      level: 'campaign',
      fields: 'spend,impressions,reach,frequency,ctr,cpc,cpm,actions,action_values'
    });

    if (!rows.length) return;
    var d = rows[0];

    var spend = APP.Util.num(d.spend);
    if (spend < minSpend) return;

    var impressions = APP.Util.num(d.impressions);
    var reach = APP.Util.num(d.reach);
    var freq = APP.Util.num(d.frequency);
    var ctr = APP.Util.num(d.ctr);
    var cpm = APP.Util.num(d.cpm);
    var cpc = APP.Util.num(d.cpc);

    var clicks = APP.Util.actionValue(d.actions, 'link_click');
    var atc = APP.Util.actionValue(d.actions, 'add_to_cart');
    var ic = APP.Util.actionValue(d.actions, 'initiate_checkout');
    var purchase = APP.Util.actionValue(d.actions, 'purchase');
    var revenue = APP.Util.actionValue(d.action_values, 'purchase');

    var profit = revenue - spend;
    var roas = spend > 0 ? revenue / spend : 0;
    var cpr = purchase > 0 ? spend / purchase : spend;
    var cvr = clicks > 0 ? (purchase / clicks) * 100 : 0;

    tSpend += spend;
    tRev += revenue;
    tProfit += profit;

    var dec = APP.ReportHandlers._fullMetricsDecision({
      roas: roas,
      purchase: purchase,
      ctr: ctr,
      ctrLow: ctrLow
    });

    report +=
      '━━━━━━━━━━━━━━━━━━\n' +
      '🎯 *' + c.name + '*\n' +
      '━━━━━━━━━━━━━━━━━━\n' +
      '💸 Spend      : Rp' + APP.Util.rp(spend) + '\n' +
      '💰 Revenue    : Rp' + APP.Util.rp(revenue) + '\n' +
      '📈 Profit     : Rp' + APP.Util.rp(profit) + '\n' +
      '📊 ROAS       : ' + roas.toFixed(2) + '\n\n' +
      '👁 Impr       : ' + APP.Util.rp(impressions) + '\n' +
      '🎯 Reach      : ' + APP.Util.rp(reach) + '\n' +
      '🔁 Freq       : ' + freq.toFixed(2) + '\n' +
      '📉 CPM        : Rp' + APP.Util.rp(cpm) + '\n\n' +
      '🖱 Click      : ' + APP.Util.rp(clicks) + '\n' +
      '📊 CTR        : ' + ctr.toFixed(2) + '%\n' +
      '💰 CPC        : Rp' + APP.Util.rp(cpc) + '\n\n' +
      '🛒 ATC        : ' + atc + '\n' +
      '📦 IC         : ' + ic + '\n' +
      '✅ Purchase   : ' + purchase + '\n' +
      '🎯 CPR        : Rp' + APP.Util.rp(cpr) + '\n' +
      '📈 CVR        : ' + cvr.toFixed(2) + '%\n\n' +
      '➡️ *' + dec.label + '* — ' + dec.plan + '\n\n';
  });

  var summaryRoas = tSpend > 0 ? (tRev / tSpend) : 0;
  report +=
    '━━━━━━━━━━━━━━━━━━\n' +
    '📌 *ACCOUNT SUMMARY*\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '💸 Spend   : Rp' + APP.Util.rp(tSpend) + '\n' +
    '💰 Revenue : Rp' + APP.Util.rp(tRev) + '\n' +
    '📈 Profit  : Rp' + APP.Util.rp(tProfit) + '\n' +
    '📊 ROAS    : ' + summaryRoas.toFixed(2);

  return {
    messageText: report,
    summary: 'Full metrics selesai. Spend total Rp' + APP.Util.rp(tSpend)
  };
};

APP.ReportHandlers._fullMetricsDecision = function (d) {
  if (d.roas >= 2 && d.purchase >= 2) {
    return { label: '🚀 SCALE', plan: '+20% budget' };
  }

  if (d.roas >= 1 && d.purchase > 0) {
    return { label: '🟢 SMALL SCALE', plan: '+10–15%' };
  }

  if (d.roas < 1 && d.ctr >= d.ctrLow) {
    return { label: '🟡 OPTIMIZE', plan: 'Improve efficiency' };
  }

  if (d.roas < 1 && d.ctr < d.ctrLow) {
    return { label: '🔴 KILL', plan: 'Pause campaign' };
  }

  return { label: '⚪ HOLD', plan: 'Collect more data' };
};
