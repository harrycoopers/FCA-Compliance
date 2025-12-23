require('dotenv').config({ path: './.env' });

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const expressLayouts = require('express-ejs-layouts');

const app = express();

// Basic config
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
function getUKTimestamp() {
  return new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Database setup (SQLite)
const dbPath = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(dbPath);


// Create tables if they don't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  mobile_number TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_verified INTEGER DEFAULT 0,
  verification_token TEXT,
  reset_token TEXT,
  reset_token_expires DATETIME
)
  `);

  // Add missing columns safely (ignore "duplicate column" errors)
db.run(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`, (e) => {});
db.run(`ALTER TABLE users ADD COLUMN unsubscribe_token TEXT`, (e) => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reporting_month TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      data TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(expressLayouts);
app.set('layout', 'layout');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Session & flash
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());

// Local variables for templates
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// Nodemailer transporter
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// Google Sheets setup
let sheetsClient = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!email || !key || !spreadsheetId) {
    console.warn('Google Sheets not fully configured. Skipping Sheets integration.');
    return null;
  }

  // Handle escaped newlines in env
  const fixedKey = key.replace(/\\n/g, '\n');

  const jwt = new google.auth.JWT(
    email,
    null,
    fixedKey,
    ['https://www.googleapis.com/auth/spreadsheets'],
    null
  );

  sheetsClient = {
    jwt,
    spreadsheetId,
  };

  return sheetsClient;
}

async function appendRowToSheet(sheetName, rowValues) {
  const client = getSheetsClient();
  if (!client) return;

  const { jwt, spreadsheetId } = client;
  await jwt.authorize();
  const sheets = google.sheets({ version: 'v4', auth: jwt });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
  } catch (err) {
    console.error(`Error appending to Google Sheet (${sheetName}):`, err.message);
  }
}

async function upsertDealerInSheet(dealer) {
  const client = getSheetsClient();
  if (!client) return;

  const { jwt, spreadsheetId } = client;
  await jwt.authorize();
  const sheets = google.sheets({ version: 'v4', auth: jwt });

  // Read DealerIDs
  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Dealers!A2:A',
  });

  const ids = (readRes.data.values || []).flat().map(String);
  const idx = ids.indexOf(String(dealer.dealerId));

  const baseValues = [
    String(dealer.dealerId),      // A
    dealer.name || '',            // B
    dealer.email || '',           // C
    dealer.phone || '',           // D
    dealer.isActive === false ? 'FALSE' : 'TRUE', // E
    dealer.createdAt || new Date().toISOString(), // F
  ];

  if (idx === -1) {
    // Append A:F first
    await appendRowToSheet('Dealers', baseValues.concat([
      "", "", "",                 // G/H/I formulas live here (leave blank)
      dealer.unsubscribeToken || "" // J
      // K/L are formulas, leave them out
    ]));
    return;
  }

  const rowNumber = idx + 2;

  // Update ONLY A:F (do not touch formula cols)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Dealers!A${rowNumber}:F${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [baseValues] },
  });

  // Update ONLY J (UnsubscribeToken)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Dealers!J${rowNumber}:J${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[dealer.unsubscribeToken || ""]] },
  });
}

// Auth middleware (email verification disabled)
function ensureAuth(req, res, next) {
  if (req.session.user) {
    return next();
  }
  req.flash('error', 'Please log in to access this page.');
  res.redirect('/login');
}

// Routes

// Homepage
app.get('/', (req, res) => {
  res.render('index');
});

// Metrics API (total users)
app.get('/api/metrics', (req, res) => {
  db.get('SELECT COUNT(*) AS count FROM users', [], (err, row) => {
    if (err) return res.json({ count: 0 });
    res.json({ count: row.count || 0 });
  });
});

// Auth views
app.get('/register', (req, res) => {
  res.render('register');
});

// Terms page shown before registration
app.get('/terms', (req, res) => {
  // If you want to prefill what the user typed, pass query params through
  res.render('terms', { formData: req.query || {} });
});

