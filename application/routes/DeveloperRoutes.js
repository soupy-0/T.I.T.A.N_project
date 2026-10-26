const express = require('express');
const router = express.Router();
const SolanaService = require('../services/SolanaService');
const AuditService = require('../services/AuditService');
const { db } = require('../services/DatabaseService');
const supplierAuth = require('../services/SupplierAuth');
const axios = require('axios');


/// ==========================================
// 1. Developer Area (/api/dev)
// ==========================================

router.post('/test', (req, res) => {
    console.log("🎯 TEST-TREFFER!");
    res.send("Habe dich gehört!");
});

router.get('/ping', (req, res) => res.send("PONG - Entwicklerzugang aktiv!"));

router.get('/buffer-view', (req, res) => {
    db.all("SELECT * FROM sensor_logs ORDER BY timestamp DESC LIMIT 50", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

router.get('/debug-mappings', (req, res) => {
    db.all("SELECT * FROM hardware_mappings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
}); 

router.get('/health', (req, res) => {
    console.log("🔍 Health-Check: Passiv-Modus...");
    
    // Nur den Status abfragen, nicht aktiv .initBlockchain() rufen!
    const contract = SolanaService.getContract();
    const isReady = !!contract && Boolean(process.env.SOLANA_KEYPAIR_PATH || process.env.SOLANA_SECRET_KEY);

    console.log("🔍 Status:", isReady ? "Verbunden" : "Initialisierung läuft...");

    if (isReady) {
        return res.status(200).json({ 
            status: "ready", 
            blockchain: "connected",
            timestamp: new Date().toISOString()
        });
    } else {
        // 503 signalisiert: Dienst ist da, aber noch nicht bereit (Ready-Probe)
        return res.status(503).json({ 
            status: "not ready", 
            blockchain: "disconnected",
            message: "System is still initializing or blockchain is unreachable."
        });
    }
});

// Generator für fiktive dynamische Sensorwerte (dynamisch für jede Lieferung)
router.post('/generate-reading', async (req, res) => {
    const { deliveryId, supplierName, sensorId, apiKey, count = 10 } = req.body;

    if (!deliveryId || !supplierName || !sensorId || !apiKey) {
        return res.status(400).json({ 
            error: "deliveryId, supplierName, sensorId und apiKey sind erforderlich." 
        });
    }

    const readingCount = parseInt(count);
    if (readingCount < 1 || readingCount > 100) {
        return res.status(400).json({ 
            error: "count muss zwischen 1 und 100 liegen." 
        });
    }

    // Standardroute: Berlin nach Ludwigshafen (kann später erweitert werden)
    const defaultRoute = [
        { lat: 52.5200, lon: 13.4050 },
        { lat: 51.3396, lon: 12.3731 },
        { lat: 50.9848, lon: 11.0290 },
        { lat: 49.7913, lon: 9.9534 },
        { lat: 49.5209, lon: 8.4267 }
    ];

    function calculateLogicalPosition(routeArray, progress) {
        const totalSegments = routeArray.length - 1;
        const segmentProgress = progress * totalSegments;
        const currentSegmentIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1);
        
        const localProgress = segmentProgress - currentSegmentIndex;
        const startNode = routeArray[currentSegmentIndex];
        const endNode = routeArray[currentSegmentIndex + 1];
        
        let lat = startNode.lat + (endNode.lat - startNode.lat) * localProgress;
        let lon = startNode.lon + (endNode.lon - startNode.lon) * localProgress;
        
        const jitterLat = (Math.random() - 0.5) * 0.0015;
        const jitterLon = (Math.random() - 0.5) * 0.0015;
        
        return {
            lat: parseFloat((lat + jitterLat).toFixed(4)),
            lon: parseFloat((lon + jitterLon).toFixed(4))
        };
    }

    try {
        console.log(`🎲 GENERIERE ${readingCount} ZUFÄLLIGE MESSWERTE FÜR ${deliveryId} (${supplierName})...`);
        
        const results = [];
        const errors = [];

        for (let i = 0; i < readingCount; i++) {
            const randomProgress = Math.random();
            const coords = calculateLogicalPosition(defaultRoute, randomProgress);
            const randomBaseTemp = 3.5 + (Math.random() * 4.0);
            const randomBaseHum = 45.0 + (Math.random() * 20.0);

            const payload = {
                sensorId: sensorId,
                temperature: parseFloat(randomBaseTemp.toFixed(2)),
                humidity: parseFloat(randomBaseHum.toFixed(2)),
                lat: coords.lat,
                lon: coords.lon,
                timestamp: new Date().toISOString()
            };

            try {
                await axios.post(`${req.protocol}://${req.get('host')}/api/buffer`, payload, { 
                    headers: { 'x-api-key': apiKey } 
                });
                results.push(payload);
                console.log(`✅ Messwert ${i + 1}/${readingCount} übertragen (Fortschritt: ${(randomProgress * 100).toFixed(1)}%)`);
            } catch (err) {
                errors.push({ index: i, error: err.message });
                console.error(`❌ Messwert ${i + 1}/${readingCount} fehlgeschlagen`);
            }
        }

        console.log(`\n🟢 ${results.length}/${readingCount} Messwerte erfolgreich übertragen!`);
        
        res.json({ 
            status: "completed", 
            message: `${results.length} von ${readingCount} Messwerten generiert und übertragen`,
            deliveryId,
            supplierName,
            successful: results.length,
            failed: errors.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error("🔴 Kritischer Fehler:", err.response ? err.response.data : err.message);
        res.status(500).json({ 
            error: "Übertragung fehlgeschlagen", 
            details: err.response ? err.response.data : err.message 
        });
    }
});

module.exports = router;