const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const { v4: uuidv4 } = require("uuid");

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');

const app = express();

/* =====================
    Configuración WhatsApp (ARREGLO PARA RENDER)
===================== */
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome', // Forzamos la ruta de Chrome
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
    console.log('⚠️ ESCANEA ESTE QR PARA ACTIVAR (MIRA LOS LOGS ABAJO):');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado correctamente');
    client.sendMessage("59891923107@c.us", "✅ Sistema conectado. Ya puedes recibir avisos.");
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
            if(client.pupBrowser) { // Solo si el navegador está vivo
               client.sendMessage(chatId, "hola queres hacerte un tatuaje??").catch(() => {});
            }
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
    const aviso = `🚀 *NUEVO TURNO AGENDADO*\n\n📱 Cliente: ${newBooking.phone}\n📅 Fecha: ${newBooking.date}\n⏰ Hora: ${newBooking.start}:00hs`;

    if (client.pupBrowser) {
        client.sendMessage(numeroTatuador, aviso)
            .then(() => console.log("✅ Notificación enviada"))
            .catch(e => console.error("❌ Error de envío:", e.message));
    } else {
        console.error("❌ WhatsApp no está listo todavía.");
    }

    res.status(201).json(newBooking);
  } catch (err) { res.status(500).json({ error: "Error" }); }
});

app.put("/api/bookings/:id", async (req, res) => {
    const b = await readBookings();
    const i = b.findIndex(x => x.id === req.params.id);
    if (i !== -1) {
        b[i] = { ...b[i], ...req.body };
        await writeBookings(b);
        res.json(b[i]);
    }
});

app.delete("/api/bookings/:id", async (req, res) => {
    const b = await readBookings();
    const filtered = b.filter(x => x.id !== req.params.id);
    await writeBookings(filtered);
    res.json({ success: true });
});

app.use((req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor en puerto ${PORT}`));