
const express = require('express');
const cors    = require('cors');

const authRoutes     = require('./routes/auth');
const articleRoutes  = require('./routes/articles');

const app = express();

app.use(cors({ origin: true }));          // Firebase Hosting same-origin + local dev
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',     authRoutes);
app.use('/api/articles', articleRoutes);

app.get('/api/health', (_, res) =>
  res.json({ status: 'ok', ts: Date.now() })
);

app.use((req, res) =>
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` })
);

app.use((err, req, res, next) => {          // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

module.exports = app;
