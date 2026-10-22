import { useUser } from "@clerk/clerk-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEndSession, useJoinSession, useSessionById } from "../hooks/useSessions";
import { PROBLEMS } from "../data/problems";
import { executeCode } from "../lib/piston";
import Navbar from "../components/Navbar";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { getDifficultyBadgeClass, copyToClipboard } from "../lib/utils";
import { Loader2Icon, LogOutIcon, PhoneOffIcon, Share2Icon, CheckIcon } from "lucide-react";
import CodeEditorPanel from "../components/CodeEditorPanel";
import OutputPanel from "../components/OutputPanel";
import toast from "react-hot-toast";

import useStreamClient from "../hooks/useStreamClient";
import { StreamCall, StreamVideo } from "@stream-io/video-react-sdk";
import VideoCallUI from "../components/VideoCallUI";
import { useSessionSocket } from "../hooks/useSessionSocket";
import { UsersIcon, KeyboardIcon } from "lucide-react";

function SessionPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useUser();
  const [output, setOutput] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyInviteLink = async () => {
    const inviteUrl = window.location.href;
    const ok = await copyToClipboard(inviteUrl);
    if (ok) {
      setCopiedLink(true);
      toast.success("Room invite link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      toast.error("Failed to copy link. Please copy URL from browser address bar.");
    }
  };

  const { data: sessionData, isLoading: loadingSession, refetch } = useSessionById(id);

  const joinSessionMutation = useJoinSession();
  const endSessionMutation = useEndSession();

  const session = sessionData?.session;
  const isHost = session?.host?.clerkId === user?.id;
  const isParticipant = session?.participant?.clerkId === user?.id;

  const { call, channel, chatClient, isInitializingCall, streamClient } = useStreamClient(
    session,
    loadingSession,
    isHost,
    isParticipant
  );

  // find problem data based on session problem title or provide interview fallback
  const matchedProblem = useMemo(() => {
    return session?.problem
      ? Object.values(PROBLEMS).find(
          (p) => p.title.toLowerCase() === session.problem.toLowerCase()
        )
      : null;
  }, [session?.problem]);

  const fallbackProblem = useMemo(() => ({
    title: session?.problem || "Live Technical Interview",
    difficulty: session?.difficulty
      ? session.difficulty.charAt(0).toUpperCase() + session.difficulty.slice(1)
      : "Medium",
    category: "Technical Interview & Live Assessment",
    description: {
      text: `Welcome to the live technical coding session for ${session?.problem || "this role"}. In this workspace, both interviewer and candidate collaborate in real-time with synchronized code editing, integrated video conferencing, chat, and instant code execution.`,
      notes: [
        "Use the code editor on the left to write and test your solution.",
        "Both parties have real-time audio, video, and text communication enabled.",
        "Press 'Run Code' to execute your program against the isolated runtime.",
        "You can switch programming languages using the language dropdown above the editor.",
      ],
    },
    examples: [
      {
        input: "// Candidate will write solution here",
        output: "// Run code output appears in the panel below",
        explanation:
          "Collaborate with the interviewer to understand requirements and implement a clean, optimal solution.",
      },
    ],
    constraints: [
      "Real-time code synchronization is active",
      "Both participants have full access to execute code",
    ],
    starterCode: {
      javascript: `// Technical Interview Workspace\n// Role / Topic: ${session?.problem || "Coding Assessment"}\n\nfunction solution() {\n  // Write your solution here\n  console.log("Hello from Hire-Bridge Interview Workspace!");\n}\n\nsolution();\n`,
      python: `# Technical Interview Workspace\n# Role / Topic: ${session?.problem || "Coding Assessment"}\n\ndef solution():\n    # Write your solution here\n    print("Hello from Hire-Bridge Interview Workspace!")\n\nif __name__ == "__main__":\n    solution()\n`,
      java: `// Technical Interview Workspace\n// Role / Topic: ${session?.problem || "Coding Assessment"}\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n        System.out.println("Hello from Hire-Bridge Interview Workspace!");\n    }\n}\n`,
    },
  }), [session?.problem, session?.difficulty]);

  const problemData = matchedProblem || fallbackProblem;

  const [selectedLanguage, setSelectedLanguage] = useState("javascript");
  const [code, setCode] = useState("");
  const typingTimeoutRef = useRef(null);
  const isCodeInitializedRef = useRef(false);

  const { socket, participants, typingUsers, syncCode, setTyping } = useSessionSocket(id, user);

  // auto-join session if user is not already a participant and not the host
  useEffect(() => {
    if (!session || !user || loadingSession) return;
    if (isHost || isParticipant) return;

    joinSessionMutation.mutate(id, { onSuccess: refetch });

    // remove the joinSessionMutation, refetch from dependencies to avoid infinite loop
  }, [session, user, loadingSession, isHost, isParticipant, id]);

  // redirect the "participant" when session ends
  useEffect(() => {
    if (!session || loadingSession) return;

    if (session.status === "completed") navigate("/dashboard");
  }, [session, loadingSession, navigate]);

  // initialize starter code once session data is available, unless code was already set or received
  useEffect(() => {
    if (loadingSession) return;
    if (!isCodeInitializedRef.current && problemData?.starterCode?.[selectedLanguage]) {
      setCode(problemData.starterCode[selectedLanguage]);
      isCodeInitializedRef.current = true;
    }
  }, [loadingSession, problemData, selectedLanguage]);

  const handleCodeChange = (newCode) => {
    isCodeInitializedRef.current = true;
    setCode(newCode);
    syncCode(newCode, selectedLanguage);
    setTyping(true);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => setTyping(false), 800);
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setSelectedLanguage(newLang);
    isCodeInitializedRef.current = true;
    // use problem-specific starter code
    const starterCode = problemData?.starterCode?.[newLang] || "";
    setCode(starterCode);
    setOutput(null);
    syncCode(starterCode, newLang);
  };

  useEffect(() => {
    const handleIncomingCode = ({ code: nextCode, language, userId }) => {
      if (typeof nextCode !== "string" || userId === user?.id) return;

      isCodeInitializedRef.current = true;

      if (language) {
        setSelectedLanguage(language);
      }

      setCode(nextCode);
    };

    socket.on("code:sync", handleIncomingCode);

    return () => {
      socket.off("code:sync", handleIncomingCode);
    };
  }, [socket, user?.id]);

  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput(null);

    const result = await executeCode(selectedLanguage, code);
    setOutput(result);
    setIsRunning(false);
  };

  const handleEndSession = () => {
    if (confirm("Are you sure you want to end this session? All participants will be notified.")) {
      // this will navigate the HOST to dashboard
      endSessionMutation.mutate(id, { onSuccess: () => navigate("/dashboard") });
    }
  };

  return (
    <div className="h-screen bg-base-100 flex flex-col">
      <Navbar />

      <div className="flex-1">
        <PanelGroup direction="horizontal">
          {/* LEFT PANEL - CODE EDITOR & PROBLEM DETAILS */}
          <Panel defaultSize={50} minSize={30}>
            <PanelGroup direction="vertical">
              {/* PROBLEM DSC PANEL */}
              <Panel defaultSize={50} minSize={20}>
                <div className="h-full overflow-y-auto bg-base-200">
                  {/* HEADER SECTION */}
                  <div className="p-6 bg-base-100 border-b border-base-300">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h1 className="text-3xl font-bold text-base-content">
                          {session?.problem || "Loading..."}
                        </h1>
                        {problemData?.category && (
                          <p className="text-base-content/60 mt-1">{problemData.category}</p>
                        )}
                        <p className="text-base-content/60 mt-2">
                          Host: {session?.host?.name || "Loading..."} •{" "}
                          {session?.participant ? 2 : 1}/2 participants
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                          <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-700">
                            {participants.length} online
                          </span>
                          <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-700">
                            {typingUsers.length} typing
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleCopyInviteLink}
                          className="btn btn-outline btn-sm gap-2"
                          title="Copy session invite URL to share"
                        >
                          {copiedLink ? (
                            <CheckIcon className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Share2Icon className="w-4 h-4 text-indigo-600" />
                          )}
                          <span>{copiedLink ? "Link Copied" : "Share Room"}</span>
                        </button>

                        <span
                          className={`badge badge-lg ${getDifficultyBadgeClass(
                            session?.difficulty
                          )}`}
                        >
                          {session?.difficulty.slice(0, 1).toUpperCase() +
                            session?.difficulty.slice(1) || "Easy"}
                        </span>
                        {isHost && session?.status === "active" && (
                          <button
                            onClick={handleEndSession}
                            disabled={endSessionMutation.isPending}
                            className="btn btn-error btn-sm gap-2"
                          >
                            {endSessionMutation.isPending ? (
                              <Loader2Icon className="w-4 h-4 animate-spin" />
                            ) : (
                              <LogOutIcon className="w-4 h-4" />
                            )}
                            End Session
                          </button>
                        )}
                        {session?.status === "completed" && (
                          <span className="badge badge-ghost badge-lg">Completed</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* problem desc */}
                    {problemData?.description && (
                      <div className="bg-base-100 rounded-xl shadow-sm p-5 border border-base-300">
                        <h2 className="text-xl font-bold mb-4 text-base-content">Description</h2>
                        <div className="space-y-3 text-base leading-relaxed">
                          <p className="text-base-content/90">{problemData.description.text}</p>
                          {problemData.description.notes?.map((note, idx) => (
                            <p key={idx} className="text-base-content/90">
                              {note}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* examples section */}
                    {problemData?.examples && problemData.examples.length > 0 && (
                      <div className="bg-base-100 rounded-xl shadow-sm p-5 border border-base-300">
                        <h2 className="text-xl font-bold mb-4 text-base-content">Examples</h2>

                        <div className="space-y-4">
                          {problemData.examples.map((example, idx) => (
                            <div key={idx}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="badge badge-sm">{idx + 1}</span>
                                <p className="font-semibold text-base-content">Example {idx + 1}</p>
                              </div>
                              <div className="bg-base-200 rounded-lg p-4 font-mono text-sm space-y-1.5">
                                <div className="flex gap-2">
                                  <span className="text-primary font-bold min-w-[70px]">
                                    Input:
                                  </span>
                                  <span>{example.input}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-secondary font-bold min-w-[70px]">
                                    Output:
                                  </span>
                                  <span>{example.output}</span>
                                </div>
                                {example.explanation && (
                                  <div className="pt-2 border-t border-base-300 mt-2">
                                    <span className="text-base-content/60 font-sans text-xs">
                                      <span className="font-semibold">Explanation:</span>{" "}
                                      {example.explanation}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Constraints */}
                    {problemData?.constraints && problemData.constraints.length > 0 && (
                      <div className="bg-base-100 rounded-xl shadow-sm p-5 border border-base-300">
                        <h2 className="text-xl font-bold mb-4 text-base-content">Constraints</h2>
                        <ul className="space-y-2 text-base-content/90">
                          {problemData.constraints.map((constraint, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-primary">•</span>
                              <code className="text-sm">{constraint}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-2 bg-base-300 hover:bg-primary transition-colors cursor-row-resize" />

              <Panel defaultSize={50} minSize={20}>
                <PanelGroup direction="vertical">
                  <Panel defaultSize={70} minSize={30}>
                    <CodeEditorPanel
                      selectedLanguage={selectedLanguage}
                      code={code}
                      isRunning={isRunning}
                      problemTitle={session?.problem || "Interview Session"}
                      onLanguageChange={handleLanguageChange}
                      onCodeChange={handleCodeChange}
                      onRunCode={handleRunCode}
                    />
                  </Panel>

                  <PanelResizeHandle className="h-2 bg-base-300 hover:bg-primary transition-colors cursor-row-resize" />

                  <Panel defaultSize={30} minSize={15}>
                    <OutputPanel output={output} />
                  </Panel>
                </PanelGroup>
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="w-2 bg-base-300 hover:bg-primary transition-colors cursor-col-resize" />

          {/* RIGHT PANEL - VIDEO CALLS & CHAT */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full bg-base-200 p-4 overflow-auto">
              {isInitializingCall ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Loader2Icon className="w-12 h-12 mx-auto animate-spin text-primary mb-4" />
                    <p className="text-lg">Connecting to video call...</p>
                  </div>
                </div>
              ) : !streamClient || !call ? (
                <div className="h-full flex items-center justify-center">
                  <div className="card bg-base-100 shadow-xl max-w-md">
                    <div className="card-body items-center text-center">
                      <div className="w-24 h-24 bg-error/10 rounded-full flex items-center justify-center mb-4">
                        <PhoneOffIcon className="w-12 h-12 text-error" />
                      </div>
                      <h2 className="card-title text-2xl">Connection Failed</h2>
                      <p className="text-base-content/70">Unable to connect to the video call</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full">
                  <StreamVideo client={streamClient}>
                    <StreamCall call={call}>
                      <VideoCallUI chatClient={chatClient} channel={channel} />
                    </StreamCall>
                  </StreamVideo>
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

export default SessionPage;
