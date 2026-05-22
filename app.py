import os
import logging
from flask import Flask, request, jsonify, send_file, Response, stream_with_context
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from groq import Groq
from video_processor import generate_video_summary
import json

load_dotenv()

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "videos"
OUTPUT_FOLDER = "output"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY not set.")

client = Groq(api_key=GROQ_API_KEY)

ALLOWED_EXTENSIONS = {"mp4", "mov", "avi", "mkv"}


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def send_event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@app.route("/upload", methods=["POST"])
def upload_video():
    file_path = None

    file = request.files.get("file")
    language = request.form.get("language", "English")

    if not file or file.filename == "":
        return jsonify({"error": "No file uploaded"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type"}), 400

    safe_name = secure_filename(file.filename)
    file_path = os.path.join(UPLOAD_FOLDER, safe_name)
    file.save(file_path)
    logger.info(f"File saved: {safe_name}")

    def generate():
        nonlocal file_path
        try:
            # ── Step 1: Transcribe ────────────────────────────────────
            yield send_event({"step": "transcribing"})

            with open(file_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-large-v3",
                )
            transcript = transcription.text

            if not transcript.strip():
                yield send_event({"error": "No speech detected in video"})
                return

            # Send transcript immediately
            yield send_event({"step": "transcript_done", "transcript": transcript})

            # ── Step 2: Summarize ─────────────────────────────────────
            yield send_event({"step": "summarizing"})

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

            # Send summary immediately
            yield send_event({"step": "summary_done", "summary": summary})

            # ── Step 3: Generate video (local only) ───────────────────
            if os.getenv("FLASK_DEBUG") == "true":
                yield send_event({"step": "creating_video"})
                output_video_path = os.path.join(OUTPUT_FOLDER, "summary.mp4")
                generate_video_summary(file_path, output_video_path)
                yield send_event({"step": "video_done", "video": "/video"})

            yield send_event({"step": "done"})

        except Exception as e:
            logger.error(f"Error: {e}", exc_info=True)
            yield send_event({"error": str(e)})

        finally:
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
                logger.info("Temp file cleaned up.")

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


@app.route("/video")
def get_video():
    video_path = os.path.join(OUTPUT_FOLDER, "summary.mp4")
    if os.path.exists(video_path):
        return send_file(video_path, mimetype="video/mp4")
    return jsonify({"error": "Video not found"}), 404


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=5003, debug=debug_mode)