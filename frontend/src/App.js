import React, { useState, useRef } from "react";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5003";
const MAX_FILE_SIZE_MB = 200;

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function App() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [language, setLanguage] = useState("English");
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (selected) => {
    setError("");
    if (!selected) return;
    const ext = selected.name.split(".").pop().toLowerCase();
    if (!["mp4", "mov", "avi", "mkv"].includes(ext)) {
      setError("Unsupported format. Please use MP4, MOV, AVI, or MKV.");
      return;
    }
    if (selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    setFile(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a video file first.");
      return;
    }

    setLoading(true);
    setError("");
    setTranscript("");
    setSummary("");
    setVideoUrl("");
    setCurrentStep("uploading");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", language);

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.error) {
                setError(data.error);
                break;
              }

              if (data.step === "transcribing") {
                setCurrentStep("transcribing");
              }

              if (data.step === "transcript_done") {
                setTranscript(data.transcript);
                setCurrentStep("summarizing");
              }

              if (data.step === "summarizing") {
                setCurrentStep("summarizing");
              }

              if (data.step === "summary_done") {
                setSummary(data.summary);
                setCurrentStep("creating_video");
              }

              if (data.step === "creating_video") {
                setCurrentStep("creating_video");
              }

              if (data.step === "video_done") {
                setVideoUrl(`${API_URL}/video?t=${Date.now()}`);
                setCurrentStep("done");
              }

              if (data.step === "done") {
                setCurrentStep("done");
                setLoading(false);
              }

            } catch (e) {
              // skip malformed lines
            }
          }
        }
      }

    } catch (err) {
      setError("Cannot reach the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
      setCurrentStep("");
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setFile(null);
    setTranscript("");
    setSummary("");
    setVideoUrl("");
    setError("");
    setCurrentStep("");
  };

  const getStepLabel = () => {
    switch (currentStep) {
      case "uploading": return "Uploading video...";
      case "transcribing": return "Transcribing audio...";
      case "summarizing": return "Generating summary...";
      case "creating_video": return "Creating summary video...";
      default: return "Processing...";
    }
  };

  return (
    <div className="page">
      <header className="header">
        <div className="logo">⚡ VideoAI</div>
        <p className="tagline">Turn long videos into smart summaries</p>
      </header>

      <main className="main">
        <div className="card upload-card">
          <h2 className="card-title">Upload your video</h2>

          {/* Drag & Drop Zone */}
          <div
            className={`drop-zone ${dragging ? "drag-over" : ""} ${file ? "has-file" : ""}`}
            onClick={() => fileInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => handleFile(e.target.files[0])}
              style={{ display: "none" }}
            />
            {file ? (
              <div className="file-info">
                <span className="file-icon">🎬</span>
                <span className="file-name">{file.name}</span>
                <span className="file-size">{formatFileSize(file.size)}</span>
              </div>
            ) : (
              <div className="drop-hint">
                <span className="drop-icon">📁</span>
                <span className="drop-text">Drag & drop or <u>click to browse</u></span>
                <span className="drop-sub">MP4, MOV, AVI, MKV — up to 200 MB</span>
              </div>
            )}
          </div>

          {/* Language */}
          <div className="row">
            <label className="label">Language</label>
            <select
              className="select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option>English</option>
              <option>Hindi</option>
            </select>
          </div>

          {/* Error */}
          {error && <div className="error-box">⚠ {error}</div>}

          {/* Loading step indicator */}
          {loading && (
            <div className="loading-step">
              <div className="spinner"></div>
              <span>{getStepLabel()}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={loading || !file}
            >
              {loading ? "Processing…" : "Generate Summary"}
            </button>

            {(transcript || summary || file) && !loading && (
              <button className="btn btn-ghost" onClick={handleReset}>
                Start over
              </button>
            )}
          </div>
        </div>

        {/* Results — show as each step completes */}
        <div className="results">

          {/* Transcript — shows first */}
          {transcript && (
            <div className="card result-card">
              <div className="result-header">
                <h2 className="card-title">Transcript</h2>
                <button className="copy-btn" onClick={() => handleCopy(transcript)}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <p className="summary-text">{transcript}</p>
            </div>
          )}

          {/* Summary — shows second */}
          {summary && (
            <div className="card result-card">
              <div className="result-header">
                <h2 className="card-title">
                  Summary <span className="lang-badge">{language}</span>
                </h2>
                <button className="copy-btn" onClick={() => handleCopy(summary)}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <p className="summary-text">{summary}</p>
            </div>
          )}

          {/* Video — shows last */}
          {videoUrl && (
            <div className="card video-card">
              <div className="result-header">
                <h2 className="card-title">Summary video</h2>
                <a className="copy-btn" href={videoUrl} download="summary.mp4">
                  ↓ Download
                </a>
              </div>
              <video className="video-player" controls key={videoUrl}>
                <source src={videoUrl} type="video/mp4" />
              </video>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;