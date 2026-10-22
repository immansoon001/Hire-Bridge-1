import { clerkClient, getAuth } from "@clerk/express";
import User from "../models/User.js";
import { upsertStreamUser } from "../lib/stream.js";

export const protectRoute = async (req, res, next) => {
  try {
    const auth = getAuth(req);
    const clerkId = auth?.userId;

    if (!clerkId) {
      return res.status(401).json({ message: "Unauthorized - Please sign in to continue" });
    }

      // find user in db by clerk ID
      let user = await User.findOne({ clerkId });

      // Auto-sync: if the user exists in Clerk but not in our DB yet
      // (e.g., the Inngest webhook wasn't processed in local dev), create them now.
      if (!user) {
        console.log(`User ${clerkId} not found in DB — auto-syncing from Clerk...`);

        const clerkUser = await clerkClient.users.getUser(clerkId);

        const fullName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim();
        const primaryEmail = clerkUser.emailAddresses?.[0]?.emailAddress || `${clerkId}@clerk.user`;
        const name = fullName || clerkUser.username || primaryEmail.split("@")[0] || "User";

        const newUser = {
          clerkId,
          email: primaryEmail,
          name,
          profileImage: clerkUser.imageUrl || "",
        };

        user = await User.create(newUser);

        // Also sync to Stream so video/chat features work (non-fatal if Stream is offline)
        try {
          await upsertStreamUser({
            id: clerkId,
            name: newUser.name,
            image: newUser.profileImage,
          });
        } catch (streamErr) {
          console.warn("Stream user sync failed during protectRoute auto-sync (non-fatal):", streamErr.message);
        }

        console.log(`✅ Auto-synced user ${clerkId} to DB and Stream.`);
      }

    // attach user to req
    req.user = user;

    next();
  } catch (error) {
    console.error("Error in protectRoute middleware:", error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};
