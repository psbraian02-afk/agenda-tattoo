const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs"); 
const { v4: uuidv4 } = require("uuid");

// --- LIBRERÍAS ---
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');

// Intentar cargar qr-image de forma segura
let qrImage;
try {
    qrImage = require('qr-image');
} catch (e) {
    console.error("⚠️ La librería qr-image no se instaló aún.");
}

const app = express();

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
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote'
        ] 
    }
});

client.on('qr', (qr) => {
    console.log('⚠️ NUEVO QR GENERADO. Míralo en: tu-web.onrender.com/qr.png');
    
    // QR en consola (el que se ve mal)
    qrcode.generate(qr, { small: true });

    // QR en imagen (el que vas a usar)
    if (qrImage) {
        const img = qrImage.image(qr, { type: 'png' });
        const qrPath = path.join(__dirname, 'public', 'qr.png');
        const fileStream = fssync.createWriteStream(qrPath);
        img.pipe(fileStream);
        console.log('✅ Imagen QR creada en /public/qr.png');
    }
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado');
    
    // Limpiar imagen después de conectar
    const qrPath = path.join(__dirname, 'public', 'qr.png');
    if (fssync.existsSync(qrPath)) {
        fssync.unlinkSync(qrPath);
    }

    client.sendMessage("59891923107@c.us", "✅ Richard, ya estoy conectado y listo.");
});

client.initialize().catch(err => console.error("Error al iniciar WhatsApp:", err));

/* =====================
    Middleware
===================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

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

/* =====================
    Marketing
===================== */
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

/* =====================
    API
===================== */
app.get("/api/bookings", async (req, res) => {
  const b = await readBookings();
  res.json(b);
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

app.use((req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor listo en puerto ${PORT}`));