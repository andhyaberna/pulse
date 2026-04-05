var APP = APP || {};
APP.ReportHandlers = APP.ReportHandlers || {};

APP.ReportHandlers.runReportAdsetPerformance = function (ctx) {
  var threshold = ctx.thresholdMap || {};
  var minSpend = APP.ReportHelpers.getThreshold(threshold, 'MIN_SPEND', 10000);
  var cprHigh = APP.ReportHelpers.getThreshold(threshold, 'CPR_HIGH', 70000);

  var acc = APP.ReportHelpers.getAccountInfoSafe();
  var campaigns = APP.ReportHelpers.getActiveCampaigns();
  var extraAlerts = [];

  if (!campaigns.length) {
    return {
      messageText: 'ℹ️ Tidak ada campaign ACTIVE.',
      summary: 'Campaign aktif tidak ditemukan',
      additionalMessages: []
    };
  }

  var report =
    '📊 *#3. META ADS — ADSET PERFORMANCE*\n\n' +
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
      fields: 'adset_name,spend,ctr,cpm,cpc,actions,action_values'
    });

    if (!rows.length) return;

    report +=
      '━━━━━━━━━━━━━━━━━━\n' +
      '🎯 *Campaign: ' + c.name + '*\n' +
      '━━━━━━━━━━━━━━━━━━\n';

    rows.forEach(function (d) {
      var spend = APP.Util.num(d.spend);
      if (spend < minSpend) return;

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

      var status = '🟢';
      if (profit <= 0 || roas < 1) status = '🟡';
      if (spend >= 30000 && purchase === 0) status = '🔴';

      if (status === '🟢') g += 1;
      if (status === '🟡') y += 1;
      if (status === '🔴') r += 1;

      report +=
        status + ' *' + (d.adset_name || '-') + '*\n' +
        '💸 Spend   : Rp' + APP.Util.rp(spend) + '\n' +
        '💰 Revenue : Rp' + APP.Util.rp(revenue) + '\n' +
        '📈 Profit  : Rp' + APP.Util.rp(profit) + ' | ROAS ' + roas.toFixed(2) + '\n\n' +
        '🧲 CTR ' + ctr.toFixed(2) + '% | CPM Rp' + APP.Util.rp(cpm) + ' | CPC Rp' + APP.Util.rp(cpc) + '\n' +
        '🛒 ATC ' + atc + ' → IC ' + ic + ' → BUY ' + purchase + '\n' +
        '🎯 CPR Rp' + APP.Util.rp(cpr) + '\n\n';

      var alerts = [];
      if (atc >= 10 && ic === 0) alerts.push('ATC tinggi tapi IC = 0');
      if (ic >= 5 && purchase === 0) alerts.push('IC ada tapi belum purchase');
      if (spend >= 30000 && purchase === 0) alerts.push('Spend jalan tanpa hasil');
      if (cpr >= cprHigh) alerts.push('CPR mahal');
      if (cpm >= 100000) alerts.push('CPM tinggi (auction / audience)');
      if (ctr < 1) alerts.push('CTR rendah (creative lemah)');

      if (alerts.length) {
        var msg =
          '🚨 *FUNNEL ALERT — ADSET*\n' +
          '🔥 Campaign : *' + c.name + '*\n' +
          '🧩 Adset    : *' + (d.adset_name || '-') + '*\n\n' +
          '• ' + alerts.join('\n• ') + '\n\n' +
          '⚡️ *Action:* evaluasi creative & audience.';
        extraAlerts.push(msg);
      }
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
    '💰 Omzet   : Rp' + APP.Util.rp(tRev) + '\n' +
    '📈 Profit  : Rp' + APP.Util.rp(tProfit);

  return {
    messageText: report,
    summary: 'Adset performance selesai. Alert tambahan: ' + extraAlerts.length,
    additionalMessages: extraAlerts
  };
};
