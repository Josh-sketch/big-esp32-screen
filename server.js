const express = require("express");
const http = require("http"); // ✅ Add this
const WebSocket = require("ws");

const app = express();

let latestFrame = null;

// HTTP server port
const PORT = process.env.PORT || 3000;

// ✅ Use http.createServer for Render compatibility
const server = http.createServer(app);

// ✅ Start server
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

// ✅ WebSocket server on same port
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("📷 ESP32 connected via WebSocket");
  ws.on("message", (data) => {
    latestFrame = data;
  });
});

// ✅ MJPEG streaming endpoint
app.get("/video", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-cache",
    Connection: "close",
    Pragma: "no-cache",
  });

  const interval = setInterval(() => {
    if (latestFrame) {
      res.write(`--frame\r\n`);
      res.write(`Content-Type: image/jpeg\r\n\r\n`);
      res.write(latestFrame);
      res.write("\r\n");
    }
  }, 200);

  req.on("close", () => clearInterval(interval));
});
