'use strict';
require('dotenv').config();
const express = require('express');
const { db } = require('./services/DatabaseService');
const SolanaService = require('./services/SolanaService');
const EmailService = require('./services/EmailService');
const app = express();
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'T.I.T.A.N API', blockchain: 'Solana Devnet', walletConfigured: Boolean(process.env.SOLANA_KEYPAIR_PATH || process.env.SOLANA_SECRET_KEY), timestamp: new Date().toISOString() }));
app.use('/api/admin', require('./routes/AdminRoutes'));
app.use('/api/dev', require('./routes/DeveloperRoutes'));
app.use('/api/supplier', require('./routes/SupplierRoutes'));
app.use('/api/', require('./routes/SensorRoutes'));

// Offline-resilience: retry pending sensor records when a Devnet wallet is configured.
setInterval(async () => {
  if (!(process.env.SOLANA_KEYPAIR_PATH || process.env.SOLANA_SECRET_KEY)) return;
  try {
    const rows = await new Promise((resolve, reject) => db.all(`SELECT s.*, h.supplier_name, h.delivery_id FROM sensor_logs s JOIN hardware_mappings h ON s.sensor_id=h.sensor_id WHERE s.sync_status='PENDING' ORDER BY s.id LIMIT 20`, [], (e, r) => e ? reject(e) : resolve(r || [])));
    for (const row of rows) {
      const result = await SolanaService.syncToBlockchain(row.id, { uniqueId: row.sensor_id, temp: row.temp, humidity: row.humidity, lat: row.lat, lon: row.lon, measurementTime: row.timestamp, isAlarm: Boolean(row.is_alarm) }, row);
      if (!result.success) break;
      await new Promise((resolve, reject) => db.run(`UPDATE sensor_logs SET sync_status='SYNCED' WHERE id=?`, [row.id], e => e ? reject(e) : resolve()));
    }
  } catch (e) { console.error('Pending Solana sync retry failed:', e.message); }
}, 30000);

EmailService.initialize();
app.listen(port, '0.0.0.0', () => {
  console.log(`T.I.T.A.N API listening on ${port}`);
  SolanaService.initBlockchain().catch(err => console.warn(`Solana Devnet not initialized yet: ${err.message}`));
});
module.exports = app;
