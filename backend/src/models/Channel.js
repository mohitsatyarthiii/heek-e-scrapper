import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
  {
    channelId: {
      type: String,
      required: true,
      index: true
    },

    platform: {
      type: String,
      enum: ["youtube", "instagram", "linkedin", "x"],
      required: true,
      index: true
    },

    keyword: {
      type: String,
      index: true
    },

    title: String,

    email: {
      type: String,
      index: true
    },

    subscribers: {
      type: Number,
      default: 0
    },

    views: {
      type: Number,
      default: 0
    },

    videos: {
      type: Number,
      default: 0
    },

    country: String,

    profileUrl: String,

    source: {
      type: String,
      enum: [
        "youtube-api",
        "youtube-browser",
        "youtube-google",
        "instagram",
        "instagram-google",
        "linkedin",
        "x"
      ]
    },

    bio: String
  },
  {
    timestamps: true
  }
);

channelSchema.index(
  { channelId: 1, platform: 1 },
  { unique: true }
);

export default mongoose.model("Channel", channelSchema);