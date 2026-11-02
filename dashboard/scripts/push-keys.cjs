'use strict';
// Generate only on your own machine/server. Do not put the private key in Git.
const {createECDH}=require('node:crypto');
const pair=createECDH('prime256v1');pair.generateKeys();
console.log('VAPID_PUBLIC_KEY='+pair.getPublicKey().toString('base64url'));
console.log('VAPID_PRIVATE_KEY='+pair.getPrivateKey().toString('base64url'));
console.log('\nSave both in your website environment. Keep the private key secret. Do not regenerate keys for every start.');
