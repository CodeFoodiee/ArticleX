const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const app = require('./app');

exports.apiV2 = onRequest({
  region: 'us-central1',
  timeoutSeconds: 60,
  memory: '256MiB',
}, app);