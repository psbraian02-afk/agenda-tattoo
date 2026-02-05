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

// Configuración de carpetas
const publicDir = path.join(__dirname, 'public');
if (!fssync.existsSync(publicDir)) {
    fssync.mkdirSync(publicDir);
}

/* =====================
    RUTAS DE INTERFAZ (IMPORTANTE)
===================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.static(publicDir));

// RUTA PARA EL QR (Asegúrate de entrar aquí)
app.get("/scan-qr", (req, res) => {
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1>Escanea el QR de WhatsApp</h1>
                <img src="/qr.png?t=${Date.now()}" style="border: 5px solid #25D366; border-radius: 10px; width: 300px;">
                <p>Si ya escaneaste, esta página dirá que no está disponible.</p>
                <script>setInterval(() => location.reload(), 5000);</script>
            </div>
        `);
    } else {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h2>QR no disponible</h2>
                <p>Esto puede ser porque: <br> 1. Ya estás conectado. <br> 2. El servidor aún está iniciando.</p>
                <a href="/scan-qr">Reintentar</a>
            </div>
        `);
    }
});

/* =====================
    Configuración WhatsApp
===================== */
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    }
});

client.on('qr', (qr) => {
    console.log('--- GENERANDO QR ---');
    const img = qrImage.image(qr, { type: 'png' });
    const qrPath = path.join(publicDir, 'qr.png');
    const fileStream = fssync.createWriteStream(qrPath);
    img.pipe(fileStream);
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado');
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) fssync.unlinkSync(qrPath);
    client.sendMessage("59891923107@c.us", "✅ Richard, ya estoy conectado.");
});

client.initialize().catch(err => console.error("Error al iniciar WhatsApp:", err));

/* =====================
    Lógica de Bookings y Marketing (Original)
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
    const aviso = `🚀 *NUEVO TURNO*\n\n📱 Cliente: ${newBooking.phone}\n📅 Fecha: ${newBooking.date}`;
    client.sendMessage(numeroTatuador, aviso).catch(e => console.error(e));
    res.status(201).json(newBooking);
  } catch (err) { res.status(500).json({ error: "Error" }); }
});

// Catch-all para el frontend
app.get("*", (req, res) => {
    const indexPath = path.join(publicDir, "index.html");
    if (fssync.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("No se encontró el archivo index.html en la carpeta public");
    }
});

app.listen(PORT, () => console.log(`✅ Servidor en puerto ${PORT}`));