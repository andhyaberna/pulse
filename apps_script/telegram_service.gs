var APP = APP || {};

APP.TelegramService = {
  splitMessage: function (text, maxLen) {
    var limit = APP.Util.num(maxLen) || 3500;
    var source = String(text || '');
    if (source.length <= limit) return [source];

    var chunks = [];
    var paragraphs = source.split('\n\n');
    var current = '';

    function pushCurrent() {
      if (current && current.trim()) {
        chunks.push(current);
      }
      current = '';
    }

    function pushLongParagraph(paragraph) {
      var p = String(paragraph || '');
      while (p.length > limit) {
        chunks.push(p.slice(0, limit));
        p = p.slice(limit);
      }
      if (p.length > 0) {
        if (current) current += '\n\n' + p;
        else current = p;
      }
    }

    paragraphs.forEach(function (paragraph) {
      var part = String(paragraph || '');
      if (!part) return;

      if (part.length > limit) {
        pushCurrent();
        pushLongParagraph(part);
        return;
      }

      if (!current) {
        current = part;
        return;
      }

      var candidate = current + '\n\n' + part;
      if (candidate.length <= limit) {
        current = candidate;
      } else {
        pushCurrent();
        current = part;
      }
    });

    pushCurrent();
    return chunks.length ? chunks : [source.slice(0, limit)];
  },

  sendMessage: function (chatId, text) {
    var cfg = APP.getAppConfig();
    var url = 'https://api.telegram.org/bot' + cfg.telegramBotToken + '/sendMessage';

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        chat_id: String(chatId),
        text: text,
        parse_mode: 'Markdown'
      })
    });

    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Telegram send gagal. code=' + code + ', body=' + response.getContentText());
    }

    return JSON.parse(response.getContentText());
  },

  broadcastReport: function (reportId, text) {
    var targets = APP.SheetRepository.getTelegramTargetsForReport(reportId);
    var sent = 0;
    var totalChunks = 0;
    var chunks = APP.TelegramService.splitMessage(text, 3500);

    targets.forEach(function (target) {
      chunks.forEach(function (chunk, idx) {
        var payload = chunk;
        if (chunks.length > 1) {
          payload = '📦 Part ' + (idx + 1) + '/' + chunks.length + '\n\n' + chunk;
        }

        APP.TelegramService.sendMessage(target.chat_id, payload);
        sent += 1;
        totalChunks += 1;
        Utilities.sleep(180);
      });
    });

    return {
      targetCount: targets.length,
      sentCount: sent,
      chunkCount: chunks.length,
      totalChunkSent: totalChunks
    };
  }
};
