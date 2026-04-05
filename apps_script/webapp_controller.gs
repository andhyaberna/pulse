var APP = APP || {};

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.api === 'status') {
    return APP.Util.jsonResponse({
      ok: true,
      app: 'meta-ads-telegram',
      version: APP.VERSION,
      now: APP.Util.nowIso()
    }, 200);
  }

  var template = HtmlService.createTemplateFromFile('dashboard');
  template.version = APP.VERSION;
  return template.evaluate().setTitle('Meta Ads Report Runner');
}

function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    var action = body.action || 'run-report';

    if (action !== 'run-report') {
      return APP.Util.jsonResponse({ ok: false, message: 'action tidak valid' }, 400);
    }

    APP.WebApi.assertApiKey(body.api_key || '');

    var reportId = body.report_id;
    if (!reportId) {
      return APP.Util.jsonResponse({ ok: false, message: 'report_id wajib diisi' }, 400);
    }

    var result = APP.Dispatcher.runSingleReport(reportId, {
      source: body.source || 'worker'
    });

    return APP.Util.jsonResponse(result, 200);
  } catch (err) {
    return APP.Util.jsonResponse({ ok: false, message: err.message }, 500);
  }
}

function uiGetReportRows(sessionToken) {
  APP.Auth.requireRole(sessionToken, ['admin', 'user']);
  var reports = APP.SheetRepository.getRowsAsObjects(APP.SHEETS.APP_REPORTS);
  var lastRunMap = APP.SheetRepository.getLastRunStatusMap();

  return reports.map(function (r) {
    var status = lastRunMap[r.report_id] || {};
    return {
      report_id: r.report_id,
      report_name: r.report_name,
      is_active: APP.Util.bool(r.is_active),
      schedule_type: r.schedule_type || '-',
      sort_order: APP.Util.num(r.sort_order),
      last_status: status.status || '-',
      last_message: status.message || '-',
      last_timestamp: status.timestamp || '-'
    };
  }).sort(function (a, b) {
    return a.sort_order - b.sort_order;
  });
}

function uiRunReport(reportId, sessionToken) {
  APP.Auth.requireRole(sessionToken, ['admin']);
  return APP.Dispatcher.runSingleReport(reportId, { source: 'manual_ui' });
}

function uiQueueReport(reportId, note, sessionToken) {
  var session = APP.Auth.requireRole(sessionToken, ['admin']);
  var queueId = APP.SheetRepository.enqueueManualRun(reportId, session.email || 'manual_ui', note || '');
  return { ok: true, queue_id: queueId };
}

function uiRegister(input) {
  return APP.Auth.register(input || {});
}

function uiLogin(input) {
  return APP.Auth.login(input || {});
}

function uiLogout(sessionToken) {
  APP.Auth.clearSession(sessionToken);
  return { ok: true, message: 'Logout berhasil' };
}

function uiGetSession(sessionToken) {
  var session = APP.Auth.getSession(sessionToken);
  if (!session) {
    return { ok: false, user: null };
  }
  return { ok: true, user: session };
}

function uiGetIntegrationConfig(sessionToken) {
  APP.Auth.requireRole(sessionToken, ['admin']);
  return APP.IntegrationConfig.getViewModel();
}

function uiSaveIntegrationConfig(input, sessionToken) {
  APP.Auth.requireRole(sessionToken, ['admin']);
  return APP.IntegrationConfig.saveFromInput(input || {});
}

APP.WebApi = {
  assertApiKey: function (inputKey) {
    var key = APP.getAppConfig().webhookApiKey;
    if (!key) {
      throw new Error('WEBHOOK_API_KEY belum di-set di Script Properties');
    }
    if (String(inputKey) !== String(key)) {
      throw new Error('api_key tidak valid');
    }
  }
};
