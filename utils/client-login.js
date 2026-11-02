'use strict';
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

function createClientLogin({ db, bcrypt, crypto = require('crypto'), logger = console }) {
  return async function clientLogin(req, res) {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    const fail = message => { req.flash('error', message); return res.redirect('/login'); };
    if (!email || email.length > 254 || typeof password !== 'string' || !password || Buffer.byteLength(password,'utf8') > 1024) return fail('Please enter your email and password.');
    try {
      // Accommodate older records without silently merging duplicate accounts.
      const users = await new Promise((resolve, reject) => db.all(
        'SELECT * FROM users WHERE lower(trim(email)) = ? LIMIT 2', [email],
        (err, rows) => err ? reject(err) : resolve(rows)
      ));
      if (users.length !== 1) return fail('Invalid email or password. Use Forgot password if you need help.');
      const user = users[0];
      if (typeof user.password_hash !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
        return fail('Invalid email or password. Use Forgot password if you need help.');
      }
      // Email confirmation is optional; a unique account and valid password remain mandatory.
      await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
      const unsubscribeToken = user.unsubscribe_token || crypto.randomBytes(24).toString('hex');
      if (!user.unsubscribe_token) {
        // Reminder metadata must not block an otherwise valid login.
        db.run('UPDATE users SET unsubscribe_token = ? WHERE id = ?', [unsubscribeToken, user.id], err => {
          if (err) logger.error('Could not save reminder token during login.');
        });
      }
      req.session.user = {
        id: user.id, email: user.email, name: user.name, mobile_number: user.mobile_number,
        is_verified: user.is_verified === 1, terms_version: user.terms_version || null,
        terms_accepted_at: user.terms_accepted_at || null, firm_name: user.firm_name || '',
        fca_firm_ref: user.fca_firm_ref || '', unsubscribe_token: unsubscribeToken,
        session_version: user.session_version || 0, is_active: user.is_active
      };
      await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
      return res.redirect('/dashboard');
    } catch (err) {
      // Never expose submitted credentials or hashes in logs or responses.
      if (req.session) delete req.session.user;
      logger.error('Client login could not complete.');
      return fail('We could not sign you in just now. Please try again. If this continues, contact us.');
    }
  };
}
module.exports = { createClientLogin, normalizeEmail };
