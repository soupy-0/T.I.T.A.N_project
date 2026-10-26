const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const SolanaService = require('../services/SolanaService');
const AuditService = require('../services/AuditService');
const { db } = require('../services/DatabaseService');
const supplierAuth = require('../services/SupplierAuth');
const EmailService = require('../services/EmailService');

// ==========================================
// 3. Supplier Area (/api/supplier)
// ==========================================

// 3.1 Einsehen aller aktiven Lieferungen 
router.get('/:supplier/active', supplierAuth, (req, res) => {
    const { supplier } = req.params;
    const user = req.user;

    // Sicherheits-Check: Nur Admin oder der betroffene Supplier selbst
    if (user.role !== 'ADMIN' && user.owner !== supplier) {
        return res.status(403).json({ error: "Zugriff verweigert." });
    }

    // Wir holen die Lieferungs-Daten UND den neuesten Zeitstempel aus den Logs
    const sql = `
        SELECT 
            m.delivery_id, 
            m.sensor_id, 
            m.status,
            (SELECT MAX(timestamp) FROM sensor_logs WHERE sensor_id = m.sensor_id) as last_reading
        FROM hardware_mappings m
        WHERE m.supplier_name = ? AND m.is_active = 1
    `;

    db.all(sql, [supplier], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({ 
            supplier, 
            activeCount: rows.length, 
            deliveries: rows // Enthält jetzt 'last_reading' statt dem fehlerhaften 'timestamp'
        });
    });
});

