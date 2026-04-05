var APP = APP || {};

APP.Auth = {
  USER_HEADERS: [
    'user_id',
    'email',
    'name',
    'password_hash',
    'password_salt',
    'role',
    'is_active',
    'created_at',
    'updated_at',
    'last_login_at'
  ],

  ensureUserStore: function () {
    APP.SheetRepository.ensureSheetWithHeaders(APP.SHEETS.APP_USERS, APP.Auth.USER_HEADERS);
  },

  normalizeEmail: function (email) {
    return String(email || '').toLowerCase().trim();
  },

  validateRegisterInput: function (payload) {
    var name = String(payload.name || '').trim();
    var email = APP.Auth.normalizeEmail(payload.email);
    var password = String(payload.password || '');

    if (name.length < 2) throw new Error('Nama minimal 2 karakter');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Format email tidak valid');
    if (password.length < 8) throw new Error('Password minimal 8 karakter');
  },

  createSalt: function () {
    return Utilities.getUuid().replace(/-/g, '');
  },

  hashPassword: function (password, salt) {
    var cfg = APP.getAppConfig();
    var base = String(salt) + '|' + String(password) + '|' + String(cfg.authPepper || '');
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base, Utilities.Charset.UTF_8);
    return Utilities.base64Encode(bytes);
  },

  createSessionToken: function () {
    return Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  },

  saveSession: function (token, sessionData) {
    var cfg = APP.getAppConfig();
    var ttl = Math.max(300, Math.min(21600, APP.Util.num(cfg.authSessionTtlSec || 21600)));
    var cache = CacheService.getScriptCache();
    cache.put('sess:' + token, JSON.stringify(sessionData), ttl);
  },

  getSession: function (token) {
    if (!token) return null;
    var cache = CacheService.getScriptCache();
    var raw = cache.get('sess:' + token);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  },

  clearSession: function (token) {
    if (!token) return;
    CacheService.getScriptCache().remove('sess:' + token);
  },

  requireAuth: function (token) {
    var session = APP.Auth.getSession(token);
    if (!session) throw new Error('Sesi tidak valid atau sudah expired. Silakan login ulang.');
    return session;
  },

  requireRole: function (token, allowedRoles) {
    var session = APP.Auth.requireAuth(token);
    var role = String(session.role || 'user');
    var allowed = allowedRoles || [];
    if (allowed.indexOf(role) === -1) {
      throw new Error('Akses ditolak untuk role ' + role);
    }
    return session;
  },

  register: function (payload) {
    APP.Auth.ensureUserStore();
    APP.Auth.validateRegisterInput(payload || {});

    var name = String(payload.name || '').trim();
    var email = APP.Auth.normalizeEmail(payload.email);
    var password = String(payload.password || '');
    var wantedRole = String(payload.role || 'user').toLowerCase().trim();
    var cfg = APP.getAppConfig();

    var role = 'user';
    if (wantedRole === 'admin' && cfg.allowAdminRegister) {
      role = 'admin';
    }

    var existing = APP.SheetRepository.getUserByEmail(email);
    if (existing) throw new Error('Email sudah terdaftar');

    var salt = APP.Auth.createSalt();
    var hash = APP.Auth.hashPassword(password, salt);
    var now = APP.Util.nowIso();

    APP.SheetRepository.appendUser({
      user_id: Utilities.getUuid(),
      email: email,
      name: name,
      password_hash: hash,
      password_salt: salt,
      role: role,
      is_active: 1,
      created_at: now,
      updated_at: now,
      last_login_at: ''
    });

    return {
      ok: true,
      message: 'Register berhasil',
      user: { email: email, name: name, role: role }
    };
  },

  login: function (payload) {
    APP.Auth.ensureUserStore();
    var email = APP.Auth.normalizeEmail(payload && payload.email);
    var password = String(payload && payload.password || '');

    if (!email || !password) throw new Error('Email dan password wajib diisi');

    var user = APP.SheetRepository.getUserByEmail(email);
    if (!user) throw new Error('Email atau password salah');
    if (!APP.Util.bool(user.is_active)) throw new Error('Akun tidak aktif');

    var expected = String(user.password_hash || '');
    var check = APP.Auth.hashPassword(password, String(user.password_salt || ''));
    if (expected !== check) throw new Error('Email atau password salah');

    var token = APP.Auth.createSessionToken();
    var session = {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      login_at: APP.Util.nowIso()
    };

    APP.Auth.saveSession(token, session);
    APP.SheetRepository.updateUserLastLogin(user._rowNumber, APP.Util.nowIso());

    return {
      ok: true,
      token: token,
      user: {
        user_id: session.user_id,
        email: session.email,
        name: session.name,
        role: session.role
      }
    };
  },

  seedDummyUsers: function () {
    APP.Auth.ensureUserStore();

    var samples = [
      { name: 'Admin Pulse', email: 'admin@pulse.local', password: 'Admin12345!', role: 'admin' },
      { name: 'Ops Admin', email: 'ops.admin@pulse.local', password: 'Admin12345!', role: 'admin' },
      { name: 'User Marketing', email: 'user.marketing@pulse.local', password: 'User12345!', role: 'user' },
      { name: 'User Analyst', email: 'user.analyst@pulse.local', password: 'User12345!', role: 'user' }
    ];

    var created = [];
    var skipped = [];

    samples.forEach(function (item) {
      var exists = APP.SheetRepository.getUserByEmail(item.email);
      if (exists) {
        APP.SheetRepository.updateUserRoleByEmail(item.email, item.role);
        skipped.push(item.email);
        return;
      }

      var salt = APP.Auth.createSalt();
      var now = APP.Util.nowIso();

      APP.SheetRepository.appendUser({
        user_id: Utilities.getUuid(),
        email: item.email,
        name: item.name,
        password_hash: APP.Auth.hashPassword(item.password, salt),
        password_salt: salt,
        role: item.role,
        is_active: 1,
        created_at: now,
        updated_at: now,
        last_login_at: ''
      });

      created.push(item.email);
    });

    return {
      ok: true,
      message: 'Seeder selesai',
      created: created,
      skipped_existing: skipped,
      default_password_hint: {
        admin: 'Admin12345!',
        user: 'User12345!'
      }
    };
  }
};

function seedAuthDummyUsers() {
  return APP.Auth.seedDummyUsers();
}
