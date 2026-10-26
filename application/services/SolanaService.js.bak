'use strict';

// T.I.T.A.N MVP ledger adapter: Solana Devnet + Memo Program.
// Raw telemetry stays in SQLite; only a SHA-256 digest and minimal event metadata go on-chain.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, clusterApiUrl } = require('@solana/web3.js');
const { db } = require('./DatabaseService');

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const network = process.env.SOLANA_RPC_URL || clusterApiUrl(process.env.SOLANA_CLUSTER || 'devnet');
const connection = new Connection(network, 'confirmed');
let wallet;
let initialized = false;

function loadWallet() {
  if (wallet) return wallet;
  const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
  if (keypairPath) {
    const secret = JSON.parse(fs.readFileSync(path.resolve(keypairPath), 'utf8'));
    wallet = Keypair.fromSecretKey(Uint8Array.from(secret));
  } else if (process.env.SOLANA_SECRET_KEY) {
    let parsed;
    try { parsed = JSON.parse(process.env.SOLANA_SECRET_KEY); }
    catch { parsed = Array.from(Buffer.from(process.env.SOLANA_SECRET_KEY, 'base64')); }
    wallet = Keypair.fromSecretKey(Uint8Array.from(parsed));
  }
  return wallet;
}

function dbAll(sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (e, rows) => e ? reject(e) : resolve(rows || []))); }
function dbGet(sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (e, row) => e ? reject(e) : resolve(row))); }

async function initBlockchain() {
  const kp = loadWallet();
  if (!kp) throw new Error('Solana wallet not configured. Set SOLANA_KEYPAIR_PATH or SOLANA_SECRET_KEY in application/.env');
  await connection.getLatestBlockhash('confirmed');
  initialized = true;
  console.log(`Solana Devnet ready: ${kp.publicKey.toBase58()}`);
  return true;
}
function getContract() {
  // Stable adapter object: SQL-backed delivery workflows remain usable while wallet setup is pending.
  return { submitTransaction, evaluateTransaction };
}

async function recordEventNow(event) {
  const kp = loadWallet();
  if (!kp) throw new Error('Solana wallet not configured. Configure SOLANA_KEYPAIR_PATH in application/.env');
  const canonical = JSON.stringify(event);
  const digest = crypto.createHash('sha256').update(canonical).digest('hex');
  // Memo payload intentionally contains no full measurements or personal data.
  const memo = JSON.stringify({ app: 'TITAN', version: 1, type: event.type, eventId: event.eventId || null, digest, at: new Date().toISOString() });
  const tx = new Transaction().add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo, 'utf8') }));
  const signature = await sendAndConfirmTransaction(connection, tx, [kp], { commitment: 'confirmed' });
  return { success: true, signature, explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`, digest };
}


// Serialize Devnet writes to reduce public RPC rate-limit errors.
let transactionQueue = Promise.resolve();
let lastTransactionStart = 0;
function recordEvent(event) {
  const task = transactionQueue.then(async () => {
    const delay = Math.max(0, 2500 - (Date.now() - lastTransactionStart));
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    lastTransactionStart = Date.now();
    return recordEventNow(event);
  });
  // Keep the queue usable even when one transaction fails.
  transactionQueue = task.catch(() => {});
  return task;
}

async function syncToBlockchain(logId, reading, mapping = {}) {
  try {
    const event = {
      type: reading.isAlarm ? 'SENSOR_ALARM' : 'SENSOR_READING', eventId: `LOG-${logId}`,
      logId, sensorId: reading.uniqueId, supplier: mapping.supplier_name || null,
      deliveryId: mapping.delivery_id || null, temperature: Number(reading.temp), humidity: Number(reading.humidity),
      lat: reading.lat == null ? null : Number(reading.lat), lon: reading.lon == null ? null : Number(reading.lon),
      timestamp: reading.measurementTime || new Date().toISOString(), isAlarm: Boolean(reading.isAlarm)
    };
    const result = await recordEvent(event);
    return { ...result, success: true };
  } catch (error) {
    console.error('Solana write failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Compatibility adapter lets the existing delivery workflows migrate incrementally.
// State and queries remain in SQLite; each mutation is anchored as a Solana memo transaction.
async function submitTransaction(method, ...args) {
  try {
    const result = await recordEvent({ type: method, args, at: new Date().toISOString() });
    return Buffer.from(JSON.stringify({ ...result, method }));
  } catch (error) {
    // Allow local/demo workflows to be exercised before a Devnet wallet is configured.
    // Sensor telemetry sync still returns failure so its SQL row remains PENDING.
    if (!loadWallet()) return Buffer.from(JSON.stringify({ success: false, localOnly: true, method, warning: 'Solana wallet not configured; no on-chain transaction was sent.' }));
    console.error(`Solana workflow transaction failed for ${method}:`, error.message);
    // Do not crash the backend or claim that the event was confirmed.
    // A send/confirmation error can leave the on-chain status uncertain; do not auto-retry.
    return Buffer.from(JSON.stringify({
      success: false,
      localOnly: true,
      method,
      warning: 'Solana transaction was not confirmed; on-chain status may be uncertain. Check the transaction status before retrying.'
    }));
  }
}
async function evaluateTransaction(method, ...args) {
  let result = [];
  if (method === 'GetAllAssets') {
    result = await dbAll(`SELECT s.id, s.sensor_id AS SensorID, s.temp AS Temperature, s.humidity AS Humidity, s.timestamp AS Timestamp, s.is_alarm AS IsWarning, m.supplier_name AS Supplier, m.delivery_id AS DeliveryID FROM sensor_logs s JOIN hardware_mappings m ON m.sensor_id=s.sensor_id ORDER BY s.id`);
  } else if (method === 'GetAssetsByDelivery') {
    const [supplier, deliveryId] = args;
    result = await dbAll(`SELECT 'LOG-' || strftime('%s', s.timestamp) || '-' || s.id AS ID, s.sensor_id AS SensorID, s.temp AS Temperature, s.humidity AS Humidity, s.timestamp AS Timestamp, s.is_alarm AS IsWarning, m.supplier_name AS Supplier, m.delivery_id AS DeliveryID FROM sensor_logs s JOIN hardware_mappings m ON m.sensor_id=s.sensor_id WHERE m.supplier_name=? AND m.delivery_id=? ORDER BY s.id`, [supplier, deliveryId]);
  } else if (method === 'GetAssetsBySupplier') {
    const [supplier] = args;
    result = await dbAll(`SELECT 'LOG-' || strftime('%s', s.timestamp) || '-' || s.id AS ID, s.sensor_id AS SensorID, s.temp AS Temperature, s.humidity AS Humidity, s.timestamp AS Timestamp, (s.is_alarm=1) AS IsWarning, m.supplier_name AS Supplier, m.delivery_id AS DeliveryID FROM sensor_logs s JOIN hardware_mappings m ON m.sensor_id=s.sensor_id WHERE m.supplier_name=? ORDER BY s.id`, [supplier]);
  } else if (method === 'AssetExists') {
    const [id] = args;
    const row = id.startsWith('SUPPLIER_')
      ? await dbGet('SELECT 1 AS yes FROM api_users WHERE owner=? LIMIT 1', [id.slice('SUPPLIER_'.length)])
      : await dbGet('SELECT 1 AS yes FROM hardware_mappings WHERE sensor_id=? LIMIT 1', [id]);
    return Buffer.from(row ? 'true' : 'false');
  }
  return Buffer.from(JSON.stringify(result));
}

module.exports = { initBlockchain, getContract, syncToBlockchain, recordEvent, connection, getWallet: loadWallet, get initialized() { return initialized; } };
