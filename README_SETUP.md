# Meta Ads Report -> Telegram (Google Sheets + GAS + Worker)

Project ini menyatukan report Meta Ads Anda menjadi 1 aplikasi modular.

## 1) Struktur Folder

```text
meta_ads_internal_app/
  apps_script/
    config.gs
    sheet_repository.gs
    auth_service.gs
    integration_config_service.gs
    telegram_service.gs
    meta_service.gs
    dispatcher.gs
    webapp_controller.gs
    report_full_metrics.gs
    report_adset_breakdown.gs
    report_adset_performance.gs
    report_top_ads_profit.gs
    report_top_ads_winner.gs
    report_funnel_alert.gs
    report_creative_fatigue.gs
    dashboard.html
  cloudflare_worker/
    src/index.js
    wrangler.toml
    package.json
  templates/
    meta_ads_report_template.xlsx
    csv/
      app_reports.csv
      app_users.csv
      report_thresholds.csv
      telegram_targets.csv
      run_logs.csv
      manual_run_queue.csv
```

## 2) Asumsi Terbuka

- Semua report memakai sumber data Meta Graph API `v19.0`.
- Secret tidak disimpan di Google Sheets.
- Google Sheets hanya untuk config non-secret + log.
- `report_id` adalah kunci utama dispatch report.
- Format chat Telegram pakai Markdown sederhana.

## 3) Mapping report_id -> function

- `META_FULL_METRICS` -> `runReportFullMetrics`
- `META_ADSET_BREAKDOWN` -> `runReportAdsetBreakdown`
- `META_ADSET_PERFORMANCE` -> `runReportAdsetPerformance`
- `META_TOP_ADS_PROFIT` -> `runReportTopAdsProfit`
- `META_TOP_ADS_WINNER` -> `runReportTopAdsWinner`
- `META_FUNNEL_ALERT` -> `runReportFunnelAlert`
- `META_CREATIVE_FATIGUE` -> `runReportCreativeFatigue`

Implementasi mapping ada di `apps_script/config.gs` pada `APP.REPORT_FUNCTION_MAP`.

## 4) Setup dari Nol

### A. Buat Google Sheets (database)

1. Buat spreadsheet baru.
2. Import file `templates/meta_ads_report_template.xlsx`.
3. Pastikan ada 5 sheet:
   - `app_reports`
   - `report_thresholds`
   - `telegram_targets`
   - `run_logs`
   - `manual_run_queue`

### B. Import Apps Script

1. Buka `Extensions -> Apps Script` dari spreadsheet.
2. Buat file sesuai folder `apps_script/`.
3. Copy isi file satu per satu.
4. Deploy sebagai Web App:
   - Execute as: `Me`
   - Who has access: sesuai kebutuhan internal (umumnya `Anyone with link` jika dipanggil Worker)

Alternatif yang lebih praktis: pakai `clasp` agar semua file `.gs` dan `dashboard.html` bisa di-push langsung dari folder lokal tanpa buat file satu per satu di editor Apps Script.

Perintah dari folder `apps_script/`:

```bash
npm install
npm run clasp:login
```

Aktifkan dulu Apps Script API di:

- `https://script.google.com/home/usersettings`

Lalu pilih salah satu:

```bash
npm run clasp:create:bound
```

- Dipakai jika ingin project Apps Script langsung terikat ke Google Sheet `1OOOWLiu9ZkyxRCFVqkHdfdk4-RFF4UlncNGn5COg5dQ`.

Atau:

```bash
npm run clasp:create:standalone
```

- Dipakai jika ingin project Apps Script standalone.

Setelah `.clasp.json` terbentuk, sync file lokal ke Apps Script dengan:

```bash
npm run clasp:push
```

Command tambahan yang berguna:

```bash
npm run clasp:pull
npm run clasp:status
npm run clasp:open
```

Catatan:

- File `appsscript.json` sudah disiapkan di folder `apps_script/`.
- File `.clasp.json` akan dibuat otomatis oleh `clasp` dan sengaja tidak di-commit karena berisi `scriptId` spesifik project Anda.
- Untuk deploy Web App pertama kali, paling mudah tetap lewat UI Apps Script setelah source code ter-push.

### C. Set Script Properties (wajib)

