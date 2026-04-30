import type { GaitMetrics } from '@/lib/healthScoring';
import { Cpu, Clock, Layers, Gauge } from 'lucide-react';

interface Props {
  frameCount: number;
  gaitMetrics: GaitMetrics;
  isActive: boolean;
}

export default function SystemStatus({ frameCount, gaitMetrics, isActive }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-1.5 mb-1">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Frames</span>
        </div>
        <span className="text-xl font-bold text-foreground">{frameCount}</span>
      </div>

      <div className="p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-1.5 mb-1">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Step Freq</span>
        </div>
        <span className="text-xl font-bold text-foreground">{gaitMetrics.stepFrequency}</span>
      </div>

      <div className="p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-1.5 mb-1">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-mono text-muted-foreground uppercase">L/R Ratio</span>
        </div>
        <span className="text-xl font-bold text-foreground">{gaitMetrics.leftRightRatio}</span>
      </div>

      <div className="p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-1.5 mb-1">
          <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Status</span>
        </div>
        <span className={`text-sm font-mono font-bold ${isActive ? 'text-success' : 'text-muted-foreground'}`}>
          {isActive ? 'ACTIVE' : 'IDLE'}
        </span>
      </div>
    </div>
  );
}
