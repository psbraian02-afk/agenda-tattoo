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

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.static(publicDir));

/* =====================
    Lógica de Archivos
===================== */
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

async function ensureBookingsFile() {
  try { 
      await fs.access(BOOKINGS_FILE); 
  } catch { 
      await fs.writeFile(BOOKINGS_FILE, "[]", "utf-8"); 
  }
}

async function readBookings() {
  await ensureBookingsFile();
  try {
      const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
      return JSON.parse(data);
  } catch (e) {
      return [];
  }
}

async function writeBookings(bookings) {
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), "utf-8");
}

/* =====================
    API Bookings
===================== */

// 1. OBTENER CITAS
app.get("/api/bookings", async (req, res) => {
    try {
        const bookings = await readBookings();
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(bookings);
    } catch (err) {
        console.error("Error al leer:", err);
        res.status(500).json({ error: "Error al leer citas" });
    }
});

// 2. CREAR CITA (CON ENVÍO CORREGIDO)
app.post("/api/bookings", async (req, res) => {
  try {
    const bookings = await readBookings();
    const newBooking = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
    bookings.push(newBooking);
    await writeBookings(bookings);

    // Formateo de números
    const numeroTatuador = "59891923107@c.us"; 
    let numCliente = newBooking.phone.replace(/[^0-9]/g, "");
    if (numCliente.startsWith("0")) numCliente = "598" + numCliente.substring(1);
    if (!numCliente.startsWith("598")) numCliente = "598" + numCliente;
    const chatIdCliente = `${numCliente}@c.us`;

    const aviso = `🚀 *NUEVO TURNO*\n\n📱 Cliente: ${newBooking.name} ${newBooking.surname}\n📞 Tel: ${newBooking.phone}\n📅 Fecha: ${newBooking.date}\n⏰ Hora: ${newBooking.start}:00hs`;

    // Intentar envío solo si el cliente está listo
    if (client && client.info && client.info.wid) {
        client.sendMessage(numeroTatuador, aviso)
            .then(() => console.log("✅ Aviso enviado a Richard"))
            .catch(e => console.error("❌ Error Richard:", e.message));

        client.sendMessage(chatIdCliente, `¡Hola! Tu turno ha sido agendado para el ${newBooking.date}. Te esperamos.`)
            .then(() => console.log("✅ Confirmación enviada al cliente"))
            .catch(e => console.error("❌ Error Cliente:", e.message));
    } else {
        console.log("⚠️ El mensaje no se envió: WhatsApp no está conectado todavía.");
    }

    res.status(201).json(newBooking);
  } catch (err) { 
    console.error("Error en POST:", err);
    res.status(500).json({ error: "Error interno" }); 
  }
});

// 3. ELIMINAR CITA
app.delete("/api/bookings/:id", async (req, res) => {
    try {
        let bookings = await readBookings();
        bookings = bookings.filter(b => b.id !== req.params.id);
        await writeBookings(bookings);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error al borrar" });
    }
});

/* =====================
    RUTAS DE INTERFAZ
===================== */

app.get("/scan-qr", (req, res) => {
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1>Escanea el QR de WhatsApp</h1>
                <img src="/qr.png?t=${Date.now()}" style="border: 5px solid #25D366; border-radius: 10px; width: 300px;">
                <p>Refrescando automáticamente...</p>
                <script>setInterval(() => location.reload(), 5000);</script>
            </div>
        `);
    } else {
        res.send(`<div style="text-align:center; margin-top:50px; font-family:sans-serif;"><h2>✅ Conectado o QR no generado</h2><p>Si no te llegan mensajes, reinicia el servidor en Render.</p><a href="/">Ir al inicio</a></div>`);
    }
});

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
            '--disable-gpu'
        ] 
    }
});

client.on('qr', (qr) => {
    console.log('⚠️ NUEVO QR RECIBIDO');
    const img = qrImage.image(qr, { type: 'png', margin: 4 });
    const qrPath = path.join(publicDir, 'qr.png');
    const stream = fssync.createWriteStream(qrPath);
    img.pipe(stream);
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado');
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) fssync.unlinkSync(qrPath);
    
    // Notificación inicial confirmada
    client.sendMessage("59891923107@c.us", "✅ *SISTEMA CONECTADO*\nRichard, ya estoy listo para avisarte de nuevos turnos.");
});

// Manejo de errores de inicialización
client.initialize().catch(err => console.error("❌ Error crítico al iniciar WhatsApp:", err));

/* =====================
    Marketing (Cron)
===================== */
cron.schedule('0 10 * * *', async () => {
    try {
        const bookings = await readBookings();
        if (bookings.length === 0) return;
        const uniquePhones = [...new Set(bookings.map(b => {
            let num = b.phone.replace(/[^0-9]/g, "");
            if (num.startsWith("0")) num = "598" + num.substring(1);
            if (!num.startsWith("598")) num = "598" + num;
            return `${num}@c.us`;
        }))];
        for (const chatId of uniquePhones) {
            if (client.info && client.info.wid) {
                await client.sendMessage(chatId, "¡Hola! ¿Te gustaría agendar un nuevo tatuaje?").catch(() => {});
            }
        }
    } catch (err) { console.error("Error en Cron:", err); }
});

// Catch-all para el frontend
app.get("*", (req, res) => {
    const indexPath = path.join(publicDir, "index.html");
    if (fssync.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("No se encontró index.html");
    }
});

app.listen(PORT, () => console.log(`🚀 Servidor encendido en puerto ${PORT}`));