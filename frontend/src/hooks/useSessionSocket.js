import { useEffect, useMemo, useState, useCallback } from "react";
import { disconnectSocket, getSocket } from "../lib/socket";

export const useSessionSocket = (sessionId, user) => {
  const socket = useMemo(() => getSocket(), []);
  const [participants, setParticipants] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  const userId = user?.id;
  const userName = user?.fullName || user?.username || user?.firstName || "Guest";
  const userImage = user?.imageUrl || "";

  useEffect(() => {
    if (!sessionId || !userId) return;

    socket.connect();
    socket.emit("session:join", {
      sessionId,
      user: {
        id: userId,
        name: userName,
        image: userImage,
        socketId: socket.id,
      },
    });

    const handlePresence = ({ participants: nextParticipants }) => setParticipants(nextParticipants || []);
    const handleTyping = ({ typingUsers: nextTypingUsers }) => setTypingUsers(nextTypingUsers || []);

    socket.on("session:presence", handlePresence);
    socket.on("session:typing:update", handleTyping);

    return () => {
      socket.emit("session:leave", { sessionId, userId });
      socket.off("session:presence", handlePresence);
      socket.off("session:typing:update", handleTyping);
      disconnectSocket();
    };
  }, [sessionId, userId, userName, userImage, socket]);

  const syncCode = useCallback((code, language) => {
    if (!sessionId || !userId || typeof code !== "string") return;
    socket.emit("code:sync", { sessionId, code, language, userId });
  }, [sessionId, userId, socket]);

  const setTyping = useCallback((isTyping) => {
    if (!sessionId || !userId) return;
    socket.emit("session:typing", { sessionId, userId, isTyping });
  }, [sessionId, userId, socket]);

  return { socket, participants, typingUsers, syncCode, setTyping };
};