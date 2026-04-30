import type { HealthScore } from '@/lib/healthScoring';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { BarChart3 } from 'lucide-react';

interface Props {
  scoreHistory: HealthScore[];
}

export default function GaitChart({ scoreHistory }: Props) {
  const data = scoreHistory.slice(-60).map((s, i) => ({
    t: i,
    health: s.overallHealth,
    symmetry: s.stepSymmetry,
    lameness: s.lamenessScore,
  }));

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Temporal Analysis</h3>
      </div>

      {data.length < 1 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs font-mono opacity-60">
          Waiting for pose data…
        </div>
      ) : (
        <div className="flex-1 min-h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="t" hide />
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(0, 0%, 100%)',
                  border: '1px solid hsl(215, 20%, 88%)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontFamily: 'JetBrains Mono, monospace',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                }}
                labelStyle={{ display: 'none' }}
              />
              <Line type="monotone" dataKey="health" stroke="hsl(152, 60%, 40%)" strokeWidth={2} dot={false} name="Health" />
              <Line type="monotone" dataKey="symmetry" stroke="hsl(220, 70%, 50%)" strokeWidth={1.5} dot={false} name="Symmetry" />
              <Line type="monotone" dataKey="lameness" stroke="hsl(0, 72%, 50%)" strokeWidth={1.5} dot={false} name="Lameness" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-4 text-[10px] font-mono text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-success inline-block" /> Health</span>
        <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-primary inline-block" /> Symmetry</span>
        <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded bg-destructive inline-block" /> Lameness</span>
      </div>
    </div>
  );
}