// About page
app.get('/about', (req, res) => {
  res.render('about');
});

// Contact page
app.get('/contact', (req, res) => {
  res.render('contact');
});


app.post('/register', async (req, res) => {
  const { name, email, password, confirmPassword, mobile_number } = req.body;
    
  if (req.body.agree_terms !== 'yes') {
    req.flash('error', 'You must agree to the Client Service Agreement to create an account.');
    return res.redirect('/register');
  }

  if (!name || !email || !password || !mobile_number) {
    req.flash('error', 'Please complete all fields.');
    return res.redirect('/register');
  }

  if (password !== confirmPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('/register');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const verificationToken = require('crypto').randomBytes(32).toString('hex');
  
  const crypto = require('crypto');
  const unsubscribeToken = crypto.randomBytes(24).toString('hex');

  db.run(
    'INSERT INTO users (email, password_hash, name, mobile_number, verification_token) VALUES (?, ?, ?, ?, ?)',
    [email.toLowerCase(), passwordHash, name, mobile_number, verificationToken],
      async function (err) {
      if (err) {
        console.error(err);
        if (err.message.includes('UNIQUE')) {
          req.flash('error', 'An account with that email already exists.');
        } else {
          req.flash('error', 'Unable to create account. Please try again.');
        }
        return res.redirect('/register');
      }

      // Send verification email (non-blocking)
      if (transporter) {
        const verifyUrl = `${BASE_URL}/verify-email?token=${verificationToken}`;
        transporter.sendMail({
          from: process.env.FROM_EMAIL || 'no-reply@example.com',
          to: email,
          subject: 'Confirm your FCA Compliance account',
          html: `
            <p>Hi ${name},</p>
            <p>Thanks for registering for the FCA Compliance Reporting Portal.</p>
            <p>Please confirm your email by clicking the link below:</p>
            <p><a href="${verifyUrl}">Verify my email</a></p>
          `,
        }).catch(err => console.error('Email error:', err.message));
      }

      // ✅ Auto-login
      req.session.user = {
        id: this.lastID,
        email: email.toLowerCase(),
        name,
        mobile_number,
        is_verified: 0,
      };

      req.flash('success', 'Welcome! Your account has been created.');
     
 // ✅ Add/Update dealer in Google Sheets "Dealers" tab
db.run(
  'UPDATE users SET unsubscribe_token = ?, is_active = 1 WHERE id = ?',
  [unsubscribeToken, this.lastID]
);
    
      
try {
  await upsertDealerInSheet({
  dealerId: this.lastID,
  name,
  email: email.toLowerCase(),
  phone: mobile_number,
  createdAt: getUKTimestamp(),
  isActive: true,
  unsubscribeToken,
});
} catch (e) {
  console.error('Dealer Sheets upsert failed:', e.message);
}
      res.redirect('/dashboard');
    }
  );
});

app.get('/verify-email-notice', (req, res) => {
  res.render('verify_email_notice');
});

app.get('/verify-email', (req, res) => {
  const token = req.query.token;
  if (!token) {
    req.flash('error', 'Missing verification token.');
    return res.redirect('/login');
  }

  db.get('SELECT * FROM users WHERE verification_token = ?', [token], (err, user) => {
    if (err || !user) {
      req.flash('error', 'Invalid or expired verification token.');
      return res.redirect('/login');
    }

    db.run(
      'UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?',
      [user.id],
      function (updateErr) {
        if (updateErr) {
          console.error(updateErr);
          req.flash('error', 'Unable to verify email. Please try again.');
          return res.redirect('/login');
        }
        req.flash('success', 'Email verified. You can now log in.');
        res.redirect('/login');
      }
    );
  });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    req.flash('error', 'Please enter your email and password.');
    return res.redirect('/login');
  }

  db.get(
    'SELECT * FROM users WHERE email = ?',
    [email.toLowerCase()],
    async (err, user) => {
      if (err || !user) {
        req.flash('error', 'Invalid email or password.');
        return res.redirect('/login');
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        req.flash('error', 'Invalid email or password.');
        return res.redirect('/login');
      }

      // Logged in
      req.session.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        mobile_number: user.mobile_number,
        is_verified: user.is_verified === 1,
      };

      const crypto = require('crypto');
const unsubscribeToken = user.unsubscribe_token || crypto.randomBytes(24).toString('hex');

if (!user.unsubscribe_token) {
  db.run(
    'UPDATE users SET unsubscribe_token = ? WHERE id = ?',
    [unsubscribeToken, user.id]
  );
}


      // Send login notification email (optional)
      if (transporter) {
        transporter.sendMail({
          from: process.env.FROM_EMAIL || 'no-reply@example.com',
          to: user.email,
          subject: 'New login to FCA Compliance portal',
          html: `
            <p>Hi ${user.name},</p>
            <p>There was a new login to your FCA Compliance portal account.</p>
            <p>If this wasn't you, please reset your password immediately.</p>
          `,
        }).catch(err => console.error('Email error:', err.message));
      }

      res.redirect('/dashboard');
    }
  );
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/unsubscribe', async (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).send('Missing token.');

    db.get(
      'SELECT id, name, email, mobile_number FROM users WHERE unsubscribe_token = ?',
      [token],
      async (err, user) => {
        if (err || !user) return res.status(404).send('Invalid unsubscribe link.');

        // mark inactive in DB
        db.run('UPDATE users SET is_active = 0 WHERE id = ?', [user.id], async (uErr) => {
          if (uErr) return res.status(500).send('Could not unsubscribe. Please try again.');

          // update Google Sheets (Active -> FALSE)
          try {
            await upsertDealerInSheet({
              dealerId: user.id,
              name: user.name,
              email: user.email,
              phone: user.mobile_number,
              createdAt: getUKTimestamp(),
              isActive: false,
              unsubscribeToken: token,
            });
          } catch (e) {
            console.error('Dealer Sheets upsert failed:', e.message);
          }

          res.send('You have been unsubscribed. You will no longer receive reminders.');
        });
      }
    );
  } catch (e) {
    console.error(e);
    res.status(500).send('Something went wrong.');
  }
});


