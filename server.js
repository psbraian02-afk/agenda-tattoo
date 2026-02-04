const express = require("express");
const path = require("path");

const app = express();

// Servir archivos estáticos desde /public
app.use(express.static(path.join(__dirname, "public")));

// Todas las rutas devuelven index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Puerto asignado por Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
