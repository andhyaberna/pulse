var APP = APP || {};
APP.ReportHandlers = APP.ReportHandlers || {};

APP.ReportHandlers.runReportCreativeFatigue = function (ctx) {
  var threshold = ctx.thresholdMap || {};
  var spendNoPurchase = APP.ReportHelpers.getThreshold(threshold, 'SPEND_NO_PURCHASE', 30000);
  var fatigueMinSpend = APP.ReportHelpers.getThreshold(threshold, 'FATIGUE_MIN_SPEND', 30000);
  var fatigueCtrMax = APP.ReportHelpers.getThreshold(threshold, 'FATIGUE_CTR_MAX', 0.8);
  var fatigueCpmMin = APP.ReportHelpers.getThreshold(threshold, 'FATIGUE_CPM_MIN', 50000);
  var scaleRoasMin = APP.ReportHelpers.getThreshold(threshold, 'SCALE_ROAS_MIN', 1.5);
  var scaleCtrMin = APP.ReportHelpers.getThreshold(threshold, 'SCALE_CTR_MIN', 2.0);
  var pauseRoasMax = APP.ReportHelpers.getThreshold(threshold, 'PAUSE_ROAS_MAX', 1.0);
  var cpmSpike = APP.ReportHelpers.getThreshold(threshold, 'CPM_SPIKE', 100000);

  var account = APP.ReportHelpers.getAccountInfoSafe();
  var campaigns = APP.ReportHelpers.getActiveCampaigns();

  if (!campaigns.length) {
    return {
      messageText: 'ℹ️ Tidak ada campaign ACTIVE / CONFIG belum lengkap.',
      summary: 'Campaign aktif tidak ditemukan'
    };
  }

  var report =
    '📊 *#7 META ADS — CREATIVE FATIGUE REPORT*\n' +
    '🏦 Account : *' + account.name + '*\n' +
    '🆔 ID      : ' + account.id + '\n' +
    '🕒 ' + APP.Util.formatWIB(new Date()) + '\n\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '🎯 *CAMPAIGN SNAPSHOT*\n' +
    '━━━━━━━━━━━━━━━━━━\n';

  var tSpend = 0;
  var tRev = 0;
  var tProfit = 0;

  campaigns.forEach(function (c) {
    var rows = APP.MetaService.getInsightsByLevel({
      campaignId: c.id,
      level: 'campaign',
      fields: 'spend,ctr,cpm,actions,action_values'
    });

    if (!rows.length) return;

    var d = rows[0] || {};
    var spend = APP.Util.num(d.spend);
    if (spend < 10000) return;

    var ctr = APP.Util.num(d.ctr);
    var cpm = APP.Util.num(d.cpm);

    var buy = APP.Util.actionValue(d.actions, 'purchase');
    var rev = APP.Util.actionValue(d.action_values, 'purchase');
    var profit = rev - spend;
    var roas = spend > 0 ? rev / spend : 0;

    tSpend += spend;
    tRev += rev;
    tProfit += profit;

    var status = '🟢';
    if (profit <= 0 || roas < 1) status = '🟡';
    if (spend >= spendNoPurchase && buy === 0) status = '🔴';

    var suggest = APP.ReportHandlers._creativeAutoSuggest({
      spend: spend,
      purchase: buy,
      profit: profit,
      roas: roas,
      ctr: ctr,
      cpm: cpm
    }, {
      spendNoPurchase: spendNoPurchase,
      fatigueMinSpend: fatigueMinSpend,
      fatigueCtrMax: fatigueCtrMax,
      fatigueCpmMin: fatigueCpmMin,
      scaleRoasMin: scaleRoasMin,
      scaleCtrMin: scaleCtrMin,
      pauseRoasMax: pauseRoasMax,
      cpmSpike: cpmSpike
    });

    report +=
      status + ' *' + c.name + '*\n' +
      '💸 Rp' + APP.Util.rp(spend) + ' | 💰 Rp' + APP.Util.rp(rev) + ' | ' + (profit >= 0 ? '📈' : '📉') + ' ' + (profit >= 0 ? '+' : '') + 'Rp' + APP.Util.rp(profit) + '\n' +
      'ROAS ' + roas.toFixed(2) + ' | CTR ' + ctr.toFixed(2) + '% | CPM Rp' + APP.Util.rp(cpm) + '\n' +
      '👉 *' + suggest.label + '* — ' + suggest.reason + '\n\n';
  });

  report +=
    '━━━━━━━━━━━━━━━━━━\n' +
    '📌 *RINGKASAN AKUN*\n' +
    '━━━━━━━━━━━━━━━━━━\n' +
    '💸 Spend   : Rp' + APP.Util.rp(tSpend) + '\n' +
    '💰 Revenue : Rp' + APP.Util.rp(tRev) + '\n' +
    '📈 Profit  : Rp' + APP.Util.rp(tProfit);

  return {
    messageText: report,
    summary: 'Creative fatigue selesai. Spend total Rp' + APP.Util.rp(tSpend)
  };
};

APP.ReportHandlers._creativeAutoSuggest = function (d, cfg) {
  if (d.spend >= cfg.spendNoPurchase && (d.purchase === 0 || d.roas < cfg.pauseRoasMax)) {
    return { label: '🔴 PAUSE', reason: 'Spend jalan tapi tidak menghasilkan' };
  }

  if (d.spend >= cfg.fatigueMinSpend && d.ctr < cfg.fatigueCtrMax && d.cpm >= cfg.fatigueCpmMin) {
    return { label: '🧠 REFRESH CREATIVE', reason: 'CTR turun & CPM naik (fatigue)' };
  }

  if (d.roas >= cfg.scaleRoasMin && d.profit > 0 && d.ctr >= cfg.scaleCtrMin && d.cpm < cfg.cpmSpike) {
    return { label: '🟢 SCALE', reason: 'ROAS & profit kuat' };
  }

  return { label: '⏸ HOLD', reason: 'Data belum cukup kuat' };
};
