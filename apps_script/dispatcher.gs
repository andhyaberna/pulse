var APP = APP || {};

function runScheduledReports() {
  return APP.Dispatcher.runScheduledReports();
}

function runManualQueue() {
  return APP.Dispatcher.runManualQueue();
}

function runReportById(reportId) {
  return APP.Dispatcher.runSingleReport(reportId, { source: 'manual_function' });
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Meta Ads App')
    .addItem('Run Semua Report Aktif', 'runScheduledReports')
    .addItem('Proses Manual Queue', 'runManualQueue')
    .addToUi();
}

APP.Dispatcher = {
  runScheduledReports: function () {
    APP.assertRequiredSecrets();

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      var reports = APP.SheetRepository.getActiveReports();
      var results = [];

      reports.forEach(function (reportConfig) {
        var result = APP.Dispatcher.runSingleReport(reportConfig.report_id, {
          source: 'scheduled',
          reportConfig: reportConfig
        });
        results.push(result);
        Utilities.sleep(800);
      });

      return { ok: true, count: results.length, results: results };
    } finally {
      lock.releaseLock();
    }
  },

  runManualQueue: function () {
    var queueRows = APP.SheetRepository.getPendingManualRuns(20);
    var outputs = [];

    queueRows.forEach(function (item) {
      APP.SheetRepository.markManualRunStatus(item._rowNumber, 'PROCESSING');
      try {
        var result = APP.Dispatcher.runSingleReport(item.report_id, { source: 'manual_queue' });
        APP.SheetRepository.markManualRunStatus(item._rowNumber, 'DONE', result.message || 'OK');
        outputs.push(result);
      } catch (err) {
        APP.SheetRepository.markManualRunStatus(item._rowNumber, 'FAILED', err.message);
        outputs.push({ ok: false, report_id: item.report_id, error: err.message });
      }
    });

    return { ok: true, processed: outputs.length, outputs: outputs };
  },

  runSingleReport: function (reportId, options) {
    var opt = options || {};
    var runId = Utilities.getUuid();
    var startedAt = new Date();
    var reportConfig = opt.reportConfig || APP.SheetRepository.getReportById(reportId);

    if (!reportConfig) {
      throw new Error('Report tidak ditemukan: ' + reportId);
    }

    var reportFnName = APP.REPORT_FUNCTION_MAP[reportId];
    var reportFn = APP.ReportHandlers && APP.ReportHandlers[reportFnName];
    if (typeof reportFn !== 'function') {
      throw new Error('Handler report belum tersedia: ' + reportFnName);
    }

    try {
      var thresholdMap = APP.SheetRepository.getThresholdMap(reportId);
      var payload = reportFn({
        reportConfig: reportConfig,
        thresholdMap: thresholdMap,
        source: opt.source || 'manual',
        runId: runId
      });

      var sendResult = APP.TelegramService.broadcastReport(reportId, payload.messageText);
      var extraCount = 0;
      if (payload.additionalMessages && payload.additionalMessages.length) {
        payload.additionalMessages.forEach(function (msg) {
          APP.TelegramService.broadcastReport(reportId, msg);
          extraCount += 1;
          APP.Util.sleep(250);
        });
      }
      var elapsed = new Date().getTime() - startedAt.getTime();

      APP.SheetRepository.appendRunLog({
        timestamp: APP.Util.nowIso(),
        run_id: runId,
        source: opt.source || 'manual',
        report_id: reportId,
        report_name: reportConfig.report_name,
        status: 'SUCCESS',
        message: payload.summary || 'Report terkirim',
        duration_ms: elapsed,
        target_count: sendResult.sentCount,
        error_stack: ''
      });

      return {
        ok: true,
        report_id: reportId,
        run_id: runId,
        message: payload.summary || 'SUCCESS',
        sent_count: sendResult.sentCount,
        extra_message_count: extraCount,
        duration_ms: elapsed
      };
    } catch (err) {
      var elapsedFail = new Date().getTime() - startedAt.getTime();
      APP.SheetRepository.appendRunLog({
        timestamp: APP.Util.nowIso(),
        run_id: runId,
        source: opt.source || 'manual',
        report_id: reportId,
        report_name: reportConfig.report_name,
        status: 'FAILED',
        message: err.message,
        duration_ms: elapsedFail,
        target_count: 0,
        error_stack: err && err.stack ? err.stack : ''
      });
      throw err;
    }
  }
};
