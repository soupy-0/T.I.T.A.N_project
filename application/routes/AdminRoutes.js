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
// 2. Admin Area (/api/admin)
// ==========================================

// 2.1 SENSOR ONBOARDING
router.post('/onboard', supplierAuth, (req, res) => {
    const { hardwareId, supplierName, deliveryId } = req.body;

    // Erstelle die eindeutige System-ID
    const uniqueSensorId = `${supplierName}_${hardwareId}`;

    const sql = `INSERT INTO hardware_mappings (sensor_id, supplier_name, delivery_id, is_active, status) 
                 VALUES (?, ?, ?, 1, 'IN_TRANSIT')`;

            
    const activeContract = SolanaService.getContract();

    db.run(sql, [uniqueSensorId, supplierName, deliveryId], (err) => {
        if (err) return res.status(500).json({ error: "Sensor bereits belegt oder Fehler: " + err.message });
        res.json({ status: "Success", systemId: uniqueSensorId });
    });
});

// 2.2 SET LIMITS (Admin setzt Limits für Supplier)
router.post('/set-limit/:supplier/:deliveryId', supplierAuth, async (req, res) => {
    const { supplier, deliveryId } = req.params;
    const { maxTemp, minTemp, maxHum, minHum } = req.body;
    const activeContract = SolanaService.getContract();

    try {
        if (!activeContract) {
            await SolanaService.initBlockchain();
        }

        // 1. Unveränderlich im Smart Contract speichern
        await activeContract.submitTransaction('SetLimit', supplier, deliveryId,
            maxTemp.toString(), minTemp.toString(), maxHum.toString(), minHum.toString());

        // 2. Status auf Blockchain auf LIMITS_SET_BY_ADMIN setzen
        await activeContract.submitTransaction('SetDeliveryStatus', supplier, deliveryId, 'LIMITS_SET_BY_ADMIN');

        // 3. Im lokalen SQLite-Cache spiegeln & Status auf LIMITS_SET_BY_ADMIN setzen
        const sqlUpdate = `UPDATE hardware_mappings
                           SET max_temp = ?, min_temp = ?, max_hum = ?, min_hum = ?, status = 'LIMITS_SET_BY_ADMIN'
                           WHERE supplier_name = ? AND delivery_id = ?`;

        db.run(sqlUpdate, [maxTemp, minTemp, maxHum, minHum, supplier, deliveryId], (err) => {
            if (err) return res.status(500).json({ error: "Blockchain OK, lokaler DB-Fehler: " + err.message });
            res.json({
                message: "Grenzwerte erfolgreich auf Blockchain und im lokalen System gespeichert. Supplier muss Limits bestätigen.",
                status: "LIMITS_SET_BY_ADMIN"
            });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2.3 DEEP-AUDIT (Vgl. der Blockchain-Daten mit der SQL)
router.get('/audit/:supplier/:deliveryId', supplierAuth, async (req, res) => {
    const { supplier, deliveryId } = req.params;
    
    try {
        // 1. Sensor-ID der Lieferung ermitteln
        const mapping = await new Promise((resolve, reject) => {
            db.get("SELECT sensor_id FROM hardware_mappings WHERE supplier_name = ? AND delivery_id = ?", 
            [supplier, deliveryId], (e, r) => e ? reject(e) : resolve(r));
        });
        if (!mapping) return res.status(404).json({ error: "Lieferung nicht gefunden." });

        // 2. Alle lokalen Rohdaten aus SQLite laden
        const sqlLogs = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM sensor_logs WHERE sensor_id = ?", [mapping.sensor_id], (e, r) => e ? reject(e) : resolve(r));
        });

        // Beschleunigung: SQLite-Daten in ein Dictionary (Map) packen, geordnet nach 'id'
        const localDataMap = {};
        sqlLogs.forEach(log => localDataMap[log.id] = log);

        // 3. Unveränderliche Daten aus der Blockchain laden
        if (!activeContract) await SolanaService.initBlockchain();
        const bcResult = await activeContract.evaluateTransaction('GetAssetsByDelivery', supplier, deliveryId);
        const bcData = JSON.parse(Buffer.from(bcResult).toString('utf8'));

        // 4. DER DEEP-CHECK LOGIK-KERN
        let isConsistent = true;
        const discrepancies = [];

        for (const bcRecord of bcData) {
            // Blockchain-ID splitten: LOG-1741251780-45 -> Teile: ["LOG", "1741251780", "45"]
            const idParts = bcRecord.ID.split('-');
            const sqlId = parseInt(idParts[2], 10); 

            const localRecord = localDataMap[sqlId];

            if (!localRecord) {
                // Fall A: Jemand hat den Datensatz in der SQLite-Datenbank GELÖSCHT!
                isConsistent = false;
                discrepancies.push({
                    id: bcRecord.ID,
                    issue: "Datensatz fehlt lokal (Gelöscht!)",
                    blockchain: { temp: bcRecord.Temperature, humidity: bcRecord.Humidity },
                    local: null
                });
            } else {
                // Fall B: Datensatz ist da. Wir prüfen auf nachträgliche MANIPULATION.
                // Kleine Toleranz (< 0.01) für eventuelle Float-Rundungsfehler in JavaScript
                const tempMatch = Math.abs(bcRecord.Temperature - localRecord.temp) < 0.01;
                const humMatch = Math.abs(bcRecord.Humidity - localRecord.humidity) < 0.01;

                if (!tempMatch || !humMatch) {
                    isConsistent = false;
                    discrepancies.push({
                        id: bcRecord.ID,
                        issue: "Lokale Daten wurden manipuliert!",
                        blockchain: { temp: bcRecord.Temperature, humidity: bcRecord.Humidity },
                        local: { temp: localRecord.temp, humidity: localRecord.humidity }
                    });
                }
            }
        }

        // 5. Ergebnis an das Dashboard senden
        res.json({
            deliveryId, 
            supplier,
            integrity: isConsistent ? "VERIFIED ✅" : "DISCREPANCY ❌",
            details: { 
                total_sql_logs: sqlLogs.length, 
                total_blockchain_logs: bcData.length,
                manipulations_found: discrepancies.length
            },
            discrepancies: discrepancies, // Listet genau auf, WO betrogen wurde
            history: bcData // Lückenlose Historie für die Graphen im Frontend
        });

    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

// 2.4 PROOF-OF-DELIVERY (Empfänger bestätigt Erhalt)
router.post('/confirm-receipt/:supplier/:deliveryId', supplierAuth, async (req, res) => {
    const { supplier, deliveryId } = req.params;
    // Fallback sorgt für Stabilität
    const recipientName = req.body.recipientName || "Zentrallager BASF Ludwigshafen"; 
    const activeContract = SolanaService.getContract();


    try {
        if (!activeContract) await SolanaService.initBlockchain();
        
        // Blockchain-Eintrag: Dokumentiert den Zeitpunkt der physischen Übergabe
        await activeContract.submitTransaction('ConfirmDelivery', supplier, deliveryId, recipientName);
        
        // Status in DB ändern: Sensor bleibt aktiv (is_active = 1)
        db.run(`UPDATE hardware_mappings SET status = 'DELIVERED' WHERE delivery_id = ?`, [deliveryId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ 
                status: "Success", 
                message: `Erhalt von ${deliveryId} bestätigt. Status: DELIVERED. Erwarte Final Checkout.` 
            });
        });
    } catch (error) { 
        res.status(500).json({ error: "Blockchain Fehler: " + error.message }); 
    }
});

// 2.5 FINAL CHECKOUT (Lieferant bestätigt Daten & schließt ab)
router.post('/final-checkout/:supplier/:deliveryId', supplierAuth, async (req, res) => {
    const { supplier, deliveryId } = req.params;
    const activeContract = SolanaService.getContract();


    try {
        if (!activeContract) await SolanaService.initBlockchain();
        await activeContract.submitTransaction('FinalizeDelivery', supplier, deliveryId);

        const statsQuery = `SELECT MIN(timestamp) as start_time, SUM(is_alarm) as alarm_count 
                            FROM sensor_logs l JOIN hardware_mappings m ON l.sensor_id = m.sensor_id 
                            WHERE m.delivery_id = ? AND m.is_active = 1`;

        db.get(statsQuery, [deliveryId], async (err, stats) => {
            if (err) return res.status(500).json({ error: err.message });

            try {
                // HIER DER NEUE SAUBERE AUFRUF:
                const { filePath } = await AuditService.generateDeliveryReport(
                    deliveryId, 
                    supplier, 
                    stats, 
                    req.user.api_key, 
                    req.get('host')
                );

                // Abschluss-Logik (DB Update & Response)
                db.serialize(() => {
                    db.run(`UPDATE hardware_mappings SET is_active = 0, status = 'CLOSED' WHERE delivery_id = ?`, [deliveryId]);
                    db.run(`INSERT OR REPLACE INTO delivery_reports (delivery_id, pdf_path, integrity_status) 
                            VALUES (?, ?, ?)`, [deliveryId, filePath, stats.alarm_count > 0 ? 'ALARM_LOGGED' : 'VERIFIED']);

                    // E-Mail-Adresse des Suppliers abrufen
                    db.get(`SELECT email FROM api_users WHERE owner = ? AND role = 'SUPPLIER'`, [supplier], async (err, user) => {
                        if (err) {
                            console.error('❌ Fehler beim Abrufen der Supplier-E-Mail:', err.message);
                        } else if (user && user.email) {
                            // Buchhaltungs-Benachrichtigung per E-Mail senden
                            await EmailService.sendAccountingNotification(
                                user.email,
                                deliveryId,
                                supplier,
                                filePath,
                                stats.alarm_count,
                                stats.alarm_count > 0 ? 'ALARM_LOGGED' : 'VERIFIED'
                            );
                        }
                    });

                    res.json({ status: "Success", message: `Report für ${deliveryId} generiert.` });
                });

            } catch (pdfErr) {
                console.error("PDF Fehler:", pdfErr);
                res.status(500).json({ error: "Zertifikatserstellung fehlgeschlagen" });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.6 ALARM-DASHBOARD (Nur Warnungen abrufen)
router.get('/alerts', supplierAuth, async (req, res) => {
    const activeContract = SolanaService.getContract();
    

    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Nur für Admins" });
    try {
        if (!activeContract) await SolanaService.initBlockchain();
        // Nutzt die Chaincode-Funktion für den Gesamtüberblick
        const result = await activeContract.evaluateTransaction('GetAllAssets');
        const allData = JSON.parse(Buffer.from(result).toString('utf8'));
        
        const alerts = allData.filter(asset => asset.IsWarning === true);
        res.json({ count: alerts.length, alerts });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 2.7 Routenverlauf einsehen (von abgeschlossenen und laufenden Lieferungen)
router.get('/history/:supplier/:deliveryId', supplierAuth, (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: "Nur für Admins." });

    const { supplier, deliveryId } = req.params;
    const activeContract = SolanaService.getContract();

    // 1. Hole das Hardware-Mapping
    db.get("SELECT sensor_id, status FROM hardware_mappings WHERE delivery_id = ? AND supplier_name = ?", 
    [deliveryId, supplier], async (err, mapping) => {
        if (err || !mapping) return res.status(404).json({ error: "Lieferung nicht gefunden." });

        const sqlLogs = `SELECT id, sensor_id, temp, humidity, lat, lon, is_alarm, timestamp FROM sensor_logs WHERE sensor_id = ? ORDER BY timestamp ASC`;

        db.all(sqlLogs, [mapping.sensor_id], async (err, logs) => {
            if (err) return res.status(500).json({ error: err.message });

            let blockchainVerified = true;
            let blockchainHistory = [];
            let blockchainIds = [];

            try {
                if (!activeContract) await SolanaService.initBlockchain();
                const bcResult = await activeContract.evaluateTransaction('GetAssetsByDelivery', supplier, deliveryId);
                blockchainHistory = JSON.parse(Buffer.from(bcResult).toString('utf8'));
                blockchainIds = blockchainHistory.map(record => record.ID).filter(id => !!id);
            } catch (e) {
                blockchainVerified = false;
            }

            res.json({
                role: "ADMIN_VIEW",
                deliveryId: deliveryId,
                status: mapping.status,
                blockchainStatus: blockchainVerified ? "VERIFIED_SUCCESS" : "MANIPULATION_DETECTED",
                lastAudit: new Date().toISOString(),
                dataPoints: logs.length,
                localIds: logs.map(log => log.id),
                data: logs,
                blockchainIds,
                blockchainHistory
            });
        });
    });
});

// 2.8 Registrieren eines neuen Lieferanten im System => legt einen lokalen Account an und registriert die Identität auf der Blockchain.
router.post('/onboard-supplier', supplierAuth, async (req, res) => {
    const activeContract = SolanaService.getContract();

    // 1. Berechtigungsprüfung (Nur Admins dürfen neue Supplier anlegen)
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Nur Admins erlaubt." });
    }

    const { supplierName, apiKey, email } = req.body;

    // 2. Validierung der Pflichtfelder für dein Schema
    if (!supplierName || !apiKey) {
        return res.status(400).json({
            error: "supplierName und apiKey sind erforderlich. Bitte genau die Keys nehmen"
        });
    }

    // 3. Lokale Registrierung in der SQLite (api_users Tabelle)
    // Wir nutzen nur die Spalten, die laut deinem Screenshot existieren.
    const sqlInsert = `INSERT OR IGNORE INTO api_users (api_key, role, owner, email) VALUES (?, 'SUPPLIER', ?, ?)`;
    
    db.run(sqlInsert, [apiKey, supplierName, email || null], async function(err) {
        if (err) {
            console.error("❌ Lokaler DB-Fehler:", err.message);
            return res.status(500).json({ 
                error: "Fehler beim Anlegen des Lieferanten in der DB: " + err.message 
            });
        }

        console.log(`[GATEWAY] Lokaler Account erstellt für: ${supplierName}`);

        // 4. Blockchain-Registrierung (Die "digitale Urkunde")
        try {
            // Blockchain-Verbindung sicherstellen
            if (!activeContract) {
                console.log("🔗 Initialisiere Blockchain-Verbindung...");
                await SolanaService.initBlockchain();
            }

            console.log(`🔗 BLOCKCHAIN: Registriere Lieferant '${supplierName}' im Ledger...`);
            
            // Aufruf der Chaincode-Funktion
            await activeContract.submitTransaction(
                'RegisterSupplier', 
                supplierName, 
                "Zertifizierter Logistikpartner (Neuaufnahme 2026)"
            );

            // 5. Erfolg: Antwort an den Admin
            res.status(201).json({
                status: "Success",
                message: `Lieferant '${supplierName}' wurde lokal und auf der Blockchain registriert.`,
                data: {
                    supplier: supplierName,
                    blockchainId: `SUPPLIER_${supplierName}`,
                    role: "SUPPLIER"
                }
            });

            // 6. Willkommens-E-Mail senden (falls E-Mail angegeben)
            if (email) {
                EmailService.sendWelcomeEmail(supplierName, apiKey, email)
                    .then(result => {
                        console.log(`✅ Willkommens-E-Mail an ${email} gesendet:`, result);
                    })
                    .catch(error => {
                        console.error(`❌ Willkommens-E-Mail an ${email} fehlgeschlagen:`, error);
                    });
            }

        } catch (bcError) {
            // Falls Blockchain fehlschlägt, ist der User lokal trotzdem angelegt (Partial Success)
            console.error("❌ Blockchain-Fehler bei Onboarding:", bcError.message);
            
            res.status(201).json({
                status: "Partial Success",
                message: `Lieferant lokal angelegt, aber Blockchain-Eintrag fehlgeschlagen.`,
                error: bcError.message,
                supplier: supplierName
            });
        }
    });
});

// 2.9 Zertifikat/Report wird via API heruntergeladen
router.get('/download-report/:deliveryId', supplierAuth, (req, res) => {
    // Sicherheitscheck: Nur ADMIN Rolle erlaubt
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Nur Administratoren können globale Reports abrufen." });
    }

    const { deliveryId } = req.params;

    db.get("SELECT pdf_path FROM delivery_reports WHERE delivery_id = ?", [deliveryId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Report nicht gefunden." });

        const filePath = path.resolve(row.pdf_path);
        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).json({ error: "PDF-Datei existiert nicht auf dem Server." });
        }
    });
});

// 2.10 Admin initialisiert Lieferung und weist Supplier zu
router.post('/initiate-delivery', supplierAuth, async (req, res) => {
    const activeContract = SolanaService.getContract();

    // Berechtigungsprüfung (Nur Admins dürfen Lieferungen initialisieren)
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Nur Admins erlaubt." });
    }

    const { hardwareId, deliveryId, supplierName } = req.body;

    // Validierung der Pflichtfelder
    if (!hardwareId || !deliveryId || !supplierName) {
        return res.status(400).json({
            error: "hardwareId, deliveryId und supplierName sind erforderlich."
        });
    }

    const uniqueSensorId = `${supplierName}_${hardwareId}`;

    try {
        // 1. Prüfen, ob Supplier auf Blockchain registriert ist
        if (!activeContract) {
            await SolanaService.initBlockchain();
        }

        const supplierExistsResult = await activeContract.evaluateTransaction('AssetExists', `SUPPLIER_${supplierName}`);
        const supplierExists = Buffer.from(supplierExistsResult).toString('utf8') === 'true';

        if (!supplierExists) {
            return res.status(400).json({
                error: `Supplier '${supplierName}' ist nicht auf der Blockchain registriert.`
            });
        }

        // 2. Prüfen, ob Lieferung bereits existiert
        const deliveryExistsResult = await activeContract.evaluateTransaction('AssetExists', uniqueSensorId);
        const deliveryExists = Buffer.from(deliveryExistsResult).toString('utf8') === 'true';

        if (deliveryExists) {
            return res.status(400).json({
                error: `Lieferung '${deliveryId}' für Supplier '${supplierName}' existiert bereits.`
            });
        }

        // 3. Insert in hardware_mappings Tabelle
        const sql = `INSERT INTO hardware_mappings (sensor_id, supplier_name, delivery_id, is_active, status)
                     VALUES (?, ?, ?, 1, 'PENDING_LIMITS')`;

        db.run(sql, [uniqueSensorId, supplierName, deliveryId], async (err) => {
            if (err) return res.status(500).json({ error: "Sensor belegt: " + err.message });

            try {
                // 4. Blockchain: Registrierung der Lieferung
                await activeContract.submitTransaction('InitializeDelivery', supplierName, deliveryId, uniqueSensorId);

                // 5. E-Mail-Benachrichtigung an Supplier senden
                db.get(`SELECT email FROM api_users WHERE owner = ? AND role = 'SUPPLIER'`, [supplierName], async (err, user) => {
                    if (err) {
                        console.error('❌ Fehler beim Abrufen der Supplier-E-Mail:', err.message);
                    } else if (user && user.email) {
                        await EmailService.sendDeliveryNotification(
                            user.email,
                            deliveryId,
                            supplierName,
                            'Admin'
                        );
                    }
                });

                res.json({
                    status: "Success",
                    message: "Lieferung vom Admin initialisiert und Supplier zugewiesen.",
                    systemId: uniqueSensorId
                });
            } catch (bcError) {
                console.error("❌ BLOCKCHAIN REJECTED:", bcError.message);
                res.json({ status: "Partial Success", message: "Lokal registriert, Blockchain verzögert." });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2.11 Alle aktiven Lieferungen anzeigen (Admin-Übersicht)
router.get('/show-deliveries', supplierAuth, async (req, res) => {
    // Berechtigungsprüfung (Nur Admins)
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Nur Admins erlaubt." });
    }

    const activeContract = SolanaService.getContract();

    try {
        // 1. Alle aktiven Lieferungen aus der Datenbank abrufen
        const sql = `
            SELECT 
                m.delivery_id, 
                m.sensor_id, 
                m.status,
                m.supplier_name,
                (SELECT MAX(timestamp) FROM sensor_logs WHERE sensor_id = m.sensor_id) as last_reading
            FROM hardware_mappings m
            WHERE m.is_active = 1
        `;

        const deliveries = await new Promise((resolve, reject) => {
            db.all(sql, [], (err, rows) => {
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