// 3.2 Einsehen der Blockchain-Datenintegrität für den Lieferanten
router.get('/:supplier/audit/:deliveryId', supplierAuth, async (req, res) => {
    const { supplier, deliveryId } = req.params;
    const activeContract = SolanaService.getContract();


    try {
        if (!activeContract) await SolanaService.initBlockchain();

        // 1. Blockchain-Daten abrufen (Der "Gold-Standard")
        const bcResult = await activeContract.evaluateTransaction('GetAssetsByDelivery', supplier, deliveryId);
        const bcRecords = JSON.parse(Buffer.from(bcResult).toString('utf8'));

        // 2. Integritäts-Check vorbereiten
        let anomalies = [];
        let verifiedCount = 0;

        // Wir prüfen jeden Blockchain-Eintrag gegen die lokale SQL-DB
        for (const record of bcRecords) {
            const sqlMatch = await new Promise((resolve) => {
                // Suche in sensor_logs nach dem exakten Zeitstempel
                db.get(
                    `SELECT temp, humidity FROM sensor_logs 
                     WHERE sensor_id = (SELECT sensor_id FROM hardware_mappings WHERE delivery_id = ?) 
                     AND timestamp = ?`,
                    [deliveryId, record.Timestamp], // record.Timestamp kommt vom Ledger
                    (err, row) => resolve(row)
                );
            });

            if (!sqlMatch) {
                anomalies.push({ time: record.Timestamp, reason: "Datensatz in SQL fehlt (gelöscht?)" });
            } else if (Math.abs(sqlMatch.temp - record.Temperature) > 0.01) {
                // Vergleich mit kleiner Toleranz für Floating Point
                anomalies.push({ time: record.Timestamp, reason: "Temperatur-Abweichung festgestellt!" });
            } else {
                verifiedCount++;
            }
        }

        // 3. Ergebnis mit Modulo-Kontext senden
        res.json({
            deliveryId,
            summary: {
                blockchainTotal: bcRecords.length,
                integrityVerified: verifiedCount,
                anomaliesDetected: anomalies.length
            },
            status: anomalies.length === 0 ? "INTEGRITY_OK" : "INTEGRITY_COMPROMISED",
            details: anomalies
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3.3 Einsehen aller Alarme für den Lieferanten
router.get('/alerts', supplierAuth, async (req, res) => {
    // Wir nehmen den Namen des Lieferanten direkt aus seinem authentifizierten API-Key
    const supplierName = req.user.owner; 
    const activeContract = SolanaService.getContract();


    try {
        if (!activeContract) await SolanaService.initBlockchain();

        // NUTZT DIE SPEZIFISCHE CHAINCODE-LOGIK:
        // GetAssetsBySupplier(ctx, supplierName)
        const result = await activeContract.evaluateTransaction('GetAssetsBySupplier', supplierName);
        const myAssets = JSON.parse(Buffer.from(result).toString('utf8'));
        
        // Filtert nur die Warnungen aus SEINEN Assets
        const myAlerts = myAssets.filter(asset => asset.IsWarning === true);
        
        res.json({
            supplier: supplierName,
            count: myAlerts.length,
            alerts: myAlerts
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3.4 SUPPLIER: Verlauf der eigenen Lieferung mit Blockchain-Verifizierung
router.get('/history/:deliveryId', supplierAuth, (req, res) => {
    const { deliveryId } = req.params;
    const supplierName = req.user.owner; // Harte Identität aus dem API-Key (z.B. 'Supplier_A')
    const activeContract = SolanaService.getContract();

    // 1. Suche die Lieferung - nur wenn sie diesem Supplier gehört!
    const sqlMapping = `SELECT sensor_id, status FROM hardware_mappings 
                        WHERE delivery_id = ? AND supplier_name = ?`;

    db.get(sqlMapping, [deliveryId, supplierName], async (err, mapping) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (!mapping) {
            return res.status(403).json({ 
                error: "Zugriff verweigert", 
                message: "Diese Lieferung gehört nicht zu deinem Account oder existiert nicht." 
            });
        }

        const sqlLogs = `SELECT id, sensor_id, temp, humidity, lat, lon, is_alarm, timestamp 
                         FROM sensor_logs 
                         WHERE sensor_id = ? 
                         ORDER BY timestamp ASC`;

        db.all(sqlLogs, [mapping.sensor_id], async (err, logs) => {
            if (err) return res.status(500).json({ error: err.message });

            let blockchainStatus = "VERIFIED_SUCCESS";
            let blockchainHistory = [];
            let blockchainIds = [];

            try {
                if (!activeContract) await SolanaService.initBlockchain();
                const bcResult = await activeContract.evaluateTransaction('GetAssetsByDelivery', supplierName, deliveryId);
                blockchainHistory = JSON.parse(Buffer.from(bcResult).toString('utf8'));
                blockchainIds = blockchainHistory.map(record => record.ID).filter(id => !!id);
            } catch (e) {
                blockchainStatus = "VERIFICATION_FAILED";
            }

            res.json({
                role: "SUPPLIER_VIEW",
                supplier: supplierName,
                deliveryId: deliveryId,
                status: mapping.status,
                blockchainStatus: blockchainStatus,
                dataPoints: logs.length,
                localIds: logs.map(log => log.id),
                data: logs,
                blockchainIds,
                blockchainHistory
            });
        });
    });
});

//3.5 Supplier initialisiert seine Lieferung selbst
router.post('/initiate-delivery', supplierAuth, async (req, res) => {
    const supplierName = req.user.owner;
    const { hardwareId, deliveryId } = req.body;
    const activeContract = SolanaService.getContract();

    if (!hardwareId || !deliveryId) {
        return res.status(400).json({ error: "hardwareId und deliveryId erforderlich." });
    }

    const uniqueSensorId = `${supplierName}_${hardwareId}`;

    // Status 'PENDING_LIMITS' signalisiert, dass die Logistik steht, aber die QS noch fehlt
    const sql = `INSERT INTO hardware_mappings (sensor_id, supplier_name, delivery_id, is_active, status)
                 VALUES (?, ?, ?, 1, 'PENDING_LIMITS')`;

    db.run(sql, [uniqueSensorId, supplierName, deliveryId], async (err) => {
        if (err) return res.status(500).json({ error: "Sensor belegt: " + err.message });

        try {
            // Blockchain: Registrierung des logistischen Vorgangs
            await activeContract.submitTransaction('InitializeDelivery', supplierName, deliveryId, uniqueSensorId);

            // E-Mail-Benachrichtigung an Supplier senden
            db.get(`SELECT email FROM api_users WHERE owner = ? AND role = 'SUPPLIER'`, [supplierName], async (err, user) => {
                if (err) {
                    console.error('❌ Fehler beim Abrufen der Supplier-E-Mail:', err.message);
                } else if (user && user.email) {
                    await EmailService.sendDeliveryNotification(
                        user.email,
                        deliveryId,
                        supplierName,
                        'Supplier'
                    );
                }
            });

            res.json({
                status: "Success",
                message: "Lieferung registriert. Bitte Grenzwerte definieren.",
                systemId: uniqueSensorId
            });
        } catch (bcError) {
            console.error("❌ BLOCKCHAIN REJECTED:", bcError.message);
            res.json({ status: "Partial Success", message: "Lokal registriert, Blockchain verzögert." });
        }
    });
});

// 3.6 Supplier legt Grenzwerte fest
// DEAKTIVIERT - Limits werden jetzt vom Admin gesetzt und vom Supplier bestätigt
// Dieser Endpoint wird für zukünftige Verwendung als Fallback erhalten
/*
router.post('/set-limit/:deliveryId', supplierAuth, async (req, res) => {
    const { deliveryId } = req.params; // Eindeutige ID aus der URL
    const { maxTemp, minTemp, maxHum, minHum } = req.body;
    const activeContract = SolanaService.getContract();


    // Identität wird sicher aus dem API-Key (Header) extrahiert
    const supplier = req.user.owner;

    console.log(`\nLimit-Setzung für: ${deliveryId} (${supplier}) ---`);

    try {
        // 1. Blockchain-Verbindung sicherstellen
        if (!activeContract) {
            console.log("🔗 Initialisiere Blockchain-Verbindung...");
            await SolanaService.initBlockchain();
        }

        // 2. Unveränderlich im Smart Contract speichern
        // Wir nutzen 'SetLimit' - achte darauf, dass dieser Name im Chaincode existiert
        console.log("📡 Sende Transaktion 'SetLimit' an Solana Devnet...");
        await activeContract.submitTransaction(
            'SetLimit',
            supplier,
            deliveryId,
            maxTemp.toString(),
            minTemp.toString(),
            maxHum.toString(),
            minHum.toString()
        );
        console.log("✅ Blockchain: Limits wurden im Ledger versiegelt.");

        // 3. Im lokalen SQLite-Cache spiegeln & Status auf 'IN_TRANSIT' setzen
        const sqlUpdate = `UPDATE hardware_mappings
                           SET max_temp = ?, min_temp = ?, max_hum = ?, min_hum = ?, status = 'IN_TRANSIT'
                           WHERE supplier_name = ? AND delivery_id = ? AND is_active = 1`;

        db.run(sqlUpdate, [maxTemp, minTemp, maxHum, minHum, supplier, deliveryId], function(err) {
            if (err) {
                console.error("❌ Lokaler DB-Fehler nach Blockchain-Sync:", err.message);
                return res.status(500).json({ error: "Blockchain OK, lokaler DB-Fehler: " + err.message });
            }

            if (this.changes === 0) {
                console.warn("⚠️ Keine Änderung: Lieferung existiert nicht, ist inaktiv oder gehört anderem Supplier.");
                return res.status(404).json({ error: "Lieferung nicht gefunden oder bereits abgeschlossen." });
            }

            console.log("💾 Lokale Datenbank aktualisiert.");
            console.log(`   📊 Neue Grenzwerte: Temp: ${minTemp}°C - ${maxTemp}°C | Feuchtigkeit: ${minHum}% - ${maxHum}%`);
            res.json({
                status: "Success",
                message: `Grenzwerte für ${deliveryId} versiegelt. Überwachung ist jetzt aktiv.`,
                limits: { maxTemp, minTemp, maxHum, minHum }
            });
        });

    } catch (error) {
        console.error("❌ Kritischer Fehler bei SetLimit:", error.message);
        res.status(500).json({ error: error.message });
    }
});
*/

// 3.6 NEU: Supplier bestätigt die vom Admin gesetzten Limits
router.post('/confirm-limits/:deliveryId', supplierAuth, async (req, res) => {
    const { deliveryId } = req.params;
    const supplier = req.user.owner;
    const activeContract = SolanaService.getContract();

    console.log(`\nLimit-Bestätigung für: ${deliveryId} (${supplier}) ---`);

    try {
        // 1. Prüfen ob Lieferung existiert und Status korrekt ist
        const sqlCheck = `SELECT status FROM hardware_mappings WHERE delivery_id = ? AND supplier_name = ? AND is_active = 1`;
        const mapping = await new Promise((resolve, reject) => {
            db.get(sqlCheck, [deliveryId, supplier], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!mapping) {
            return res.status(404).json({ error: "Lieferung nicht gefunden oder nicht aktiv." });
        }

        if (mapping.status !== 'LIMITS_SET_BY_ADMIN') {
            return res.status(400).json({
                error: "Limits können nur bestätigt werden, wenn Status 'LIMITS_SET_BY_ADMIN' ist.",
                currentStatus: mapping.status
            });
        }

        // 2. Blockchain-Verbindung sicherstellen
        if (!activeContract) {
            console.log("🔗 Initialisiere Blockchain-Verbindung...");
            await SolanaService.initBlockchain();
        }

        // 3. Bestätigung auf Blockchain speichern
        console.log("📡 Sende Transaktion 'ConfirmLimits' an Solana Devnet...");
        await activeContract.submitTransaction('ConfirmLimits', supplier, deliveryId);
        console.log("✅ Blockchain: Limits wurden vom Supplier bestätigt.");

        // 4. Status in lokaler DB auf IN_TRANSIT setzen
        const sqlUpdate = `UPDATE hardware_mappings SET status = 'IN_TRANSIT' WHERE delivery_id = ? AND supplier_name = ?`;
        db.run(sqlUpdate, [deliveryId, supplier], function(err) {
            if (err) {
                console.error("❌ Lokaler DB-Fehler nach Blockchain-Sync:", err.message);
                return res.status(500).json({ error: "Blockchain OK, lokaler DB-Fehler: " + err.message });
            }

            console.log("💾 Lokale Datenbank aktualisiert. Status: IN_TRANSIT");
            res.json({
                status: "Success",
                message: `Limits für ${deliveryId} erfolgreich bestätigt. Überwachung ist jetzt aktiv.`,
                deliveryId,
                supplier,
                newStatus: "IN_TRANSIT"
            });
        });

    } catch (error) {
        console.error("❌ Kritischer Fehler bei ConfirmLimits:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// 3.7 Supplier kann Report/Zertifikat der Lieferung via API herunterladen
router.get('/download-report/:deliveryId', supplierAuth, (req, res) => {
    const { deliveryId } = req.params;
    const supplierName = req.user.owner; 

    // 1. Validierung: Gehört diese Lieferung diesem Supplier?
    const checkOwnership = `SELECT delivery_id FROM hardware_mappings 
                            WHERE delivery_id = ? AND supplier_name = ?`;

    db.get(checkOwnership, [deliveryId, supplierName], (err, mapping) => {
        if (err || !mapping) {
            // Wichtig: 403, wenn die ID existiert, aber nicht dem Supplier gehört
            return res.status(403).json({ error: "Zugriff verweigert." });
        }

        db.get("SELECT pdf_path FROM delivery_reports WHERE delivery_id = ?", [deliveryId], (err, report) => {
            if (err || !report) return res.status(404).json({ error: "Report nicht gefunden." });

            const filePath = path.resolve(report.pdf_path);
            if (fs.existsSync(filePath)) {
                res.download(filePath); // Der Browser startet automatisch den Download
            } else {
                res.status(404).json({ error: "Datei auf Server nicht auffindbar." });
            }
        });
    });
});

// 3.8 Alle aktiven Lieferungen des Suppliers anzeigen (mit Blockchain-Verifizierung)
router.get('/show-deliveries', supplierAuth, async (req, res) => {
    const supplierName = req.user.owner;
    const activeContract = SolanaService.getContract();

    try {
        // 1. Alle aktiven Lieferungen dieses Suppliers aus der Datenbank abrufen
        const sql = `
            SELECT 
                m.delivery_id, 
                m.sensor_id, 
                m.status,
                m.supplier_name,
                (SELECT MAX(timestamp) FROM sensor_logs WHERE sensor_id = m.sensor_id) as last_reading
            FROM hardware_mappings m
            WHERE m.supplier_name = ? AND m.is_active = 1
        `;

        const deliveries = await new Promise((resolve, reject) => {
            db.all(sql, [supplierName], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // 2. Blockchain-Verifikation für jede Lieferung durchführen
        const deliveriesWithVerification = await Promise.all(deliveries.map(async (delivery) => {
            let blockchainVerified = false;
            
            try {
                if (!activeContract) {
                    await SolanaService.initBlockchain();
                }
                
                const result = await activeContract.evaluateTransaction('GetAssetsByDelivery', delivery.supplier_name, delivery.delivery_id);
                const bcData = JSON.parse(Buffer.from(result).toString('utf8'));
                blockchainVerified = bcData && bcData.length > 0;
            } catch (e) {
                blockchainVerified = false;
            }

            return {
                ...delivery,
                blockchain_verified: blockchainVerified
            };
        }));

        res.json({
            total: deliveriesWithVerification.length,
            deliveries: deliveriesWithVerification
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;