Di Apps Script: `Project Settings -> Script properties`.

Tambahkan:

- `TARGET_SHEET_ID` = `1OOOWLiu9ZkyxRCFVqkHdfdk4-RFF4UlncNGn5COg5dQ`
- `WEBHOOK_API_KEY` = shared key untuk Worker -> GAS
- `AUTH_PEPPER` = random string panjang untuk hash password

Catatan:

- `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `TELEGRAM_BOT_TOKEN`, dan `CHAT_IDS` sekarang bisa dikelola dari menu konfigurasi dashboard (admin), jadi tidak wajib set manual di awal.

Opsional:

- `APP_TIMEZONE` = `Asia/Jakarta`
- `META_DATE_PRESET` = `today`
- `AUTH_SESSION_TTL_SEC` = default `21600` (6 jam)
- `ALLOW_ADMIN_REGISTER` = `false` (disarankan). Set `true` jika ingin register admin langsung.

## 5) Import file Excel ke Google Sheets

1. Buka Google Drive.
2. Upload `templates/meta_ads_report_template.xlsx`.
3. Klik kanan -> `Open with -> Google Sheets`.
4. Untuk project ini, gunakan Spreadsheet ID:
   - `1OOOWLiu9ZkyxRCFVqkHdfdk4-RFF4UlncNGn5COg5dQ`

## 6) Trigger time-driven di Apps Script

Tambahkan trigger:

- `runScheduledReports` -> time-driven (mis. tiap jam atau harian)
- `runManualQueue` -> time-driven (mis. tiap 5-15 menit)

Tujuan:

- Scheduled report langsung jalan dari `app_reports` yang aktif.
- Queue manual dari dashboard diproses berkala.

## 7) Cara test manual run

### Opsi 1: dari Dashboard UI

1. Buka URL Web App GAS.
2. Klik tombol `Run Now` pada report.
3. Cek hasil di Telegram + `run_logs`.

### Opsi 2: dari function editor

- Jalankan `runReportById('META_FULL_METRICS')`

### Opsi 3: via API POST ke GAS

```json
{
  "action": "run-report",
  "report_id": "META_TOP_ADS_WINNER",
  "source": "postman",
  "api_key": "<WEBHOOK_API_KEY>"
}
```

## 8) Cloudflare Worker (middleware)

Worker hanya forward request, tanpa static assets.

Setting deploy Worker yang sudah dipakai di project ini:

- Worker name: `pulse`
- Allowed domain: `pulse.cepat.top`
- Custom domain pattern: `pulse.cepat.top`

Endpoint:

- `POST /run-report`

Validasi:

- Header `x-api-key` harus sama dengan `WORKER_API_KEY`.

Forward body ke GAS:

- Menyisipkan `api_key: GAS_API_KEY`.

### Setup local deploy (Wrangler)

Masuk folder:

```bash
cd cloudflare_worker
npm install
```

Set secrets:

```bash
wrangler secret put WORKER_API_KEY
wrangler secret put GAS_API_KEY
wrangler secret put GAS_WEB_APP_URL
wrangler secret put DB_TARGET_SHEET_ID
wrangler secret put ALLOWED_DOMAIN
```

Nilai untuk project ini:

- `GAS_WEB_APP_URL` = `https://script.google.com/macros/s/AKfycbyMXXb4hW-pWyvzx_Y6Job_bPXlW6-jr95ssMtdLPu0SK_LVQQeIf0BMuB4kK0b8kVw/exec`
- `DB_TARGET_SHEET_ID` = `1OOOWLiu9ZkyxRCFVqkHdfdk4-RFF4UlncNGn5COg5dQ`
- `ALLOWED_DOMAIN` = `pulse.cepat.top`

Catatan penting: set juga `GAS_API_KEY` di Worker sama persis dengan `WEBHOOK_API_KEY` di Script Properties GAS.

Jalankan lokal:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

Catatan penting:

- Deploy ini harus dijalankan dari folder `cloudflare_worker`, bukan dari root repo.
- Jangan deploy sebagai Cloudflare Pages, karena project ini adalah Worker murni dan tidak punya folder static assets.

### Hindari error submodule saat deploy

