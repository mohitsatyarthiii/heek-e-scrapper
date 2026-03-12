import express from "express";
import mongoose from "mongoose";
import cors from "cors";

import config from "./config/config.js";

import Channel from "./models/Channel.js";
import Queue from "./models/Queue.js";

import { BrowserPool } from "./lib/BrowserPool.js";
import { WorkerPool } from "./lib/WorkerPool.js";
import { ProxyManager } from "./lib/ProxyManager.js";

import { QueueService } from "./services/QueueService.js";
import { ScraperService } from "./services/ScraperService.js";

const app = express();

app.use(cors());
app.use(express.json());

/* ==============================
   DATABASE
============================== */

await mongoose.connect(config.mongoUri);

console.log("✅ MongoDB Connected");

/* ==============================
   POOLS
============================== */

const proxyManager = new ProxyManager(config.proxies);

const browserPool = new BrowserPool(
  config.workers.maxBrowsers,
  proxyManager
);

await browserPool.initialize();

const workerPool = new WorkerPool(
  config.workers.maxWorkers
);

/* ==============================
   WORKER START
============================== */

function startWorkers() {

  workerPool.start({

    getNextItem: async () => {
      return QueueService.getNextItem();
    },

    processItem: async (queueItem) => {

      const result =
        await ScraperService.process(queueItem, browserPool);

      return result;

    }

  });

}

/* ==============================
   ROUTES
============================== */


/*
Health Check
*/

app.get("/health", (req, res) => {

  res.json({
    status: "ok",
    workers: workerPool.getStatus(),
    browsers: browserPool.getStatus()
  });

});


/*
Add keywords to queue
*/

// On startup, check if there are pending or running queues and start workers if needed
(async () => {
  const count = await Queue.countDocuments({ status: { $in: ["pending", "running"] } });
  if (count > 0) {
    startWorkers();
    console.log("🔄 Pending or running queues found. Workers started.");
  } else {
    console.log("ℹ️ No pending/running queues. Workers will start when a queue is added.");
  }
})();

app.post("/queue/add", async (req, res) => {
  try {
    const {
      keywords,
      platform,
      targetCount,
      minSubs
    } = req.body;

    const list = Array.isArray(keywords)
      ? keywords
      : keywords.split(",").map(k => k.trim());

    const results = [];

    for (const keyword of list) {
      const result = await QueueService.addKeyword({
        keyword,
        platform,
        targetCount,
        minSubs
      });
      results.push(result);
    }

    // Auto-start workers if not running and there are any pending/running queues
    const count = await Queue.countDocuments({ status: { $in: ["pending", "running"] } });
    if (count > 0 && !workerPool.running) {
      startWorkers();
      console.log("▶️ Worker started automatically after queue add.");
    }

    res.json({
      success: true,
      results
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});


/*
Get Queue
*/

app.get("/queue", async (req, res) => {

  const items = await Queue
    .find()
    .sort({ createdAt: -1 })
    .limit(200);

  res.json(items);

});


/*
Pause Queue
*/

app.post("/queue/pause/:id", async (req, res) => {

  await Queue.findByIdAndUpdate(req.params.id, {
    status: "paused"
  });

  res.json({ success: true });

});


/*
Resume Queue
*/

app.post("/queue/resume/:id", async (req, res) => {

  await Queue.findByIdAndUpdate(req.params.id, {
    status: "pending"
  });

  res.json({ success: true });

});


/*
Delete Queue Item
*/

app.delete("/queue/:id", async (req, res) => {

  await Queue.findByIdAndDelete(req.params.id);

  res.json({ success: true });

});


/*
Start Scraper
*/

app.post("/scraper/start", async (req, res) => {

  if (!workerPool.running) {

    startWorkers();

    res.json({
      message: "Scraper started"
    });

  } else {

    res.json({
      message: "Already running"
    });

  }

});


/*
Stop Scraper
*/

app.post("/scraper/stop", (req, res) => {

  workerPool.stop();

  res.json({
    message: "Scraper stopped"
  });

});


/*
Scraper Status
*/

app.get("/scraper/status", (req, res) => {

  res.json({
    workers: workerPool.getStatus(),
    browsers: browserPool.getStatus()
  });

});


/*
Get Channels / Leads
*/

app.get("/channels", async (req, res) => {

  const { keyword, platform } = req.query;

  const query = {};

  if (keyword) query.keyword = keyword;

  if (platform) query.platform = platform;

  const data = await Channel
    .find(query)
    .sort({ subscribers: -1 })
    .limit(10000);

  res.json(data);

});


/*
Get Keywords
*/

app.get("/keywords", async (req, res) => {

  const keywords = await Channel.distinct("keyword");

  res.json(keywords);

});


/*
Stats
*/

app.get("/stats", async (req, res) => {

  const total = await Channel.countDocuments();

  const withEmail = await Channel.countDocuments({
    email: { $ne: null }
  });

  const queue = await Queue.countDocuments({
    status: "pending"
  });

  res.json({
    totalLeads: total,
    emails: withEmail,
    queuePending: queue
  });

});


/*
Export CSV
*/

app.get("/channels/export", async (req, res) => {

  const channels = await Channel
    .find({ email: { $ne: null } })
    .lean();

  const rows = [];

  rows.push(
    "Title,Email,Platform,Subscribers,Keyword,Profile"
  );

  for (const ch of channels) {

    rows.push(
      `"${ch.title}",${ch.email},${ch.platform},${ch.subscribers},${ch.keyword},${ch.profileUrl}`
    );

  }

  res.setHeader("Content-Type", "text/csv");

  res.setHeader(
    "Content-Disposition",
    "attachment; filename=leads.csv"
  );

  res.send(rows.join("\n"));

});


/* ==============================
   SERVER
============================== */

app.listen(config.port, () => {

  console.log(`🚀 Server running on ${config.port}`);

});


/* ==============================
   AUTO START
============================== */

// On startup, check if there are pending queues and start workers if needed
(async () => {
  const pendingCount = await Queue.countDocuments({ status: "pending" });
  if (pendingCount > 0) {
    startWorkers();
    console.log("🔄 Pending queues found. Workers started.");
  } else {
    console.log("ℹ️ No pending queues. Workers will start when a queue is added.");
  }
})();