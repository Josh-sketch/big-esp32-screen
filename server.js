const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Live ESP32-CAM Feed</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #000;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          color: white;
          font-family: Arial, sans-serif;
          flex-direction: column;
        }
        canvas {
          border: 2px solid #444;
          border-radius: 8px;
          width: 640px;
          height: 640px;
          background-color: #222;
        }
        h1 {
          margin-bottom: 20px;
          font-size: 28px;
        }
      </style>
    </head>
    <body>
      <h1>🔴 ESP32-CAM Live Feed</h1>
      <canvas id="videoCanvas" width="640" height="640"></canvas>
      <script>
        const canvas = document.getElementById('videoCanvas');
        const ctx = canvas.getContext('2d');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(protocol + '//' + window.location.host);

        ws.onmessage = (event) => {
          if (event.data instanceof Blob) {
            const blob = new Blob([event.data], { type: 'image/jpeg' });
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(blob);
          }
        };
      </script>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    clients: wss.clients.size,
  });
});

// API endpoint for client count
app.get("/api/clients", (req, res) => {
  res.json({ clientCount: wss.clients.size });
});

// WebSocket connection handling
wss.on("connection", (ws, req) => {
  console.log("New WebSocket connection from:", req.connection.remoteAddress);

  // Send welcome message
  ws.send(
    JSON.stringify({
      type: "welcome",
      message: "Connected to ESP32 Camera Server",
      clientCount: wss.clients.size,
    })
  );

  // Broadcast client count update
  broadcastClientCount();

  ws.on("message", (data) => {
    console.log("Received data:", data.length, "bytes");

    // Check if it's binary data (camera frame)
    if (data instanceof Buffer) {
      console.log(
        "Broadcasting camera frame to",
        wss.clients.size - 1,
        "clients"
      );

      // Broadcast frame to all other clients (not the sender)
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          try {
            client.send(data);
          } catch (error) {
            console.error("Error sending frame to client:", error);
          }
        }
      });
    } else {
      // Handle text messages
      try {
        const message = JSON.parse(data.toString());
        console.log("Received message:", message);

        // Echo message to all clients
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({
                type: "message",
                data: message,
                timestamp: new Date().toISOString(),
              })
            );
          }
        });
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
    broadcastClientCount();
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  // Send periodic ping to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000); // 30 seconds
});

// Function to broadcast client count to all connected clients
function broadcastClientCount() {
  const count = wss.clients.size;
  const message = JSON.stringify({ clientCount: count });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error("Error broadcasting client count:", error);
      }
    }
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🌐 HTTP server ready`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// Error handling
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});
