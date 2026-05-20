import React, { useState, useRef } from "react";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5003";
const MAX_FILE_SIZE_MB = 200;

const STEPS = ["Uploading", "Transcribing", "Summarizing", "Creating video"];

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function App() {
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [language, setLanguage] = useState("English");
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
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
    setSummary("");
    setVideoUrl("");
    setCurrentStep(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", language);

    // Simulate step progression (real steps happen server-side)
    const stepTimer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < STEPS.length - 1) return prev + 1;
        clearInterval(stepTimer);
        return prev;
      });
    }, 8000);

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      clearInterval(stepTimer);
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setSummary(data.text);
        setVideoUrl(`${API_URL}/video?t=${Date.now()}`);
        setCurrentStep(STEPS.length);
      }
    } catch (err) {
      clearInterval(stepTimer);
      setError("Cannot reach the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
      setCurrentStep(-1);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setFile(null);
    setSummary("");
    setVideoUrl("");
    setError("");
    setCurrentStep(-1);
  };

  return (
    <div className="page">
      <header className="header">
        <div className="logo">Video Summarizer</div>
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

          {/* Language selector */}
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

          {/* Error message */}
          {error && <div className="error-box">⚠ {error}</div>}

          {/* Progress steps */}
          {loading && (
            <div className="steps">
              {STEPS.map((step, i) => (
                <div
                  key={step}
                  className={`step ${i < currentStep ? "done" : i === currentStep ? "active" : ""}`}
                >
                  <div className="step-dot">{i < currentStep ? "✓" : i + 1}</div>
                  <span>{step}</span>
                </div>
              ))}
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

            {(summary || file) && !loading && (
              <button className="btn btn-ghost" onClick={handleReset}>
                Start over
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        {(summary || videoUrl) && (
          <div className="results">
            {summary && (
              <div className="card result-card">
                <div className="result-header">
                  <h2 className="card-title">
                    Summary <span className="lang-badge">{language}</span>
                  </h2>
                  <button className="copy-btn" onClick={handleCopy}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <p className="summary-text">{summary}</p>
              </div>
            )}

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
        )}
      </main>
    </div>
  );
}

export default App;