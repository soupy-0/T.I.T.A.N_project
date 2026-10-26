'use strict';

const crypto = require('crypto');
const SolanaService = require('./SolanaService');
const { db } = require('./DatabaseService');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) =>
      err ? reject(err) : resolve(rows || [])
    );
  });
}

function canonicalEvent(row) {
  return {
    type: row.is_alarm ? 'SENSOR_ALARM' : 'SENSOR_READING',
    eventId: `LOG-${row.id}`,
    logId: row.id,
    sensorId: row.sensor_id,
    supplier: row.supplier_name || null,
    deliveryId: row.delivery_id || null,
    temperature: Number(row.temp),
    humidity: Number(row.humidity),
    lat: row.lat == null ? null : Number(row.lat),
    lon: row.lon == null ? null : Number(row.lon),
    timestamp: row.timestamp,
    isAlarm: Boolean(row.is_alarm)
  };
}

async function readMemo(signature) {
  const tx = await SolanaService.connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (!tx || tx.meta?.err || !tx.meta?.logMessages) return null;

  for (const line of tx.meta.logMessages) {
    if (!line.includes('Memo (len ')) continue;

    try {
      const separator = line.indexOf(': ', line.indexOf('Memo (len '));
      if (separator === -1) continue;

      const memoText = JSON.parse(line.slice(separator + 2));
      const memo = JSON.parse(memoText);

      if (memo.app === 'TITAN') return memo;
    } catch {}
  }

  return null;
}

async function verifyDelivery(supplier, deliveryId) {
  const rows = await dbAll(`
    SELECT s.*, m.supplier_name, m.delivery_id
    FROM sensor_logs s
    JOIN hardware_mappings m ON m.sensor_id = s.sensor_id
    WHERE m.supplier_name = ? AND m.delivery_id = ?
    ORDER BY s.id
  `, [supplier, deliveryId]);

  const results = [];

  for (const row of rows) {
    const eventId = `LOG-${row.id}`;

    if (!row.solana_signature) {
      results.push({
        eventId,
        status: 'MISSING_SIGNATURE',
        message: 'No transaction signature saved in SQLite.'
      });
      continue;
    }

    try {
      const memo = await readMemo(row.solana_signature);

      if (!memo || memo.eventId !== eventId) {
        results.push({
          eventId,
          status: 'TRANSACTION_NOT_VERIFIED',
          signature: row.solana_signature
        });
        continue;
      }

      const digest = crypto.createHash('sha256')
        .update(JSON.stringify(canonicalEvent(row)))
        .digest('hex');

      results.push({
        eventId,
        status: digest === memo.digest ? 'VERIFIED' : 'DIGEST_MISMATCH',
        signature: row.solana_signature,
        explorerUrl:
          `https://explorer.solana.com/tx/${row.solana_signature}?cluster=devnet`
      });
    } catch (error) {
      results.push({
        eventId,
        status: 'RPC_ERROR',
        message: error.message
      });
    }
  }

  return {
    supplier,
    deliveryId,
    totalLocalReadings: rows.length,
    verified: results.filter(r => r.status === 'VERIFIED').length,
    mismatches: results.filter(r => r.status === 'DIGEST_MISMATCH').length,
    missingSignatures: results.filter(r => r.status === 'MISSING_SIGNATURE').length,
    results
  };
}

module.exports = { verifyDelivery };
