import Queue from "../models/Queue.js";

export class QueueService {

  static async addKeyword({
    keyword,
    platform,
    targetCount = 100,
    minSubs = 0,
    country = ""
  }) {

    const exists = await Queue.findOne({
      keyword,
      platform,
      status: { $in: ["pending", "running"] }
    });

    if (exists) {
      return { success: false, message: "Already queued" };
    }

    const item = await Queue.create({
      keyword,
      platform,
      targetCount,
      minSubs,
      country,
      progress: {
        total: targetCount
      }
    });

    return { success: true, item };
  }

  static async getNextItem() {

    return Queue.findOneAndUpdate(
      { status: "pending" },
      {
        status: "running",
        "stats.startTime": new Date()
      },
      {
        sort: { createdAt: 1 },
        new: true
      }
    );
  }

  static async updateProgress(id, collected) {

    return Queue.findByIdAndUpdate(id, {
      $set: {
        "progress.collected": collected
      }
    });
  }

  static async complete(id, collected) {

    return Queue.findByIdAndUpdate(id, {
      status: "completed",
      "progress.collected": collected,
      "stats.endTime": new Date()
    });
  }

  static async fail(id) {

    const item = await Queue.findById(id);

    if (!item) return;

    if (item.retryCount < 3) {

      await Queue.findByIdAndUpdate(id, {
        status: "pending",
        retryCount: item.retryCount + 1
      });

    } else {

      await Queue.findByIdAndUpdate(id, {
        status: "failed"
      });

    }
  }

}