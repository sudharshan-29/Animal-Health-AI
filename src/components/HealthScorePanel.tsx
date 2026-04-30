import { motion } from 'framer-motion';
import type { HealthScore } from '@/lib/healthScoring';
import { Activity, AlertTriangle, Footprints, TrendingUp } from 'lucide-react';

interface Props {
  score: HealthScore;
}

function ScoreGauge({ label, value, icon: Icon, invert = false }: {
  label: string;
  value: number;
  icon: React.ElementType;
  invert?: boolean;
}) {
  const displayValue = invert ? 100 - value : value;
  const color = displayValue >= 80 ? 'var(--success)' : displayValue >= 50 ? 'var(--warning)' : 'var(--destructive)';
  const colorClass = displayValue >= 80 ? 'text-success' : displayValue >= 50 ? 'text-warning' : 'text-destructive';
  const bgClass = displayValue >= 80 ? 'bg-success/5 border-success/15' : displayValue >= 50 ? 'bg-warning/5 border-warning/15' : 'bg-destructive/5 border-destructive/15';

  return (
    <div className={`relative p-3 rounded-lg border ${bgClass}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${colorClass}`} />
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${colorClass}`}>
        {value.toFixed(1)}
        <span className="text-sm text-muted-foreground ml-1">/ 100</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: `hsl(${color})` }}
          initial={{ width: 0 }}
          animate={{ width: `${displayValue}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export default function HealthScorePanel({ score }: Props) {
  const overallColor = score.overallHealth >= 80 ? 'text-success' : score.overallHealth >= 50 ? 'text-warning' : 'text-destructive';
  const overallBg = score.overallHealth >= 80 ? 'bg-success/5 border-success/15' : score.overallHealth >= 50 ? 'bg-warning/5 border-warning/15' : 'bg-destructive/5 border-destructive/15';

  return (
    <div className="flex flex-col gap-3">
      <div className={`p-4 rounded-lg border ${overallBg} text-center`}>
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Overall Health</span>
        <div className={`text-5xl font-bold mt-1 ${overallColor}`}>
          {score.overallHealth.toFixed(0)}
        </div>
        <div className="text-xs text-muted-foreground mt-1 font-mono">
          Confidence: {(score.confidence * 100).toFixed(0)}%
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ScoreGauge label="Step Symmetry" value={score.stepSymmetry} icon={Footprints} />
        <ScoreGauge label="Stride Consistency" value={score.strideConsistency} icon={TrendingUp} />
        <ScoreGauge label="Lameness" value={score.lamenessScore} icon={AlertTriangle} invert />
        <ScoreGauge label="Anomaly" value={score.movementAnomaly} icon={Activity} invert />
      </div>
    </div>
  );
}
