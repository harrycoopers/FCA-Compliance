'use strict';
const crypto = require('node:crypto');
const { query, wrap, hashToken, validEmail, passwordError, rateLimit } = require('./security');
const { normalizeEmail, createClientLogin } = require('./client-login');
const tokenHash = token => 'sha256:' + hashToken(token);
const tokenValid = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regenerate = req => new Promise((resolve,reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
const save = req => new Promise((resolve,reject) => req.session.save(e => e ? reject(e) : resolve()));
function createAccounts({ db, bcrypt, sendEmail, baseUrl, termsVersion, sync }) {
  const q = query(db);
  const ensureAuth = wrap(async (req,res,next) => {
    if (!req.session.user) return res.redirect('/login');
    const user = await q.get('SELECT * FROM users WHERE id=?', [req.session.user.id]);
    if (!user || user.session_version !== req.session.user.session_version) {
      await regenerate(req); req.flash('error','Please log in again.'); return res.redirect('/login');
    }
    if (user.is_verified !== 1) { delete req.session.user; req.session.pendingVerificationUserId = user.id; return res.redirect('/verify-email-notice'); }
    // Refresh permissions/preferences from the DB instead of trusting stale session fields.
    req.session.user = sessionUser(user); res.locals.currentUser = req.session.user; next();
  });
  async function sendVerification(user) {
    const token = crypto.randomBytes(32).toString('hex'), hash = tokenHash(token);
    await q.run('UPDATE users SET verification_token=?,verification_expires=? WHERE id=? AND is_verified=0', [hash,new Date(Date.now()+86400000).toISOString(),user.id]);
    await sendEmail({to:user.email,subject:'Verify your 009 Compliance email',html:`<p>Hi ${escape(user.name)},</p><p>Confirm your email to access your account:</p><p><a href="${escape(baseUrl)}/verify-email?token=${token}">Verify email</a></p><p>This link expires in 24 hours. If you did not request this account, ignore this email.</p>`});
  }
  async function beginVerification(user,req,res) {
    await regenerate(req); req.session.pendingVerificationUserId=user.id;
    try { await sendVerification(user); req.flash('success','A verification link has been sent. Please check your inbox.'); }
    catch { req.flash('error','We could not send the verification email. Try resending it or contact support.'); }
    await save(req); return res.redirect('/verify-email-notice');
  }
  function mount(app) {
    const authLimit = rateLimit(db,'authentication',20,15*60000);
    const emailLimit = rateLimit(db,'email-actions',5,15*60000);
    app.get('/register',(req,res)=>res.render('register',{formData:{}}));
    // CSRF middleware has rejected this submission. Render only; never process
    // rejected credentials or create an account, including at the terms step.
    app.post(['/register/precheck','/register'],(req,res,next)=>res.locals.registrationSecurityError
      ? res.status(403).render('register',{formData:{},error:[res.locals.registrationSecurityError],success:[]})
      : next());
    app.post('/register/precheck',authLimit,wrap(async(req,res)=>{
      const data={};
      for (const key of ['firm_name','fca_firm_ref','name','email','mobile_number']) {
        if (typeof req.body[key] !== 'string' || !req.body[key].trim() || req.body[key].length>254 || /[\x00-\x1f]/.test(req.body[key])) return res.status(400).render('register',{formData:{},error:['Please complete all fields with valid details.'],success:[]});
        data[key]=req.body[key].trim();
      }
      data.email=normalizeEmail(data.email);data.mobile_number=data.mobile_number.replace(/[\s()\-]/g,'');
      const error=passwordError(req.body.password) || (req.body.password!==req.body.confirmPassword ? 'Passwords do not match.' : '') || (!validEmail(data.email) ? 'Enter a valid email address.' : '') || (!/^\+?\d{7,15}$/.test(data.mobile_number) ? 'Enter a valid phone number.' : '');
      if(error)return res.status(400).render('register',{formData:data,error:[error],success:[]});
      const passwordHash=await bcrypt.hash(req.body.password,12);
      await regenerate(req);
      req.session.pendingRegister=data;req.session.pendingPasswordHash=passwordHash;req.session.pendingRegisterExpires=Date.now()+20*60000;
      await save(req);res.redirect('/terms');
    }));
    app.get('/terms',(req,res)=>res.render('terms',{formData:req.session.pendingRegisterExpires>Date.now()?req.session.pendingRegister:(req.session.user||null)}));
    app.post('/register',authLimit,wrap(async(req,res)=>{
      const pending=req.session.pendingRegister,passwordHash=req.session.pendingPasswordHash;
      if(!pending||!passwordHash||req.session.pendingRegisterExpires<=Date.now()){delete req.session.pendingRegister;delete req.session.pendingPasswordHash;req.flash('error','Please start registration again.');return res.redirect('/register');}
      if(req.body.agree_terms!=='yes'){req.flash('error','You must agree to the Client Service Agreement to create an account.');return res.redirect('/terms');}
      const accepted=new Date().toISOString(),unsubscribe=crypto.randomBytes(24).toString('hex');let inserted;
      try { inserted=await q.run('INSERT INTO users(email,password_hash,name,firm_name,fca_firm_ref,mobile_number,unsubscribe_token,is_active,terms_accepted_at,terms_version) VALUES(?,?,?,?,?,?,?,1,?,?)',[pending.email,passwordHash,pending.name,pending.firm_name,pending.fca_firm_ref,pending.mobile_number,unsubscribe,accepted,termsVersion]); }
      catch(e){ if(e.code!=='SQLITE_CONSTRAINT')throw e;req.flash('error','An account with that email already exists. Please log in or reset your password.');return res.redirect('/register'); }
      const user=await q.get('SELECT * FROM users WHERE id=?',[inserted.id]);
      // Rotation removes all pending registration fields and the password hash.
      return beginVerification(user,req,res);
    }));
    app.post('/terms/accept',ensureAuth,wrap(async(req,res)=>{
      if(req.body.agree_terms!=='yes'){req.flash('error','You must agree to the Client Service Agreement to continue.');return res.redirect('/terms');}
      await q.run('UPDATE users SET terms_accepted_at=?,terms_version=? WHERE id=?',[new Date().toISOString(),termsVersion,req.session.user.id]);
      req.session.user.terms_version=termsVersion;
      // Updating terms must never reactivate reminder preferences or replace creation dates.
      await save(req);res.redirect('/dashboard');
    }));
    app.get('/verify-email-notice',(req,res)=>res.render('verify_email_notice',{canResend:Boolean(req.session.pendingVerificationUserId)}));
    app.post('/verify-email/resend',emailLimit,wrap(async(req,res)=>{
      const user=await q.get('SELECT * FROM users WHERE id=? AND is_verified=0',[req.session.pendingVerificationUserId||0]);
      if(!user)return res.redirect('/login');
      try{await sendVerification(user);req.flash('success','A verification link has been sent. Please check your inbox.');}catch{req.flash('error','We could not send the email. Please try again later or contact support.');}
      res.redirect('/verify-email-notice');
    }));
    app.get('/verify-email',wrap(async(req,res)=>{
      if(!tokenValid(req.query.token)){req.flash('error','Invalid or expired verification link. Log in to request another.');return res.redirect('/login');}
      const result=await q.run('UPDATE users SET is_verified=1,verification_token=NULL,verification_expires=NULL WHERE verification_token=? AND verification_expires>?',[tokenHash(req.query.token),new Date().toISOString()]);
      req.flash(result.changes?'success':'error',result.changes?'Email verified. You can now log in.':'Invalid or expired verification link. Log in to request another.');
      res.redirect('/login');
    }));
    app.get('/login',(req,res)=>res.render('login'));
    app.post('/login',(req,res,next)=>res.locals.loginSecurityError
      ? res.status(403).render('login', { error: [res.locals.loginSecurityError] })
      : next(),authLimit,createClientLogin({db,bcrypt,onUnverified:beginVerification}));
    app.get('/logout',(req,res)=>res.render('account_action',{title:'Log out',message:'Confirm you want to log out.',action:'/logout',button:'Log out',token:''}));
    app.post('/logout',(req,res,next)=>req.session.destroy(e=>{if(e)return next(e);res.clearCookie('009.sid',{path:'/'});res.redirect('/');}));
    app.get('/unsubscribe',wrap(async(req,res)=>{
      const token=req.query.token;
      if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))return res.status(404).send('Invalid unsubscribe link.');
      const user=await q.get('SELECT id FROM users WHERE unsubscribe_token=?',[token]);
      if(!user)return res.status(404).send('Invalid unsubscribe link.');
      res.render('account_action',{title:'Reminder preferences',message:'Confirm to stop reminder emails.',action:'/unsubscribe',button:'Stop reminders',token});
    }));
    app.post('/unsubscribe',wrap(async(req,res)=>{
      const token=req.body.token;
      if(typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))return res.status(404).send('Invalid unsubscribe link.');
      const result=await q.run('UPDATE users SET is_active=0 WHERE unsubscribe_token=?',[token]);
      if(!result.changes)return res.status(404).send('Invalid unsubscribe link.');
      res.render('account_action',{title:'Reminders stopped',message:'You have been unsubscribed. You will no longer receive reminders.',action:'',button:'',token:''});
    }));
    app.get('/forgot-password',(req,res)=>res.render('forgot_password',{error:[],success:[]}));
    app.post('/forgot-password',emailLimit,wrap(async(req,res)=>{
      const email=normalizeEmail(req.body.email),generic='If that email exists, a reset link has been sent.';
      const users=validEmail(email)?await q.all('SELECT * FROM users WHERE lower(trim(email))=? LIMIT 2',[email]):[];
      if(users.length===1){
        const user=users[0],token=crypto.randomBytes(32).toString('hex'),hash=tokenHash(token);
        await q.run('UPDATE users SET reset_token=?,reset_token_expires=? WHERE id=?',[hash,new Date(Date.now()+3600000).toISOString(),user.id]);
        try{await sendEmail({to:user.email,subject:'Reset your FCA Compliance password',html:`<p>Hi ${escape(user.name)},</p><p>We received a request to reset your password.</p><p><a href="${escape(baseUrl)}/reset-password/${token}">Reset my password</a></p><p>This link is valid for 1 hour.</p>`});}
        catch{await q.run('UPDATE users SET reset_token=NULL,reset_token_expires=NULL WHERE id=? AND reset_token=?',[user.id,hash]);console.error('Password reset email could not be delivered.');}
      }
      res.render('forgot_password',{error:[],success:[generic]});
    }));
    const resetUser=token=>tokenValid(token)?q.get('SELECT * FROM users WHERE reset_token=? AND reset_token_expires>?',[tokenHash(token),new Date().toISOString()]):Promise.resolve(null);
    app.get('/reset-password/:token',wrap(async(req,res)=>{
      if(!await resetUser(req.params.token))return res.redirect('/forgot-password');
      res.render('reset_password',{token:req.params.token,error:[],success:[]});
    }));
    app.post('/reset-password/:token',authLimit,wrap(async(req,res)=>{
      const token=req.params.token,user=await resetUser(token);if(!user)return res.redirect('/forgot-password');
      const error=passwordError(req.body.password)||(req.body.password!==req.body.confirmPassword?'Passwords do not match.':'');
      if(error)return res.status(400).render('reset_password',{token,error:[error],success:[]});
      const passwordHash=await bcrypt.hash(req.body.password,12);
      const updated=await q.run('UPDATE users SET password_hash=?,reset_token=NULL,reset_token_expires=NULL,session_version=session_version+1 WHERE id=? AND reset_token=? AND reset_token_expires>?',[passwordHash,user.id,tokenHash(token),new Date().toISOString()]);
      if(!updated.changes)return res.redirect('/forgot-password');
      await regenerate(req);req.flash('success','Password has been reset. Please log in again.');await save(req);res.redirect('/login');
    }));
  }
  return { ensureAuth, mount };
}
function sessionUser(user){return {id:user.id,email:user.email,name:user.name,mobile_number:user.mobile_number,is_verified:user.is_verified===1,terms_version:user.terms_version||null,terms_accepted_at:user.terms_accepted_at||null,firm_name:user.firm_name||'',fca_firm_ref:user.fca_firm_ref||'',unsubscribe_token:user.unsubscribe_token||'',session_version:user.session_version,is_active:user.is_active};}
module.exports={createAccounts,sessionUser};
