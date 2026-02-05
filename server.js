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
    CONFIGURACIÓN WHATSAPP (OPTIMIZADA)
===================== */
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
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
    isReady = true;
    console.log('✅ WhatsApp Conectado');
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) fssync.unlinkSync(qrPath);
    
    client.sendMessage("59891923107@c.us", "✅ Richard, ya estoy conectado.");
});

// Reiniciar si se desconecta para evitar el error 503
client.on('disconnected', () => {
    isReady = false;
    client.initialize();
});

client.initialize().catch(err => console.error("Error inicial:", err));

/* =====================
    LÓGICA DE ARCHIVOS
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

/* =====================
    API (RUTAS)
===================== */

app.get("/scan-qr", (req, res) => {
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) {
        res.send(`<div style="text-align:center;padding:50px;"><h1>Escanea el QR</h1><img src="/qr.png?t=${Date.now()}" width="300"><script>setInterval(()=>location.reload(),5000)</script></div>`);
    } else {
        res.send(`<div style="text-align:center;padding:50px;"><h2>${isReady ? '✅ Ya estás conectado' : '⏳ Iniciando...'}</h2><a href="/">Ir al Inicio</a></div>`);
    }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const bookings = await readBookings();
    const newBooking = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
    bookings.push(newBooking);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

    if (isReady) {
        const aviso = `🚀 *NUEVO TURNO*\n\n📱 Cliente: ${newBooking.name}\n📅 Fecha: ${newBooking.date}\n⏰ Hora: ${newBooking.start}:00hs`;
        await client.sendMessage("59891923107@c.us", aviso);
        
        let numCli = newBooking.phone.replace(/[^0-9]/g, "");
        if (numCli.startsWith("0")) numCli = "598" + numCli.substring(1);
        if (!numCli.startsWith("598")) numCli = "598" + numCli;
        await client.sendMessage(`${numCli}@c.us`, `¡Hola! Turno agendado para el ${newBooking.date}.`).catch(()=>{});
    }

    res.status(201).json(newBooking);
  } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.get("/api/bookings", async (req, res) => {
    const b = await readBookings();
    res.json(b);
});

app.delete("/api/bookings/:id", async (req, res) => {
    let b = await readBookings();
    b = b.filter(x => x.id !== req.params.id);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(b, null, 2));
    res.json({ success: true });
});

app.get("*", (req, res) => {
    const indexPath = path.join(publicDir, "index.html");
    fssync.existsSync(indexPath) ? res.sendFile(indexPath) : res.status(404).send("Error: index.html no encontrado");
});

app.listen(PORT, () => console.log(`🚀 Puerto ${PORT}`));