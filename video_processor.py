import cv2
import numpy as np
import os

def get_video_info(video_path):
    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    duration = total_frames / fps
    cap.release()
    return total_frames, fps, duration


def extract_all_frames(video_path):
    cap = cv2.VideoCapture(video_path)
    frames = []
    frame_indices = []
    count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frames.append(frame)
        frame_indices.append(count)
        count += 1

    cap.release()
    print("Total frames in video:", len(frames))
    return frames, frame_indices


def score_frames(frames):
    scores = []

    # Score each frame based on motion and change
    prev_gray = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)

    for i in range(len(frames)):
        gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)

        # Motion score
        diff = cv2.absdiff(prev_gray, gray)
        motion_score = np.mean(diff)

        # Edge score - frames with more edges are more interesting
        edges = cv2.Canny(gray, 50, 150)
        edge_score = np.mean(edges)

        # Brightness score - avoid very dark or very bright frames
        brightness = np.mean(gray)
        brightness_score = 1.0 - abs(brightness - 128) / 128

        # Combined score
        total_score = (motion_score * 0.5) + (edge_score * 0.3) + (brightness_score * 20)
        scores.append(total_score)

        prev_gray = gray

    return scores


def select_best_frames(frames, scores, target_duration=28, output_fps=24):
    target_frame_count = target_duration * output_fps

    # Divide video into segments
    total_frames = len(frames)
    segment_size = max(1, total_frames // target_frame_count)

    selected_frames = []
    selected_indices = []

    # From each segment pick the best scoring frame
    for seg_start in range(0, total_frames, segment_size):
        seg_end = min(seg_start + segment_size, total_frames)
        seg_scores = scores[seg_start:seg_end]

        if not seg_scores:
            continue

        best_local_idx = np.argmax(seg_scores)
        best_global_idx = seg_start + best_local_idx

        selected_frames.append(frames[best_global_idx])
        selected_indices.append(best_global_idx)

        if len(selected_frames) >= target_frame_count:
            break

    print("Selected frames:", len(selected_frames))
    return selected_frames, selected_indices


def save_summary_video(frames, output_path, original_video_path, fps=24):
    if not frames:
        print("No frames!")
        return False

    height, width, _ = frames[0].shape

    temp_video = output_path.replace(".mp4", "_temp.avi")
    fourcc = cv2.VideoWriter_fourcc(*"MJPG")
    out = cv2.VideoWriter(temp_video, fourcc, fps, (width, height))

    for frame in frames:
        resized = cv2.resize(frame, (width, height))
        out.write(resized)

    out.release()

    # Add audio
    final_output = output_path.replace(".mp4", "_final.mp4")
    cmd = f'ffmpeg -y -i {temp_video} -i "{original_video_path}" -map 0:v:0 -map 1:a:0 -shortest -vcodec libx264 -acodec aac {final_output}'
    os.system(cmd)

    if os.path.exists(final_output) and os.path.getsize(final_output) > 0:
        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(final_output, output_path)
    else:
        # No audio, just convert
        os.system(f'ffmpeg -y -i {temp_video} -vcodec libx264 {output_path}')

    if os.path.exists(temp_video):
        os.remove(temp_video)

    print("Video saved:", output_path)
    return True


def generate_video_summary(video_path, output_path):
    print("Starting video summarization...")

    # Get video info
    total_frames, fps, duration = get_video_info(video_path)
    print(f"Duration: {duration:.1f} sec, FPS: {fps}, Frames: {total_frames}")

    # Extract all frames
    frames, indices = extract_all_frames(video_path)

    if not frames:
        print("No frames extracted!")
        return False

    # Score every frame
    print("Scoring frames...")
    scores = score_frames(frames)

    # Select best frames spread across entire video
    print("Selecting best frames...")
    selected_frames, selected_indices = select_best_frames(
        frames, scores,
        target_duration=28,
        output_fps=24
    )

    if not selected_frames:
        print("No frames selected!")
        return False

    # Save video
    print("Saving summary video...")
    return save_summary_video(selected_frames, output_path, video_path, fps=24)