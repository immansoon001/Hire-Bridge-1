const roomState = new Map();

const getRoomState = (sessionId) => {
  if (!roomState.has(sessionId)) {
    roomState.set(sessionId, {
      code: "",
      language: "javascript",
      participants: new Map(),
      typingUsers: new Set(),
    });
  }

  return roomState.get(sessionId);
};

export const initializeSocket = (io) => {
  io.on("connection", (socket) => {
    socket.on("session:join", ({ sessionId, user }) => {
      if (!sessionId || !user?.id) return;

      socket.join(sessionId);
      const state = getRoomState(sessionId);
      state.participants.set(user.id, {
        ...user,
        socketId: socket.id,
      });

      io.to(sessionId).emit("session:presence", {
        participants: Array.from(state.participants.values()),
      });

      // Send current live code & language to newly joined participant
      if (state.code) {
        socket.emit("code:sync", {
          code: state.code,
          language: state.language || "javascript",
          userId: "server",
        });
      }
    });

    socket.on("session:typing", ({ sessionId, userId, isTyping }) => {
      if (!sessionId || !userId) return;

      const state = getRoomState(sessionId);
      if (isTyping) state.typingUsers.add(userId);
      else state.typingUsers.delete(userId);

      io.to(sessionId).emit("session:typing:update", {
        typingUsers: Array.from(state.typingUsers),
      });
    });

    socket.on("code:sync", ({ sessionId, code, language, userId }) => {
      if (!sessionId || typeof code !== "string") return;

      const state = getRoomState(sessionId);
      state.code = code;
      if (language) state.language = language;

      socket.to(sessionId).emit("code:sync", {
        code,
        language,
        userId,
      });
    });

    socket.on("chat:message", ({ sessionId, message }) => {
      if (!sessionId || !message) return;

      io.to(sessionId).emit("chat:message", message);
    });

    socket.on("session:leave", ({ sessionId, userId }) => {
      if (!sessionId || !userId) return;

      const state = getRoomState(sessionId);
      state.participants.delete(userId);
      state.typingUsers.delete(userId);

      io.to(sessionId).emit("session:presence", {
        participants: Array.from(state.participants.values()),
      });
      io.to(sessionId).emit("session:typing:update", {
        typingUsers: Array.from(state.typingUsers),
      });
    });

    socket.on("disconnect", () => {
      for (const [sessionId, state] of roomState.entries()) {
        const removed = [...state.participants.entries()].filter(([, user]) => user.socketId === socket.id);
        if (removed.length > 0) {
          removed.forEach(([userId]) => {
            state.participants.delete(userId);
            state.typingUsers.delete(userId);
          });
          io.to(sessionId).emit("session:presence", {
            participants: Array.from(state.participants.values()),
          });
          io.to(sessionId).emit("session:typing:update", {
            typingUsers: Array.from(state.typingUsers),
          });
        }
      }
    });
  });
};