- Jangan pakai git submodule.
- Worker ini hanya 1 file utama (`src/index.js`) + `wrangler.toml`.
- Deploy dari folder worker langsung.

## 9) Contoh response JSON

### Success

```json
{
  "ok": true,
  "status_from_gas": 200,
  "gas_response": {
    "ok": true,
    "statusCode": 200,
    "data": {
      "ok": true,
      "report_id": "META_FULL_METRICS",
      "run_id": "uuid",
      "message": "Campaign dianalisis: 4",
      "sent_count": 2,
      "duration_ms": 2314
    }
  },
  "target_sheet_id": "..."
}
```

### Error API key

```json
{
  "ok": false,
  "message": "Unauthorized"
}
```

### Error report tidak ditemukan

```json
{
  "ok": false,
  "statusCode": 500,
  "data": {
    "ok": false,
    "message": "Report tidak ditemukan: META_X"
  }
}
```

## 10) Auto split payload Telegram

- Sistem sekarang otomatis split payload panjang sebelum kirim ke Telegram.
- Batas split diset aman di sekitar 3500 karakter per message chunk.
- Jika ter-split, pesan akan diberi prefix `Part x/y`.
- Implementasi ada di `apps_script/telegram_service.gs` (`splitMessage` + `broadcastReport`).

## 11) Menu Konfigurasi Dashboard

Admin bisa mengelola parameter integrasi tanpa edit source code:

- `ACCESS_TOKEN`
- `AD_ACCOUNT_ID`
- `BOT_TOKEN_TELEGRAM`
- `CHAT_IDS` (koma/baris baru)

Tersedia tombol verifikasi langsung di dashboard (admin):

- `Test Koneksi Meta` untuk cek akses API akun Meta
- `Test Kirim Telegram` untuk kirim pesan uji ke chat default

Mekanisme:

- Backend: `apps_script/integration_config_service.gs`
- UI: `apps_script/dashboard.html`
- Simpan ke Script Properties (token, account id) + sinkron chat id ke sheet `telegram_targets` dengan `target_id` prefix `CFG_DEFAULT_`.
- Token sensitif ditampilkan sebagai masked value.
- Input tervalidasi (format account id, format bot token, format chat ids).

## 12) Auth (admin/user)

Fitur yang tersedia:

- register akun baru
- login untuk admin dan user
- role-based access:
  - `admin`: bisa `Run Now` dan `Queue`
  - `user`: read-only dashboard

Data user disimpan di sheet `app_users` (auto-create saat register/login/seeder pertama).

Kolom `app_users`:

- `user_id,email,name,password_hash,password_salt,role,is_active,created_at,updated_at,last_login_at`

Seeder akun dummy:

- Jalankan function Apps Script: `seedAuthDummyUsers()`

Akun default hasil seeder:

- Admin:
  - `admin@pulse.local` / `Admin12345!`
  - `ops.admin@pulse.local` / `Admin12345!`
- User:
  - `user.marketing@pulse.local` / `User12345!`
  - `user.analyst@pulse.local` / `User12345!`

Catatan: ganti password dummy setelah test awal.

## 13) Penanganan error yang sudah dibuat

- Validasi Script Properties wajib (`APP.assertRequiredSecrets`).
- Validasi `api_key` untuk endpoint `doPost`.
- Semua run success/fail masuk `run_logs`.
- Queue manual punya status `PENDING/PROCESSING/DONE/FAILED`.
- Exception API Meta/Telegram dibaca jelas di log.

## 14) Catatan adaptasi dari script lama Anda

Laporan existing Anda dipetakan langsung ke 7 report modular di atas.
Jika ingin logika lama dipertahankan 100%, salin rules khusus lama ke file report yang sesuai:

- `MetaAdsIntelligenceReport` -> `report_full_metrics.gs`
- `MetaAds_AdsetBreakdown` -> `report_adset_breakdown.gs`
- `MetaAds_AdsetPerformance` -> `report_adset_performance.gs`
- `TopAdsPerformance` -> `report_top_ads_profit.gs`
- `TopAds_Ranking_WinnerAlert` -> `report_top_ads_winner.gs`
- `FunnelAlert_CPM_CTR` -> `report_funnel_alert.gs`
- `CekCreativeFatigue` -> `report_creative_fatigue.gs`
