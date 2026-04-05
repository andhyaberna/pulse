var APP = APP || {};

APP.IntegrationConfig = {
  getMasked: function (value, head, tail) {
    var v = String(value || '');
    if (!v) return '';
    var h = APP.Util.num(head) || 4;
    var t = APP.Util.num(tail) || 4;
    if (v.length <= h + t) return '***';
    return v.slice(0, h) + '...' + v.slice(v.length - t);
  },

  parseChatIds: function (raw) {
    var text = String(raw || '').trim();
    if (!text) return [];

    var parts = text.split(/[\n,]+/)
      .map(function (x) { return String(x || '').trim(); })
      .filter(function (x) { return x.length > 0; });

    var cleaned = [];
    var seen = {};

    parts.forEach(function (p) {
      if (!/^-?\d+$/.test(p)) {
        throw new Error('CHAT_IDS harus angka, pisahkan dengan koma atau baris baru. Invalid: ' + p);
      }
      if (!seen[p]) {
        cleaned.push(p);
        seen[p] = true;
      }
    });

    return cleaned;
  },

  normalizeAdAccountId: function (value) {
    var input = String(value || '').trim();
    if (!input) throw new Error('AD_ACCOUNT_ID wajib diisi');

    if (/^act_\d+$/.test(input)) return input;
    if (/^\d+$/.test(input)) return 'act_' + input;
    throw new Error('Format AD_ACCOUNT_ID tidak valid. Contoh: act_123456789');
  },

  getDefaultChatIds: function () {
    var rows = APP.SheetRepository.getRowsAsObjects(APP.SHEETS.TELEGRAM_TARGETS);

    var cfgRows = rows.filter(function (r) {
      return APP.Util.bool(r.is_active) && String(r.target_id || '').indexOf(APP.CONFIG_TARGET_PREFIX) === 0;
    });

    if (cfgRows.length > 0) {
      return cfgRows.map(function (r) { return String(r.chat_id || '').trim(); }).filter(Boolean);
    }

    var fallback = rows.filter(function (r) {
      return APP.Util.bool(r.is_active) && String(r.report_id || '') === 'ALL';
    });
    return fallback.map(function (r) { return String(r.chat_id || '').trim(); }).filter(Boolean);
  },

  upsertDefaultChatTargets: function (chatIds) {
    var sheet = APP.SheetRepository.getSheetOrThrow(APP.SHEETS.TELEGRAM_TARGETS);
    var rows = APP.SheetRepository.getRowsAsObjects(APP.SHEETS.TELEGRAM_TARGETS);

    var wantedMap = {};
    chatIds.forEach(function (id) { wantedMap[id] = true; });

    rows.forEach(function (row) {
      var targetId = String(row.target_id || '');
      if (targetId.indexOf(APP.CONFIG_TARGET_PREFIX) !== 0) return;

      var currentChat = String(row.chat_id || '').trim();
      if (wantedMap[currentChat]) {
        sheet.getRange(row._rowNumber, 2).setValue('ALL');
        sheet.getRange(row._rowNumber, 4).setValue(1);
        sheet.getRange(row._rowNumber, 5).setValue('Dashboard Default');
        delete wantedMap[currentChat];
      } else {
        sheet.getRange(row._rowNumber, 4).setValue(0);
      }
    });

    Object.keys(wantedMap).forEach(function (chatId) {
      var targetId = APP.CONFIG_TARGET_PREFIX + Utilities.getUuid().slice(0, 8);
      sheet.appendRow([targetId, 'ALL', chatId, 1, 'Dashboard Default']);
    });
  },

  getViewModel: function () {
    var cfg = APP.getAppConfig();
    var chatIds = APP.IntegrationConfig.getDefaultChatIds();

    return {
      meta_access_token: '',
      meta_access_token_masked: APP.IntegrationConfig.getMasked(cfg.metaAccessToken, 6, 4),
      meta_access_token_set: !!cfg.metaAccessToken,
      ad_account_id: cfg.metaAdAccountId || '',
      telegram_bot_token: '',
      telegram_bot_token_masked: APP.IntegrationConfig.getMasked(cfg.telegramBotToken, 6, 4),
      telegram_bot_token_set: !!cfg.telegramBotToken,
      chat_ids: chatIds,
      chat_ids_text: chatIds.join(', ')
    };
  },

  saveFromInput: function (payload) {
    var input = payload || {};
    var props = PropertiesService.getScriptProperties();
    var cfg = APP.getAppConfig();

    var newAccessToken = String(input.access_token || '').trim();
    var newAdAccountId = String(input.ad_account_id || '').trim();
    var newBotToken = String(input.bot_token_telegram || '').trim();
    var chatText = String(input.chat_ids_text || '').trim();

    if (newAccessToken && newAccessToken.length < 20) {
      throw new Error('ACCESS_TOKEN terlihat terlalu pendek. Cek kembali.');
    }

    if (newBotToken && !/^\d+:[A-Za-z0-9_-]+$/.test(newBotToken)) {
      throw new Error('Format BOT_TOKEN_TELEGRAM tidak valid.');
    }

    var normalizedAdAccountId = newAdAccountId ? APP.IntegrationConfig.normalizeAdAccountId(newAdAccountId) : cfg.metaAdAccountId;
    if (!normalizedAdAccountId) {
      throw new Error('AD_ACCOUNT_ID wajib diisi.');
    }

    var chatIds = chatText ? APP.IntegrationConfig.parseChatIds(chatText) : APP.IntegrationConfig.getDefaultChatIds();
    if (!chatIds.length) {
      throw new Error('CHAT_IDS minimal satu ID aktif.');
    }

    if (newAccessToken) props.setProperty('META_ACCESS_TOKEN', newAccessToken);
    props.setProperty('META_AD_ACCOUNT_ID', normalizedAdAccountId);
    if (newBotToken) props.setProperty('TELEGRAM_BOT_TOKEN', newBotToken);

    APP.IntegrationConfig.upsertDefaultChatTargets(chatIds);

    return {
      ok: true,
      message: 'Konfigurasi berhasil disimpan',
      saved: {
        ad_account_id: normalizedAdAccountId,
        chat_id_count: chatIds.length,
        access_token_updated: !!newAccessToken,
        bot_token_updated: !!newBotToken
      }
    };
  },

  testMetaConnection: function () {
    var cfg = APP.getAppConfig();
    if (!cfg.metaAccessToken) {
      throw new Error('META_ACCESS_TOKEN belum diisi');
    }
    if (!cfg.metaAdAccountId) {
      throw new Error('META_AD_ACCOUNT_ID belum diisi');
    }

    var info = APP.MetaService.getAdAccountInfo();
    return {
      ok: true,
      message: 'Koneksi Meta berhasil',
      account: info
    };
  },

  testTelegramSend: function () {
    var cfg = APP.getAppConfig();
    if (!cfg.telegramBotToken) {
      throw new Error('TELEGRAM_BOT_TOKEN belum diisi');
    }

    var chatIds = APP.IntegrationConfig.getDefaultChatIds();
    if (!chatIds.length) {
      throw new Error('CHAT_IDS default belum tersedia di telegram_targets');
    }

    var msg =
      '✅ *Test Kirim Telegram Berhasil*\n' +
      '🕒 ' + APP.Util.formatWIB(new Date()) + '\n' +
      '📌 Source: Dashboard Integration Config';

    var sent = 0;
    chatIds.forEach(function (chatId) {
      APP.TelegramService.sendMessage(chatId, msg);
      sent += 1;
      Utilities.sleep(120);
    });

    return {
      ok: true,
      message: 'Test Telegram berhasil',
      sent_count: sent,
      chat_ids: chatIds
    };
  }
};
