require('dotenv').config({ path: './.env' });

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const { google } = require('googleapis');
const expressLayouts = require('express-ejs-layouts');
const { sendEmail } = require('./utils/email');
const CURRENT_TERMS_VERSION = process.env.TERMS_VERSION || '2026-01-13';

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

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanEmailHeader(value = '') {
  return String(value).replace(/[\r\n]/g, ' ').trim();
}

function normalizeUKMobile(input) {
  if (!input) return '';

  let s = String(input).trim();

  // Remove spaces, dashes, brackets etc (keep digits and leading +)
  s = s.replace(/[^\d+]/g, '');
  return s;
}

// Database setup (SQLite)
const dbPath = process.env.DB_PATH || path.join(__dirname, 'db.sqlite');
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
db.run(`ALTER TABLE users ADD COLUMN terms_accepted_at TEXT`, (e) => {});
db.run(`ALTER TABLE users ADD COLUMN terms_version TEXT`, (e) => {});
db.run(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`, (e) => {});
db.run(`ALTER TABLE users ADD COLUMN unsubscribe_token TEXT`, (e) => {});
db.run(`ALTER TABLE users ADD COLUMN firm_name TEXT`, (e) => {});
db.run(`ALTER TABLE users ADD COLUMN fca_firm_ref TEXT`, (e) => {});

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

// Local variables for templates + SEO defaults
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.showSubmissionToast = req.flash('showSubmissionToast');

  // ✅ SEO defaults (used by layout.ejs)
  res.locals.pageTitle = '009 Compliance | FCA Compliance Reporting Portal';
  res.locals.pageDescription =
    'Monthly FCA compliance reporting portal for motor dealers. Submit MI, track submissions, and maintain evidence-ready records with 009 Compliance.';
  res.locals.robots = 'index,follow';

  // ✅ Canonical URL auto-built (works on localhost + live domain)
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.locals.canonicalUrl = `${baseUrl}${req.path}`;

  next();
});


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

  // Read DealerIDs (column A)
  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Dealers!A2:A',
  });

  const ids = (readRes.data.values || []).flat().map(String);
  const idx = ids.indexOf(String(dealer.dealerId));

  const baseValues = [
    String(dealer.dealerId),                          // A
    dealer.name || '',                                // B
    dealer.email || '',                               // C
    dealer.phone || '',                               // D
    dealer.firmName || '',                            // E
    dealer.isActive === false ? 'FALSE' : 'TRUE',     // F
    dealer.createdAt || new Date().toISOString(),     // G
  ];

  // Your sheet header is "TermsAccepted" but code writes by column position (P)
  const termsAcceptedAt = dealer.termsAcceptedAt || ''; // P
  const termsVersion = dealer.termsVersion || '';       // Q

  if (idx === -1) {
    // Append A:G, leave H:L blank, set M token, N/O blank, then P/Q terms
    await appendRowToSheet('Dealers', baseValues.concat([
      "", "", "", "", "",                 // H:I:J:K:L
      dealer.unsubscribeToken || "",      // M
      "", "",                             // N:O
      termsAcceptedAt,                    // P
      termsVersion                        // Q
    ]));
    return;
  }

  const rowNumber = idx + 2;

  // Update ONLY A:G
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Dealers!A${rowNumber}:G${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [baseValues] },
  });

  // Update ONLY M (UnsubscribeToken)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Dealers!M${rowNumber}:M${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[dealer.unsubscribeToken || ""]] },
  });

  // Update ONLY E (FirmName)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Dealers!E${rowNumber}:E${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[dealer.firmName || ""]] },
  });

  // Update ONLY P:Q (TermsAccepted + TermsVersion)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Dealers!P${rowNumber}:Q${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[termsAcceptedAt, termsVersion]] },
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

function ensureTerms(req, res, next) {
  // must be logged in
  if (!req.session.user) return res.redirect('/login');

  // allow these pages without terms
  const allowed = ['/terms', '/logout', '/privacy-policy', '/cookie-policy', '/complaints-policy'];
  if (allowed.includes(req.path)) return next();

  const user = req.session.user;

  // if user has NOT accepted current version -> force terms
  if (!user.terms_version || user.terms_version !== CURRENT_TERMS_VERSION) {
    return res.redirect('/terms');
  }

  next();
}

// Routes

// Homepage
app.get('/', (req, res) => {
  res.render('index', {
    pageTitle: '009 Compliance | FCA Compliance Reporting Portal for Motor Dealers',
    pageDescription: 'FCA compliance reporting portal for motor dealers. Submit monthly MI, evidence oversight, and support CCR009 workflows.',
    canonicalUrl: `${process.env.BASE_URL || `${req.protocol}://${req.get('host')}`}/`
  });
});

// Metrics API (total users)
app.get('/api/metrics', (req, res) => {
  db.get('SELECT COUNT(*) AS count FROM users', [], (err, row) => {
    if (err) return res.json({ count: 0 });
    res.json({ count: row.count || 0 });
  });
});

app.get('/register', (req, res) => {
  res.render('register', { formData: {} });
});

app.post('/register/precheck', (req, res) => {
  let { firm_name, fca_firm_ref, name, email, password, confirmPassword, mobile_number } = req.body;
mobile_number = normalizeUKMobile(mobile_number);

if (!firm_name || !fca_firm_ref || !name || !email || !password || !confirmPassword || !mobile_number) {
  return res.render('register', {
    formData: { firm_name, fca_firm_ref, name, email, mobile_number },
    error: ['Please complete all fields.'],
    success: []
  });
}

if (password !== confirmPassword) {
  return res.render('register', {
    formData: { firm_name, fca_firm_ref, name, email, mobile_number },
    error: ['Passwords do not match.'],
    success: []
  });
}

  // Passed validation → send user to terms with safe fields only
  // (Do NOT send passwords in querystring)
  req.session.pendingRegister = { firm_name, fca_firm_ref, name, email, mobile_number };
  req.session.pendingPassword = password; // stored server-side in session
  return res.redirect('/terms');
});

app.get('/terms', (req, res) => {
  // Case 1: New registration flow (pending)
  if (req.session.pendingRegister && req.session.pendingPassword) {
    return res.render('terms', { formData: req.session.pendingRegister });
  }

  // Case 2: Existing logged-in user forced to accept new terms
  if (req.session.user) {
    return res.render('terms', { formData: {
      firm_name: req.session.user.firm_name || '',
      fca_firm_ref: req.session.user.fca_firm_ref || '',
      name: req.session.user.name || '',
      email: req.session.user.email || '',
      mobile_number: req.session.user.mobile_number || ''
    }});
  }

  // Otherwise not logged in
  req.flash('error', 'Please log in to view the terms.');
  return res.redirect('/login');
});

app.post('/terms/accept', ensureAuth, async (req, res) => {
  if (req.body.agree_terms !== 'yes') {
    req.flash('error', 'You must agree to the Client Service Agreement to continue.');
    return res.redirect('/terms');
  }

  const userId = req.session.user.id;
  const acceptedAt = getUKTimestamp();

  // Save in SQLite
  db.run(
    'UPDATE users SET terms_accepted_at = ?, terms_version = ? WHERE id = ?',
    [acceptedAt, CURRENT_TERMS_VERSION, userId],
    async (err) => {
      if (err) {
        console.error(err);
        req.flash('error', 'Could not save your agreement. Please try again.');
        return res.redirect('/terms');
      }

      // Update session so middleware stops redirecting
      req.session.user.terms_accepted_at = acceptedAt;
      req.session.user.terms_version = CURRENT_TERMS_VERSION;

      // Update Google Sheet P/Q
      try {
        await upsertDealerInSheet({
          dealerId: userId,
          name: req.session.user.name,
          email: req.session.user.email,
          phone: req.session.user.mobile_number,
          firmName: req.session.user.firm_name || '',
          isActive: true,
          createdAt: acceptedAt,
          unsubscribeToken: req.session.user.unsubscribe_token || '',
          termsAcceptedAt: acceptedAt,
          termsVersion: CURRENT_TERMS_VERSION
        });
      } catch (e) {
        console.error('Dealer Sheets terms update failed:', e.message);
      }

      return res.redirect('/dashboard');
      }
    );
  });

// About page
app.get('/about', (req, res) => {
  res.render('about', {
    pageTitle: 'About | 009 Compliance',
    pageDescription: 'Learn about 009 Compliance and our FCA compliance reporting portal built for motor dealers.'
  });
});


// Contact page
app.get('/contact', (req, res) => {
  res.render('contact', {
    pageTitle: 'Contact | 009 Compliance',
    pageDescription: 'Get in touch with 009 Compliance for help with monthly reporting, oversight evidence, and portal support.'
  });
});

app.post('/contact', async (req, res) => {
  const {
    first_name,
    last_name,
    phone_number,
    company_name,
    email,
    message
  } = req.body;

  const enquiry = {
    first_name: String(first_name || '').trim(),
    last_name: String(last_name || '').trim(),
    phone_number: String(phone_number || '').trim(),
    company_name: String(company_name || '').trim(),
    email: String(email || '').trim(),
    message: String(message || '').trim()
  };

  const requiredFields = Object.values(enquiry);
  const wantsJson = req.xhr || req.headers.accept?.includes('application/json');

  if (requiredFields.some((field) => !String(field || '').trim())) {
    if (wantsJson) {
      return res.status(400).json({
        ok: false,
        message: 'Please complete all required fields before submitting your enquiry.'
      });
    }

    req.flash('error', 'Please complete all required fields before submitting your enquiry.');
    return res.redirect('/contact');
  }

  const submittedAt = getUKTimestamp();

  try {
    await sendEmail({
      to: 'info@009compliance.com',
      replyTo: cleanEmailHeader(enquiry.email),
      subject: cleanEmailHeader(`New website enquiry from ${enquiry.first_name} ${enquiry.last_name}`),
      html: `
        <h2>New website enquiry</h2>
        <p>A new enquiry has been submitted through the 009 Compliance contact page.</p>
        <table cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 720px;">
          <tr>
            <td style="border: 1px solid #e5e7eb;"><strong>First Name</strong></td>
            <td style="border: 1px solid #e5e7eb;">${escapeHtml(enquiry.first_name)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #e5e7eb;"><strong>Last Name</strong></td>
            <td style="border: 1px solid #e5e7eb;">${escapeHtml(enquiry.last_name)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #e5e7eb;"><strong>Phone Number</strong></td>
            <td style="border: 1px solid #e5e7eb;">${escapeHtml(enquiry.phone_number)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #e5e7eb;"><strong>Company Name</strong></td>
            <td style="border: 1px solid #e5e7eb;">${escapeHtml(enquiry.company_name)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #e5e7eb;"><strong>Email</strong></td>
            <td style="border: 1px solid #e5e7eb;">${escapeHtml(enquiry.email)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #e5e7eb;"><strong>Submitted</strong></td>
            <td style="border: 1px solid #e5e7eb;">${escapeHtml(submittedAt)}</td>
          </tr>
        </table>
        <h3>Message</h3>
        <p style="white-space: pre-line;">${escapeHtml(enquiry.message)}</p>
      `
    });

    if (wantsJson) {
      return res.json({
        ok: true,
        message: 'Enquiry Sent'
      });
    }

    req.flash('success', 'Thank you. Your enquiry has been sent and we will get back to you as soon as possible.');
    return res.redirect('/contact');
  } catch (err) {
    console.error('Contact enquiry email failed:', err);

    if (wantsJson) {
      return res.status(500).json({
        ok: false,
        message: 'Unable to send your enquiry at the moment. Please email info@009compliance.com directly.'
      });
    }

    req.flash('error', 'Unable to send your enquiry at the moment. Please email info@009compliance.com directly.');
    return res.redirect('/contact');
  }
});


app.post('/register', async (req, res) => {
  const pending = req.session.pendingRegister;
  const password = req.session.pendingPassword;

  if (!pending || !password) {
    req.flash('error', 'Please start registration again.');
    return res.redirect('/register');
  }

  let { firm_name, fca_firm_ref, name, email, mobile_number } = pending;
  mobile_number = normalizeUKMobile(mobile_number);

  if (req.body.agree_terms !== 'yes') {
    req.flash('error', 'You must agree to the Client Service Agreement to create an account.');
    return res.redirect('/terms');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const verificationToken = require('crypto').randomBytes(32).toString('hex');

  const crypto = require('crypto');
  const unsubscribeToken = crypto.randomBytes(24).toString('hex');

  const termsAcceptedAt = getUKTimestamp();
const termsVersion = CURRENT_TERMS_VERSION;


  // ... keep the db.run INSERT below as-is ...
  db.run(
    'INSERT INTO users (email, password_hash, name, firm_name, fca_firm_ref, mobile_number, verification_token) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [email.toLowerCase(), passwordHash, name, firm_name, fca_firm_ref, mobile_number, verificationToken],
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


      req.session.user = {
  id: this.lastID,
  email: email.toLowerCase(),
  name,
  mobile_number,
  is_verified: 0,
  terms_version: termsVersion,
  terms_accepted_at: termsAcceptedAt,
  firm_name,
  fca_firm_ref,
  unsubscribe_token: unsubscribeToken
};


      req.flash('success', 'Welcome! Your account has been created.');
     
 // ✅ Add/Update dealer in Google Sheets "Dealers" tab
db.run(
  `UPDATE users
   SET unsubscribe_token = ?,
       is_active = 1,
       terms_accepted_at = ?,
       terms_version = ?
   WHERE id = ?`,
  [unsubscribeToken, termsAcceptedAt, termsVersion, this.lastID]
);
    
      
try {
  await upsertDealerInSheet({
  dealerId: this.lastID,
  name,
  email: email.toLowerCase(),
  phone: mobile_number,
  firmName: firm_name,
  createdAt: getUKTimestamp(),
  isActive: true,
  unsubscribeToken,
  termsAcceptedAt,
  termsVersion,
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

      req.session.user = {
  id: user.id,
  email: user.email,
  name: user.name,
  mobile_number: user.mobile_number,
  is_verified: user.is_verified === 1,
  terms_version: user.terms_version || null,
  terms_accepted_at: user.terms_accepted_at || null,
  firm_name: user.firm_name || '',
  fca_firm_ref: user.fca_firm_ref || '',
  unsubscribe_token: user.unsubscribe_token || ''
};



      // Ensure unsubscribe token exists
      const crypto = require('crypto');
      const unsubscribeToken =
        user.unsubscribe_token || crypto.randomBytes(24).toString('hex');

      if (!user.unsubscribe_token) {
        db.run(
          'UPDATE users SET unsubscribe_token = ? WHERE id = ?',
          [unsubscribeToken, user.id]
        );
      }

      return res.redirect('/dashboard');
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
  res.render('forgot_password', { error: [], success: [] });
});

app.post('/forgot-password', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.render('forgot_password', {
      error: ['Please enter your email address.'],
      success: []
    });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], async (err, user) => {
    // Always show success (prevents email enumeration)
    const genericSuccess = 'If that email exists, a reset link has been sent.';

    if (err || !user) {
      return res.render('forgot_password', { error: [], success: [genericSuccess] });
    }

    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    db.run(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetToken, expires.toISOString(), user.id],
      async (updateErr) => {
        if (updateErr) {
          console.error(updateErr);
          return res.render('forgot_password', {
            error: ['Unable to generate reset link. Please try again.'],
            success: []
          });
        }

        try {
          const resetUrl = `${BASE_URL}/reset-password/${resetToken}`;

          await sendEmail({
            to: user.email,
            subject: 'Reset your FCA Compliance password',
            html: `
              <p>Hi ${user.name},</p>
              <p>We received a request to reset your password.</p>
              <p><a href="${resetUrl}">Reset my password</a></p>
              <p>This link is valid for 1 hour.</p>
            `
          });
        } catch (e) {
          console.error('Email send failed:', e);
          // Still show generic success to the user
        }

        return res.render('forgot_password', { error: [], success: [genericSuccess] });
      }
    );
  });
});

app.get('/reset-password/:token', (req, res) => {
  const token = req.params.token;

  db.get('SELECT * FROM users WHERE reset_token = ?', [token], (err, user) => {
    if (err || !user) {
      return res.redirect('/login');
    }

    const now = new Date();
    const expires = new Date(user.reset_token_expires);

    if (now > expires) {
      return res.redirect('/forgot-password');
    }

    return res.render('reset_password', { token, error: [], success: [] });
  });
});

app.post('/reset-password/:token', async (req, res) => {
  const token = req.params.token;
  const { password, confirmPassword } = req.body;

  if (!password || password !== confirmPassword) {
    return res.render('reset_password', {
      token,
      error: ['Passwords do not match.'],
      success: []
    });
  }

  db.get('SELECT * FROM users WHERE reset_token = ?', [token], async (err, user) => {
    if (err || !user) {
      return res.redirect('/login');
    }

    const now = new Date();
    const expires = new Date(user.reset_token_expires);

    if (now > expires) {
      return res.redirect('/forgot-password');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    db.run(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [passwordHash, user.id],
      (updateErr) => {
        if (updateErr) {
          console.error(updateErr);
          return res.render('reset_password', {
            token,
            error: ['Unable to reset password. Please try again.'],
            success: []
          });
        }

        req.flash('success', 'Password has been reset. You can now log in.');
        return res.redirect('/login');
      }
    );
  });
});

// Dashboard
app.get('/dashboard', ensureAuth, ensureTerms, (req, res) => {
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
app.get('/reports/new', ensureAuth, ensureTerms, (req, res) => {
  res.render('report_form', { report: null });
});

app.post('/reports/new', ensureAuth, ensureTerms, async (req, res) => {
  const userId = req.session.user.id;
  const { reporting_month, confirm_submission, ...dataFields } = req.body;

  // ✅ Checkbox validation
  if (confirm_submission !== 'yes') {
    req.flash('error', 'Please confirm the declaration before submitting.');
    return res.render('report_form', { report: null, formData: req.body });
  }

  if (!reporting_month) {
    req.flash('error', 'Please choose the reporting month.');
    return res.render('report_form', { report: null, formData: req.body });
  }

  const dataJson = JSON.stringify(dataFields);

  db.run(
    'INSERT INTO reports (user_id, reporting_month, data) VALUES (?, ?, ?)',
    [userId, reporting_month, dataJson],
    async function (err) {
      if (err) {
        console.error(err);
        req.flash('error', 'Unable to save report. Please try again.');
        return res.render('report_form', { report: null, formData: req.body });
      }

      // ✅ Append to Google Sheet (MUST be inside this async function)
      try {
        const user = req.session.user;
        const createdAt = getUKTimestamp();

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
          this.lastID,              // report id
          user.id,                  // dealer id
          user.name,
          user.email,
          "'" + user.mobile_number, // keep leading 0
          reporting_month,
          createdAt,
          ...answers,
        ];

        await appendRowToSheet('Submissions', row);
      } catch (e) {
        console.error('Sheets error:', e.message);
      }

      // ✅ show toast once on dashboard
      req.flash('showSubmissionToast', 'true');
      req.flash('success', 'Report submitted successfully.');
      return res.redirect('/dashboard');
    }
  );
});

async function updateGoogleSheetRowByReportId(reportId, updatedRowValues) {
  const client = getSheetsClient();
  if (!client) return;

  const { jwt, spreadsheetId } = client;
  await jwt.authorize();
  const sheets = google.sheets({ version: 'v4', auth: jwt });

  const SHEET_NAME = 'Submissions';

  // 1) Read column A from the Submissions tab only
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A:A`,
  });

  const colA = res.data.values || [];
  const rowIndex = colA.findIndex(r => String(r?.[0] ?? '').trim() === String(reportId).trim());

  if (rowIndex === -1) {
    console.warn(`Report ID ${reportId} not found in ${SHEET_NAME}, appending instead.`);
    await appendRowToSheet(SHEET_NAME, updatedRowValues);
    return;
  }

  // Sheets rows are 1-based
  const sheetRowNumber = rowIndex + 1;

  // 2) Update the row starting at column A on the Submissions tab
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A${sheetRowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [updatedRowValues],
    },
  });
  }

// View & edit report
app.get('/reports/:id/edit', ensureAuth, ensureTerms, (req, res) => {
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

app.post('/reports/:id/edit', ensureAuth, ensureTerms, (req, res) => {
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
          reportId,                // A
          user.id,                 // B
          user.name,               // C
          user.email,              // D
          "'" + user.mobile_number,// E (keep leading 0)
          reporting_month,         // F
           updatedAt,               // G (timestamp)
          ...answers,              // H onwards
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
app.get('/reports', ensureAuth, ensureTerms, (req, res) => {
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

app.get('/test-email', async (req, res) => {
  try {
    await sendEmail({
      to: 'YOUR_EMAIL@gmail.com',
      subject: 'Email system working',
      html: '<p>Your email setup works 🎉</p>'
    });
    res.send('Email sent successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Email failed');
  }
});


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

app.get('/ccr009-return-assistance-motor-dealers', (req, res) => {
  res.render('ccr009_return_assistance_motor_dealers', {
    pageTitle: 'CCR009 Return Assistance for Motor Dealers | FCA CCR009 Reporting Support | 009 Compliance Ltd',
    pageDescription: 'CCR009 return assistance for FCA authorised motor dealers. Practical support with FCA CCR009 reporting, RegData submissions, finance introductions, commission reporting, lender relationships, prudential resources and annual FCA reporting obligations',
    robots: 'index,follow',
    ogTitle: 'CCR009 Return Assistance for Motor Dealers | 009 Compliance Ltd',
    ogDescription: 'Practical FCA CCR009 reporting support for motor dealers, including RegData preparation, finance introductions, commission reporting and lender relationship information.',
    ogType: 'article'
  });
});

const ccr009GuidePages = [
  {
    slug: '/what-is-ccr009',
    title: 'What Is CCR009? Plain-English Guide for Motor Dealers',
    description: 'Learn what CCR009 is, why it matters for motor dealers and how it fits into FCA consumer credit reporting.',
    h1: 'What Is CCR009?',
    eyebrow: 'Plain-English CCR009 guide',
    intro: 'CCR009 is an FCA consumer credit regulatory return connected to consumer credit activity. This guide is written for UK motor dealers who introduce customers to finance providers or work in the motor finance space.',
    primaryLink: { href: '/ccr009-return-assistance-motor-dealers', label: 'CCR009 return assistance for motor dealers' },
    panel: {
      kicker: 'Guide focus',
      title: 'Understand the return before preparing it',
      stats: [
        { label: 'Topic', value: 'CCR009' },
        { label: 'Audience', value: 'Motor dealers' },
        { label: 'Platform', value: 'FCA RegData' },
        { label: 'Purpose', value: 'Reporting' }
      ]
    },
    aside: ['Explains the purpose of CCR009', 'Written for motor dealers', 'Links to practical support', 'Includes FCA RegData context'],
    sections: [
      {
        heading: 'What CCR009 is in simple terms',
        text: [
          'CCR009 is a regulatory return used by the Financial Conduct Authority to collect information from certain consumer credit firms.',
          'For a motor dealer, it may relate to activity such as introducing customers to finance, dealing with lenders or brokers, and receiving income connected with regulated credit activity.'
        ]
      },
      {
        heading: 'Why the FCA uses CCR009',
        text: [
          'The FCA uses regulatory returns to understand the type and scale of activity taking place across authorised firms.',
          'CCR009 helps the regulator gather structured information about consumer credit activity rather than relying only on accounts, websites or firm descriptions.'
        ]
      },
      {
        heading: 'Why motor dealers should understand CCR009 reporting',
        text: [
          'Many dealerships see themselves first as vehicle retailers, but finance introductions can bring FCA reporting responsibilities.',
          'Understanding CCR009 early helps a dealer know what information may need to be tracked during the year, especially where finance, commission or customer fee records are involved.'
        ]
      },
      {
        heading: 'How CCR009 connects to FCA RegData',
        text: [
          'CCR009 is normally handled through FCA RegData, the FCA platform used for regulatory reporting.',
          'Firms should check their own RegData account and reporting schedule because the return, timing and required information depend on the firm’s permissions and reporting profile.'
        ]
      },
      {
        heading: 'How CCR009 differs from business accounts or tax reporting',
        text: [
          'CCR009 is not the same as preparing annual accounts or a tax return. Business accounts look at financial performance for accounting and tax purposes.',
          'A consumer credit return focuses on regulated activity, such as finance introductions, income connected with that activity, complaints and other information the FCA may request.'
        ]
      },
      {
        heading: 'Why monthly record keeping makes the return easier',
        text: [
          'CCR009 becomes harder when a firm waits until year end and then tries to reconstruct figures from sales files, lender portals and spreadsheets.',
          'Monthly management information gives the business a clearer record of finance activity while it is still fresh.'
        ]
      },
      {
        heading: 'When a dealer may need support',
        text: [
          'Support may be useful where a dealer is unsure how its finance activity is recorded, where information is held in several places, or where the RegData return raises unfamiliar questions.',
          'For practical help, see our <a href="/ccr009-return-assistance-motor-dealers">CCR009 return assistance for motor dealers</a>.'
        ]
      }
    ],
    support: {
      title: 'Need help understanding or preparing your CCR009 return?',
      text: '009 Compliance helps motor dealers organise the information needed for FCA consumer credit reporting.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'View CCR009 Support'
    },
    cta: {
      title: 'Need help understanding or preparing your CCR009 return?',
      text: '009 Compliance helps motor dealers organise the information needed for FCA consumer credit reporting.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'View CCR009 Support'
    },
    faqs: [
      { question: 'What does CCR009 stand for?', answer: 'CCR009 is commonly referred to as the FCA consumer credit regulatory return. It is used to collect information about certain consumer credit activities.' },
      { question: 'Is CCR009 submitted through FCA RegData?', answer: 'In most cases, CCR009 reporting is handled through FCA RegData. Firms should check their own RegData schedule for current requirements.' },
      { question: 'Is CCR009 only for motor dealers?', answer: 'No. CCR009 is not only for motor dealers. It can apply to different types of firms with relevant consumer credit permissions.' },
      { question: 'Do all FCA-authorised firms submit CCR009?', answer: 'No. Reporting depends on the firm’s permissions and FCA reporting profile, so each firm should check its own requirements.' },
      { question: 'Can 009 Compliance help with CCR009?', answer: 'Yes. 009 Compliance can help motor dealers organise the information needed for CCR009 reporting and understand the process in plain English.' }
    ]
  },
  {
    slug: '/who-needs-to-submit-ccr009',
    title: 'Who Needs to Submit CCR009? Guide for Motor Dealers',
    description: 'Find out which firms may need to submit CCR009, including motor dealers with FCA consumer credit permissions.',
    h1: 'Who Needs to Submit CCR009?',
    eyebrow: 'CCR009 reporting obligations',
    intro: 'Whether a firm needs to submit CCR009 usually depends on its FCA permissions and reporting profile. This guide explains the main points motor dealers should understand before checking their own position.',
    primaryLink: { href: '/ccr009-return-assistance-motor-dealers', label: 'CCR009 support for motor dealers' },
    panel: {
      kicker: 'Guide focus',
      title: 'Permissions, activity and reporting profile',
      stats: [
        { label: 'Question', value: 'Who submits?' },
        { label: 'Key factor', value: 'Permissions' },
        { label: 'Check', value: 'FCA Register' },
        { label: 'Platform', value: 'RegData' }
      ]
    },
    aside: ['Focused on who may need CCR009', 'No absolute legal advice', 'Explains dealer differences', 'Points to support if unsure'],
    sections: [
      {
        heading: 'Why CCR009 depends on FCA permissions',
        text: [
          'CCR009 is linked to regulated consumer credit activity. A firm’s permissions help determine which FCA returns may appear in its reporting schedule.',
          'This means a dealer should not assume that another business has the same obligations simply because it sells similar vehicles.'
        ]
      },
      {
        heading: 'Motor dealers and credit broking activity',
        text: [
          'Many motor dealers introduce customers to lenders or brokers as part of the vehicle sales process.',
          'Where a dealership has credit broking permission, it may need to pay close attention to FCA consumer credit reporting, including whether CCR009 appears in RegData.'
        ]
      },
      {
        heading: 'Finance introductions and consumer credit permissions',
        text: [
          'Finance introductions are often the reason a dealership becomes authorised by the FCA.',
          'The permissions held by the firm, the activity it carries out and the FCA reporting schedule should all be checked together.'
        ]
      },
      {
        heading: 'Other permissions that may affect CCR009',
        text: [
          'Some firms hold additional permissions that go beyond simple credit broking. These can affect the type of reporting information the FCA expects.',
          'A dealer should review its own FCA Register entry and RegData schedule rather than relying on a general assumption.'
        ]
      },
      {
        heading: 'Why firms should check their FCA Register details',
        text: [
          'The FCA Register shows important public information about a firm, including its current status and permissions.',
          'Checking those details can help a dealership understand the activities it is authorised for before reviewing its reporting obligations.'
        ]
      },
      {
        heading: 'Why two dealers may have different reporting obligations',
        text: [
          'Two dealerships may look similar from the outside but hold different permissions, use different finance arrangements or have different reporting schedules.',
          'That is why CCR009 should be checked by reference to the individual firm, not by copying what another dealer does.'
        ]
      },
      {
        heading: 'What to do if you are unsure',
        text: [
          'If CCR009 appears in RegData or you are unsure what information may be needed, take time to review the firm’s permissions, reporting period and available records.',
          'You can also speak to us about <a href="/ccr009-return-assistance-motor-dealers">CCR009 support for motor dealers</a>.'
        ]
      }
    ],
    support: {
      title: 'Unsure whether CCR009 applies to your dealership?',
      text: 'We can help motor dealers understand what information they may need to organise before reporting.',
      href: '/contact',
      button: 'Speak to 009 Compliance'
    },
    cta: {
      title: 'Unsure whether CCR009 applies to your dealership?',
      text: 'We can help motor dealers understand what information they may need to organise before reporting.',
      href: '/contact',
      button: 'Speak to 009 Compliance'
    },
    faqs: [
      { question: 'Do motor dealers need to submit CCR009?', answer: 'Some motor dealers may need to submit CCR009 depending on their FCA permissions and reporting schedule. Firms should check FCA RegData and their own permissions.' },
      { question: 'Does credit broking permission affect CCR009?', answer: 'Credit broking permission can be relevant because CCR009 relates to consumer credit activity. The firm’s full reporting profile should still be checked.' },
      { question: 'Where can a firm check its FCA permissions?', answer: 'A firm can check its public permissions on the FCA Register and should also review its FCA RegData reporting schedule.' },
      { question: 'Can reporting requirements differ between dealers?', answer: 'Yes. Reporting requirements can differ because firms may hold different permissions or have different reporting profiles.' },
      { question: 'What should a dealer do if it is unsure?', answer: 'The dealer should check its FCA Register details, RegData schedule and internal records. It can also seek suitable professional support.' }
    ]
  },
  {
    slug: '/ccr009-reporting-checklist-motor-dealers',
    title: 'CCR009 Reporting Checklist for Motor Dealers',
    description: 'Use this CCR009 checklist to help organise finance, commission, lender and complaints information before reporting.',
    h1: 'CCR009 Reporting Checklist for Motor Dealers',
    eyebrow: 'CCR009 checklist',
    intro: 'This CCR009 reporting checklist helps motor dealers think about the information they may need to organise before completing a consumer credit return.',
    primaryLink: { href: '/ccr009-return-assistance-motor-dealers', label: 'CCR009 return assistance' },
    panel: {
      kicker: 'Checklist focus',
      title: 'Prepare records before reporting',
      stats: [
        { label: 'Records', value: 'Finance' },
        { label: 'Income', value: 'Commission' },
        { label: 'Relationships', value: 'Lenders' },
        { label: 'Access', value: 'RegData' }
      ]
    },
    aside: ['Checklist-led page', 'Short practical prompts', 'Useful before year end', 'Links to CCR009 help'],
    sections: [
      {
        heading: 'CCR009 checklist for motor dealers',
        cards: [
          { title: 'Check your FCA permissions', text: 'Review the permissions held by the firm and confirm the activity shown on the FCA Register.' },
          { title: 'Confirm the reporting period', text: 'Make sure the figures being gathered relate to the correct period shown in FCA RegData.' },
          { title: 'Review finance introductions', text: 'Look at the number and type of finance introductions made during the period.' },
          { title: 'Organise lender and broker information', text: 'Keep a clear list of lenders, brokers and finance partners used by the dealership.' },
          { title: 'Check commission records', text: 'Gather records of commission or other income linked to finance introductions.' },
          { title: 'Review customer fees', text: 'Identify any fees or charges paid by customers in connection with regulated activity.' },
          { title: 'Review complaints records', text: 'Check whether complaints include finance-related issues or consumer credit themes.' },
          { title: 'Check part exchange finance settlement records', text: 'Review records where existing finance was settled as part of a part exchange transaction.' },
          { title: 'Confirm RegData access', text: 'Make sure the right person can access the firm’s FCA RegData account before the deadline.' },
          { title: 'Complete a final sense check before submission', text: 'Review figures for obvious gaps, inconsistencies or missing supporting records.' }
        ]
      }
    ],
    support: {
      title: 'Want help working through your CCR009 checklist?',
      text: '009 Compliance provides practical support for motor dealers preparing consumer credit reporting information.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'View CCR009 Return Assistance'
    },
    cta: {
      title: 'Want help working through your CCR009 checklist?',
      text: '009 Compliance provides practical support for motor dealers preparing consumer credit reporting information.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'View CCR009 Return Assistance'
    },
    faqs: [
      { question: 'What should be included in a CCR009 checklist?', answer: 'A checklist should usually cover permissions, reporting period, finance introductions, lender details, commission records, complaints, RegData access and a final review.' },
      { question: 'Should dealers collect CCR009 information monthly?', answer: 'Monthly collection can make CCR009 reporting easier because records are fresher and less likely to be missed at year end.' },
      { question: 'Do commission records matter for CCR009?', answer: 'Commission records can be relevant where income is connected to consumer credit or finance introduction activity.' },
      { question: 'Should complaints be reviewed before CCR009?', answer: 'Yes. Dealers should review complaints records and consider whether any relate to finance or consumer credit activity.' },
      { question: 'Can 009 Compliance help organise CCR009 information?', answer: 'Yes. 009 Compliance can help motor dealers organise the information needed before completing CCR009 reporting.' }
    ]
  },
  {
    slug: '/what-information-is-needed-for-ccr009',
    title: 'What Information Is Needed for a CCR009 Return?',
    description: 'Learn what information motor dealers may need for CCR009, including finance, commission, lender and complaints data.',
    h1: 'What Information Is Needed for a CCR009 Return?',
    eyebrow: 'CCR009 data guide',
    intro: 'A CCR009 return may require a dealership to organise information about consumer credit activity, finance introductions, income and related records. This guide explains the main data categories motor dealers often need to review.',
    hideSupportBox: true,
    primaryLink: { href: '/ccr009-return-assistance-motor-dealers', label: 'CCR009 return help for motor dealers' },
    panel: {
      kicker: 'Data focus',
      title: 'Know what to gather before you report',
      stats: [
        { label: 'Finance', value: 'Introductions' },
        { label: 'Income', value: 'Commission' },
        { label: 'Records', value: 'Complaints' },
        { label: 'System', value: 'RegData' }
      ]
    },
    aside: ['Data categories only', 'Useful for active preparation', 'Includes monthly MI', 'Links to CCR009 support'],
    sections: [
      { heading: 'Why accurate data matters', text: ['CCR009 reporting relies on information supplied by the firm. Incomplete or poorly organised data can make the return harder to complete and review.', 'The aim is to build a clear record of the activity that sits behind the figures.'] },
      { heading: 'Finance introductions and sales channels', text: ['Dealers may need to review how customers were introduced to finance and which sales routes were involved.', 'This can include showroom activity, online enquiries, telephone sales and any broker-led route where relevant.'] },
      { heading: 'Lender and broker relationships', text: ['A clear record of lender and broker relationships helps explain how the dealership sources finance for customers.', 'It is useful to keep partner names, arrangement types and any changes during the reporting period.'] },
      { heading: 'Commission information', text: ['Commission information may be relevant where income is received from finance introductions or related arrangements.', 'Records should be consistent with the dealership’s own accounting and sales information.'] },
      { heading: 'Customer fees and charges', text: ['Some firms may need to review fees or charges paid by customers in connection with regulated activity.', 'The key point is to separate these from unrelated vehicle sale costs where the records allow.'] },
      { heading: 'Complaints information', text: ['Complaints records can matter where issues relate to finance, credit broking, disclosures or customer understanding.', 'A simple complaint log can make it easier to identify relevant themes before reporting.'] },
      { heading: 'Part exchange finance settlements', text: ['Where existing finance is settled as part of a part exchange, dealers should keep clear records of the transaction.', 'These records can help explain customer journeys and finance-related activity.'] },
      { heading: 'Turnover and regulated income', text: ['CCR009 may ask for information that connects business activity with regulated consumer credit income.', 'Dealers should understand the difference between general vehicle turnover and income linked to regulated activity.'] },
      { heading: 'Prudential or financial information where relevant', text: ['Depending on the firm’s permissions and reporting profile, financial or prudential information may be requested.', 'Firms should check the specific questions shown in their RegData return.'] },
      { heading: 'Why monthly MI helps avoid year-end problems', text: ['Monthly management information reduces the need to rebuild a full year of activity in one go.', 'For help structuring records, see our <a href="/ccr009-return-assistance-motor-dealers">CCR009 return help for motor dealers</a>.'] }
    ],
    support: {
      title: 'Need help organising CCR009 information?',
      text: 'We help motor dealers put structure around the information needed for FCA consumer credit reporting.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'Get CCR009 Support'
    },
    cta: {
      title: 'Need help organising CCR009 information?',
      text: 'We help motor dealers put structure around the information needed for FCA consumer credit reporting.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'Get CCR009 Support'
    },
    faqs: [
      { question: 'What data is needed for CCR009?', answer: 'Data may include finance introductions, lender and broker relationships, commission information, customer fees, complaints and financial information where relevant.' },
      { question: 'Does CCR009 include commission information?', answer: 'Commission information can be relevant where it relates to finance introductions or regulated consumer credit activity.' },
      { question: 'Do complaints records matter for CCR009?', answer: 'Complaints records can matter, especially where complaints relate to finance, credit broking or customer understanding.' },
      { question: 'Should motor dealers track lender information?', answer: 'Yes. Keeping lender and broker information organised can make CCR009 reporting easier to prepare.' },
      { question: 'How can 009 Compliance help?', answer: '009 Compliance helps motor dealers organise information and prepare structured records for FCA consumer credit reporting.' }
    ]
  },
  {
    slug: '/ccr009-vs-ccr007',
    title: 'CCR009 vs CCR007: What Is the Difference?',
    description: 'Understand the difference between CCR009 and CCR007 and why motor dealers may need to track both reporting areas.',
    h1: 'CCR009 vs CCR007: What Is the Difference?',
    eyebrow: 'FCA reporting comparison',
    intro: 'CCR009 and CCR007 are often mentioned together, but they are not the same return. This comparison explains the difference for motor dealers in plain English.',
    primaryLink: { href: '/ccr009-return-assistance-motor-dealers', label: 'CCR009 return support' },
    panel: {
      kicker: 'Comparison focus',
      title: 'Two returns, different information',
      stats: [
        { label: 'CCR009', value: 'Credit activity' },
        { label: 'CCR007', value: 'Complaints' },
        { label: 'Records', value: 'Both matter' },
        { label: 'Audience', value: 'Dealers' }
      ]
    },
    aside: ['Comparison only', 'Explains key difference', 'Links to CCR009 support', 'Links to wider compliance support'],
    sections: [
      { heading: 'Why firms confuse CCR009 and CCR007', text: ['The names look similar and both relate to FCA reporting, so it is easy to mix them up.', 'The important point is that the returns focus on different information.'] },
      { heading: 'CCR009 explained briefly', text: ['CCR009 is connected with consumer credit activity. For motor dealers, that often means finance introductions, income linked to regulated activity and related operational information.'] },
      { heading: 'CCR007 explained briefly', text: ['CCR007 is generally associated with complaints reporting. It focuses on complaint volumes, categories and outcomes rather than finance introduction activity.'] },
      { heading: 'Main difference between the returns', text: ['CCR009 looks at consumer credit activity. CCR007 looks at complaints information.', 'A dealership should avoid treating one as a substitute for the other.'] },
      { heading: 'Why motor dealers should not treat them as the same', text: ['A dealer may need finance records for one return and complaints records for another.', 'Using one set of records for both without review can lead to confusion. For wider help, see our <a href="/motor-dealer-compliance">motor dealer compliance support</a>.'] },
      {
        heading: 'CCR009 vs CCR007 comparison table',
        table: {
          headers: ['Area', 'CCR009', 'CCR007'],
          rows: [
            ['Purpose', 'Helps collect information about consumer credit activity.', 'Helps collect information about complaints.'],
            ['Main focus', 'Finance introductions, regulated income and related activity.', 'Complaint numbers, categories and outcomes.'],
            ['Type of information', 'Lender details, commission, fees and activity records may be relevant.', 'Complaint logs, root causes and closure outcomes may be relevant.'],
            ['Relevance to motor dealers', 'Relevant where the dealer carries out consumer credit activity.', 'Relevant where the firm has reportable complaints obligations.'],
            ['Record keeping needed', 'Finance and sales records should be organised throughout the year.', 'Complaint records should be maintained and reviewed regularly.'],
            ['How 009 Compliance can help', '<a href="/ccr009-return-assistance-motor-dealers">CCR009 return support</a> can help with reporting preparation.', '<a href="/motor-dealer-compliance">Motor dealer compliance support</a> can help with broader record organisation.']
          ]
        }
      },
      { heading: 'How record keeping supports both returns', text: ['Good records make both returns easier. Finance activity, complaints, customer outcomes and internal reviews should be kept in a way that can be understood later.'] },
      { heading: 'When to get support', text: ['Support may be useful if the dealership is unsure which return applies, has poor historic records or needs a more structured process before the next reporting period.'] }
    ],
    support: {
      title: 'Need help understanding FCA reporting?',
      text: '009 Compliance supports motor dealers with CCR009, compliance records and ongoing FCA reporting preparation.',
      href: '/motor-dealer-compliance',
      button: 'View Motor Dealer Compliance Support'
    },
    cta: {
      title: 'Need help understanding FCA reporting?',
      text: '009 Compliance supports motor dealers with CCR009, compliance records and ongoing FCA reporting preparation.',
      href: '/motor-dealer-compliance',
      button: 'View Motor Dealer Compliance Support'
    },
    faqs: [
      { question: 'Is CCR009 the same as CCR007?', answer: 'No. CCR009 and CCR007 are different FCA returns and focus on different information.' },
      { question: 'Can a motor dealer need both CCR009 and CCR007?', answer: 'Yes. A dealer may need to consider both depending on its permissions, activity and reporting schedule.' },
      { question: 'Does CCR007 relate to complaints?', answer: 'Yes. CCR007 is generally associated with complaints reporting.' },
      { question: 'Does CCR009 relate to consumer credit activity?', answer: 'Yes. CCR009 relates to consumer credit activity and may include information linked to finance introductions.' },
      { question: 'Can 009 Compliance help with reporting preparation?', answer: 'Yes. 009 Compliance can help motor dealers organise records for CCR009 and broader FCA reporting preparation.' }
    ]
  },
  {
    slug: '/when-is-ccr009-due',
    title: 'When Is CCR009 Due? CCR009 Deadline Guide',
    description: 'Understand CCR009 reporting timing, annual preparation and why motor dealers should not leave data collection until the deadline.',
    h1: 'When Is CCR009 Due?',
    eyebrow: 'CCR009 deadline guide',
    intro: 'CCR009 timing depends on the firm’s FCA reporting schedule. This guide explains how motor dealers can think about deadlines without relying on fixed dates that may change.',
    primaryLink: { href: '/ccr009-return-assistance-motor-dealers', label: 'CCR009 deadline support' },
    panel: {
      kicker: 'Timing focus',
      title: 'Check RegData before the window opens',
      stats: [
        { label: 'Frequency', value: 'Usually annual' },
        { label: 'Check', value: 'RegData' },
        { label: 'Risk', value: 'Last minute' },
        { label: 'Best habit', value: 'Monthly MI' }
      ]
    },
    aside: ['Deadline-focused guide', 'Avoids hardcoded dates', 'RegData checking emphasised', 'Useful before year end'],
    sections: [
      { heading: 'Why CCR009 timing matters', text: ['A CCR009 return can take longer than expected if the underlying records are not ready.', 'The deadline matters, but the preparation period before it matters just as much.'] },
      { heading: 'Reporting periods and RegData windows', text: ['CCR009 is generally linked to a reporting period and a submission window shown in FCA RegData.', 'The dates can vary, so firms should always check FCA RegData and current FCA guidance for their own schedule.'] },
      { heading: 'Why dealers should check their own FCA reporting schedule', text: ['A dealership should not rely on another firm’s deadline. The reporting schedule belongs to the individual authorised firm.', 'Checking the schedule early helps avoid rushed preparation.'] },
      { heading: 'Why year-end preparation is risky', text: ['Waiting until year end can leave gaps in finance, commission, complaint or lender records.', 'It also increases pressure on staff who may already be dealing with normal trading demands.'] },
      { heading: 'Monthly data collection before the deadline', text: ['Monthly data collection makes the CCR009 return easier because figures can be checked during the year.', 'This can include finance introductions, commission records, complaints and lender information.'] },
      { heading: 'What to check before the reporting window opens', items: ['FCA permissions and reporting schedule', 'RegData login access', 'Finance introduction records', 'Commission and fee records', 'Complaint records', 'Lender and broker information'], grid: true },
      { heading: 'What to do if the deadline is close', text: ['If the deadline is close, focus on gathering the core records, confirming access to RegData and checking the figures for obvious gaps.', 'For help with urgent preparation, speak to us about <a href="/ccr009-return-assistance-motor-dealers">CCR009 deadline support</a>.'] }
    ],
    support: {
      title: 'Is your CCR009 deadline approaching?',
      text: 'We help motor dealers organise the information needed before reporting through FCA RegData.',
      href: '/contact',
      button: 'Speak to 009 Compliance'
    },
    cta: {
      title: 'Is your CCR009 deadline approaching?',
      text: 'We help motor dealers organise the information needed before reporting through FCA RegData.',
      href: '/contact',
      button: 'Speak to 009 Compliance'
    },
    faqs: [
      { question: 'When is CCR009 due?', answer: 'The due date depends on the firm’s FCA reporting schedule. Firms should check FCA RegData for their own deadline.' },
      { question: 'Where can I check my CCR009 deadline?', answer: 'A firm should check its FCA RegData account and current FCA guidance for the relevant reporting schedule.' },
      { question: 'Is CCR009 annual?', answer: 'CCR009 is commonly treated as an annual consumer credit return, but firms should check their own RegData schedule.' },
      { question: 'Should dealers prepare monthly for CCR009?', answer: 'Monthly preparation can reduce year-end pressure and make it easier to gather accurate information.' },
      { question: 'Can 009 Compliance help before a deadline?', answer: 'Yes. 009 Compliance can help motor dealers organise information before a CCR009 reporting deadline.' }
    ]
  },
  {
    slug: '/common-ccr009-reporting-mistakes',
    title: 'Common CCR009 Reporting Mistakes Motor Dealers Should Avoid',
    description: 'Avoid common CCR009 mistakes around finance data, commission records, complaints, RegData access and year-end preparation.',
    h1: 'Common CCR009 Reporting Mistakes',
    eyebrow: 'CCR009 mistakes to avoid',
    intro: 'CCR009 reporting can become difficult when records are incomplete or left until the deadline. This guide highlights common mistakes motor dealers should watch for.',
    primaryLink: { href: '/ccr009-return-assistance-motor-dealers', label: 'CCR009 reporting support' },
    panel: {
      kicker: 'Risk focus',
      title: 'Avoid preventable reporting problems',
      stats: [
        { label: 'Risk', value: 'Deadlines' },
        { label: 'Records', value: 'Finance data' },
        { label: 'Income', value: 'Commission' },
        { label: 'Access', value: 'RegData' }
      ]
    },
    aside: ['Risk-focused guide', 'Practical mistake examples', 'Encourages early records', 'Links to CCR009 support'],
    sections: [
      { heading: 'Leaving the return until the deadline', text: ['The most common problem is waiting until the submission window is nearly closed.', 'This leaves little time to find missing records or question figures that do not look right.'] },
      { heading: 'Not collecting finance data monthly', text: ['Finance introduction data is easier to review when it is collected throughout the year.', 'Leaving it until the end can mean relying on memory, incomplete exports or scattered deal files.'] },
      { heading: 'Mixing up lenders, brokers and introducers', text: ['Dealers should understand who they work with and what role each party plays.', 'Confusing lenders, brokers and introducers can make reporting harder to explain.'] },
      { heading: 'Missing commission information', text: ['Commission records can be important for CCR009 reporting where income is linked to finance activity.', 'A dealer should be able to trace commission information back to sensible records.'] },
      { heading: 'Not separating finance-related complaints', text: ['Complaint records should make it possible to identify issues linked to finance, disclosures or credit broking.', 'A single general complaints folder may not give enough visibility.'] },
      { heading: 'Poor part exchange settlement records', text: ['Part exchange transactions involving finance settlement should be recorded clearly.', 'Missing settlement information can make it harder to understand the customer journey.'] },
      { heading: 'Not checking FCA permissions first', text: ['CCR009 preparation should start with the firm’s permissions and reporting schedule.', 'This helps the dealer understand why the return applies and what activity may be relevant.'] },
      { heading: 'RegData access issues', text: ['A surprising number of problems come from login access, user permissions or uncertainty over who can submit through FCA RegData.', 'Access should be checked well before the deadline.'] },
      { heading: 'No final review before submission', text: ['A final review helps identify obvious gaps, duplicated figures or inconsistencies before submission.', 'That review should happen before the deadline pressure becomes too high.'] },
      { heading: 'How to reduce the risk of mistakes', text: ['Keep monthly records, review permissions, maintain lender and commission information, and check RegData access early.', 'For practical help, see our <a href="/ccr009-return-assistance-motor-dealers">CCR009 reporting support</a>.'] }
    ],
    support: {
      title: 'Want to reduce CCR009 reporting errors?',
      text: '009 Compliance helps motor dealers put structure around reporting information before submission.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'View CCR009 Support'
    },
    cta: {
      title: 'Want to reduce CCR009 reporting errors?',
      text: '009 Compliance helps motor dealers put structure around reporting information before submission.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'View CCR009 Support'
    },
    faqs: [
      { question: 'What are common CCR009 mistakes?', answer: 'Common mistakes include late preparation, missing finance data, poor commission records, unclear lender information and RegData access issues.' },
      { question: 'Why is monthly record keeping important?', answer: 'Monthly record keeping helps firms keep finance and reporting information organised while it is still current.' },
      { question: 'Can missing commission data cause problems?', answer: 'Missing commission data can make CCR009 preparation harder where commission is relevant to the firm’s consumer credit activity.' },
      { question: 'Should complaints be reviewed before CCR009?', answer: 'Yes. Complaints should be reviewed to identify any finance-related or consumer credit themes.' },
      { question: 'Can 009 Compliance review CCR009 information?', answer: '009 Compliance can help motor dealers organise and sense-check CCR009 information, but the firm remains responsible for its submissions.' }
    ]
  },
  {
    slug: '/how-to-prepare-for-ccr009-return',
    title: 'How to Prepare for a CCR009 Return',
    description: 'A practical step-by-step guide for motor dealers preparing finance, commission and complaints information for CCR009.',
    h1: 'How to Prepare for a CCR009 Return',
    eyebrow: 'CCR009 preparation guide',
    intro: 'Preparing for a CCR009 return is easier when the work is done in a clear order. This guide gives motor dealers a practical sequence for organising finance, commission and complaints information.',
    hideSupportBox: true,
    primaryLink: { href: '/ccr009-return-assistance-motor-dealers', label: 'Prepare for your CCR009 return' },
    panel: {
      kicker: 'Process focus',
      title: 'A practical preparation sequence',
      stats: [
        { label: 'Step 1', value: 'Permissions' },
        { label: 'Step 2', value: 'Period' },
        { label: 'Step 3', value: 'Records' },
        { label: 'Step 4', value: 'Review' }
      ]
    },
    aside: ['Step-by-step process', 'Explains the order of work', 'Useful before RegData', 'Links to preparation support'],
    sections: [
      { heading: 'Start with your FCA permissions', text: ['Begin by reviewing the permissions held by the firm and the activity it carries out.', 'This gives context for the information that may be relevant to the CCR009 return.'] },
      { heading: 'Confirm your reporting period', text: ['Before gathering figures, confirm the reporting period shown in FCA RegData.', 'Using the wrong period can create avoidable confusion later.'] },
      { heading: 'Gather finance introduction data', text: ['Review the finance introductions made during the period and how those introductions were recorded.', 'This should include the main routes customers used to access finance.'] },
      { heading: 'Review lender and broker arrangements', text: ['Prepare a clear list of lenders, brokers and finance partners used by the dealership.', 'Note any changes that occurred during the reporting period.'] },
      { heading: 'Organise commission records', text: ['Gather records of commission or other finance-related income.', 'Where possible, keep the records traceable to the underlying deals or lender statements.'] },
      { heading: 'Check customer fee records', text: ['Review whether any customer fees or charges are connected with regulated activity.', 'Separate those records from unrelated vehicle sale costs where appropriate.'] },
      { heading: 'Review complaints and outcomes', text: ['Check complaints records for finance-related themes, outcomes and closure information.', 'This helps the dealership understand whether complaints information is relevant to reporting.'] },
      { heading: 'Check RegData access', text: ['Make sure the correct person can access FCA RegData and that login details are working.', 'This should be done before the submission window becomes urgent.'] },
      { heading: 'Complete a pre-submission review', text: ['Before submission, review the information for obvious gaps, duplicated figures or inconsistent records.', 'The firm remains responsible for the accuracy of information submitted.'] },
      { heading: 'Set up monthly MI for next year', text: ['Once the return is complete, set up monthly management information for the next reporting period.', 'For support with this process, we can help you <a href="/ccr009-return-assistance-motor-dealers">prepare for your CCR009 return</a>.'] }
    ],
    support: {
      title: 'Need support preparing your CCR009 return?',
      text: 'We help motor dealers organise the information needed for FCA consumer credit reporting.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'View CCR009 Return Assistance'
    },
    cta: {
      title: 'Need support preparing your CCR009 return?',
      text: 'We help motor dealers organise the information needed for FCA consumer credit reporting.',
      href: '/ccr009-return-assistance-motor-dealers',
      button: 'View CCR009 Return Assistance'
    },
    faqs: [
      { question: 'How should motor dealers prepare for CCR009?', answer: 'They should review permissions, confirm the reporting period, gather finance and commission records, review complaints and check RegData access.' },
      { question: 'When should preparation start?', answer: 'Preparation should start well before the deadline. Monthly record keeping can make the annual return easier.' },
      { question: 'What records should be reviewed first?', answer: 'Start with FCA permissions and the reporting period, then review finance introduction data and related records.' },
      { question: 'Is RegData access important?', answer: 'Yes. Firms should confirm FCA RegData access before the reporting window becomes urgent.' },
      { question: 'Can 009 Compliance help prepare the information?', answer: 'Yes. 009 Compliance can help motor dealers organise the information needed before CCR009 reporting.' }
    ]
  }
];

const officialFcaLinks = {
  regData: {
    label: 'FCA RegData',
    href: 'https://www.fca.org.uk/firms/regdata',
    text: 'for checking reporting schedules and submitting regulatory returns.'
  },
  register: {
    label: 'FCA Register',
    href: 'https://register.fca.org.uk/s/',
    text: 'for checking firm status, permissions and appointed representative information.'
  },
  authorisation: {
    label: 'FCA authorisation',
    href: 'https://www.fca.org.uk/firms/authorisation',
    text: 'for official information about applying to be authorised.'
  },
  connect: {
    label: 'FCA Connect',
    href: 'https://connect.fca.org.uk/',
    text: 'for applications, notifications and related FCA interactions.'
  },
  consumerDuty: {
    label: 'FCA Consumer Duty',
    href: 'https://www.fca.org.uk/firms/consumer-duty',
    text: 'for the FCA’s current Consumer Duty material.'
  }
};

function enrichGuidePage(page) {
  page.summaryHeading = page.summaryHeading || `${page.h1} key checks`;

  if (!page.summaryCards) {
    if (page.slug.includes('ccr009')) {
      page.summaryHeading = page.summaryHeading || 'What this CCR009 guide helps you check';
      page.summaryCards = [
        {
          title: 'The reporting question',
          text: 'What the page is helping you decide, such as whether a CCR009 return applies, what reporting information to gather, or how to prepare before the RegData window opens.'
        },
        {
          title: 'The dealership records',
          text: 'Where the answer is likely to sit in practice, including lender portals, DMS records, spreadsheets, emails, complaints logs and finance commission statements.'
        },
        {
          title: 'The next sensible step',
          text: 'How to move from reading about FCA consumer credit reporting to keeping monthly MI and submission preparation in a more organised place.'
        }
      ];
    } else if (page.slug.includes('fca') || page.slug.includes('credit-broking') || page.slug.includes('approval')) {
      page.summaryHeading = page.summaryHeading || 'What this FCA authorisation guide helps you check';
      page.summaryCards = [
        {
          title: 'The regulated activity',
          text: 'Whether the dealership is simply selling vehicles or also introducing customers to lenders, brokers or motor finance products.'
        },
        {
          title: 'The evidence trail',
          text: 'How the customer journey, website wording, application documents and FCA permissions should tell the same story.'
        },
        {
          title: 'The practical next step',
          text: 'What to prepare before an FCA application, FCA licence discussion or post-approval compliance review.'
        }
      ];
    } else {
      page.summaryHeading = page.summaryHeading || 'What this compliance guide helps you check';
      page.summaryCards = [
        {
          title: 'The customer journey',
          text: 'How customers move from enquiry to finance discussion, disclosure, complaint handling and aftersales support.'
        },
        {
          title: 'The compliance records',
          text: 'Where evidence is kept for Consumer Duty, vulnerable customers, website compliance, monitoring and complaints handling.'
        },
        {
          title: 'The routine review',
          text: 'How to turn dealership compliance into monthly checks rather than a rushed exercise when something goes wrong.'
        }
      ];
    }
  }

  if (!page.officialLinks) {
    if (page.slug.includes('ccr009') || page.slug.includes('when-is')) {
      page.officialLinks = [officialFcaLinks.regData, officialFcaLinks.register];
    } else if (page.slug.includes('consumer-duty')) {
      page.officialLinks = [officialFcaLinks.consumerDuty, officialFcaLinks.register];
    } else if (page.slug.includes('website-compliance')) {
      page.officialLinks = [officialFcaLinks.register, officialFcaLinks.consumerDuty];
    } else if (page.slug.includes('fca') || page.slug.includes('credit-broking') || page.slug.includes('approval')) {
      page.officialLinks = [officialFcaLinks.authorisation, officialFcaLinks.connect, officialFcaLinks.register];
    }
  }

  const firstSection = page.sections && page.sections[0];
  if (firstSection && !firstSection.note) {
    firstSection.note = {
      title: 'Motor trade example',
      text: page.slug.includes('ccr009')
        ? 'A dealer may have finance proposal data in a lender portal, commission totals in a statement, complaints in a shared mailbox and part exchange settlement figures in deal files. The return is easier when those records can be brought together before the deadline.'
        : page.slug.includes('website-compliance') || page.slug.includes('consumer-duty') || page.slug.includes('compliance')
          ? 'A dealership may update its finance page, change broker arrangements and train new sales staff at different times. A short compliance review helps check that the customer journey, website wording and staff process still match.'
          : 'A car dealer may describe itself as a vehicle retailer, but the finance conversation can still involve regulated activity. The customer journey, lender relationship and website wording need to be checked together.'
    };
  }
}

function setChecklistCardDetails(page) {
  const checklist = page.sections.find((section) => section.cards);
  if (!checklist) return;

  checklist.cards = checklist.cards.map((card) => ({
    ...card,
    text: card.text,
    details: [
      {
        label: 'What to check',
        text: {
          'Check your FCA permissions': 'Compare the firm’s FCA Register entry with the activity actually taking place in the dealership, including finance introductions and any broker relationships.',
          'Confirm the reporting period': 'Check the dates shown in FCA RegData before gathering figures, especially if the dealership year end and FCA reporting period do not feel aligned.',
          'Review finance introductions': 'Check how many customers were introduced to lenders, which lender or broker was used, and whether proposals were accepted, declined or not completed.',
          'Organise lender and broker information': 'Keep lender names, broker arrangements and introducer relationships in one place, rather than spread across emails and sales staff notes.',
          'Check commission records': 'Check lender commission statements, how totals are calculated and where commission disclosure wording is held.',
          'Review customer fees': 'Identify any finance-related fees or charges and separate them from normal vehicle sale costs where the records allow.',
          'Review complaints records': 'Look for complaints about finance explanations, affordability discussions, commission disclosure, declined proposals or customer misunderstanding.',
          'Check part exchange finance settlement records': 'Review deal files where existing finance was settled, including settlement figures, lender details and customer communications.',
          'Confirm RegData access': 'Make sure the right person can log in, see the return and understand what information is needed before the deadline is close.',
          'Complete a final sense check before submission': 'Compare totals against sales records, lender statements and complaint logs so obvious gaps can be queried before submission.'
        }[card.title] || card.text
      },
      {
        label: 'Record that may help',
        text: {
          'Check your FCA permissions': 'FCA Register extract, permissions summary and current finance process notes.',
          'Confirm the reporting period': 'RegData schedule, internal reporting calendar and monthly MI file.',
          'Review finance introductions': 'DMS report, lender portal export, finance proposal log or spreadsheet.',
          'Organise lender and broker information': 'Current lender panel, broker agreements and commission statements.',
          'Check commission records': 'Lender commission statements, invoices, accounting records and disclosure wording.',
          'Review customer fees': 'Deal files, invoices and sales ledger records.',
          'Review complaints records': 'Complaints log, email records, outcomes and root cause notes.',
          'Check part exchange finance settlement records': 'Settlement letters, lender confirmations and deal jackets.',
          'Confirm RegData access': 'RegData user list, login check and internal owner for submission preparation.',
          'Complete a final sense check before submission': 'A short review note showing what was checked and where figures came from.'
        }[card.title] || 'Keep a clear source record that explains where the figure or answer came from.'
      },
      {
        label: 'Common issue to avoid',
        text: 'Avoid relying on memory or one person’s inbox. CCR009 reporting becomes harder when finance information is split across systems with no monthly review.'
      }
    ]
  }));
}

const whatIsCcr009 = ccr009GuidePages.find((page) => page.slug === '/what-is-ccr009');
if (whatIsCcr009) {
  whatIsCcr009.sections[0].text.push('A useful way to think about it is this: accounts show how the business performed financially, while the FCA CCR009 return asks for information about regulated consumer credit activity.');
  whatIsCcr009.sections[2].text.push('For a dealer principal or sales manager, the practical issue is knowing where the finance introduction data, lender information and commission information are kept before the return is due.');
}

const whoNeedsCcr009 = ccr009GuidePages.find((page) => page.slug === '/who-needs-to-submit-ccr009');
if (whoNeedsCcr009) {
  whoNeedsCcr009.sections[1].text.push('A dealer using a lender panel, sending customers to a broker, or helping customers complete finance proposals should look closely at its permissions and RegData schedule.');
  whoNeedsCcr009.sections[6].note = {
    title: 'Practical check',
    text: 'Do not only ask whether you sell cars. Check whether the dealership introduces customers to finance, receives commission, handles part exchange finance settlement figures or describes finance on its website.'
  };
}

const ccr009Checklist = ccr009GuidePages.find((page) => page.slug === '/ccr009-reporting-checklist-motor-dealers');
if (ccr009Checklist) {
  ccr009Checklist.summaryCards = [
    {
      title: 'Work from source records',
      text: 'Use lender portal exports, commission statements, complaints logs and deal files rather than rough year-end estimates.'
    },
    {
      title: 'Check the story makes sense',
      text: 'Finance introductions, lender relationships, commission totals and complaints data should broadly line up with how the dealership traded during the period.'
    },
    {
      title: 'Leave time for questions',
      text: 'A checklist is most useful before the RegData deadline, when there is still time to find missing files or challenge unclear figures.'
    }
  ];
  setChecklistCardDetails(ccr009Checklist);
}

const ccr009Info = ccr009GuidePages.find((page) => page.slug === '/what-information-is-needed-for-ccr009');
if (ccr009Info) {
  ccr009Info.sections[1].text.push('For example, a proposal accepted by one lender, a declined application with another lender and a customer who walked away before signing may need to be treated differently in the dealership’s own records.');
  ccr009Info.sections[3].note = {
    title: 'Commission records in practice',
    text: 'If the dealership receives lender commission, keep a clear record of how commission is calculated, where it is disclosed, and how totals are checked before reporting.'
  };
}

const ccr009Vs = ccr009GuidePages.find((page) => page.slug === '/ccr009-vs-ccr007');
if (ccr009Vs) {
  ccr009Vs.sections[6].text.push('A finance-related complaint may therefore matter for complaints reporting and also help the firm understand whether its finance customer journey needs attention.');
}

const ccr009Deadline = ccr009GuidePages.find((page) => page.slug === '/when-is-ccr009-due');
if (ccr009Deadline) {
  ccr009Deadline.summaryCards = [
    {
      title: 'Check the firm’s own schedule',
      text: 'The safest starting point is the firm’s own FCA RegData schedule, not a date copied from another dealership.'
    },
    {
      title: 'Understand the reporting period',
      text: 'The period tells you which finance introductions, commission records, complaints and settlement records belong in the preparation file.'
    },
    {
      title: 'Prepare before the window opens',
      text: 'RegData access, lender exports and monthly MI should be checked before the reporting window becomes urgent.'
    }
  ];
  ccr009Deadline.sections[2].text.push('A dealership with more than one trading name or multiple sales sites should also check who owns the RegData task internally.');
  ccr009Deadline.sections[6].note = {
    title: 'If the deadline is close',
    text: 'Prioritise RegData access, the reporting period, finance introduction totals, commission statements, complaints data and a short final review note showing where the figures came from.'
  };
}

const ccr009Mistakes = ccr009GuidePages.find((page) => page.slug === '/common-ccr009-reporting-mistakes');
if (ccr009Mistakes) {
  ccr009Mistakes.summaryCards = [
    {
      title: 'What usually goes wrong',
      text: 'The return is left until late, finance records are split across systems, or commission and lender information cannot be traced quickly.'
    },
    {
      title: 'Why it matters',
      text: 'Poor records make it harder to explain the figures and increase the chance that obvious errors are missed before submission.'
    },
    {
      title: 'How to reduce the risk',
      text: 'Use monthly MI, keep source records, check RegData access early and review finance-related complaints before the deadline.'
    }
  ];
}

const ccr009Prepare = ccr009GuidePages.find((page) => page.slug === '/how-to-prepare-for-ccr009-return');
if (ccr009Prepare) {
  ccr009Prepare.sections[2].text.push('Where records are spread across spreadsheets, DMS reports, lender portals and emails, create one preparation file that explains the source of each figure.');
  ccr009Prepare.sections[8].note = {
    title: 'Pre-submission sense check',
    text: 'Ask whether the finance introduction totals, commission totals, lender list and complaints records look consistent with the dealership’s trading activity for the period.'
  };
}

ccr009GuidePages.forEach(enrichGuidePage);

ccr009GuidePages.forEach((page) => {
  app.get(page.slug, (req, res) => {
    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer
        }
      }))
    };

    res.render('ccr009_guide_page', {
      page: { hideSupportBox: true, ...page },
      faqSchema,
      pageTitle: page.title,
      pageDescription: page.description,
      canonicalUrl: `https://009compliance.com${page.slug}`,
      robots: 'index,follow',
      ogTitle: page.title,
      ogDescription: page.description,
      ogType: 'article'
    });
  });
});

const motorDealerSeoPages = [
  {
    slug: '/do-motor-dealers-need-fca-authorisation',
    title: 'Do Motor Dealers Need FCA Authorisation?',
    description: 'Learn when motor dealers may need FCA authorisation to introduce customers to vehicle finance or carry out credit broking.',
    h1: 'Do Motor Dealers Need FCA Authorisation?',
    eyebrow: 'FCA authorisation guide',
    guideLabel: 'FCA authorisation guide',
    intro: 'Motor dealers may need FCA authorisation when they introduce customers to vehicle finance or carry out credit broking activity. This guide explains the decision points in plain English.',
    primaryLink: { href: '/fca-authorisation-motor-dealers', label: 'FCA authorisation support for motor dealers' },
    secondaryLink: { href: '/contact', label: 'Ask About FCA Authorisation' },
    panel: {
      kicker: 'Guide focus',
      title: 'Understand when authorisation may apply',
      stats: [
        { label: 'Topic', value: 'Authorisation' },
        { label: 'Activity', value: 'Finance' },
        { label: 'Permission', value: 'Credit broking' },
        { label: 'Audience', value: 'Dealers' }
      ]
    },
    sections: [
      { heading: 'Why FCA authorisation matters for motor dealers', text: ['FCA authorisation matters because vehicle finance introductions can fall within regulated consumer credit activity.', 'A dealership should understand its position before offering finance options to customers.'] },
      { heading: 'Vehicle finance introductions and credit broking', text: ['Introducing a customer to a lender or finance broker can amount to credit broking.', 'The exact position depends on what the dealer does in practice, not just the wording used on the website or sales documents.'] },
      { heading: 'When authorisation may be needed', text: ['Authorisation may be needed where a dealer introduces customers to finance providers, helps arrange finance, or presents finance options as part of the sales journey.', 'Dealers should check their activities before starting or expanding finance introductions.'] },
      { heading: 'Why activities matter more than business labels', text: ['A business may call itself a car dealer, used vehicle retailer or brokerage, but FCA permissions are driven by activity.', 'The key question is what the firm actually does with customers and finance providers.'] },
      { heading: 'What FCA permissions may be relevant', text: ['For many dealers, credit broking permission is the main consumer credit permission to consider.', 'Some firms may need different or additional permissions depending on the services they provide.'] },
      { heading: 'What happens if a dealer starts offering finance without checking', text: ['Starting finance activity without checking permissions can create avoidable regulatory and commercial risk.', 'It may also cause issues with lenders, customer disclosures and future FCA reporting.'] },
      { heading: 'How to check your position', text: ['Review the customer journey, finance process, website wording and any lender or broker arrangements.', 'If you need help, see our <a href="/fca-authorisation-motor-dealers">FCA authorisation support for motor dealers</a>.'] }
    ],
    support: {
      title: 'Need help applying for FCA authorisation?',
      text: '009 Compliance supports motor dealers with practical FCA application preparation.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Authorisation Support'
    },
    cta: {
      title: 'Need help applying for FCA authorisation?',
      text: '009 Compliance supports motor dealers with practical FCA application preparation.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Authorisation Support'
    },
    faqs: [
      { question: 'Do car dealers need FCA authorisation?', answer: 'Some car dealers need FCA authorisation, especially where they introduce customers to vehicle finance or carry out credit broking activity.' },
      { question: 'Do I need FCA authorisation to introduce finance?', answer: 'You may need FCA authorisation if you introduce customers to lenders or brokers. The answer depends on the activity and permissions required.' },
      { question: 'What is credit broking for motor dealers?', answer: 'Credit broking can include introducing customers to finance providers or helping arrange vehicle finance.' },
      { question: 'Can a dealer apply for Limited Permission?', answer: 'Many motor dealers apply for Limited Permission where consumer credit activity is secondary to vehicle sales.' },
      { question: 'Can 009 Compliance help with an application?', answer: 'Yes. 009 Compliance can help motor dealers prepare FCA authorisation applications and supporting documents.' }
    ]
  },
  {
    slug: '/fca-licence-car-dealers',
    title: 'FCA Licence for Car Dealers: What You Need to Know',
    description: 'A plain-English guide to FCA licence, FCA authorisation and consumer credit permissions for UK car dealers.',
    h1: 'FCA Licence for Car Dealers',
    eyebrow: 'FCA licence terminology',
    guideLabel: 'FCA licence guide',
    intro: 'Many car dealers search for an FCA licence, even though the FCA usually refers to authorisation and permissions. This guide explains the wording and what it means for vehicle finance activity.',
    primaryLink: { href: '/fca-authorisation-motor-dealers', label: 'FCA licence support for car dealers' },
    secondaryLink: { href: '/contact', label: 'Ask About FCA Licence Support' },
    panel: {
      kicker: 'Guide focus',
      title: 'Licence wording and FCA permissions',
      stats: [
        { label: 'Common term', value: 'FCA licence' },
        { label: 'FCA term', value: 'Authorisation' },
        { label: 'Activity', value: 'Credit broking' },
        { label: 'Dealer type', value: 'Car dealers' }
      ]
    },
    sections: [
      { heading: 'Why people say FCA licence', text: ['Many dealers still use the phrase FCA licence because it is simple and widely understood.', 'In practice, firms are usually talking about FCA authorisation and consumer credit permissions.'] },
      { heading: 'FCA authorisation vs FCA licence', text: ['FCA authorisation is the formal status a firm may need before carrying out regulated activity.', 'An FCA licence is a common search phrase, but the application process is about permissions and authorisation.'] },
      { heading: 'Consumer credit permissions for car dealers', text: ['Car dealers that introduce customers to finance providers may need consumer credit permissions.', 'The permission most often discussed in this context is credit broking permission.'] },
      { heading: 'Credit broking and vehicle finance introductions', text: ['Credit broking can include introducing a customer to a lender or broker as part of a vehicle sale.', 'Dealers should understand the finance journey before deciding what permissions may be required.'] },
      { heading: 'Limited Permission explained briefly', text: ['Limited Permission can apply where consumer credit activity is secondary to the main business.', 'For many car dealers, the main business is selling vehicles and the finance introduction supports that sale.'] },
      { heading: 'Why the right wording matters in an application', text: ['The wording used in an FCA application should accurately describe the business and customer journey.', 'Using vague or inconsistent wording can make the application harder to understand.'] },
      { heading: 'What to prepare before applying', text: ['Before applying, dealers should prepare a clear business description, customer journey, compliance documents and website wording.', 'For help with this, see our <a href="/fca-authorisation-motor-dealers">FCA licence support for car dealers</a>.'] }
    ],
    support: {
      title: 'Applying for an FCA licence as a car dealer?',
      text: 'We help motor dealers prepare FCA authorisation applications for credit broking and vehicle finance activity.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Licence Support'
    },
    cta: {
      title: 'Applying for an FCA licence as a car dealer?',
      text: 'We help motor dealers prepare FCA authorisation applications for credit broking and vehicle finance activity.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Licence Support'
    },
    faqs: [
      { question: 'Is an FCA licence the same as FCA authorisation?', answer: 'People often use the phrase FCA licence, but the FCA usually refers to authorisation and permissions.' },
      { question: 'Do car dealers need a consumer credit licence?', answer: 'Car dealers may need FCA authorisation with consumer credit permissions if they introduce customers to finance providers.' },
      { question: 'What is credit broking permission?', answer: 'Credit broking permission can allow a firm to introduce customers to lenders or finance brokers where the activity is regulated.' },
      { question: 'What is Limited Permission?', answer: 'Limited Permission can apply where regulated consumer credit activity is secondary to the firm’s main business.' },
      { question: 'Can 009 Compliance help with FCA licence applications?', answer: 'Yes. 009 Compliance helps motor dealers prepare FCA authorisation applications and supporting documents.' }
    ]
  },
  {
    slug: '/limited-permission-fca-authorisation-motor-dealers',
    title: 'Limited Permission FCA Authorisation for Motor Dealers',
    description: 'Learn what Limited Permission means for motor dealers applying for FCA authorisation for consumer credit activity.',
    h1: 'Limited Permission FCA Authorisation for Motor Dealers',
    eyebrow: 'Limited Permission guide',
    guideLabel: 'Limited Permission guide',
    intro: 'Limited Permission FCA authorisation can be relevant where a motor dealer carries out consumer credit activity as a secondary part of selling vehicles.',
    primaryLink: { href: '/fca-authorisation-motor-dealers', label: 'Limited Permission FCA application support' },
    secondaryLink: { href: '/contact', label: 'Ask About Limited Permission' },
    panel: {
      kicker: 'Guide focus',
      title: 'Understand Limited Permission before applying',
      stats: [
        { label: 'Permission', value: 'Limited' },
        { label: 'Activity', value: 'Credit broking' },
        { label: 'Sector', value: 'Motor trade' },
        { label: 'Need', value: 'Preparation' }
      ]
    },
    sections: [
      { heading: 'What Limited Permission means', text: ['Limited Permission is a category of FCA authorisation for certain firms carrying out specified consumer credit activities.', 'It is still authorisation and still requires a clear application.'] },
      { heading: 'Why it can apply to motor dealers', text: ['It can apply where finance introductions support the main activity of selling vehicles.', 'The dealership must still explain how the finance journey works and how customers are treated.'] },
      { heading: 'Credit broking and motor finance introductions', text: ['Many Limited Permission applications for dealers involve credit broking permission.', 'This is because the dealer may introduce customers to lenders or brokers during the vehicle purchase.'] },
      { heading: 'Why Limited Permission still requires proper preparation', text: ['Limited Permission should not be treated as informal or automatic.', 'The FCA may still expect proportionate systems, documents and a clear understanding of the regulated activity.'] },
      { heading: 'Information the FCA may expect', items: ['Business model and ownership details', 'Customer journey and sales process', 'Finance introduction process', 'Compliance procedures', 'Complaints handling approach', 'Website and disclosure wording'], grid: true },
      { heading: 'Common application weaknesses', text: ['Applications can be weakened by vague customer journeys, inconsistent documents or website wording that does not match the application.', 'A clear and joined-up application is easier to understand.'] },
      { heading: 'What happens after authorisation', text: ['After authorisation, firms need to maintain records, monitor compliance and keep information current.', 'For application help, see our <a href="/fca-authorisation-motor-dealers">Limited Permission FCA application support</a>.'] }
    ],
    support: {
      title: 'Need help with a Limited Permission application?',
      text: '009 Compliance provides structured FCA application support for motor dealers.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Authorisation Support'
    },
    cta: {
      title: 'Need help with a Limited Permission application?',
      text: '009 Compliance provides structured FCA application support for motor dealers.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Authorisation Support'
    },
    faqs: [
      { question: 'What is Limited Permission?', answer: 'Limited Permission is a form of FCA authorisation for certain firms where consumer credit activity is limited or secondary to the main business.' },
      { question: 'Can motor dealers apply for Limited Permission?', answer: 'Many motor dealers may apply for Limited Permission where finance introductions are secondary to vehicle sales.' },
      { question: 'Does Limited Permission mean light-touch compliance?', answer: 'No. It may be proportionate, but firms still need appropriate systems, documents and ongoing compliance arrangements.' },
      { question: 'What documents may be needed?', answer: 'Documents may include a business plan, compliance procedures, monitoring arrangements, complaints procedure and customer journey information.' },
      { question: 'Can 009 Compliance help?', answer: 'Yes. 009 Compliance can help motor dealers prepare Limited Permission FCA applications.' }
    ]
  },
  {
    slug: '/credit-broking-permission-motor-dealers',
    title: 'Credit Broking Permission for Motor Dealers',
    description: 'Understand credit broking permission for motor dealers who introduce customers to vehicle finance providers.',
    h1: 'Credit Broking Permission for Motor Dealers',
    eyebrow: 'Credit broking guide',
    guideLabel: 'Credit broking guide',
    intro: 'Credit broking permission is often central to FCA authorisation for motor dealers that introduce customers to vehicle finance providers.',
    primaryLink: { href: '/fca-authorisation-motor-dealers', label: 'Credit broking permission support' },
    secondaryLink: { href: '/contact', label: 'Ask About Credit Broking' },
    panel: {
      kicker: 'Guide focus',
      title: 'One regulated activity, explained clearly',
      stats: [
        { label: 'Permission', value: 'Credit broking' },
        { label: 'Activity', value: 'Introductions' },
        { label: 'Records', value: 'Commission' },
        { label: 'Reporting', value: 'CCR009' }
      ]
    },
    sections: [
      { heading: 'What credit broking means in a motor dealer setting', text: ['In a dealership, credit broking can involve introducing a customer to a finance provider or broker.', 'It can form part of the vehicle sales journey even where the dealer is not lending money itself.'] },
      { heading: 'Introducing customers to lenders', text: ['If staff discuss finance options or direct customers towards a lender, the firm should consider whether permission is required.', 'The practical customer journey matters.'] },
      { heading: 'Finance proposals and customer journeys', text: ['A finance proposal should sit within a clear customer journey that explains who does what and when.', 'This helps with FCA applications, disclosures and ongoing records.'] },
      { heading: 'Why permission matters before offering finance', text: ['Dealers should check permissions before offering finance or promoting finance availability.', 'This can avoid issues with lenders, customers and regulatory expectations.'] },
      { heading: 'Commission and disclosure considerations', text: ['Commission arrangements should be understood and disclosed appropriately where required.', 'Records should show how finance-related income is managed.'] },
      { heading: 'How credit broking connects to CCR009', text: ['Credit broking activity can feed into FCA consumer credit reporting, including CCR009 where applicable.', 'For reporting help, see our <a href="/ccr009-return-assistance-motor-dealers">CCR009 reporting support</a>.'] },
      { heading: 'Records dealers should keep', text: ['Dealers should keep records of finance introductions, lender relationships, commission information, customer disclosures and complaints.', 'For permission support, see our <a href="/fca-authorisation-motor-dealers">credit broking permission support</a>.'] }
    ],
    support: {
      title: 'Need help with credit broking permissions?',
      text: 'We support motor dealers applying for FCA authorisation and organising ongoing reporting information.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Authorisation Support'
    },
    cta: {
      title: 'Need help with credit broking permissions?',
      text: 'We support motor dealers applying for FCA authorisation and organising ongoing reporting information.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Authorisation Support'
    },
    faqs: [
      { question: 'What is credit broking?', answer: 'Credit broking can include introducing customers to lenders or finance brokers in connection with credit.' },
      { question: 'Do motor dealers carry out credit broking?', answer: 'Many motor dealers may carry out credit broking where they introduce customers to vehicle finance providers.' },
      { question: 'Does credit broking require FCA permission?', answer: 'Credit broking is a regulated activity and may require FCA permission depending on what the firm does.' },
      { question: 'How does credit broking connect to CCR009?', answer: 'Credit broking activity can be relevant to FCA consumer credit reporting, including CCR009 where applicable.' },
      { question: 'Can 009 Compliance help?', answer: 'Yes. 009 Compliance can help motor dealers with FCA authorisation preparation and CCR009 reporting organisation.' }
    ]
  },
  {
    slug: '/fca-application-documents-motor-dealers',
    title: 'FCA Application Documents for Motor Dealers',
    description: 'Learn which documents motor dealers may need when preparing an FCA authorisation application for credit broking.',
    h1: 'FCA Application Documents for Motor Dealers',
    eyebrow: 'FCA application documents',
    guideLabel: 'Document guide',
    intro: 'FCA application documents help explain how a motor dealer will operate, monitor compliance and introduce customers to finance providers.',
    primaryLink: { href: '/fca-authorisation-motor-dealers', label: 'FCA application support for motor dealers' },
    secondaryLink: { href: '/contact', label: 'Ask About Application Documents' },
    panel: {
      kicker: 'Guide focus',
      title: 'Documents that support a clearer application',
      stats: [
        { label: 'Core', value: 'Business plan' },
        { label: 'Controls', value: 'Monitoring' },
        { label: 'Customer', value: 'Journey' },
        { label: 'Website', value: 'Disclosures' }
      ]
    },
    sections: [
      { heading: 'Why FCA application documents matter', text: ['Documents help the FCA understand the dealership, its finance activity and its compliance arrangements.', 'They should be proportionate, consistent and specific to the business.'] },
      { heading: 'Regulatory business plan', text: ['The business plan explains what the firm does, who its customers are and how regulated activity fits into the dealership.', 'It should match the actual sales and finance process.'] },
      { heading: 'Compliance procedures manual', text: ['A compliance procedures manual sets out how the firm intends to manage key regulatory areas.', 'It should be practical enough for the business to use.'] },
      { heading: 'Compliance monitoring programme', text: ['A monitoring programme explains how the firm will check that procedures are being followed.', 'It may include periodic file checks, website reviews and complaint reviews.'] },
      { heading: 'Complaints procedure', text: ['A complaints procedure should explain how complaints are identified, recorded, investigated and responded to.', 'It should be clear to staff and consistent with customer-facing information.'] },
      { heading: 'Vulnerable customer policy', text: ['The policy should explain how staff identify and support customers who may need additional care.', 'It should fit the finance and vehicle sales journey.'] },
      { heading: 'Customer journey document', text: ['A customer journey document maps how customers move from enquiry to finance introduction and vehicle purchase.', 'This can help show where disclosures and checks happen.'] },
      { heading: 'Financial crime procedures', text: ['Financial crime procedures should explain proportionate steps for fraud, identity concerns and suspicious activity.', 'They should reflect the dealership’s actual processes.'] },
      { heading: 'Website and disclosure wording', text: ['Website wording should match the application and the firm’s intended permissions.', 'Inconsistent wording can make the application less clear.'] },
      { heading: 'Why consistency matters across documents', text: ['The documents, website and application answers should describe the same business model.', 'For document help, see our <a href="/fca-authorisation-motor-dealers">FCA application support for motor dealers</a>.'] }
    ],
    support: {
      title: 'Need help preparing FCA application documents?',
      text: '009 Compliance helps motor dealers prepare structured documents for FCA authorisation applications.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Application Support'
    },
    cta: {
      title: 'Need help preparing FCA application documents?',
      text: '009 Compliance helps motor dealers prepare structured documents for FCA authorisation applications.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Application Support'
    },
    faqs: [
      { question: 'What documents are needed for an FCA application?', answer: 'Documents may include a regulatory business plan, compliance procedures, monitoring programme, complaints procedure, vulnerable customer policy and customer journey information.' },
      { question: 'Do motor dealers need a business plan?', answer: 'A regulatory business plan is commonly used to explain the dealership, its finance activity and its compliance approach.' },
      { question: 'What is a compliance monitoring programme?', answer: 'It is a plan for checking that compliance procedures are followed and records are maintained.' },
      { question: 'Does website wording matter?', answer: 'Yes. Website wording should be consistent with the FCA application and the firm’s permissions.' },
      { question: 'Can 009 Compliance prepare documents?', answer: 'Yes. 009 Compliance can help motor dealers prepare structured FCA application documents.' }
    ]
  },
  {
    slug: '/why-fca-applications-get-delayed',
    title: 'Why FCA Applications Get Delayed',
    description: 'Learn common reasons FCA applications get delayed, including weak documents, unclear journeys and missing information.',
    h1: 'Why FCA Applications Get Delayed',
    eyebrow: 'FCA application delays',
    guideLabel: 'Delay guide',
    intro: 'FCA applications can take longer than expected when documents, explanations or permissions are unclear. This guide focuses on avoidable delay risks for motor dealers.',
    primaryLink: { href: '/fca-authorisation-motor-dealers', label: 'FCA application support' },
    secondaryLink: { href: '/contact', label: 'Ask About Application Delays' },
    panel: {
      kicker: 'Guide focus',
      title: 'Reduce avoidable application friction',
      stats: [
        { label: 'Risk', value: 'Documents' },
        { label: 'Journey', value: 'Unclear' },
        { label: 'Permissions', value: 'Mismatch' },
        { label: 'Response', value: 'Slow' }
      ]
    },
    sections: [
      { heading: 'Why FCA applications can take longer than expected', text: ['Applications can be delayed when the FCA needs further information or the business model is not clear.', 'Some delays are outside a firm’s control, but many preparation issues can be reduced.'] },
      { heading: 'Incomplete or inconsistent documents', text: ['Documents that conflict with each other can create follow-up questions.', 'A business plan, policies and website wording should all describe the same customer journey.'] },
      { heading: 'Unclear customer journey', text: ['The FCA needs to understand how customers move from enquiry to finance introduction.', 'If the journey is vague, the application may need further explanation.'] },
      { heading: 'Weak compliance monitoring arrangements', text: ['Monitoring should show how the firm will check that procedures are followed.', 'Generic statements are less helpful than a practical programme.'] },
      { heading: 'Missing vulnerable customer process', text: ['A dealership should be able to explain how it identifies and supports vulnerable customers.', 'This should connect to staff behaviour and customer communications.'] },
      { heading: 'Website wording that does not match the application', text: ['Website finance wording should match the permissions being applied for and the business model described.', 'Mismatch can lead to uncertainty about what the firm intends to do.'] },
      { heading: 'Slow responses to FCA questions', text: ['Delays can increase if follow-up questions are not answered clearly or promptly.', 'Keeping records and documents organised makes responses easier.'] },
      { heading: 'Applying for the wrong permissions', text: ['Applying for permissions that do not match the activity can create avoidable problems.', 'The finance journey should be reviewed before permissions are selected.'] },
      { heading: 'How to reduce avoidable delays', text: ['Prepare clear documents, map the customer journey, review website wording and answer questions carefully.', 'For help, see our <a href="/fca-authorisation-motor-dealers">FCA application support</a>.'] }
    ],
    support: {
      title: 'Want to reduce avoidable FCA application delays?',
      text: 'We help motor dealers prepare clearer FCA authorisation applications with structured documents and practical explanations.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Authorisation Support'
    },
    cta: {
      title: 'Want to reduce avoidable FCA application delays?',
      text: 'We help motor dealers prepare clearer FCA authorisation applications with structured documents and practical explanations.',
      href: '/fca-authorisation-motor-dealers',
      button: 'View FCA Authorisation Support'
    },
    faqs: [
      { question: 'Why do FCA applications get delayed?', answer: 'Applications may be delayed by unclear business models, inconsistent documents, missing information or slow responses to FCA questions.' },
      { question: 'Can weak documents delay an application?', answer: 'Yes. Weak or inconsistent documents can lead to follow-up questions and delay.' },
      { question: 'Does the customer journey matter?', answer: 'Yes. A clear customer journey helps explain how finance introductions and disclosures work.' },
      { question: 'Can website wording affect an application?', answer: 'Yes. Website wording should be consistent with the FCA application and intended permissions.' },
      { question: 'Can 009 Compliance help fix application issues?', answer: '009 Compliance can help motor dealers improve application documents and explanations before or during the process.' }
    ]
  },
  {
    slug: '/after-fca-approval-motor-dealers',
    title: 'What Happens After FCA Approval for Motor Dealers?',
    description: 'Learn what motor dealers should consider after FCA authorisation, including compliance monitoring, CCR009 and Consumer Duty.',
    h1: 'What Happens After FCA Approval?',
    eyebrow: 'After FCA approval',
    guideLabel: 'Post-approval guide',
    intro: 'FCA approval is an important step, but it is not the end of compliance. Motor dealers need to keep records, review processes and prepare for ongoing reporting where required.',
    primaryLink: { href: '/motor-dealer-compliance', label: 'Ongoing motor dealer compliance support' },
    secondaryLink: { href: '/contact', label: 'Ask About Ongoing Compliance' },
    panel: {
      kicker: 'Guide focus',
      title: 'What comes after authorisation',
      stats: [
        { label: 'Focus', value: 'Ongoing' },
        { label: 'Records', value: 'Monitoring' },
        { label: 'Reporting', value: 'CCR009' },
        { label: 'Duty', value: 'Consumer' }
      ]
    },
    sections: [
      { heading: 'FCA approval is not the end of compliance', text: ['After FCA approval, the firm must continue to operate in line with its permissions and procedures.', 'Compliance becomes part of normal dealership management rather than a one-off application task.'] },
      { heading: 'Keeping policies and procedures up to date', text: ['Policies should be reviewed when the business changes, lenders change or customer journeys are updated.', 'Documents should remain useful and accurate.'] },
      { heading: 'Compliance monitoring', text: ['Monitoring helps the firm check whether its procedures are being followed.', 'This can include file reviews, website checks, complaint reviews and staff awareness.'] },
      { heading: 'Consumer Duty evidence', text: ['Dealers should keep evidence that customer outcomes are being considered.', 'This may include customer communications, feedback, complaint themes and process reviews.'] },
      { heading: 'Complaints records', text: ['Complaints should be recorded and reviewed so the business can spot patterns.', 'Finance-related complaints may also connect to wider FCA reporting preparation.'] },
      { heading: 'Vulnerable customer processes', text: ['Staff should understand how to identify and support vulnerable customers.', 'Records should show how the business handles these situations in practice.'] },
      { heading: 'CCR009 and consumer credit reporting', text: ['Some firms may need to prepare consumer credit reporting after authorisation, including CCR009 where applicable.', 'For reporting help, see our <a href="/ccr009-return-assistance-motor-dealers">CCR009 return assistance</a>.'] },
      { heading: 'Website and disclosure checks', text: ['Website finance wording should remain consistent with the firm’s permissions and customer journey.', 'Regular checks help keep public-facing information current.'] },
      { heading: 'Annual review habits', text: ['A yearly review of permissions, documents, website wording and reporting records can reduce last-minute pressure.', 'For practical support, see our <a href="/motor-dealer-compliance">ongoing motor dealer compliance support</a>.'] }
    ],
    support: {
      title: 'Need ongoing support after FCA approval?',
      text: '009 Compliance supports motor dealers with compliance monitoring, reporting preparation and practical record keeping.',
      href: '/motor-dealer-compliance',
      button: 'View Motor Dealer Compliance Support'
    },
    cta: {
      title: 'Need ongoing support after FCA approval?',
      text: '009 Compliance supports motor dealers with compliance monitoring, reporting preparation and practical record keeping.',
      href: '/motor-dealer-compliance',
      button: 'View Motor Dealer Compliance Support'
    },
    faqs: [
      { question: 'What happens after FCA authorisation?', answer: 'The firm needs to maintain compliance arrangements, keep records, monitor activity and meet any reporting obligations.' },
      { question: 'Do motor dealers need ongoing compliance support?', answer: 'Some dealers use ongoing compliance support to keep records, documents and reporting preparation organised.' },
      { question: 'Does CCR009 apply after approval?', answer: 'CCR009 may apply depending on the firm’s permissions and FCA reporting schedule.' },
      { question: 'Should website disclosures be reviewed?', answer: 'Yes. Website disclosures should remain consistent with the firm’s permissions and finance activity.' },
      { question: 'Can 009 Compliance help after approval?', answer: 'Yes. 009 Compliance supports motor dealers with ongoing compliance records, monitoring and reporting preparation.' }
    ]
  },
  {
    slug: '/fca-compliance-motor-dealers-guide',
    title: 'FCA Compliance for Motor Dealers: Complete Guide',
    description: 'A practical guide to FCA compliance for motor dealers, including authorisation, Consumer Duty, complaints, CCR009 and records.',
    h1: 'FCA Compliance for Motor Dealers',
    eyebrow: 'Motor dealer compliance guide',
    guideLabel: 'Compliance guide',
    intro: 'FCA compliance for motor dealers covers authorisation, finance introductions, customer outcomes, complaints, reporting and record keeping. This guide gives a practical overview.',
    primaryLink: { href: '/motor-dealer-compliance', label: 'Motor dealer compliance support' },
    secondaryLink: { href: '/contact', label: 'Ask About Dealer Compliance' },
    panel: {
      kicker: 'Guide focus',
      title: 'A broad view of dealership compliance',
      stats: [
        { label: 'Authorisation', value: 'FCA' },
        { label: 'Duty', value: 'Consumer' },
        { label: 'Reporting', value: 'CCR009' },
        { label: 'Records', value: 'Monitoring' }
      ]
    },
    sections: [
      { heading: 'What FCA compliance means for motor dealers', text: ['FCA compliance means having proportionate systems, records and customer processes for regulated activity.', 'For dealers, this often connects to vehicle finance introductions.'] },
      { heading: 'FCA authorisation and permissions', text: ['Dealers may need FCA authorisation before introducing customers to finance providers.', 'For application help, see our <a href="/fca-authorisation-motor-dealers">FCA authorisation support</a>.'] },
      { heading: 'Credit broking and finance introductions', text: ['Credit broking permission is often relevant where the dealer introduces customers to lenders or brokers.', 'The finance journey should be clear and documented.'] },
      { heading: 'Consumer Duty', text: ['Consumer Duty focuses attention on customer outcomes, understanding, fair value and support.', 'Dealers should consider how customers understand finance information and disclosures.'] },
      { heading: 'Vulnerable customers', text: ['Dealerships should have a practical approach for identifying and supporting vulnerable customers.', 'Staff awareness and clear records are important.'] },
      { heading: 'Complaints handling', text: ['Complaints should be recorded, investigated and reviewed for themes.', 'Complaint records can also support compliance monitoring.'] },
      { heading: 'Website disclosures and financial promotions', text: ['Website wording should be clear, fair and consistent with the firm’s permissions.', 'Finance wording and disclosure information should be reviewed periodically.'] },
      { heading: 'CCR009 and FCA reporting', text: ['Some dealers need to prepare FCA consumer credit reporting, including CCR009 where applicable.', 'For help, see our <a href="/ccr009-return-assistance-motor-dealers">CCR009 return assistance</a>.'] },
      { heading: 'Record keeping and compliance monitoring', text: ['Good records help firms evidence what happened and review whether processes are working.', 'Monitoring can include file checks, website reviews, complaints and finance records.'] },
      { heading: 'When to get support', text: ['Support may help where a dealer is applying for authorisation, preparing reports or trying to keep ongoing records organised.', 'Our <a href="/motor-dealer-compliance">motor dealer compliance support</a> is built around practical dealership needs.'] }
    ],
    hideSupportBox: true,
    support: {
      title: 'Need help with FCA compliance?',
      text: '009 Compliance supports motor dealers with authorisation, CCR009 preparation and ongoing compliance records.',
      href: '/motor-dealer-compliance',
      button: 'View Motor Dealer Compliance Support'
    },
    cta: {
      title: 'Choose the support that matches your dealership',
      text: '009 Compliance provides practical support across FCA authorisation, CCR009 reporting preparation and ongoing motor dealer compliance.',
      cards: [
        { title: 'FCA Authorisation Support', text: 'Application preparation for motor dealers seeking credit broking permission.', href: '/fca-authorisation-motor-dealers', button: 'View Authorisation Support' },
        { title: 'CCR009 Return Assistance', text: 'Help organising consumer credit reporting information for motor dealers.', href: '/ccr009-return-assistance-motor-dealers', button: 'View CCR009 Support' },
        { title: 'Ongoing Motor Dealer Compliance', text: 'Practical compliance monitoring, records and dealership support.', href: '/motor-dealer-compliance', button: 'View Compliance Support' }
      ]
    },
    faqs: [
      { question: 'What is FCA compliance for motor dealers?', answer: 'It means having appropriate permissions, procedures, records and monitoring for regulated activity such as finance introductions.' },
      { question: 'Do motor dealers need FCA authorisation?', answer: 'Some motor dealers need FCA authorisation where they introduce customers to finance providers or carry out credit broking.' },
      { question: 'What is Consumer Duty?', answer: 'Consumer Duty is an FCA framework focused on customer outcomes, including understanding, value and support.' },
      { question: 'What records should dealers keep?', answer: 'Dealers should keep records of finance introductions, disclosures, complaints, monitoring, vulnerable customer support and reporting information where relevant.' },
      { question: 'Can 009 Compliance help?', answer: 'Yes. 009 Compliance supports motor dealers with authorisation, CCR009 preparation and ongoing compliance organisation.' }
    ]
  },
  {
    slug: '/consumer-duty-motor-dealers',
    title: 'Consumer Duty for Motor Dealers',
    description: 'Understand Consumer Duty for motor dealers, including customer understanding, fair value, vulnerable customers and evidence.',
    h1: 'Consumer Duty for Motor Dealers',
    eyebrow: 'Consumer Duty guide',
    guideLabel: 'Consumer Duty guide',
    intro: 'Consumer Duty affects how motor dealers think about customer understanding, fair value, support and evidence during the vehicle finance journey.',
    primaryLink: { href: '/motor-dealer-compliance', label: 'Consumer Duty support for motor dealers' },
    secondaryLink: { href: '/contact', label: 'Ask About Consumer Duty' },
    panel: {
      kicker: 'Guide focus',
      title: 'Customer outcomes in dealership processes',
      stats: [
        { label: 'Outcome', value: 'Understanding' },
        { label: 'Support', value: 'Vulnerability' },
        { label: 'Evidence', value: 'Monitoring' },
        { label: 'Feedback', value: 'Complaints' }
      ]
    },
    sections: [
      { heading: 'What Consumer Duty means for motor dealers', text: ['Consumer Duty asks firms to consider customer outcomes across the products and services they provide.', 'For motor dealers, this often includes finance introductions and customer communications.'] },
      { heading: 'Customer understanding during the finance journey', text: ['Customers should receive information in a way they can understand.', 'Dealers should consider whether finance wording, explanations and handovers are clear.'] },
      { heading: 'Fair value and product suitability', text: ['Dealers should consider whether the customer journey supports fair value and suitable outcomes.', 'This does not mean guaranteeing outcomes, but it does require thoughtful processes.'] },
      { heading: 'Vulnerable customers', text: ['Staff should know how to identify signs that a customer may need additional support.', 'The process should allow time and care where vulnerability may be present.'] },
      { heading: 'Commission disclosure and transparency', text: ['Commission disclosure should be clear and consistent with the firm’s arrangements.', 'Customers should not be left confused about the dealer’s role in the finance process.'] },
      { heading: 'Complaints and customer feedback', text: ['Complaints and feedback can show where customers are confused or unhappy.', 'Reviewing themes helps a dealer improve processes.'] },
      { heading: 'Evidence and monitoring', text: ['Consumer Duty is easier to evidence when the firm keeps records of reviews, complaints, file checks and process updates.', 'Monitoring should be proportionate and practical.'] },
      { heading: 'How Consumer Duty links to ongoing compliance', text: ['Consumer Duty should sit within wider ongoing compliance support, not as a separate one-off exercise.', 'For help, see our <a href="/motor-dealer-compliance">Consumer Duty support for motor dealers</a>.'] }
    ],
    support: {
      title: 'Need help evidencing Consumer Duty?',
      text: 'We help motor dealers create practical compliance processes that support better customer outcomes.',
      href: '/motor-dealer-compliance',
      button: 'View Motor Dealer Compliance Support'
    },
    cta: {
      title: 'Need help evidencing Consumer Duty?',
      text: 'We help motor dealers create practical compliance processes that support better customer outcomes.',
      href: '/motor-dealer-compliance',
      button: 'View Motor Dealer Compliance Support'
    },
    faqs: [
      { question: 'Does Consumer Duty apply to motor dealers?', answer: 'Consumer Duty can apply where motor dealers carry out regulated activity such as finance introductions.' },
      { question: 'What customer outcomes should dealers consider?', answer: 'Dealers should consider understanding, fair value, suitable support and whether customers can make informed decisions.' },
      { question: 'How does Consumer Duty affect finance introductions?', answer: 'It affects how finance options, disclosures, commission information and customer support are handled.' },
      { question: 'Does Consumer Duty connect to complaints?', answer: 'Yes. Complaints and feedback can provide evidence about customer understanding and outcomes.' },
      { question: 'Can 009 Compliance help?', answer: 'Yes. 009 Compliance can help motor dealers organise practical Consumer Duty records and monitoring.' }
    ]
  },
  {
    slug: '/website-compliance-motor-dealers',
    title: 'Website Compliance for Motor Dealers',
    description: 'Learn what motor dealers should review on their website, including FCA status, finance wording, disclosures and complaints information.',
    h1: 'Website Compliance for Motor Dealers',
    eyebrow: 'Website compliance guide',
    guideLabel: 'Website compliance guide',
    intro: 'Dealership website wording matters because it shapes how customers understand finance, FCA status, commission disclosure and complaints information.',
    primaryLink: { href: '/motor-dealer-compliance', label: 'Website compliance support for motor dealers' },
    secondaryLink: { href: '/contact', label: 'Ask About Website Compliance' },
    panel: {
      kicker: 'Guide focus',
      title: 'Review public-facing finance wording',
      stats: [
        { label: 'Status', value: 'FCA' },
        { label: 'Wording', value: 'Finance' },
        { label: 'Disclosure', value: 'Commission' },
        { label: 'Records', value: 'Reviews' }
      ]
    },
    sections: [
      { heading: 'Why dealership website wording matters', text: ['A website is often the first place customers see finance information.', 'Wording should be clear, accurate and consistent with the firm’s permissions.'] },
      { heading: 'FCA status disclosure', text: ['Dealers should review how their FCA status is described on the website.', 'The wording should be consistent with the firm’s actual permissions and role.'] },
      { heading: 'Finance and credit broking wording', text: ['Finance wording should explain the dealer’s role without creating a misleading impression.', 'If the dealer acts as a credit broker, the website should not imply it is the lender.'] },
      { heading: 'Commission disclosure', text: ['Commission disclosure should be clear and easy to find where relevant.', 'It should fit the dealership’s actual finance arrangements.'] },
      { heading: 'Financial promotions and misleading claims', text: ['Claims about finance should be reviewed carefully so they are not unclear or misleading.', 'Rates, availability and eligibility wording should be kept current.'] },
      { heading: 'Complaints information', text: ['Customers should be able to find clear complaints information.', 'The website should explain how complaints can be raised and handled.'] },
      { heading: 'Vulnerable customer information', text: ['A website can help explain how customers can ask for additional support.', 'This should be written in plain English and fit the dealership’s process.'] },
      { heading: 'Keeping website wording consistent with FCA permissions', text: ['Website reviews should be part of ongoing dealership compliance.', 'For help, see our <a href="/motor-dealer-compliance">website compliance support for motor dealers</a>.'] }
    ],
    support: {
      title: 'Want your dealership website reviewed?',
      text: '009 Compliance supports motor dealers with practical compliance checks, website wording and ongoing records.',
      href: '/motor-dealer-compliance',
      button: 'View Motor Dealer Compliance Support'
    },
    cta: {
      title: 'Want your dealership website reviewed?',
      text: '009 Compliance supports motor dealers with practical compliance checks, website wording and ongoing records.',
      href: '/motor-dealer-compliance',
      button: 'View Motor Dealer Compliance Support'
    },
    faqs: [
      { question: 'Do motor dealer websites need FCA wording?', answer: 'Where a dealer carries out regulated finance activity, the website should describe FCA status and finance arrangements accurately.' },
      { question: 'What finance wording should dealers check?', answer: 'Dealers should check wording about their role, finance availability, lenders, brokers, rates and eligibility.' },
      { question: 'Should commission disclosure appear on a website?', answer: 'Commission disclosure may be relevant depending on the dealer’s arrangements and customer journey.' },
      { question: 'Can website wording affect FCA compliance?', answer: 'Yes. Public wording should be consistent with permissions, disclosures and the customer finance journey.' },
      { question: 'Can 009 Compliance review a website?', answer: 'Yes. 009 Compliance can support motor dealers with practical website compliance checks and wording reviews.' }
    ]
  }
];

const needAuthorisation = motorDealerSeoPages.find((page) => page.slug === '/do-motor-dealers-need-fca-authorisation');
if (needAuthorisation) {
  needAuthorisation.sections[2].text.push('Typical trigger points include adding finance calculators to the website, sending customers to a lender portal, or allowing sales staff to discuss monthly payments as part of the sale.');
  needAuthorisation.sections[6].note = {
    title: 'Useful internal check',
    text: 'Map the customer journey from first enquiry to vehicle handover. Mark where finance is mentioned, who introduces the lender, where disclosure wording appears and who keeps the record.'
  };
}

const fcaLicence = motorDealerSeoPages.find((page) => page.slug === '/fca-licence-car-dealers');
if (fcaLicence) {
  fcaLicence.sections[1].text.push('Using the right wording matters because an FCA application is assessed against permissions and regulated activity, not just the informal phrase car dealer FCA licence.');
  fcaLicence.sections[6].note = {
    title: 'Terminology in practice',
    text: 'A sales manager may ask for a motor dealer finance licence, while the application needs to explain credit broking permission, Limited Permission and the vehicle finance customer journey.'
  };
}

const limitedPermission = motorDealerSeoPages.find((page) => page.slug === '/limited-permission-fca-authorisation-motor-dealers');
if (limitedPermission) {
  limitedPermission.sections[0].text.push('In practice, Limited Permission does not mean the dealership can ignore the detail. It means the application should explain a narrower type of consumer credit activity in a clear, proportionate way.');
  limitedPermission.sections[1].text.push('Motor dealers commonly look at Limited Permission because finance introductions usually support the vehicle sale rather than being the main product sold by the business.');
  limitedPermission.sections[3].text.push('The FCA still needs to understand how customers are introduced to finance, how staff explain the dealership’s role and how complaints or vulnerable customer issues are handled.');
  limitedPermission.sections[3].text.push('A dealer should be ready to explain who speaks to the customer about finance, where disclosure wording is given, what happens if a proposal is declined and how the business monitors that process.');
  limitedPermission.sections[3].text.push('Even where the permission is limited, the FCA may still expect a coherent Regulatory Business Plan, compliance procedures, complaints procedure, vulnerable customer policy and customer journey explanation.');
  limitedPermission.sections[5].text.push('A common misunderstanding is that Limited Permission is a quick formality. It still needs to match the dealership’s real activity, website wording and lender or broker arrangements.');
  limitedPermission.sections[5].note = {
    title: 'Weak application example',
    text: 'An application can look weak if the business plan says finance is occasional, the website heavily promotes finance, and the customer journey does not explain who gives disclosures.'
  };
  limitedPermission.sections.push({
    heading: 'Common misunderstandings about Limited Permission',
    cards: [
      {
        title: 'It is not automatic approval',
        text: 'The FCA still decides whether authorisation should be granted. The application needs to explain the dealership, the finance activity and the controls in place.'
      },
      {
        title: 'It is not a substitute for clear documents',
        text: 'A short or unclear application can still raise questions. The documents should show how credit broking fits into the vehicle sales journey.'
      },
      {
        title: 'It does not end after approval',
        text: 'Once authorised, the dealer still needs to keep policies, complaints records, website wording and compliance monitoring under review.'
      },
      {
        title: 'It still needs to match the website',
        text: 'If the website describes finance in a way that goes beyond the application, the inconsistency can create confusion.'
      }
    ]
  });
}

const creditBroking = motorDealerSeoPages.find((page) => page.slug === '/credit-broking-permission-motor-dealers');
if (creditBroking) {
  creditBroking.sections[0].text.push('For example, a salesperson who explains monthly payment options, sends the customer to a lender application link or passes details to a broker may be involved in a finance introduction.');
  creditBroking.sections[1].text.push('The wording matters. A lender provides the finance, while a broker or introducer may help arrange or introduce the customer to finance. A dealer should avoid wording that makes its role unclear.');
  creditBroking.sections[2].text.push('A practical customer journey might include the customer choosing a vehicle, discussing affordability, being introduced to a lender and receiving finance disclosure wording before a proposal is submitted.');
  creditBroking.sections[2].text.push('If a finance proposal is accepted, declined or referred, the dealership should know where that outcome is recorded and how it links back to the customer file.');
  creditBroking.sections[3].text.push('Sales staff should understand what they can explain, where the disclosure wording is kept and when a customer should be directed to the lender or broker for product-specific information.');
  creditBroking.sections[4].text.push('Commission disclosure should not sit in a forgotten template. Staff need to know what customers are told, where the wording appears and how commission records can be checked later.');
  creditBroking.sections[4].note = {
    title: 'Commission and records',
    text: 'Where commission is paid by a lender, the dealership should know where the disclosure wording is stored and how commission information can be checked later for reporting or complaint handling.'
  };
  creditBroking.sections[5].text.push('That link to CCR009 becomes practical at year end. Finance introduction data, lender information, broker information and commission information may all be needed for FCA consumer credit reporting.');
  creditBroking.sections.push({
    heading: 'Credit broking customer journey example',
    cards: [
      {
        title: '1. Customer asks about finance',
        text: 'The customer asks whether monthly payments are available. Staff explain the dealership’s role and provide the correct finance disclosure wording.'
      },
      {
        title: '2. Customer is introduced',
        text: 'The customer is introduced to a lender or broker. The dealership records which route was used and where the proposal was submitted.'
      },
      {
        title: '3. Proposal outcome is recorded',
        text: 'The proposal may be accepted, declined, referred or abandoned. The outcome should be easy to find later in the sales or finance record.'
      },
      {
        title: '4. Records support reporting',
        text: 'The same records can help with complaints, commission checks and CCR009 reporting preparation where the return applies.'
      }
    ]
  });
}

const fcaDocs = motorDealerSeoPages.find((page) => page.slug === '/fca-application-documents-motor-dealers');
if (fcaDocs) {
  fcaDocs.summaryCards = [
    {
      title: 'Show how the dealer works',
      text: 'The documents should explain the actual finance customer journey, not a generic process copied from another business.'
    },
    {
      title: 'Keep documents consistent',
      text: 'The Regulatory Business Plan, website wording, compliance procedures and complaints procedure should describe the same activities.'
    },
    {
      title: 'Make them usable',
      text: 'A document is stronger when staff can understand where disclosures, vulnerable customer steps and complaint records fit in daily work.'
    }
  ];
  fcaDocs.sections[1].text.push('For a dealer, this often means explaining stock profile, sales channels, lender relationships, finance introductions and who is responsible for compliance.');
  fcaDocs.sections[9].note = {
    title: 'Consistency check',
    text: 'If the FCA application says the dealer only introduces customers to a small lender panel, the website and customer journey should not suggest something broader or different.'
  };
}

const fcaDelays = motorDealerSeoPages.find((page) => page.slug === '/why-fca-applications-get-delayed');
if (fcaDelays) {
  fcaDelays.sections[1].text.push('For example, delays can arise where the Regulatory Business Plan says one thing, the website says another and the compliance procedures do not explain either process properly.');
  fcaDelays.sections[8].note = {
    title: 'Delay prevention check',
    text: 'Before submitting, compare the permissions requested, customer journey, website finance wording, vulnerable customer policy and complaints procedure side by side.'
  };
}

const afterApproval = motorDealerSeoPages.find((page) => page.slug === '/after-fca-approval-motor-dealers');
if (afterApproval) {
  afterApproval.officialLinks = [officialFcaLinks.register, officialFcaLinks.regData, officialFcaLinks.consumerDuty];
  afterApproval.sections[0].text.push('The business now needs to keep the finance process under review, especially if lenders change, staff change or the website is updated.');
  afterApproval.sections[8].note = {
    title: 'Annual review habit',
    text: 'A simple annual review can check FCA Register details, website disclosures, complaints, vulnerable customer records, finance commission disclosure and CCR009 reporting preparation.'
  };
}

const complianceGuide = motorDealerSeoPages.find((page) => page.slug === '/fca-compliance-motor-dealers-guide');
if (complianceGuide) {
  complianceGuide.officialLinks = [officialFcaLinks.register, officialFcaLinks.regData, officialFcaLinks.consumerDuty];
  complianceGuide.summaryCards = [
    {
      title: 'Before finance is offered',
      text: 'Check FCA permissions, website finance wording, customer journey documents and sales staff understanding.'
    },
    {
      title: 'During the customer journey',
      text: 'Keep disclosures clear, handle vulnerable customers carefully, record complaints and understand commission disclosure.'
    },
    {
      title: 'After the sale',
      text: 'Maintain record keeping, compliance monitoring, monthly compliance checks and FCA reporting preparation where needed.'
    }
  ];
  complianceGuide.sections[8].text.push('In practice this may mean a monthly check of finance files, commission disclosure wording, complaints, website pages and lender changes.');
}

const consumerDuty = motorDealerSeoPages.find((page) => page.slug === '/consumer-duty-motor-dealers');
if (consumerDuty) {
  consumerDuty.summaryCards = [
    {
      title: 'Customer understanding',
      text: 'Can the customer understand the finance route, the dealer’s role, commission disclosure and what happens if a proposal is declined?'
    },
    {
      title: 'Support and vulnerability',
      text: 'Can staff spot when a customer may need more time, clearer explanations or a different communication method?'
    },
    {
      title: 'Evidence and review',
      text: 'Can the dealership show that complaints, feedback, file checks and customer outcomes are reviewed rather than left in separate inboxes?'
    }
  ];
  consumerDuty.sections[1].text.push('For example, if a customer asks whether the dealer is the lender, staff should be able to explain the credit broking role clearly and point to the right disclosure wording.');
  consumerDuty.sections[1].text.push('Customer understanding can also be affected by optional products. If paint protection, warranty, GAP-style products or other add-ons are discussed alongside finance, the customer should understand what is optional, what it costs and how it affects the overall deal.');
  consumerDuty.sections[2].text.push('A customer may focus on the monthly payment and miss the total amount payable, optional extras or product limitations. The finance journey should give customers enough information to make a considered decision.');
  consumerDuty.sections[3].text.push('During a finance application, a vulnerable customer may need more time, simpler explanations, a trusted person present or a different communication method. Staff should know how to pause the process rather than pushing for a quick decision.');
  consumerDuty.sections[4].text.push('If commission disclosure wording sits only in an old email template, sales staff may not know what the customer has been told. That is a practical Consumer Duty risk.');
  consumerDuty.sections[5].text.push('Complaints can show where customer understanding is weak. Repeated complaints about monthly payments, optional products, settlement figures or who arranged the finance should prompt a review of the customer journey.');
  consumerDuty.sections[6].note = {
    title: 'Evidence in a dealership',
    text: 'Useful evidence may include file review notes, complaints themes, staff briefings, website review dates, vulnerable customer examples and changes made after feedback.'
  };
  consumerDuty.sections.push({
    heading: 'Motor finance examples that can affect customer outcomes',
    cards: [
      {
        title: 'Optional products are not understood',
        text: 'A customer agrees to a monthly payment but later says they did not understand an optional product was included. The dealer should be able to evidence how the option was explained.'
      },
      {
        title: 'Finance explanation is unclear',
        text: 'A customer thinks the dealer is the lender, or does not understand the role of the broker. Clear role disclosure reduces this risk.'
      },
      {
        title: 'Vulnerability appears during the application',
        text: 'A customer becomes distressed or confused during the finance process. Staff should know how to slow the process and offer support.'
      },
      {
        title: 'Complaints reveal a pattern',
        text: 'Several complaints mention poor finance explanations. That should feed into monitoring, staff reminders and customer journey changes.'
      }
    ]
  });
}

const websiteCompliance = motorDealerSeoPages.find((page) => page.slug === '/website-compliance-motor-dealers');
if (websiteCompliance) {
  websiteCompliance.sections[0].text.push('Website wording can become outdated when the dealership changes lender panel, broker arrangements, trading names or FCA permissions.');
  websiteCompliance.sections[7].note = {
    title: 'Website review example',
    text: 'Check whether the finance page, footer disclosure, commission wording, complaints page and privacy or contact pages still match the dealership’s current FCA Register details and customer journey.'
  };
  websiteCompliance.sections[7].text.push('Where a website is being reviewed before an FCA application, it should also be consistent with the planned <a href="/fca-authorisation-motor-dealers">FCA authorisation support</a> and application documents.');
  websiteCompliance.sections.push({
    heading: 'Motor dealer website compliance mini checklist',
    cards: [
      {
        title: 'FCA status wording',
        text: 'Check the firm name, regulatory status, FCA number and trading names against the FCA Register. Old footer wording can easily be missed after a website redesign.'
      },
      {
        title: 'Finance disclosure',
        text: 'Make sure the website explains the dealership’s role in finance introductions and does not suggest the dealer is the lender if it acts as a broker or introducer.'
      },
      {
        title: 'Commission disclosure',
        text: 'Review whether commission wording is present, understandable and consistent with the dealership’s lender or broker arrangements.'
      },
      {
        title: 'Complaints wording',
        text: 'Check that customers can find how to complain and that the wording matches the firm’s complaints procedure.'
      },
      {
        title: 'Representative finance examples',
        text: 'Where finance examples are shown, check they are current, clear and not likely to mislead customers about availability or cost.'
      },
      {
        title: 'Misleading claims',
        text: 'Avoid broad claims such as guaranteed finance, instant approval or wording that could make eligibility sound certain when it is not.'
      },
      {
        title: 'Outdated lender or broker wording',
        text: 'Remove references to old lenders, brokers or finance routes that no longer reflect the dealership’s current arrangements.'
      }
    ]
  });
}

motorDealerSeoPages.forEach(enrichGuidePage);

motorDealerSeoPages.forEach((page) => {
  app.get(page.slug, (req, res) => {
    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer
        }
      }))
    };

    res.render('ccr009_guide_page', {
      page: { hideSupportBox: true, ...page },
      faqSchema,
      pageTitle: page.title,
      pageDescription: page.description,
      canonicalUrl: `https://009compliance.com${page.slug}`,
      robots: 'index,follow',
      ogTitle: page.title,
      ogDescription: page.description,
      ogType: 'article'
    });
  });
});

