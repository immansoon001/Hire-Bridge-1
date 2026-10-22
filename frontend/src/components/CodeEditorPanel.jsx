import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Loader2Icon, PlayIcon, SparklesIcon } from "lucide-react";
import { LANGUAGE_CONFIG } from "../data/problems";
import AiAssistModal from "./AiAssistModal";

function CodeEditorPanel({
  selectedLanguage,
  code,
  isRunning,
  onLanguageChange,
  onCodeChange,
  onRunCode,
  onMount,
  problemTitle = "",
}) {
  const [showAiModal, setShowAiModal] = useState(false);

  return (
    <div className="h-full bg-base-300 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-base-100 border-t border-base-300">
        <div className="flex items-center gap-3">
          <img
            src={LANGUAGE_CONFIG[selectedLanguage].icon}
            alt={LANGUAGE_CONFIG[selectedLanguage].name}
            className="size-6"
          />
          <select className="select select-sm" value={selectedLanguage} onChange={onLanguageChange}>
            {Object.entries(LANGUAGE_CONFIG).map(([key, lang]) => (
              <option key={key} value={key}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm gap-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 hover:from-indigo-100 hover:to-violet-100 transition shadow-sm"
            onClick={() => setShowAiModal(true)}
            title="Open AI Code Insights"
          >
            <SparklesIcon className="size-4 text-indigo-600 animate-pulse" />
            <span className="font-semibold">AI Insights</span>
          </button>

          <button className="btn btn-primary btn-sm gap-2" disabled={isRunning} onClick={onRunCode}>
            {isRunning ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <PlayIcon className="size-4" />
                Run Code
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Editor
          height={"100%"}
          language={LANGUAGE_CONFIG[selectedLanguage].monacoLang}
          value={code}
          onChange={(value) => onCodeChange(value ?? "")}
          onMount={onMount}
          theme="vs-dark"
          options={{
            fontSize: 16,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            minimap: { enabled: false },
            readOnly: false,
            domReadOnly: false,
          }}
        />
      </div>

      <AiAssistModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        code={code}
        language={selectedLanguage}
        problemTitle={problemTitle}
      />
    </div>
  );
}
export default CodeEditorPanel;
