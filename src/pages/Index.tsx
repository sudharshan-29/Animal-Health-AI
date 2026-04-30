import { type ChangeEvent, type ElementType, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bone,
  CheckCircle2,
  Clock3,
  FileImage,
  FileVideo,
  Gauge,
  Layers3,
  Pause,
  Play,
  RefreshCw,
  Route,
  ScanLine,
  ShieldCheck,
  Trees,
  Upload,
  Workflow,
  XCircle,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { toast } from 'sonner';
import {
  AnimalProfile,
  DiagnosticAlert,
  PoseFrame,
  TemporalMetrics,
  computeTemporalMetrics,
  createPoseFrame,
  drawAdaptivePoseOverlay,
  emptyTemporalMetrics,
  getVideoRect,
  inferAnimalProfile,
  mapMediaPipeToAnimal,
  clearSmoothingBuffer,
} from '@/lib/adaptivePose';
import { detectVisualAnomalies, VisionResult } from '@/lib/visionAI';
import { detectAnimalROI, cropImageToROI, DetectionResult } from '@/lib/yoloAI';

const scoreFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function PanelHeader({
  icon: Icon,
  title,
  meta,
}: {
  icon: ElementType;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          {meta && <p className="truncate text-[11px] text-muted-foreground">{meta}</p>}
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const displayValue = invert ? 100 - value : value;
  const colorClass = displayValue >= 80 ? 'bg-success' : displayValue >= 60 ? 'bg-warning' : 'bg-destructive';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium text-foreground">{scoreFormatter.format(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-muted">
        <div className={`h-full rounded-sm ${colorClass}`} style={{ width: `${Math.max(0, Math.min(100, displayValue))}%` }} />
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="font-mono text-xl font-semibold text-foreground">
        {value}
        {suffix && <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'active' | 'watch' }) {
  const toneClass = {
    neutral: 'border-border bg-muted text-muted-foreground',
    active: 'border-success/25 bg-success/10 text-success',
    watch: 'border-warning/25 bg-warning/10 text-warning',
  }[tone];

  return (
    <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

function UploadPanel({
  fileName,
  videoUrl,
  profile,
  videoInfo,
  onUpload,
}: {
  fileName: string;
  videoUrl: string | null;
  profile: AnimalProfile | null;
  videoInfo: { width: number; height: number; duration: number } | null;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <PanelHeader icon={Upload} title="Video Upload" meta="Clinical review input" />
      <div className="space-y-4 p-4">
        <label className="flex min-h-[168px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/25 px-4 py-6 text-center transition hover:border-primary/40 hover:bg-primary/5">
          <input className="hidden" type="file" accept="video/*,image/*" onChange={onUpload} />
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-card text-primary ring-1 ring-border">
            <FileImage className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-foreground">{videoUrl ? 'Replace media' : 'Upload animal media'}</span>
          <span className="mt-1 max-w-[210px] text-xs leading-5 text-muted-foreground">
            MP4, JPG, PNG, WebM - image or video diagnostics.
          </span>
        </label>

        <div className="space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Case file</p>
            <p className="mt-1 truncate text-sm font-medium text-foreground">{fileName || 'No video selected'}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <MetricTile icon={Clock3} label="Duration" value={videoInfo ? formatDuration(videoInfo.duration) : '--'} />
            <MetricTile icon={Gauge} label="Resolution" value={videoInfo ? `${videoInfo.width}x${videoInfo.height}` : '--'} />
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold text-foreground">Adaptive model routing</p>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span>Detected animal</span>
              <span className="truncate font-medium text-foreground">{profile?.species ?? 'Awaiting video'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Anatomy class</span>
              <span className="font-medium text-foreground">{profile?.anatomyClass ?? '--'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Model fit</span>
              <span className="font-mono font-medium text-foreground">
                {profile ? `${Math.round(profile.confidence * 100)}%` : '--'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/20 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Animal description</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {profile ? `${profile.species} - ${profile.conditionLabel}` : 'Awaiting video'}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {profile
              ? profile.clinicalHint
              : 'Upload a video to detect the animal, identify its body structure, and describe the movement pattern.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function VideoReviewPanel({
  videoRef,
  imageRef,
  canvasRef,
  videoUrl,
  mediaType,
  profile,
  metrics,
  isPlaying,
  isProcessing,
  onLoadedMetadata,
  onPlayPause,
  onReset,
}: {
  videoRef: RefObject<HTMLVideoElement>;
  imageRef: RefObject<HTMLImageElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  videoUrl: string | null;
  mediaType: 'video' | 'image' | null;
  profile: AnimalProfile | null;
  metrics: TemporalMetrics;
  isPlaying: boolean;
  isProcessing: boolean;
  onLoadedMetadata: () => void;
  onPlayPause: () => void;
  onReset: () => void;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <PanelHeader
        icon={ScanLine}
        title="Real-Time Pose Overlay"
        meta={profile ? profile.modelName : 'Upload a video to initialize tracking'}
      />
      <div className="space-y-3 p-4">
        <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-slate-950">
          {!videoUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300">
                <Upload className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-slate-100">No video loaded</p>
              <p className="mt-1 text-xs text-slate-400">Pose overlay starts after video upload.</p>
            </div>
          )}

          {videoUrl && mediaType === 'video' && (
            <video
              ref={videoRef}
              src={videoUrl}
              className="h-full w-full object-contain"
              muted
              playsInline
              onLoadedMetadata={onLoadedMetadata}
            />
          )}

          {videoUrl && mediaType === 'image' && (
            <img 
              ref={imageRef}
              src={videoUrl} 
              className="h-full w-full object-contain"
              alt="Uploaded animal"
            />
          )}

          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs font-medium text-white">Analyzing image...</p>
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
            <StatusPill 
              label={isProcessing ? 'Analyzing image...' : (mediaType === 'image' ? 'Image Analyzed' : (isPlaying ? 'Analyzing' : 'Paused'))} 
              tone={isProcessing || isPlaying || mediaType === 'image' ? 'active' : 'neutral'} 
            />
            {profile && <StatusPill label={profile.anatomyClass} tone="active" />}
          </div>

          <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-white/10 bg-black/55 px-3 py-2 text-right backdrop-blur">
            <p className="font-mono text-sm font-semibold text-white">{metrics.frames}</p>
            <p className="text-[11px] text-slate-300">frames fused</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPlayPause}
              disabled={!videoUrl || mediaType === 'image'}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={!videoUrl}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label="Pose continuity" tone={metrics.confidence > 0.7 ? 'active' : 'neutral'} />
            <StatusPill label="Temporal fusion" tone={metrics.frames > 20 ? 'active' : 'watch'} />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrackingPanel({ profile, latestFrame }: { profile: AnimalProfile | null; latestFrame: PoseFrame | null }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <PanelHeader icon={Bone} title="Animal-Adaptive Skeleton" meta="Anatomy-specific keypoint map" />
      <div className="space-y-4 p-4">
        <div className="rounded-md border border-border bg-muted/25 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Active model</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{profile?.modelName ?? 'Awaiting video'}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricTile icon={Layers3} label="Keypoints" value={latestFrame?.keypoints.length ?? 0} />
          <MetricTile icon={ShieldCheck} label="Quality" value={latestFrame ? Math.round(latestFrame.quality * 100) : 0} suffix="%" />
        </div>

        <div>
          <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Body structure</p>
          <div className="flex flex-wrap gap-1.5">
            {(profile?.bodyStructure ?? ['Head', 'Body axis', 'Support points']).map(part => (
              <span key={part} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground">
                {part}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HealthPanel({ metrics }: { metrics: TemporalMetrics }) {
  const scoreTone = metrics.overallHealth >= 80 ? 'text-success' : metrics.overallHealth >= 60 ? 'text-warning' : 'text-destructive';

  return (
    <section className="rounded-md border border-border bg-card">
      <PanelHeader icon={Activity} title="Health Scoring Summary" meta="Motion-derived diagnostic indicators" />
      <div className="space-y-4 p-4">
        <div className="rounded-md border border-border bg-background p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Overall score</p>
              <p className={`mt-1 font-mono text-5xl font-semibold ${scoreTone}`}>
                {scoreFormatter.format(metrics.overallHealth)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-semibold text-foreground">{Math.round(metrics.confidence * 100)}%</p>
              <p className="text-[11px] text-muted-foreground">confidence</p>
            </div>
          </div>
        </div>

        <ScoreBar label="Gait symmetry" value={metrics.symmetry} />
        <ScoreBar label="Stride rhythm" value={metrics.strideRhythm} />
        <ScoreBar label="Stride consistency" value={metrics.strideConsistency} />
        <ScoreBar label="Posture balance" value={metrics.postureBalance} />
        <ScoreBar label="Lameness risk" value={metrics.lamenessRisk} invert />
        <ScoreBar label="Instability risk" value={metrics.instabilityRisk} invert />
      </div>
    </section>
  );
}

function TemporalFusionPanel({ metrics }: { metrics: TemporalMetrics }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <PanelHeader icon={Route} title="Temporal Fusion Analysis" meta="Pose continuity, stride timing, and symmetry trends" />
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
        <div className="min-h-[270px] rounded-md border border-border bg-background p-3">
          {metrics.trend.length < 2 ? (
            <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              Waiting for consecutive pose frames.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={metrics.trend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="frame" hide />
                <YAxis domain={[0, 100]} width={28} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--foreground))',
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="health" name="Health" stroke="hsl(var(--success))" strokeWidth={2.2} dot={false} />
                <Line type="monotone" dataKey="symmetry" name="Symmetry" stroke="hsl(var(--primary))" strokeWidth={1.8} dot={false} />
                <Line type="monotone" dataKey="rhythm" name="Rhythm" stroke="hsl(var(--accent))" strokeWidth={1.8} dot={false} />
                <Line type="monotone" dataKey="lameness" name="Lameness" stroke="hsl(var(--destructive))" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <MetricTile icon={Activity} label="Anomaly" value={scoreFormatter.format(metrics.anomalyScore)} suffix="/100" />
          <MetricTile icon={Route} label="Stride rate" value={metrics.strideRate.toFixed(1)} suffix="Hz eq." />
          <MetricTile icon={Layers3} label="Model fit" value={scoreFormatter.format(metrics.modelFit)} suffix="%" />
          <MetricTile icon={Clock3} label="Window" value={Math.min(metrics.frames, 96)} suffix="frames" />
        </div>
      </div>
    </section>
  );
}

function AlertsPanel({ alerts }: { alerts: DiagnosticAlert[] }) {
  const iconMap: Record<DiagnosticAlert['type'], ElementType> = {
    normal: CheckCircle2,
    watch: AlertTriangle,
    critical: AlertTriangle,
  };

  const styleMap: Record<DiagnosticAlert['type'], string> = {
    normal: 'border-success/20 bg-success/5 text-success',
    watch: 'border-warning/25 bg-warning/5 text-warning',
    critical: 'border-destructive/25 bg-destructive/5 text-destructive',
  };

  return (
    <section className="rounded-md border border-border bg-card">
      <PanelHeader icon={AlertTriangle} title="Clinical Alerts" meta="Concise anomaly flags" />
      <div className="space-y-2 p-4">
        {alerts.length === 0 && (
          <div className="rounded-md border border-border bg-muted/25 p-4 text-sm text-muted-foreground">
            No alerts yet.
          </div>
        )}

        {alerts.map(alert => {
          const Icon = iconMap[alert.type];
          return (
            <div key={alert.id} className={`rounded-md border p-3 ${styleMap[alert.type]}`}>
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">{alert.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EnvironmentPanel({ profile }: { profile: AnimalProfile | null }) {
  if (!profile) return null;
  
  return (
    <section className="rounded-md border border-border bg-card">
      <PanelHeader icon={Trees} title="Environmental Needs" meta="Species-specific habitat guidelines" />
      <div className="space-y-3 p-4">
        <div className="rounded-md border border-success/20 bg-success/5 p-3">
          <div className="flex items-center gap-1.5 text-success mb-1">
            <CheckCircle2 className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Ideal Environment</h3>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{profile.idealEnvironment}</p>
        </div>
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
          <div className="flex items-center gap-1.5 text-destructive mb-1">
            <XCircle className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Unsuitable Environment</h3>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{profile.unsuitableEnvironment}</p>
        </div>
      </div>
    </section>
  );
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remaining}`;
}

export default function Index() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number>(-1);
  const framesRef = useRef<PoseFrame[]>([]);
  const latestFrameRef = useRef<PoseFrame | null>(null);
  const frameIndexRef = useRef(0);
  const lastProcessedTimeRef = useRef(-1);
  const metricsRef = useRef<TemporalMetrics>(emptyTemporalMetrics());
  const visionResultsRef = useRef<VisionResult[]>([]);
  const lastVisionSampleRef = useRef<number>(-1);
  const lastYoloSampleRef = useRef<number>(-1);
  const currentRoiRef = useRef<DetectionResult | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'video' | 'image' | null>(null);
  const [fileName, setFileName] = useState('');
  const [videoInfo, setVideoInfo] = useState<{ width: number; height: number; duration: number } | null>(null);
  const [profile, setProfile] = useState<AnimalProfile | null>(null);
  const [latestFrame, setLatestFrame] = useState<PoseFrame | null>(null);
  const [metrics, setMetrics] = useState<TemporalMetrics>(() => emptyTemporalMetrics());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
      } catch (e) {
        console.error('Failed to load pose model:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const clearAnalysis = useCallback(() => {
    framesRef.current = [];
    latestFrameRef.current = null;
    frameIndexRef.current = 0;
    lastProcessedTimeRef.current = -1;
    const empty = emptyTemporalMetrics();
    setLatestFrame(null);
    setMetrics(empty);
    metricsRef.current = empty;
    visionResultsRef.current = [];
    lastVisionSampleRef.current = -1;
    lastYoloSampleRef.current = -1;
    currentRoiRef.current = null;
    clearSmoothingBuffer();
  }, []);

  const processImage = useCallback(async (url: string, name: string) => {
    console.log("Starting image analysis for:", name);
    setIsProcessing(true);
    
    const img = new Image();
    img.src = url;
    try {
      await new Promise((resolve, reject) => { 
        img.onload = resolve; 
        img.onerror = () => reject(new Error("Failed to load image element"));
      });
      
      const metadata = { width: img.width, height: img.height, duration: 0 };
      const inferredProfile = inferAnimalProfile(name, metadata);
      setVideoInfo(metadata);
      setProfile(inferredProfile);
      console.log("Profile inferred:", inferredProfile.species);

      if (!poseLandmarkerRef.current) {
        console.log("Waiting for pose model...");
        toast.info("Initializing AI models...");
        let attempts = 0;
        while (!poseLandmarkerRef.current && attempts < 50) {
          await new Promise(r => setTimeout(r, 200));
          attempts++;
        }
        if (!poseLandmarkerRef.current) {
          throw new Error("AI Pose model failed to load in time.");
        }
      }
      
      toast.info("Analyzing animal pose...");
      const timestamp = Date.now();
      const poseResult = poseLandmarkerRef.current.detectForVideo(img, timestamp);
      const landmarks = poseResult.landmarks[0] || [];

      // 2. ROI-Guided Detailed Analysis
      toast.info("Refining animal localization...");
      const dataUrl = url;
      const roi = await detectAnimalROI(dataUrl);
      currentRoiRef.current = roi;
      
      let finalLandmarks = landmarks;
      
      if (roi) {
        toast.info("Calibrating joint alignment...");
        const croppedUrl = await cropImageToROI(dataUrl, roi.box);
        const croppedImg = new Image();
        croppedImg.src = croppedUrl;
        await new Promise(r => croppedImg.onload = r);
        
        const croppedResult = poseLandmarkerRef.current.detectForVideo(croppedImg, timestamp + 1);
        const rawLandmarks = croppedResult.landmarks[0];
        
        if (rawLandmarks && rawLandmarks.length > 0) {
          // Map cropped landmarks back to original image space
          const boxWidth = roi.box.xmax - roi.box.xmin;
          const boxHeight = roi.box.ymax - roi.box.ymin;
          
          finalLandmarks = rawLandmarks.map(kp => ({
            ...kp,
            x: roi.box.xmin + kp.x * boxWidth,
            y: roi.box.ymin + kp.y * boxHeight,
          }));
          console.log("ROI-guided landmarks refined.");
        }
      }

      const finalKeypoints = finalLandmarks.length > 0 ? mapMediaPipeToAnimal(finalLandmarks, inferredProfile) : undefined;
      const frame = createPoseFrame(inferredProfile, timestamp, 0, name, finalKeypoints);
      
      latestFrameRef.current = frame;
      framesRef.current = [frame];
      setLatestFrame(frame);

      // Display initial metrics immediately while intensive Vision AI runs in background
      const initialMetrics = computeStableMetrics([frame], inferredProfile, emptyTemporalMetrics(), []);
      setMetrics(initialMetrics);
      metricsRef.current = initialMetrics;

      // 3. Final Diagnostic Fusion
      const anomalies = roi 
        ? await cropImageToROI(dataUrl, roi.box).then(detectVisualAnomalies)
        : await detectVisualAnomalies(dataUrl);
        
      visionResultsRef.current = anomalies;
      
      const finalMetrics = computeStableMetrics([frame], inferredProfile, initialMetrics, anomalies);
      setMetrics(finalMetrics);
      metricsRef.current = finalMetrics;
      toast.success("Analysis complete");
    } catch (err) {
      console.error('Image processing failed:', err);
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const metadata = {
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      duration: video.duration || 0,
    };
    setVideoInfo(metadata);
    setProfile(inferAnimalProfile(fileName, metadata));
    clearAnalysis();
    
    // Auto-analyze video upon load
    void video.play();
  }, [clearAnalysis, fileName]);

  const handleUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    
    const type = file.type.startsWith('image/') ? 'image' : 'video';
    setMediaType(type);
    setVideoUrl(nextUrl);
    setFileName(file.name);
    setVideoInfo(null);
    setProfile(null);
    setIsPlaying(false);
    clearAnalysis();
    
    if (type === 'image') {
      void processImage(nextUrl, file.name);
    }
    
    event.target.value = '';
  }, [clearAnalysis, processImage]);

  const syncCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return false;

    const width = Math.max(1, Math.round(container.clientWidth));
    const height = Math.max(1, Math.round(container.clientHeight));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    return true;
  }, []);

  const renderOverlay = useCallback(() => {
    const video = videoRef.current;
    const image = imageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx || !profile || !syncCanvas()) return;
    
    const media = mediaType === 'video' ? video : image;
    if (!media) return;

    if (mediaType === 'video' && video && !video.paused && !video.ended) {
      const shouldProcess = lastProcessedTimeRef.current < 0 || video.currentTime - lastProcessedTimeRef.current >= 1 / 18;

      if (shouldProcess) {
        let detectedKeypoints = undefined;
        const landmarker = poseLandmarkerRef.current;
        
        if (landmarker) {
          try {
            const result = landmarker.detectForVideo(video, performance.now());
            if (result.landmarks && result.landmarks.length > 0) {
              detectedKeypoints = mapMediaPipeToAnimal(result.landmarks[0], profile);
            }
          } catch (err) {
            console.warn('Pose detection skipped for frame:', err);
          }
        }

        const frame = createPoseFrame(profile, video.currentTime, frameIndexRef.current, fileName, detectedKeypoints);
        frameIndexRef.current += 1;
        lastProcessedTimeRef.current = video.currentTime;
        latestFrameRef.current = frame;
        framesRef.current = [...framesRef.current.slice(-143), frame];

        if (frame.frameIndex % 2 === 0) {
          setLatestFrame(frame);
        }

        if (frame.frameIndex % 3 === 0) {
          const nextMetrics = computeStableMetrics(framesRef.current, profile, metricsRef.current, visionResultsRef.current);
          metricsRef.current = nextMetrics;
          setMetrics(nextMetrics);
        }

        // Run YOLO Object Detection every 60 frames (~2s) to localize the animal
        if (frame.frameIndex - lastYoloSampleRef.current >= 60) {
          lastYoloSampleRef.current = frame.frameIndex;
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            detectAnimalROI(dataUrl).then(roi => {
              currentRoiRef.current = roi;
            });
          } catch (err) {
            console.warn('YOLO localization failed:', err);
          }
        }

        // Run Vision AI sample every 45 frames (~1.5s) to detect wounds/blood
        if (frame.frameIndex - lastVisionSampleRef.current >= 45) {
          lastVisionSampleRef.current = frame.frameIndex;
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            
            // If we have a YOLO ROI, crop the image for much better CLIP accuracy
            const analysisTask = currentRoiRef.current 
              ? cropImageToROI(dataUrl, currentRoiRef.current.box).then(detectVisualAnomalies)
              : detectVisualAnomalies(dataUrl);

            analysisTask.then(results => {
              visionResultsRef.current = results;
            });
          } catch (err) {
            console.warn('Vision sampling failed:', err);
          }
        }
      }
    }

    const rect = getVideoRect(media, canvas);
    const visionAnomalies = visionResultsRef.current
      .filter(r => r.score > 0.38 && (
        r.label.includes('wound') || 
        r.label.includes('lesion') || 
        r.label.includes('injury') ||
        r.label.includes('limp') ||
        r.label.includes('stiff') ||
        r.label.includes('swelling')
      ))
      .map(r => ({ region: r.region || 'unknown', score: r.score, label: r.label }));
    
    drawAdaptivePoseOverlay(
      ctx, 
      latestFrameRef.current, 
      profile, 
      rect, 
      metricsRef.current.lamenessRisk, 
      visionAnomalies,
      currentRoiRef.current?.box
    );
  }, [fileName, profile, syncCanvas, mediaType]);

  useEffect(() => {
    if (!videoUrl || !profile) return undefined;

    const tick = () => {
      renderOverlay();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [profile, renderOverlay, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoUrl]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }, [videoUrl]);

  const handleReset = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setIsPlaying(false);
    clearAnalysis();
    renderOverlay();
  }, [clearAnalysis, renderOverlay]);

  const headerStatus = useMemo(() => {
    if (!videoUrl) return 'Awaiting upload';
    if (isPlaying) return 'Analyzing video';
    return 'Ready for review';
  }, [isPlaying, videoUrl]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ScanLine className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-foreground">Animal Health AI</h1>
              <p className="truncate text-xs text-muted-foreground">Adaptive pose detection and temporal motion diagnostics</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={headerStatus} tone={isPlaying ? 'active' : 'neutral'} />
            <StatusPill label="All-animal router" tone="active" />
            <StatusPill label="Temporal fusion core" tone={metrics.frames > 20 ? 'active' : 'watch'} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-4 md:px-6 md:py-5">
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <UploadPanel
            fileName={fileName}
            videoUrl={videoUrl}
            profile={profile}
            videoInfo={videoInfo}
            onUpload={handleUpload}
          />

          <div className="space-y-4">
            <VideoReviewPanel
              videoRef={videoRef}
              imageRef={imageRef}
              canvasRef={canvasRef}
              videoUrl={videoUrl}
              mediaType={mediaType}
              profile={profile}
              metrics={metrics}
              isPlaying={isPlaying}
              isProcessing={isProcessing}
              onLoadedMetadata={handleLoadedMetadata}
              onPlayPause={handlePlayPause}
              onReset={handleReset}
            />
            <EnvironmentPanel profile={profile} />
          </div>

          <div className="space-y-4">
            <HealthPanel metrics={metrics} />
            <TrackingPanel profile={profile} latestFrame={latestFrame} />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <TemporalFusionPanel metrics={metrics} />
          <div className="space-y-4">
            <AlertsPanel alerts={metrics.alerts} />
          </div>
        </div>
      </main>
    </div>
  );
}

function computeStableMetrics(frames: PoseFrame[], profile: AnimalProfile, prev: TemporalMetrics, visionResults: VisionResult[]) {
  const visionAnomalies = visionResults
    .filter(r => r.score > 0.38 && (
      r.label.includes('wound') || 
      r.label.includes('lesion') || 
      r.label.includes('injury') ||
      r.label.includes('limp') ||
      r.label.includes('stiff') ||
      r.label.includes('scar') ||
      r.label.includes('swelling')
    ))
    .map(r => ({ region: r.region || 'unknown', score: r.score, label: r.label }));

  const raw = computeTemporalMetrics(frames, profile, visionAnomalies);
  raw.visionAnomalies = visionAnomalies;
  
  if (prev.frames === 0 || frames.length < 5) return raw;

  // Smoothing: Faster response for acute changes (injuries), slower for health recovery
  const isDeclining = raw.overallHealth < prev.overallHealth - 5;
  const alpha = isDeclining ? 0.35 : 0.12; 

  return {
    ...raw,
    overallHealth: Math.round(prev.overallHealth * (1 - alpha) + raw.overallHealth * alpha),
    symmetry: Math.round(prev.symmetry * (1 - alpha) + raw.symmetry * alpha),
    strideRhythm: Math.round(prev.strideRhythm * (1 - alpha) + raw.strideRhythm * alpha),
    strideConsistency: Math.round(prev.strideConsistency * (1 - alpha) + raw.strideConsistency * alpha),
    postureBalance: Math.round(prev.postureBalance * (1 - alpha) + raw.postureBalance * alpha),
    lamenessRisk: Math.round(prev.lamenessRisk * (1 - alpha) + raw.lamenessRisk * alpha),
    instabilityRisk: Math.round(prev.instabilityRisk * (1 - alpha) + raw.instabilityRisk * alpha),
    anomalyScore: Math.round(prev.anomalyScore * (1 - alpha) + raw.anomalyScore * alpha),
  };
}