app.get('/fca-authorisation-motor-dealers', (req, res) => {
  res.render('fca_authorisation_motor_dealers', {
    pageTitle: 'FCA Authorisation for Motor Dealers - Fixed Fee £1,000 | FCA Licence Application Support',
    pageDescription: 'Apply for FCA authorisation for a fixed fee of £1,000 plus FCA fees. Includes business plan, compliance documents, FCA Connect application support, interview preparation and ongoing assistance for motor dealers seeking FCA approval and credit broking permissions.',
    robots: 'index,follow',
    ogTitle: 'FCA Authorisation for Motor Dealers | Fixed Fee £1,000',
    ogDescription: 'Fixed-fee FCA authorisation and credit broking application support for motor dealers, including business plan, compliance documents, FCA Connect support and interview preparation.',
    ogType: 'article'
  });
});

app.get('/motor-dealer-compliance', (req, res) => {
  res.render('motor_dealer_compliance', {
    pageTitle: 'Motor Dealer Compliance | FCA Compliance Support for Motor Dealers | 009 Compliance Ltd',
    pageDescription: 'Practical motor dealer compliance support including FCA authorisation, CCR009 reporting, CCR007 reporting, Consumer Duty, compliance documentation, website compliance reviews and ongoing FCA compliance assistance for motor dealers.',
    robots: 'index,follow',
    ogTitle: 'Motor Dealer Compliance | 009 Compliance Ltd',
    ogDescription: 'Practical FCA compliance support for motor dealers, including authorisation, CCR009, CCR007, Consumer Duty, documentation, website reviews and ongoing compliance assistance.',
    ogType: 'article'
  });
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
