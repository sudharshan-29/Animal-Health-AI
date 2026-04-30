import { useRef, useEffect, useState, useCallback } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { addKeypointFrame, computeHealthScore, generateAlerts, computeGaitMetrics, clearBuffer } from '@/lib/healthScoring';
import type { HealthScore, Alert, GaitMetrics, Keypoint } from '@/lib/healthScoring';
import { drawPoseSkeleton } from '@/lib/poseDrawing';
import { Camera, Upload, Video, Square, Loader2, ImageIcon } from 'lucide-react';

interface VideoFeedProps {
  onHealthUpdate: (score: HealthScore) => void;
  onAlert: (alerts: Alert[]) => void;
  onGaitUpdate: (metrics: GaitMetrics) => void;
  onFrameCount: (count: number) => void;
  onImageCapture: (dataUrl: string | null) => void;
  onPoseData: (data: Keypoint[] | null) => void;
}

type InputMode = 'webcam' | 'video' | 'image';
type LandmarkerWithOptions = PoseLandmarker & {
  setOptions?: (options: { runningMode: 'IMAGE' | 'VIDEO' }) => Promise<void> | void;
};

export default function VideoFeed({ onHealthUpdate, onAlert, onGaitUpdate, onFrameCount, onImageCapture, onPoseData }: VideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const animFrameRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const latestKeypointsRef = useRef<Keypoint[] | null>(null);

  const [mode, setMode] = useState<InputMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        if (cancelled) return;
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (cancelled) return;
        poseLandmarkerRef.current = landmarker;
        setModelReady(true);
      } catch (e) {
        console.error('Failed to load pose model:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const landmarker = poseLandmarkerRef.current;

    if (!video || !overlay || !landmarker || video.paused || video.ended) return;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    overlay.width = video.videoWidth || video.clientWidth;
    overlay.height = video.videoHeight || video.clientHeight;

    try {
      const result = landmarker.detectForVideo(video, performance.now());
      const landmarks = result.landmarks?.[0];

      if (landmarks) {
        const keypoints: Keypoint[] = landmarks.map((lm, i) => ({
          x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility ?? 1, name: `kp_${i}`,
        }));

        addKeypointFrame(keypoints);
        latestKeypointsRef.current = keypoints;
        drawPoseSkeleton(ctx, keypoints, overlay.width, overlay.height, computeHealthScore().lamenessScore);

        frameCountRef.current++;
        if (frameCountRef.current % 5 === 0) {
          const score = computeHealthScore();
          onHealthUpdate(score);
          onAlert(generateAlerts(score));
          onGaitUpdate(computeGaitMetrics());
          onFrameCount(frameCountRef.current);
        }
      }
    } catch { /* skip */ }

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [onHealthUpdate, onAlert, onGaitUpdate, onFrameCount]);

  // Capture frame for AI analysis
  const captureFrame = () => {
    if (mode === 'image' && imageUrl) {
      // For images, convert the displayed image
      const canvas = document.createElement('canvas');
      const img = imgRef.current;
      if (!img) return;
      canvas.width = img.naturalWidth || 640;
      canvas.height = img.naturalHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      onImageCapture(canvas.toDataURL('image/jpeg', 0.8));
      onPoseData(latestKeypointsRef.current);
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    onImageCapture(canvas.toDataURL('image/jpeg', 0.8));
    onPoseData(latestKeypointsRef.current);
  };

  const startWebcam = async () => {
    setMode('webcam');
    setLoading(true);
    clearBuffer();
    frameCountRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          videoRef.current?.play();
          setActive(true);
          setLoading(false);
          processFrame();
        };
      }
    } catch (e) {
      console.error('Webcam error:', e);
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    clearBuffer();
    frameCountRef.current = 0;

    if (file.type.startsWith('video/')) {
      setMode('video');
      setImageUrl(null);
      const url = URL.createObjectURL(file);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.onloadeddata = () => {
          videoRef.current?.play();
          setActive(true);
          processFrame();
        };
      }
    } else if (file.type.startsWith('image/')) {
      setMode('image');
      setActive(false);
      cancelAnimationFrame(animFrameRef.current);
      const url = URL.createObjectURL(file);
      setImageUrl(url);

      // Also read as data URL for AI
      const reader = new FileReader();
      reader.onload = () => {
        onImageCapture(reader.result as string);
      };
      reader.readAsDataURL(file);

      const img = new Image();
      img.onload = async () => {
        const landmarker = poseLandmarkerRef.current;
        if (!landmarker) return;

        try {
          await (landmarker as LandmarkerWithOptions).setOptions?.({ runningMode: 'IMAGE' });
        } catch { /* ignore */ }

        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return;

        canvas.width = img.width;
        canvas.height = img.height;
        overlay.width = img.width;
        overlay.height = img.height;

        const cctx = canvas.getContext('2d');
        cctx?.drawImage(img, 0, 0);

        try {
          const result = landmarker.detect(img);
          const landmarks = result.landmarks?.[0];
          if (landmarks) {
            const keypoints: Keypoint[] = landmarks.map((lm, i) => ({
              x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility ?? 1, name: `kp_${i}`,
            }));
            addKeypointFrame(keypoints);
            latestKeypointsRef.current = keypoints;
            onPoseData(keypoints);
            const octx = overlay.getContext('2d');
            if (octx) drawPoseSkeleton(octx, keypoints, overlay.width, overlay.height, 0);
            const score = computeHealthScore();
            onHealthUpdate(score);
            onAlert(generateAlerts(score));
            onGaitUpdate(computeGaitMetrics());
            onFrameCount(1);
          }
        } catch (err) {
          console.error('Image detection error:', err);
        }

        try {
          await (landmarker as LandmarkerWithOptions).setOptions?.({ runningMode: 'VIDEO' });
        } catch { /* ignore */ }
      };
      img.src = url;
    }
  };

  const stop = () => {
    cancelAnimationFrame(animFrameRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    setActive(false);
    setMode(null);
    setImageUrl(null);
    onImageCapture(null);
    onPoseData(null);
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={startWebcam}
          disabled={!modelReady || active}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-40 transition-all hover:scale-[1.02]"
        >
          <Camera className="w-3.5 h-3.5" /> Webcam
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!modelReady}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 disabled:opacity-40 transition-all hover:scale-[1.02]"
        >
          <Upload className="w-3.5 h-3.5" /> Upload File
        </button>
        {(active || imageUrl) && (
          <button
            onClick={captureFrame}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-all hover:scale-[1.02]"
          >
            <ImageIcon className="w-3.5 h-3.5" /> Capture for AI
          </button>
        )}
        {active && (
          <button
            onClick={stop}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono rounded-lg bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-all hover:scale-[1.02]"
          >
            <Square className="w-3.5 h-3.5" /> Stop
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="video/*,image/*" onChange={handleFileUpload} className="hidden" />
        <div className="ml-auto flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {!modelReady && !loading && <span className="text-xs text-muted-foreground font-mono">Loading pose model…</span>}
          {modelReady && !active && !imageUrl && (
            <span className="flex items-center gap-1.5 text-xs text-primary font-mono">
              <span className="w-2 h-2 rounded-full bg-primary status-pulse" /> Model Ready
            </span>
          )}
        </div>
      </div>

      {/* Video / Image display */}
      <div className="relative flex-1 min-h-[350px] rounded-xl overflow-hidden border border-border bg-muted/20 grid-bg">
        {!mode && !imageUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center">
              <Video className="w-8 h-8 opacity-40" />
            </div>
            <span className="text-sm font-heading font-bold">No Input Selected</span>
            <span className="text-xs opacity-60 font-mono">Use webcam or upload a video/image to begin analysis</span>
          </div>
        )}

        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          style={{ display: mode === 'image' ? 'none' : 'block' }}
          playsInline muted
        />

        {imageUrl && (
          <img ref={imgRef} src={imageUrl} alt="Uploaded animal" className="w-full h-full object-contain" />
        )}

        <canvas ref={canvasRef} className="hidden" />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {active && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/90 text-destructive-foreground text-xs font-mono font-bold backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-destructive-foreground status-pulse" />
            LIVE
          </div>
        )}

        {mode && (
          <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-card/80 text-xs font-mono text-muted-foreground backdrop-blur-sm border border-border">
            {mode === 'webcam' ? 'Webcam Feed' : mode === 'video' ? 'Video Playback' : 'Image Analysis'}
          </div>
        )}
      </div>
    </div>
  );
}
