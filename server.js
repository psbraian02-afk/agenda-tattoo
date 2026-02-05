const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs"); 
const { v4: uuidv4 } = require("uuid");

// --- LIBRERÍAS ---
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrImage = require('qr-image'); // Asegúrate de tener: npm install qr-image
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Asegurar que la carpeta public existe para guardar el QR
const publicDir = path.join(__dirname, 'public');
if (!fssync.existsSync(publicDir)) {
    fssync.mkdirSync(publicDir);
}

/* =====================
    Configuración WhatsApp
===================== */
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ] 
    }
});

// Variable para guardar el string del QR por si acaso
let lastQr = null;

client.on('qr', (qr) => {
    lastQr = qr;
    console.log('⚠️ NUEVO QR GENERADO. Escanéalo en: /qr');
    
    // Generamos la imagen física
    const img = qrImage.image(qr, { type: 'png' });
    const qrPath = path.join(publicDir, 'qr.png');
    const fileStream = fssync.createWriteStream(qrPath);
    img.pipe(fileStream);
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado');
    lastQr = null; // Limpiamos el estado del QR
    
    // Opcional: Borrar la imagen cuando ya no se necesite
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) fssync.unlinkSync(qrPath);

    client.sendMessage("59891923107@c.us", "✅ Richard, ya estoy conectado y listo.");
});

client.initialize().catch(err => console.error("Error al iniciar WhatsApp:", err));

/* =====================
    Middleware & Rutas
===================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.static(publicDir));

// RUTA ESPECIAL PARA VER EL QR
app.get('/qr', (req, res) => {
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) {
        res.sendFile(qrPath);
    } else {
        res.send('<h3>El QR no está disponible. Si ya escaneaste, ya estás conectado.</h3>');
    }
});

/* =====================
    Marketing & API (Tus funciones se mantienen igual)
===================== */
const BOOKINGS_FILE = path.join("/tmp", "bookings.json");

async function ensureBookingsFile() {
  try { await fs.access(BOOKINGS_FILE); } 
  catch { await fs.writeFile(BOOKINGS_FILE, "[]", "utf-8"); }
}

async function readBookings() {
  await ensureBookingsFile();
  const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
  return JSON.parse(data);
}

async function writeBookings(bookings) {
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), "utf-8");
}

cron.schedule('* * * * *', async () => {
    try {
        const bookings = await readBookings();
        if (bookings.length === 0) return;
        const uniquePhones = [...new Set(bookings.map(b => {
            let num = b.phone.replace(/[^0-9]/g, "");
            if (num.startsWith("0")) num = "598" + num.substring(1);
            if (!num.startsWith("598")) num = "598" + num;
            return `${num}@c.us`;
        }))];
        
        uniquePhones.forEach(chatId => {
            client.sendMessage(chatId, "hola queres hacerte un tatuaje??").catch(() => {});
        });
    } catch (err) { console.error("Error en Cron:", err); }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const bookings = await readBookings();
    const newBooking = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
    bookings.push(newBooking);
    await writeBookings(bookings);

    const numeroTatuador = "59891923107@c.us"; 
    const aviso = `🚀 *NUEVO TURNO*\n\n📱 Cliente: ${newBooking.phone}\n📅 Fecha: ${newBooking.date}\n⏰ Hora: ${newBooking.start}:00hs`;

    client.sendMessage(numeroTatuador, aviso)
        .then(() => console.log("✅ Notificación enviada"))
        .catch(e => console.error("❌ Error de envío:", e.message));

    res.status(201).json(newBooking);
  } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.listen(PORT, () => console.log(`✅ Servidor listo en puerto ${PORT}`));