// Forgot password
app.get('/forgot-password', (req, res) => {
  res.render('forgot_password');
});

app.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    req.flash('error', 'Please enter your email address.');
    return res.redirect('/forgot-password');
  }

  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], (err, user) => {
    if (err || !user) {
      req.flash('success', 'If that email exists, a reset link has been sent.');
      return res.redirect('/forgot-password');
    }

    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    db.run(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetToken, expires.toISOString(), user.id],
      (updateErr) => {
        if (updateErr) {
          console.error(updateErr);
          req.flash('error', 'Unable to generate reset link. Please try again.');
          return res.redirect('/forgot-password');
        }

        if (transporter) {
          const resetUrl = `${BASE_URL}/reset-password/${resetToken}`;
          transporter.sendMail({
            from: process.env.FROM_EMAIL || 'no-reply@example.com',
            to: user.email,
            subject: 'Reset your FCA Compliance password',
            html: `
              <p>Hi ${user.name},</p>
              <p>We received a request to reset your password.</p>
              <p>You can reset it by clicking the link below (valid for 1 hour):</p>
              <p><a href="${resetUrl}">Reset my password</a></p>
              <p>If you did not request this, you can ignore this email.</p>
            `,
          }).catch(err => console.error('Email error:', err.message));
        }

        req.flash('success', 'If that email exists, a reset link has been sent.');
        res.redirect('/forgot-password');
      }
    );
  });
});

app.get('/reset-password/:token', (req, res) => {
  const token = req.params.token;
  db.get(
    'SELECT * FROM users WHERE reset_token = ?',
    [token],
    (err, user) => {
      if (err || !user) {
        req.flash('error', 'Invalid or expired reset token.');
        return res.redirect('/login');
      }

      const now = new Date();
      const expires = new Date(user.reset_token_expires);
      if (now > expires) {
        req.flash('error', 'Reset token has expired. Please request a new one.');
        return res.redirect('/forgot-password');
      }

      res.render('reset_password', { token });
    }
  );
});

