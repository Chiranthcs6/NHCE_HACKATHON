// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { createClient } = require("redis");

const app = express();
const server = http.createServer(app);
const PORT = 9090;

const USER_DATA_PATH = path.join(__dirname, "..", "user_data.json");
const VIDEO_DIR = path.join(__dirname, "..", "videos");
const AI_SERVER_URL = process.env.AI_SERVER_URL || "ws://127.0.0.1:8765";

app.use(cors());
app.use(bodyParser.json());
 app.use(express.static(path.join(__dirname, 'public')));

const redisClient = createClient({ url: "redis://127.0.0.1:6379" });
redisClient.on("error", (err) => console.error("Redis Error:", err));
redisClient.connect();

if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  console.warn(`Created video directory: ${VIDEO_DIR}`);
}

// ====================================================================
// WEBSOCKET - AI SERVER CONNECTION
// ====================================================================

let aiClient = null;
let reconnectInterval = null;

function connectToAI() {
  if (aiClient && aiClient.readyState === WebSocket.OPEN) return;

  console.log(`Connecting to AI server: ${AI_SERVER_URL}`);
  aiClient = new WebSocket(AI_SERVER_URL);

  aiClient.on("open", () => {
    console.log("AI server connected");
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  });

  aiClient.on("message", (data) => {
    wssFE.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        console.log(data.toString());
        client.send(data.toString());
      }
    });
  });

  aiClient.on("close", () => {
    console.log("AI server disconnected, reconnecting in 5s...");
    aiClient = null;
    if (!reconnectInterval) {
      reconnectInterval = setInterval(connectToAI, 5000);
    }
  });

  aiClient.on("error", (err) => {
    console.error("AI server error:", err.message);
  });
}

connectToAI();

// ====================================================================
// WEBSOCKET - FRONTEND CONNECTION
// ====================================================================

const wssFE = new WebSocket.Server({
  server,
  path: "/ws",
  perMessageDeflate: false
});

function heartbeat() {
  this.isAlive = true;
}

wssFE.on("connection", (clientSocket) => {
  clientSocket.isAlive = true;
  clientSocket.on("pong", heartbeat);

  clientSocket.on("message", (data) => {
    if (aiClient && aiClient.readyState === WebSocket.OPEN) {
      aiClient.send(data.toString());
    }
  });
});

const interval = setInterval(() => {
  wssFE.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

server.on("close", () => {
  clearInterval(interval);
  if (reconnectInterval) clearInterval(reconnectInterval);
  if (aiClient) aiClient.close();
});

// ====================================================================
// USER DATA API
// ====================================================================

app.post("/user/data", async (req, res) => {
  try {
    const data = req.body;
    if (!data.name || !data.email) {
      return res.status(400).json({ error: "Name and Email required" });
    }
    fs.writeFileSync(USER_DATA_PATH, JSON.stringify(data, null, 2));
    await redisClient.set("file_changed", "true");
    res.status(200).json({ message: "User data saved" });
  } catch (err) {
    res.status(500).json({ error: "Failed to save user data" });
  }
});

app.get("/user/data", (req, res) => {
  if (!fs.existsSync(USER_DATA_PATH)) {
    return res.status(404).json({ error: "No user data found" });
  }
  const data = JSON.parse(fs.readFileSync(USER_DATA_PATH, "utf8"));
  res.status(200).json(data);
});

app.get("/file/status", async (req, res) => {
  const flag = await redisClient.get("file_changed");
  res.status(200).json({ file_changed: flag === "true" });
});

app.post("/file/reset", async (req, res) => {
  await redisClient.set("file_changed", "false");
  res.status(200).json({ message: "Flag reset" });
});

// ====================================================================
// VIDEO API
// ====================================================================

app.get("/api/videos/:filename", (req, res) => {
  const filename = req.params.filename;

  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const videoPath = path.join(VIDEO_DIR, filename);

  if (!fs.existsSync(videoPath)) {
    console.error(`Video not found: ${filename}`);
    return res.status(404).json({ error: "Video not found", filename });
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(videoPath, { start, end });

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4"
    });
    file.pipe(res);

    console.log(`Streaming ${filename} (${start}-${end}/${fileSize})`);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes"
    });
    fs.createReadStream(videoPath).pipe(res);

    console.log(`Streaming ${filename} (${fileSize} bytes)`);
  }
});

app.get("/api/videos/:filename/info", (req, res) => {
  const filename = req.params.filename;

  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const videoPath = path.join(VIDEO_DIR, filename);

  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: "Video not found" });
  }

  const stats = fs.statSync(videoPath);
  const parts = filename.replace(".mp4", "").split("_");

  let metadata = {};
  if (parts.length >= 3) {
    metadata = {
      time: parts[0],
      date: parts[1],
      trigger: parts.slice(2).join("_")
    };
  }

  res.status(200).json({
    filename,
    size: stats.size,
    modified: stats.mtime,
    created: stats.birthtime,
    url: `/api/videos/${filename}`,
    metadata
  });
});

app.get("/api/videos", (req, res) => {
  try {
    if (!fs.existsSync(VIDEO_DIR)) {
      return res.status(404).json({ error: "Video directory not found" });
    }

    const files = fs
      .readdirSync(VIDEO_DIR)
      .filter((file) => file.endsWith(".mp4"))
      .map((file) => {
        const stats = fs.statSync(path.join(VIDEO_DIR, file));
        const parts = file.replace(".mp4", "").split("_");

        let metadata = {};
        if (parts.length >= 3) {
          metadata = {
            time: parts[0],
            date: parts[1],
            trigger: parts.slice(2).join("_")
          };
        }

        return {
          filename: file,
          url: `/api/videos/${file}`,
          size: stats.size,
          modified: stats.mtime,
          metadata
        };
      })
      .sort((a, b) => b.modified - a.modified);

    res.status(200).json({
      videos: files,
      count: files.length,
      directory: VIDEO_DIR
    });

    console.log(`Listed ${files.length} videos`);
  } catch (err) {
    console.error("Error listing videos:", err);
    res.status(500).json({ error: "Failed to list videos" });
  }
});

// ====================================================================
// START SERVER
// ====================================================================

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`AI Server: ${AI_SERVER_URL}`);
  console.log(`Video directory: ${VIDEO_DIR}`);
});

