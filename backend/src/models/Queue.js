import mongoose from "mongoose";

const queueSchema = new mongoose.Schema(
  {
    keyword: {
      type: String,
      required: true,
      index: true
    },

    platform: {
      type: String,
      enum: [
        "youtube-api",
        "youtube-browser",
        "youtube-google",
        "instagram",
        "instagram-google",
        "linkedin",
        "x"
      ],
      required: true
    },

    targetCount: {
      type: Number,
      default: 100
    },

    minSubs: {
      type: Number,
      default: 0
    },

    country: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: ["pending", "running", "completed", "paused", "failed"],
      default: "pending",
      index: true
    },

    retryCount: {
      type: Number,
      default: 0
    },

    progress: {
      collected: {
        type: Number,
        default: 0
      },

      total: {
        type: Number,
        default: 0
      }
    },

    stats: {
      channelsFound: {
        type: Number,
        default: 0
      },

      emailsFound: {
        type: Number,
        default: 0
      },

      startTime: Date,
      endTime: Date
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Queue", queueSchema);