app.post('/reset-password/:token', async (req, res) => {
  const token = req.params.token;
  const { password, confirmPassword } = req.body;

  if (!password || password !== confirmPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect(`/reset-password/${token}`);
  }

  db.get(
    'SELECT * FROM users WHERE reset_token = ?',
    [token],
    async (err, user) => {
      if (err || !user) {
        req.flash('error', 'Invalid or expired reset token.');
        return res.redirect('/login');
      }

      const now = new Date();
      const expires = new Date(user.reset_token_expires);
      if (now > expires) {
        req.flash('error', 'Reset token has expired. Please request a new one.');
        return res.redirect('/forgot-password');
      }

      const passwordHash = await bcrypt.hash(password, 10);

      db.run(
        'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
        [passwordHash, user.id],
        (updateErr) => {
          if (updateErr) {
            console.error(updateErr);
            req.flash('error', 'Unable to reset password. Please try again.');
            return res.redirect('/forgot-password');
          }

          req.flash('success', 'Password has been reset. You can now log in.');
          res.redirect('/login');
        }
      );
    }
  );
});

// Dashboard
app.get('/dashboard', ensureAuth, (req, res) => {
  const userId = req.session.user.id;

  db.all(
    'SELECT * FROM reports WHERE user_id = ? ORDER BY reporting_month DESC',
    [userId],
    (err, reports) => {
      if (err) {
        console.error(err);
        reports = [];
      }
      res.render('dashboard', { reports });
    }
  );
});

// New report form
app.get('/reports/new', ensureAuth, (req, res) => {
  res.render('report_form', { report: null });
});

app.post('/reports/new', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { reporting_month, ...dataFields } = req.body;

  if (!reporting_month) {
    req.flash('error', 'Please choose the reporting month.');
    return res.redirect('/reports/new');
  }

  const dataJson = JSON.stringify(dataFields);

  db.run(
    'INSERT INTO reports (user_id, reporting_month, data) VALUES (?, ?, ?)',
    [userId, reporting_month, dataJson],
    async function (err) {
      if (err) {
        console.error(err);
        req.flash('error', 'Unable to save report. Please try again.');
        return res.redirect('/reports/new');
      }

      // Append to Google Sheet

try {
  const user = req.session.user;
  const createdAt = getUKTimestamp();

  // Keep a consistent column order in Google Sheets:
  const FIELD_ORDER = [
    'total_vehicles_sold',
    'funded_deals',
    'lenders_brokers_used',
    'finance_commission',
    'total_turnover',
    'finance_complaints',
    'finance_complaints_cases',
    'finance_complaints_details',
    'fees_paid_brokers',
    'px_settlements_number',
    'px_settlements_value',
    'changes_since_last_month',
    'changes_details',
  ];

  const answers = FIELD_ORDER.map((key) => (dataFields[key] ?? ''));

  const row = [
    this.lastID,
    user.id,
    user.name,
    user.email,
    user.mobile_number,
    reporting_month,
    createdAt,
    ...answers,
  ];

  await appendRowToSheet('Submissions', row);
} catch (e) {
  console.error('Sheets error:', e.message);
}


      
      req.flash('success', 'Report submitted successfully.');
      res.redirect('/dashboard');
    }
  );
});

