import os
import logging
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from groq import Groq
from video_processor import generate_video_summary

# ── Load .env file ──────────────────────────────────────────────────────────
load_dotenv()

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── App setup ────────────────────────────────────────────────────────────────
app = Flask(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
CORS(app, origins=[FRONTEND_URL])

UPLOAD_FOLDER = "videos"
OUTPUT_FOLDER = "output"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024

# ── Groq client (handles both Whisper + Llama) ───────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY not set. Add it to your .env file.")

client = Groq(api_key=GROQ_API_KEY)

ALLOWED_EXTENSIONS = {"mp4", "mov", "avi", "mkv"}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/upload", methods=["POST"])
def upload_video():
    file_path = None
    try:
        file = request.files.get("file")
        language = request.form.get("language", "English")

        if not file or file.filename == "":
            return jsonify({"error": "No file uploaded"}), 400

        if not allowed_file(file.filename):
            return jsonify({"error": "Invalid file type. Use mp4, mov, avi, or mkv"}), 400

        safe_name = secure_filename(file.filename)
        file_path = os.path.join(UPLOAD_FOLDER, safe_name)
        file.save(file_path)
        logger.info(f"File saved: {safe_name}")

        # ── Transcribe using Groq Whisper API (no local model needed) ────────
        logger.info("Transcribing audio via Groq Whisper...")
        with open(file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-large-v3",
            )
        transcript = transcription.text

        if not transcript.strip():
            return jsonify({"error": "Could not detect any speech in this video"}), 422

        logger.info("Transcription done.")

        # ── Summarize using Llama 3 ───────────────────────────────────────────
        logger.info("Generating summary...")
        chat = client.chat.completions.create(
            messages=[{
                "role": "user",
                "content": (
                    f"Summarize the following transcript in 3 to 4 simple sentences. "
                    f"Output must contain only 3 or 4 sentences. "
                    f"Use only information explicitly present in the transcript. "
                    f"Do not add or infer. Keep the wording clear and direct. "
                    f"Write the response only in {language}.\n\nTranscript:\n{transcript}"
                )
            }],
            model="llama-3.1-8b-instant",
            max_tokens=150,
        )
        summary = chat.choices[0].message.content
        logger.info("Summary done.")

        # ── Generate summary video ────────────────────────────────────────────
        logger.info("Generating summary video...")
        output_video_path = os.path.join(OUTPUT_FOLDER, "summary.mp4")
        generate_video_summary(file_path, output_video_path)

        logger.info("Done!")
        return jsonify({"text": summary, "video": "/video"})

    except Exception as e:
        logger.error(f"Upload failed: {e}", exc_info=True)
        return jsonify({"error": "Something went wrong. Please try again."}), 500

    finally:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            logger.info("Temp file cleaned up.")


@app.route("/video")
def get_video():
    video_path = os.path.join(OUTPUT_FOLDER, "summary.mp4")
    if os.path.exists(video_path):
        return send_file(video_path, mimetype="video/mp4")
    return jsonify({"error": "Video not found"}), 404


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug_mode, port=5003)