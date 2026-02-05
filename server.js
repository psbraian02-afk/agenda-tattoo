const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const { v4: uuidv4 } = require("uuid");

// --- NUEVAS LIBRERÍAS PARA WHATSAPP Y CRON ---
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');

const app = express();

/* =====================
    Configuración WhatsApp
===================== */
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    }
});

// Generar QR para vincular el celular del tatuador
client.on('qr', (qr) => {
    console.log('⚠️ ESCANEA ESTE QR CON TU WHATSAPP (EL DEL TATUADOR):');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado y listo para trabajar');
});

client.initialize();

/* =====================
   Middleware
===================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =====================
   Archivos estáticos
===================== */
app.use(express.static(path.join(__dirname, "public")));

/* =====================
   Archivo de datos (Render-safe)
===================== */
const BOOKINGS_FILE = path.join("/tmp", "bookings.json");

/* =====================
   Helpers
===================== */
async function ensureBookingsFile() {
  try {
    await fs.access(BOOKINGS_FILE);
  } catch {
    await fs.writeFile(BOOKINGS_FILE, "[]", "utf-8");
  }
}

async function readBookings() {
  await ensureBookingsFile();
  const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
  return JSON.parse(data);
}

async function writeBookings(bookings) {
  await fs.writeFile(
    BOOKINGS_FILE,
    JSON.stringify(bookings, null, 2),
    "utf-8"
  );
}

/* =====================
   SISTEMA DE MARKETING (Cada 1 minuto)
===================== */
cron.schedule('* * * * *', async () => {
    try {
        const bookings = await readBookings();
        if (bookings.length === 0) return;

        // Limpiar y obtener números únicos
        const uniquePhones = [...new Set(bookings.map(b => {
            let num = b.phone.replace(/[^0-9]/g, "");
            if (num.startsWith("0")) num = "598" + num.substring(1);
            if (!num.startsWith("598")) num = "598" + num;
            return `${num}@c.us`;
        }))];
        
        console.log(`🤖 Enviando mensajes de marketing a ${uniquePhones.length} números...`);

        uniquePhones.forEach(chatId => {
            client.sendMessage(chatId, "hola queres hacerte un tatuaje??")
                .catch(err => console.error("Error envío marketing:", err.message));
        });
    } catch (err) {
        console.error("Error en Cron:", err);
    }
});

/* =====================
   API
===================== */

// GET reservas
app.get("/api/bookings", async (req, res) => {
  try {
    const bookings = await readBookings();
    res.json(bookings);
  } catch (err) {
    console.error("READ ERROR:", err);
    res.status(500).json({ error: "Error leyendo reservas" });
  }
});

// POST nueva reserva (Modificado para notificar al tatuador)
app.post("/api/bookings", async (req, res) => {
  try {
    const bookings = await readBookings();

    const newBooking = {
      id: uuidv4(),
      ...req.body,
      createdAt: new Date().toISOString()
    };

    if (
      !newBooking.date ||
      newBooking.start == null ||
      newBooking.end == null ||
      !newBooking.phone
    ) {
      return res.status(400).json({ error: "Datos incompletos" });
  }

    if (newBooking.tattoo) {
      const t = newBooking.tattoo;
      if (!t.image || !t.size || !t.place) {
        return res.status(400).json({ error: "Datos del tatuaje incompletos" });
      }
    }

    bookings.push(newBooking);
    await writeBookings(bookings);

    // --- NOTIFICACIÓN AUTOMÁTICA AL TATUADOR ---
    const miNumero = "59891923107@c.us"; 
    const aviso = `🔔 *NUEVA CITA AGENDADA*\n\n📱 Cliente: ${newBooking.phone}\n📅 Fecha: ${newBooking.date}\n⏰ Hora: ${newBooking.start}:00hs\n📍 Zona: ${newBooking.tattoo.place}`;
    
    client.sendMessage(miNumero, aviso)
        .then(() => console.log("Notificación enviada a Richard"))
        .catch(e => console.error("Error al notificar al tatuador"));

    res.status(201).json(newBooking);
  } catch (err) {
    console.error("WRITE ERROR:", err);
    res.status(500).json({ error: "No se pudo guardar la reserva" });
  }
});

// PUT actualizar reserva
app.put("/api/bookings/:id", async (req, res) => {
  try {
    const bookings = await readBookings();
    const index = bookings.findIndex(b => b.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    bookings[index] = { ...bookings[index], ...req.body };

    await writeBookings(bookings);
    res.json(bookings[index]);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: "No se pudo actualizar la reserva" });
  }
});

// DELETE reserva
app.delete("/api/bookings/:id", async (req, res) => {
  try {
    const bookings = await readBookings();
    const index = bookings.findIndex(b => b.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: "Reserva no encontrada" });
  }

    bookings.splice(index, 1);
    await writeBookings(bookings);

    res.json({ message: "Reserva eliminada" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: "No se pudo eliminar la reserva" });
  }
});

/* =====================
   SPA fallback
===================== */
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =====================
   Error handling global
===================== */
process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

/* =====================
   Server
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});