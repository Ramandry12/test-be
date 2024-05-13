const express = require("express");
const bodyParser = require("body-parser");
const NodeMediaServer = require("node-media-server");
const { google } = require("googleapis");
const cors = require("cors");
const WebSocket = require("ws");
const { spawn } = require("child_process");

const app = express();
const port = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const OAuth2Client = new google.auth.OAuth2(
  "1092592614501-75e0leumjq4lde0if554h684953000fa.apps.googleusercontent.com",
  "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",
  "http://localhost:5173/coba"
);

const authUrl = OAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/youtube"],
});

// YouTube API Client
const youtube = google.youtube({
  version: "v3",
  auth: OAuth2Client,
});

// Create YouTube Live Stream
const createYoutubeLiveStream = async () => {
  try {
    // Buat live stream
    const streamResponse = await youtube.liveStreams.insert({
      part: "snippet,cdn,status",
      requestBody: {
        snippet: {
          title: "My Live Stream",
          description: "Description of my live stream",
        },
        cdn: {
          resolution: "720p",
          frameRate: "30fps",
          ingestionType: "rtmp",
        },
        status: {
          privacyStatus: "public",
        },
      },
    });

    // Buat broadcast untuk live stream yang baru saja dibuat
    const broadcastResponse = await youtube.liveBroadcasts.insert({
      part: "snippet,status,contentDetails",
      requestBody: {
        snippet: {
          title: "My Live Broadcast",
          description: "Description of my broadcast",
          scheduledStartTime: new Date().toISOString(), // Mulai segera
        },
        status: {
          privacyStatus: "public",
        },
        contentDetails: {
          enableDvr: true,
          enableContentEncryption: false,
          enableEmbed: true,
          recordFromStart: true,
          startWithSlate: false,
        },
      },
    });

    // Kaitkan stream dengan broadcast
    await youtube.liveBroadcasts.bind({
      part: "id,contentDetails",
      id: broadcastResponse.data.id,
      streamId: streamResponse.data.id,
    });

    // URL untuk menonton siaran
    const watchUrl = `https://www.youtube.com/watch?v=${broadcastResponse.data.id}`;

    return {
      streamId: streamResponse.data.id,
      ingestionAddress: streamResponse.data.cdn.ingestionInfo.ingestionAddress,
      streamName: streamResponse.data.cdn.ingestionInfo.streamName,
      broadcastId: broadcastResponse.data.id,
      watchUrl: watchUrl,
    };
  } catch (error) {
    console.error("Error creating YouTube live broadcast:", error);
    throw error;
  }
};

// Configure Node Media Server (NMS)
const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: 8000,
    mediaroot: "./media",
    allow_origin: "*",
  },
};

const nms = new NodeMediaServer(config);
nms.run();

const wss = new WebSocket.Server({ port: 8080 });

wss.on("connection", function connection(ws) {
  ws.on("message", function incoming(message) {
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-f",
      "flv",
      `rtmp://a.rtmp.youtube.com/live2/${streamData.streamName}`,
    ]);

    ffmpeg.stdin.write(message);
  });
});

// Auth endpoint
app.get("/auth", (req, res) => {
  res.json({ redirectUrl: authUrl });
});

// OAuth endpoint
app.get("/oauth", async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await OAuth2Client.getToken(code);
    OAuth2Client.setCredentials(tokens);

    const streamData = await createYoutubeLiveStream();
    console.log(streamData, "data streaming");

    res.json({
      message: "Streaming data received.",
      rtmpUrl: streamData.ingestionAddress,
      streamKey: streamData.streamName,
    });
  } catch (error) {
    console.error("Error handling stream request:", error);
    res.status(500).json({ error: "Error handling stream request" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
