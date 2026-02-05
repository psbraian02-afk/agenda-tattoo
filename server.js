const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs"); 
const { v4: uuidv4 } = require("uuid");

// --- LIBRERÍAS ---
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrImage = require('qr-image');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, 'public');
if (!fssync.existsSync(publicDir)) fssync.mkdirSync(publicDir);

app.use(express.json({ limit: "5mb" }));
app.use(express.static(publicDir));

/* =====================
    CONFIGURACIÓN WHATSAPP
===================== */
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--no-zygote'
        ] 
    }
});

let isReady = false;

client.on('qr', (qr) => {
    isReady = false;
    const img = qrImage.image(qr, { type: 'png', margin: 2 });
    img.pipe(fssync.createWriteStream(path.join(publicDir, 'qr.png')));
    console.log('⚠️ QR generado. Escanéalo en /scan-qr');
});

client.on('ready', () => {
    console.log('✅ BOT LISTO INTERNAMENTE');
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) fssync.unlinkSync(qrPath);
    
    // Esperamos 5 segundos para asegurar que la conexión de red sea estable
    setTimeout(async () => {
        try {
            await client.sendMessage("59891923107@c.us", "🔥 *BOT CONECTADO*\nRichard, si lees esto, el sistema de notificaciones está funcionando.");
            isReady = true;
            console.log("✅ Mensaje de prueba enviado con éxito");
        } catch (err) {
            console.error("❌ Error al enviar mensaje inicial:", err.message);
        }
    }, 5000);
});

client.initialize().catch(err => console.error("Error inicial:", err));

/* =====================
    API Y RUTAS
===================== */
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

async function readBookings() {
    try {
        const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
        return JSON.parse(data);
    } catch {
        await fs.writeFile(BOOKINGS_FILE, "[]");
        return [];
    }
}

app.get("/scan-qr", (req, res) => {
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) {
        res.send(`<div style="text-align:center;padding:50px;font-family:sans-serif;"><h1>Escanea el QR</h1><img src="/qr.png?t=${Date.now()}" width="300"><script>setInterval(()=>location.reload(),5000)</script></div>`);
    } else {
        res.send(`<div style="text-align:center;padding:50px;font-family:sans-serif;"><h2>${isReady ? '✅ Conectado' : '⏳ Iniciando conexión...'}</h2><p>Si el cel dice "Sesión activa" pero aquí no dice "Conectado", espera 10 segundos.</p><a href="/">Ir al Inicio</a></div>`);
    }
});

app.post("/api/bookings", async (req, res) => {
    try {
        const bookings = await readBookings();
        const newBooking = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
        bookings.push(newBooking);
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

        const miNumero = "59891923107@c.us";
        const aviso = `🚀 *NUEVO TURNO*\n\n📱 Cliente: ${newBooking.name} ${newBooking.surname}\n📅 Fecha: ${newBooking.date}\n⏰ Hora: ${newBooking.start}:00hs`;

        if (isReady) {
            await client.sendMessage(miNumero, aviso);
            console.log("✅ Notificación enviada");
        } else {
            console.log("⚠️ Intento de envío fallido: Bot no estaba Ready");
        }

        res.status(201).json(newBooking);
    } catch (err) {
        console.error("Error en el POST:", err);
        res.status(500).json({ error: "Error" });
    }
});

// Mantener el resto de tus rutas (get bookings, delete, etc.) abajo igual que antes...
app.get("/api/bookings", async (req, res) => { res.json(await readBookings()); });
app.delete("/api/bookings/:id", async (req, res) => {
    let b = await readBookings();
    b = b.filter(x => x.id !== req.params.id);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(b, null, 2));
    res.json({ success: true });
});

app.get("*", (req, res) => {
    const indexPath = path.join(publicDir, "index.html");
    fssync.existsSync(indexPath) ? res.sendFile(indexPath) : res.status(404).send("index.html no encontrado");
});

app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));