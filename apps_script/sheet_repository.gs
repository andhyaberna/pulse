var APP = APP || {};

APP.SheetRepository = {
  getSpreadsheet: function () {
    var cfg = APP.getAppConfig();
    if (!cfg.spreadsheetId) {
      throw new Error('TARGET_SHEET_ID belum di-set di Script Properties');
    }
    return SpreadsheetApp.openById(cfg.spreadsheetId);
  },

  getSheetOrThrow: function (sheetName) {
    var sheet = APP.SheetRepository.getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('Sheet tidak ditemukan: ' + sheetName);
    }
    return sheet;
  },

  getRowsAsObjects: function (sheetName) {
    var sheet = APP.SheetRepository.getSheetOrThrow(sheetName);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];

    var headers = values[0].map(function (h) {
      return String(h || '').trim();
    });

    return values.slice(1).map(function (row, index) {
      var obj = { _rowNumber: index + 2 };
      headers.forEach(function (header, i) {
        obj[header] = row[i];
      });
      return obj;
    });
  },

  getActiveReports: function () {
    return APP.SheetRepository.getRowsAsObjects(APP.SHEETS.APP_REPORTS)
      .filter(function (r) { return APP.Util.bool(r.is_active); })
      .sort(function (a, b) {
        return APP.Util.num(a.sort_order) - APP.Util.num(b.sort_order);
      });
  },

  getReportById: function (reportId) {
    var list = APP.SheetRepository.getRowsAsObjects(APP.SHEETS.APP_REPORTS);
    return list.find(function (r) { return String(r.report_id) === String(reportId); }) || null;
  },

  getThresholdMap: function (reportId) {
    var rows = APP.SheetRepository.getRowsAsObjects(APP.SHEETS.REPORT_THRESHOLDS)
      .filter(function (r) {
        return String(r.report_id) === String(reportId) && APP.Util.bool(r.is_active);
      });

    var map = {};
    rows.forEach(function (r) {
      map[String(r.threshold_key)] = APP.Util.num(r.threshold_value);
    });
    return map;
  },

  getTelegramTargetsForReport: function (reportId) {
    return APP.SheetRepository.getRowsAsObjects(APP.SHEETS.TELEGRAM_TARGETS)
      .filter(function (r) {
        if (!APP.Util.bool(r.is_active)) return false;
        var targetReport = String(r.report_id || '').trim();
        return targetReport === 'ALL' || targetReport === String(reportId);
      });
  },

  appendRunLog: function (entry) {
    var sheet = APP.SheetRepository.getSheetOrThrow(APP.SHEETS.RUN_LOGS);
    sheet.appendRow([
      entry.timestamp || APP.Util.nowIso(),
      entry.run_id || '',
      entry.source || '',
      entry.report_id || '',
      entry.report_name || '',
      entry.status || '',
      entry.message || '',
      entry.duration_ms || 0,
      entry.target_count || 0,
      entry.error_stack || ''
    ]);
  },

  enqueueManualRun: function (reportId, requestedBy, note) {
    var sheet = APP.SheetRepository.getSheetOrThrow(APP.SHEETS.MANUAL_RUN_QUEUE);
    var queueId = Utilities.getUuid();
    sheet.appendRow([
      queueId,
      reportId,
      requestedBy || 'ui',
      'PENDING',
      APP.Util.nowIso(),
      '',
      note || ''
    ]);
    return queueId;
  },

  getPendingManualRuns: function (limit) {
    var max = APP.Util.num(limit) || 10;
    return APP.SheetRepository.getRowsAsObjects(APP.SHEETS.MANUAL_RUN_QUEUE)
      .filter(function (r) { return String(r.status) === 'PENDING'; })
      .slice(0, max);
  },

  markManualRunStatus: function (rowNumber, status, note) {
    var sheet = APP.SheetRepository.getSheetOrThrow(APP.SHEETS.MANUAL_RUN_QUEUE);
    sheet.getRange(rowNumber, 4).setValue(status);
    sheet.getRange(rowNumber, 6).setValue(APP.Util.nowIso());
    if (note) {
      sheet.getRange(rowNumber, 7).setValue(note);
    }
  },

  getLastRunStatusMap: function () {
    var logs = APP.SheetRepository.getRowsAsObjects(APP.SHEETS.RUN_LOGS);
    var map = {};
    logs.forEach(function (row) {
      var id = String(row.report_id || '');
      if (!id) return;
      map[id] = {
        timestamp: row.timestamp,
        status: row.status,
        message: row.message,
        source: row.source
      };
    });
    return map;
  }
};
