const nodemailer = require('nodemailer');

class EmailService {
    static transporter = null;

    static initialize() {
        // Prüfen ob SMTP-Konfiguration vorhanden ist
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: false, // true für 465, false für andere Ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            console.log('✅ EmailService mit SMTP initialisiert');
        } else {
            console.log('⚠️ EmailService: Keine SMTP-Konfiguration gefunden - E-Mails werden in Konsole ausgegeben');
        }
    }

    static async sendEmail(to, subject, text, html = null) {
        const from = process.env.SMTP_FROM || 'noreply@supplychain.com';

        // Wenn kein SMTP konfiguriert ist, nur in Konsole ausgeben
        if (!this.transporter) {
            console.log('\n📧 [E-Mail SIMULATION]');
            console.log(`   An: ${to}`);
            console.log(`   Betreff: ${subject}`);
            console.log(`   Inhalt: ${text}`);
            console.log(`   Timestamp: ${new Date().toISOString()}\n`);
            return { success: true, simulated: true };
        }

        try {
            const mailOptions = {
                from,
                to,
                subject,
                text,
                html: html || text
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ E-Mail gesendet:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ E-Mail-Versand fehlgeschlagen:', error.message);
            return { success: false, error: error.message };
        }
    }

    static async sendWelcomeEmail(supplierName, apiKey, email) { 
        const subject = 'Willkommen bei BASF Supply Chain Management';
        const text = `
Hallo ${supplierName},

Ihr Account wurde erfolgreich im BASF Supply Chain Management System erstellt.

Ihre Zugangsdaten:
- Supplier Name: ${supplierName}
- API Key: ${apiKey}

Bitte bewahren Sie Ihren API-Key sicher auf.

Bei Fragen kontaktieren Sie bitte unseren Support.

Mit freundlichen Grüßen,
BASF x HTW Projektteam
        `.trim();

        const html = `
<h2>Willkommen beim BASF x HTW Projektteam</h2>
<p>Hallo <strong>${supplierName}</strong>,</p>
<p>Ihr Account wurde erfolgreich erstellt.</p>
<h3>Ihre Zugangsdaten:</h3>
<ul>
<li><strong>Supplier Name:</strong> ${supplierName}</li>
<li><strong>API Key:</strong> <code>${apiKey}</code></li>
</ul>
<p>Bitte bewahren Sie Ihren API-Key sicher auf.</p>
<p>Bei Fragen kontaktieren Sie bitte unseren Support.</p>
<p>Mit freundlichen Grüßen,<br>BASF x HTW Projektteam</p>
        `.trim();

        return await this.sendEmail(email, subject, text, html);
    }

    static async sendAccountingNotification(supplierEmail, deliveryId, supplier, filePath, alarmCount, status) {
        const subject = `Lieferung ${deliveryId} abgeschlossen - Buchhaltungs-Benachrichtigung`;
        const text = `
Lieferung abgeschlossen:

Lieferungs-ID: ${deliveryId}
Supplier: ${supplier}
Report-Pfad: ${filePath}
Alarm-Count: ${alarmCount}
Status: ${status}
Timestamp: ${new Date().toISOString()}

Bitte prüfen Sie die Lieferung in Ihrem System.
        `.trim();

        return await this.sendEmail(supplierEmail, subject, text);
    }

    static async sendDeliveryNotification(email, deliveryId, supplierName, initiator) {
        const initiatorText = initiator === 'Admin' ? 'Lieferung von Admin erstellt' : 'Lieferung von Lieferant erstellt';
        const subject = `Neue Lieferung ${deliveryId} initialisiert`;
        const text = `
${initiatorText}

Lieferungs-ID: ${deliveryId}
Supplier: ${supplierName}
Initiator: ${initiator}
Timestamp: ${new Date().toISOString()}

Bitte prüfen Sie die Lieferung in Ihrem System.
        `.trim();

        const html = `
<h2>Neue Lieferung initialisiert</h2>
<p><strong>${initiatorText}</strong></p>
<h3>Lieferungsdetails:</h3>
<ul>
<li><strong>Lieferungs-ID:</strong> ${deliveryId}</li>
<li><strong>Supplier:</strong> ${supplierName}</li>
<li><strong>Initiator:</strong> ${initiator}</li>
<li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
</ul>
<p>Bitte prüfen Sie die Lieferung in Ihrem System.</p>
        `.trim();

        return await this.sendEmail(email, subject, text, html);
    }
}

module.exports = EmailService;
