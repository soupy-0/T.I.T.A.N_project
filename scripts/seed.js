const axios = require('axios');
const BASE_URL = 'http://localhost:3000'; 
const ADMIN_KEY = 'MASTER_ADMIN_2026';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const SEED_CONFIG = {
    suppliers: [
        { 
            name: 'Logistik_Pro_A', 
            key: 'KEY_PRO_A', 
            // Route von München nach Ludwigshafen via Ulm (A8) und Stuttgart/Heilbronn (A81/A6)
            route: [
                { lat: 48.1351, lon: 11.5820 }, // München Start
                { lat: 48.4011, lon: 9.9876 },  // Ulm
                { lat: 48.7758, lon: 9.1829 },  // Stuttgart
                { lat: 49.1427, lon: 9.2109 },  // Heilbronn
                { lat: 49.5209, lon: 8.4267 }   // Ludwigshafen Ziel
            ],
            scenario: 'PERFECT',
            desc: "Vorzeigelieferant: Konstante 4-5 Grad."
        },
        { 
            name: 'Kühl_Express_B', 
            key: 'KEY_EXPRESS_B', 
            // Route von Hamburg nach Ludwigshafen via Hannover (A7) und Kassel/Frankfurt (A5)
            route: [
                { lat: 53.5511, lon: 9.9937 },  // Hamburg Start
                { lat: 52.3759, lon: 9.7320 },  // Hannover
                { lat: 51.3127, lon: 9.4797 },  // Kassel
                { lat: 50.1109, lon: 8.6821 },  // Frankfurt
                { lat: 49.5209, lon: 8.4267 }   // Ludwigshafen Ziel
            ],
            scenario: 'CRITICAL_SPIKE',
            desc: "Defekte Tür: Temperatur steigt kurz auf 12 Grad."
        },
        { 
            name: 'Global_Transport_C', 
            key: 'KEY_TRANS_C', 
            // Route von Berlin nach Ludwigshafen via Leipzig (A9), Erfurt (A4) und Würzburg (A7)
            route: [
                { lat: 52.5095, lon: 13.4288 }, // Berlin Start
                { lat: 51.3396, lon: 12.3731 }, // Leipzig
                { lat: 50.9848, lon: 11.0290 }, // Erfurt
                { lat: 49.7913, lon: 9.9534 },  // Würzburg
                { lat: 49.5209, lon: 8.4267 }   // Ludwigshafen Ziel
            ],
            scenario: 'SLOW_WARMING',
            desc: "Kühlaggregat schwach: Steigt am Ende auf 10 Grad."
        },
        { 
            name: 'Med_Logistix_D', 
            key: 'KEY_MED_D', 
            // Route von Frankfurt nach Ludwigshafen via Mainz/Worms (A63/A61) - Kürzere, urbane Route
            route: [
                { lat: 50.1109, lon: 8.6821 },  // Frankfurt Start
                { lat: 49.9929, lon: 8.2473 },  // Mainz
                { lat: 49.6341, lon: 8.3547 },  // Worms
                { lat: 49.5209, lon: 8.4267 }   // Ludwigshafen Ziel
            ],
            scenario: 'DEEP_FREEZE',
            desc: "Fehlsteuerung: Fällt unter 1 Grad."
        },
        { 
            name: 'Food_Safety_E', 
            key: 'KEY_FOOD_E', 
            // Route von Stuttgart nach Ludwigshafen via Karlsruhe und Mannheim (A5 / A6)
            route: [
                { lat: 48.7758, lon: 9.1829 },  // Stuttgart Start
                { lat: 49.0069, lon: 8.4037 },  // Karlsruhe
                { lat: 49.4875, lon: 8.4660 },  // Mannheim
                { lat: 49.5209, lon: 8.4267 }   // Ludwigshafen Ziel
            ],
            scenario: 'HUMIDITY_ALARM',
            desc: "Wasserschaden: Luftfeuchtigkeit springt auf 90%."
        }
    ],
    target: { lat: 49.5209, lon: 8.4267 }, // Ziel: BASF Zentrallager Ludwigshafen 
    readingsPerDelivery: 50
};

function getScenarioData(scenario, step, totalSteps) {
    let temp = 5.0;
    let hum = 50.0;
    switch(scenario) {
        case 'PERFECT': temp = 4.5 + Math.random(); break;
        case 'CRITICAL_SPIKE': temp = (step > 20 && step < 30) ? 12.5 : 4.5; break;
        case 'SLOW_WARMING': temp = 4 + (7 * (step / totalSteps)); break;
        case 'DEEP_FREEZE': temp = (step > 25) ? 0.5 : 4.0; break;
        case 'HUMIDITY_ALARM': temp = 5.0; hum = (step > 35) ? 92.0 : 50.0; break;
    }
    return { temperature: parseFloat(temp.toFixed(2)), humidity: parseFloat(hum.toFixed(2)) };
}

// Berechnet die geordnete Position entlang der Waypoints inkl. Straßenrauschen
function calculateMultiStopRoute(routeArray, progress) {
    const totalSegments = routeArray.length - 1;
    const segmentProgress = progress * totalSegments;
    const currentSegmentIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1);
    
    const localProgress = segmentProgress - currentSegmentIndex;
    
    const startNode = routeArray[currentSegmentIndex];
    const endNode = routeArray[currentSegmentIndex + 1];
    
    let lat = startNode.lat + (endNode.lat - startNode.lat) * localProgress;
    let lon = startNode.lon + (endNode.lon - startNode.lon) * localProgress;
    
    // Künstlicher GPS-Jitter (ca. 100-200 Meter Abweichung für realistischen Spurwechsel/Stadtverkehr)
    const jitterLat = (Math.random() - 0.5) * 0.0012;
    const jitterLon = (Math.random() - 0.5) * 0.0012;
    
    return {
        lat: parseFloat((lat + jitterLat).toFixed(4)),
        lon: parseFloat((lon + jitterLon).toFixed(4))
    };
}

