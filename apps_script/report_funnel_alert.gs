var APP = APP || {};
APP.ReportHandlers = APP.ReportHandlers || {};

APP.ReportHandlers.runReportFunnelAlert = function (ctx) {
  var threshold = ctx.thresholdMap || {};
  var minSpend = APP.ReportHelpers.getThreshold(threshold, 'MIN_SPEND', 10000);
  var cpmSpike = APP.ReportHelpers.getThreshold(threshold, 'CPM_SPIKE', 10000);
  var ctrLow = APP.ReportHelpers.getThreshold(threshold, 'CTR_LOW', 2);

  var account = APP.ReportHelpers.getAccountInfoSafe();
  var campaigns = APP.ReportHelpers.getActiveCampaigns();
  var extraAlerts = [];

  if (!campaigns.length) {
    return {
      messageText: 'ℹ️ Tidak ada campaign ACTIVE atau CONFIG belum diisi.',
      summary: 'Campaign aktif tidak ditemukan',
      additionalMessages: []
    };
  }

  var report =
    '📊 *#6. META ADS — FUNNEL & QUALITY*\n\n' +
    '🏦 Account : *' + account.name + '*\n' +
    '🆔 ID      : ' + account.id + '\n' +
    '🕒 ' + APP.Util.formatWIB(new Date()) + '\n\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '🎯 *CAMPAIGN SNAPSHOT*\n' +
    '━━━━━━━━━━━━━━━━━━\n';

  var g = 0;
  var y = 0;
  var r = 0;
  var spendT = 0;
  var revT = 0;
  var profitT = 0;

  campaigns.forEach(function (c) {
    var rows = APP.MetaService.getInsightsByLevel({
      campaignId: c.id,
      level: 'campaign',
      fields: 'spend,ctr,cpm,actions,action_values'
    });

    if (!rows.length) return;
    var d = rows[0] || {};

    var spend = APP.Util.num(d.spend);
    if (spend < minSpend) return;

    var ctr = APP.Util.num(d.ctr);
    var cpm = APP.Util.num(d.cpm);

    var atc = APP.Util.actionValue(d.actions, 'add_to_cart');
    var ic = APP.Util.actionValue(d.actions, 'initiate_checkout');
    var purchase = APP.Util.actionValue(d.actions, 'purchase');
    var revenue = APP.Util.actionValue(d.action_values, 'purchase');

    var profit = revenue - spend;
    var roas = spend > 0 ? revenue / spend : 0;
    var cpr = purchase > 0 ? spend / purchase : spend;

    spendT += spend;
    revT += revenue;
    profitT += profit;

    var status = '🟢';
    if (profit <= 0 || roas < 1) status = '🟡';
    if (spend >= 30000 && purchase === 0) status = '🔴';

    if (status === '🟢') g += 1;
    if (status === '🟡') y += 1;
    if (status === '🔴') r += 1;

    report +=
      status + ' *' + c.name + '*\n' +
      '💸 Rp' + APP.Util.rp(spend) + ' → 💰 Rp' + APP.Util.rp(revenue) + ' | ' + (profit >= 0 ? '📈' : '📉') + ' ' + (profit >= 0 ? '+' : '') + 'Rp' + APP.Util.rp(profit) + '\n' +
      'ROAS ' + roas.toFixed(2) + ' | CTR ' + ctr.toFixed(2) + '% | CPM Rp' + APP.Util.rp(cpm) + '\n\n';

    var perfAlerts = [];
    if (atc >= 10 && ic === 0) perfAlerts.push('ATC tinggi tapi IC = 0');
    if (ic >= 5 && purchase === 0) perfAlerts.push('IC ada tapi belum purchase');
    if (spend >= 30000 && purchase === 0) perfAlerts.push('Spend ≥ 30rb tanpa purchase');
    if (cpr >= 70000) perfAlerts.push('CPR ≥ 70rb');
    if (spend >= 300000 && roas < 1) perfAlerts.push('Spend besar tapi ROAS < 1');

    if (perfAlerts.length) {
      extraAlerts.push(
        '🚨 *FUNNEL ALERT — PERFORMANCE*\n' +
        '🏦 *' + account.name + '*\n' +
        '🆔 ' + account.id + '\n\n' +
        '🔥 *' + c.name + '*\n\n' +
        '• ' + perfAlerts.join('\n• ') + '\n\n' +
        '⚡️ Segera evaluasi funnel & budget.'
      );
    }

    var qualityAlerts = [];
    if (cpm >= cpmSpike) qualityAlerts.push('CPM tinggi (Rp' + APP.Util.rp(cpm) + ')');
    if (ctr < ctrLow) qualityAlerts.push('CTR rendah (' + ctr.toFixed(2) + '%)');

    if (qualityAlerts.length) {
      extraAlerts.push(
        '🚨 *FUNNEL ALERT — QUALITY*\n' +
        '🏦 *' + account.name + '*\n' +
        '🆔 ' + account.id + '\n\n' +
        '🔥 *' + c.name + '*\n\n' +
        '• ' + qualityAlerts.join('\n• ') + '\n\n' +
        '🧠 *Analisa Cepat*\n' +
        '• Creative mulai jenuh\n' +
        '• Hook gagal stop scroll\n' +
        '• Audience kurang relevan\n\n' +
        '⚡️ *Action*\n' +
        '• Ganti hook / opening\n' +
        '• Test creative baru\n' +
        '• Expand audience\n' +
        '• Turunkan budget sementara'
      );
    }
  });

  report +=
    '━━━━━━━━━━━━━━━━━━\n' +
    '📌 *RINGKASAN AKUN*\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '🟢 Untung  : ' + g + '\n' +
    '🟡 Warning : ' + y + '\n' +
    '🔴 Bahaya  : ' + r + '\n' +
    '💸 Spend   : Rp' + APP.Util.rp(spendT) + '\n' +
    '💰 Revenue : Rp' + APP.Util.rp(revT) + '\n' +
    '📈 Profit  : Rp' + APP.Util.rp(profitT);

  return {
    messageText: report,
    summary: 'Funnel report selesai. Alert tambahan: ' + extraAlerts.length,
    additionalMessages: extraAlerts
  };
};
