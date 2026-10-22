import mongoose from "mongoose";

import { ENV } from "./env.js";

export const connectDB = async () => {
  try {
    if (mongoose.connection.readyState >= 1) {
      return mongoose.connection;
    }
    const dbUrl = ENV.DB_URL || process.env.DB_URL;
    if (!dbUrl) {
      throw new Error("DB_URL is not defined in environment variables");
    }
    const conn = await mongoose.connect(dbUrl);
    console.log("✅ Connected to MongoDB:", conn.connection.host);
    return conn;
  } catch (error) {
    console.error("❌ Error connecting to MongoDB:", error.message);
    throw error;
  }
};