async function updateGoogleSheetRowByReportId(reportId, updatedRowValues) {
  const client = getSheetsClient();
  if (!client) return;

  const { jwt, spreadsheetId } = client;
  await jwt.authorize();
  const sheets = google.sheets({ version: 'v4', auth: jwt });

  // 1) Read column A (Report ID column) to find which row matches
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A:A',
  });

  const colA = res.data.values || [];
  const rowIndex = colA.findIndex(r => String(r[0]).trim() === String(reportId));

  if (rowIndex === -1) {
    console.warn(`Report ID ${reportId} not found in sheet, appending instead.`);
    await appendRowToSheet('Submissions', updatedRowValues);
    return;
  }

  // Sheets rows are 1-based, array index is 0-based
  const sheetRowNumber = rowIndex + 1;

  // 2) Update the entire row from A onwards
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `A${sheetRowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [updatedRowValues],
    },
  });
}

// View & edit report
app.get('/reports/:id/edit', ensureAuth, (req, res) => {
  const reportId = req.params.id;
  const userId = req.session.user.id;

  db.get(
    'SELECT * FROM reports WHERE id = ? AND user_id = ?',
    [reportId, userId],
    (err, report) => {
      if (err || !report) {
        req.flash('error', 'Report not found.');
        return res.redirect('/dashboard');
      }

      report.dataObj = {};
      try {
        report.dataObj = JSON.parse(report.data);
      } catch (e) {}

      res.render('report_form', { report });
    }
  );
});

app.post('/reports/:id/edit', ensureAuth, (req, res) => {
  const reportId = req.params.id;
  const userId = req.session.user.id;
  const { reporting_month, ...dataFields } = req.body;

  if (!reporting_month) {
    req.flash('error', 'Please choose the reporting month.');
    return res.redirect(`/reports/${reportId}/edit`);
  }

  const dataJson = JSON.stringify(dataFields);

  db.run(
    `
      UPDATE reports
      SET reporting_month = ?, data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    [reporting_month, dataJson, reportId, userId],
    async (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Unable to update report. Please try again.');
        return res.redirect(`/reports/${reportId}/edit`);
      }

      // ✅ Update Google Sheet row (if configured)
      try {
        const user = req.session.user;
        const updatedAt = getUKTimestamp();

        const FIELD_ORDER = [
          'total_vehicles_sold',
          'funded_deals',
          'lenders_brokers_used',
          'finance_commission',
          'total_turnover',
          'finance_complaints',
          'finance_complaints_cases',
          'finance_complaints_details',
          'fees_paid_brokers',
          'px_settlements_number',
          'px_settlements_value',
          'changes_since_last_month',
          'changes_details',
        ];

        const answers = FIELD_ORDER.map((k) => (dataFields[k] ?? ''));

        const updatedRow = [
          reportId, // Column A in Google Sheet must be report ID
          user.id,
          user.name,
          user.email,
          user.mobile_number,
          reporting_month,
          ...answers,
        ];

        await updateGoogleSheetRowByReportId(reportId, updatedRow);
      } catch (e) {
        console.error('Google Sheets update failed:', e.message);
      }

      req.flash('success', 'Report updated successfully.');
      res.redirect('/dashboard');
    }
  );
});

// List reports (history)
app.get('/reports', ensureAuth, (req, res) => {
  const userId = req.session.user.id;

  db.all(
    'SELECT * FROM reports WHERE user_id = ? ORDER BY reporting_month DESC',
    [userId],
    (err, reports) => {
      if (err) {
        console.error(err);
        reports = [];
      }

      res.render('reports_list', { reports });
    }
  );
});


app.get('/services', (req, res) => res.render('services'));
app.get('/privacy-policy', (req, res) => res.render('privacy_policy'));
app.get('/complaints-policy', (req, res) => res.render('complaints_policy'));
app.get('/cookie-policy', (req, res) => res.render('cookie_policy'));

app.get('/debug-env', (req, res) => {
  res.json({
    sheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  });
});

app.get('/services', (req, res) => {
  res.render('services');
});

app.get('/pricing', (req, res) => {
  res.render('pricing');
});

// 🔧 TEST GOOGLE SHEETS CONNECTION
app.get('/test-sheets', async (req, res) => {
  try {
    await appendRowToSheet('Submissions', [
      "TEST_REPORT",
      "123",
      "test@example.com",
      "Test User",
      "2024-01",
      getUKTimestamp(),
      "{}"
    ]);
    res.send("SUCCESS: A test row should now appear in Google Sheets.");
  } catch (err) {
    console.error("GOOGLE SHEETS ERROR:", err);
    res.send("FAILED: " + err.message);
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