async function runSeed() {
    try {
        console.log("🚀 STARTE AUTOMATISIERTES MULTI-STOP-SEEDING");

        for (const s of SEED_CONFIG.suppliers) {
            console.log(`\n------------------------------------------------------------`);
            console.log(`📦 PROFIL: ${s.name} | Szenario: ${s.scenario}`);
            console.log(`------------------------------------------------------------`);

            const deliveryId = `DEL-${s.name}-1`;
            const sensorId = `ESP-${s.name}-1`;

            // 1. Onboard Supplier
            try {
                await axios.post(`${BASE_URL}/api/admin/onboard-supplier`,
                    { supplierName: s.name, password: '123', apiKey: s.key, email: `${s.name.toLowerCase().replace(/ /g, '_')}@example.com` },
                    { headers: { 'x-api-key': ADMIN_KEY } });
                console.log(`✅ Schritt 1: Supplier registriert.`);
            } catch (err) {
                if (err.response && JSON.stringify(err.response.data).includes('UNIQUE constraint failed')) {
                    console.log(`ℹ️ Schritt 1: '${s.name}' existiert bereits. Fahre fort...`);
                } else {
                    throw err;
                }
            }

            // 2. Onboard Delivery
            try {
                await axios.post(`${BASE_URL}/api/supplier/initiate-delivery`,
                    { hardwareId: sensorId, deliveryId },
                    { headers: { 'x-api-key': s.key } });
                console.log(`✅ Schritt 2: Lieferung '${deliveryId}' initialisiert.`);
            } catch (err) {
                if (err.response && (
                    JSON.stringify(err.response.data).includes('already exists') ||
                    JSON.stringify(err.response.data).includes('Sensor belegt') ||
                    JSON.stringify(err.response.data).includes('UNIQUE constraint failed')
                )) {
                    console.log(`ℹ️ Schritt 2: Lieferung existiert bereits.`);
                } else {
                    throw err;
                }
            }

            // 3. Set Limits (Admin)
            try {
                await axios.post(`${BASE_URL}/api/admin/set-limit/${s.name}/${deliveryId}`,
                    { maxTemp: 8.0, minTemp: 2.0, maxHum: 70.0, minHum: 30.0 },
                    { headers: { 'x-api-key': ADMIN_KEY } });
                console.log(`✅ Schritt 3: Grenzwerte (2°C - 8°C) gesetzt.`);
            } catch (err) {
                console.log(`ℹ️ Schritt 3: Limits bereits aktiv oder übersprungen.`);
            }
// 5. Resume from existing readings
            const { db } = require('../application/services/DatabaseService');
            const existingCount = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT COUNT(*) AS count FROM sensor_logs WHERE sensor_id = ?',
                    [`${s.name}_ESP-${s.name}-1`],
                    (err, row) => err ? reject(err) : resolve(row.count)
                );
            });

            console.log(`Already stored: ${existingCount}/50 readings`);
            let successTracker = 0;

            for (let r = existingCount; r < SEED_CONFIG.readingsPerDelivery; r++) {
                const progress = r / (SEED_CONFIG.readingsPerDelivery - 1);
                const data = getScenarioData(s.scenario, r, SEED_CONFIG.readingsPerDelivery);
                const currentCoords = calculateMultiStopRoute(s.route, progress);
                const payload = {
                    sensorId,
                    temperature: data.temperature,
                    humidity: data.humidity,
                    lat: currentCoords.lat,
                    lon: currentCoords.lon,
                    timestamp: new Date().toISOString()
                };

                try {
                    await axios.post(`${BASE_URL}/api/buffer`, payload, {
                        headers: { 'x-api-key': s.key }
                    });
                    successTracker++;
                } catch (err) {
                    console.error(`Reading ${r + 1} failed:`, err.response?.data || err.message);
                    break;
                }

                await sleep(1500);
            }

            console.log(`${successTracker} new readings sent.`);

            // 6. Finalize
            try {
                await axios.post(`${BASE_URL}/api/admin/confirm-receipt/${s.name}/${deliveryId}`, 
                    { recipientName: "BASF Zentrallager Ludwigshafen" }, { headers: { 'x-api-key': ADMIN_KEY } });
                await axios.post(`${BASE_URL}/api/admin/final-checkout/${s.name}/${deliveryId}`, 
                    {}, { headers: { 'x-api-key': ADMIN_KEY } });
                console.log(`✅ Schritt 6: Lieferung erfolgreich im System abgeschlossen.`);
            } catch (err) {
                console.log(`ℹ️ Schritt 6: Abschluss-Endpunkte übersprungen.`);
            }
            
            console.log(`🎉 Profil-Sync für ${s.name} beendet.`);
        }
        console.log("\n🏁 SEEDING PROZESS ERFOLGREICH BEENDET");
    } catch (e) { 
        console.error("\n💥 Unerwarteter Fehler im Hauptprozess:", e.message);
    }
}

runSeed();
