import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Loader2, AlertCircle, CheckCircle, XCircle, Stethoscope, Eye, Shield, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export interface AIHealthScores {
  overallHealth: number;
  lamenessScore: number;
  movementAnomaly: number;
  stepSymmetry: number;
  strideConsistency: number;
  bodyConditionScore?: number;
}

export interface AnimalAnalysis {
  animalType: string;
  confidence: number;
  appearance: {
    bodyCondition?: string;
    coatCondition?: string;
    posture?: string;
    overallAppearance?: string;
  };
  healthAssessment: {
    overallStatus: string;
    possibleIssues?: string[];
    painIndicators?: string[];
    mobilityAssessment?: string;
  };
  injuryAnalysis: {
    visibleInjuries?: string[];
    suspectedInjuries?: string[];
    affectedAreas?: string[];
    severity: string;
  };
  healthScores?: AIHealthScores;
  recommendations?: string[];
  summary: string;
}

interface Props {
  imageDataUrl: string | null;
  poseData: unknown;
  onHealthScores?: (scores: AIHealthScores) => void;
}

const statusColors: Record<string, string> = {
  healthy: 'text-success',
  'mild concern': 'text-warning',
  'moderate concern': 'text-warning',
  urgent: 'text-destructive',
  unknown: 'text-muted-foreground',
};

const severityColors: Record<string, string> = {
  none: 'text-success',
  mild: 'text-warning',
  moderate: 'text-warning',
  severe: 'text-destructive',
  unknown: 'text-muted-foreground',
};

const statusIcons: Record<string, React.ElementType> = {
  healthy: CheckCircle,
  'mild concern': AlertCircle,
  'moderate concern': AlertCircle,
  urgent: XCircle,
};

export default function AIAnalysisPanel({ imageDataUrl, poseData, onHealthScores }: Props) {
  const [analysis, setAnalysis] = useState<AnimalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    if (!imageDataUrl) {
      toast.error('Please upload an image or capture from webcam first');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-animal', {
        body: { imageBase64: imageDataUrl, poseData },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (data?.analysis) {
        setAnalysis(data.analysis);
        if (data.analysis.healthScores && onHealthScores) {
          onHealthScores(data.analysis.healthScores);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const status = analysis?.healthAssessment?.overallStatus || 'unknown';
  const StatusIcon = statusIcons[status] || AlertCircle;

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={analyze}
        disabled={loading || !imageDataUrl}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing with AI…
          </>
        ) : (
          <>
            <Brain className="w-4 h-4" />
            Run AI Health Analysis
          </>
        )}
      </button>

      {!imageDataUrl && !analysis && (
        <p className="text-xs text-muted-foreground font-mono text-center opacity-60">
          Upload an image to enable AI analysis
        </p>
      )}

      {error && (
        <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs font-mono">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {analysis && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-4"
          >
            {/* Animal ID */}
            <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Identified Animal</span>
                <span className="text-[10px] font-mono text-primary font-bold">{analysis.confidence}% confidence</span>
              </div>
              <h3 className="text-xl font-bold text-primary">{analysis.animalType}</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{analysis.summary}</p>
            </div>

            {/* Health Status */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Stethoscope className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Health Assessment</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <StatusIcon className={`w-5 h-5 ${statusColors[status]}`} />
                <span className={`text-lg font-bold capitalize ${statusColors[status]}`}>
                  {status}
                </span>
              </div>
              {analysis.healthAssessment.mobilityAssessment && (
                <div className="text-xs text-muted-foreground mb-2">
                  <span className="font-medium text-foreground">Mobility:</span> {analysis.healthAssessment.mobilityAssessment}
                </div>
              )}
              {analysis.healthAssessment.possibleIssues && analysis.healthAssessment.possibleIssues.length > 0 && (
                <div className="mt-2">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Possible Issues</span>
                  <ul className="mt-1 space-y-1">
                    {analysis.healthAssessment.possibleIssues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-warning">
                        <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.healthAssessment.painIndicators && analysis.healthAssessment.painIndicators.length > 0 && (
                <div className="mt-3">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Pain Indicators</span>
                  <ul className="mt-1 space-y-1">
                    {analysis.healthAssessment.painIndicators.map((p, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                        <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Appearance */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Appearance</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {analysis.appearance.bodyCondition && (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[10px] font-mono">Body</span>
                    <span className="font-medium capitalize">{analysis.appearance.bodyCondition}</span>
                  </div>
                )}
                {analysis.appearance.coatCondition && (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[10px] font-mono">Coat</span>
                    <span className="font-medium capitalize">{analysis.appearance.coatCondition}</span>
                  </div>
                )}
                {analysis.appearance.posture && (
                  <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[10px] font-mono">Posture</span>
                    <span className="font-medium capitalize">{analysis.appearance.posture}</span>
                  </div>
                )}
              </div>
              {analysis.appearance.overallAppearance && (
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{analysis.appearance.overallAppearance}</p>
              )}
            </div>

            {/* Injury Analysis */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Injury Analysis</span>
                </div>
                <span className={`text-xs font-mono font-bold capitalize ${severityColors[analysis.injuryAnalysis.severity]}`}>
                  {analysis.injuryAnalysis.severity}
                </span>
              </div>
              {analysis.injuryAnalysis.visibleInjuries && analysis.injuryAnalysis.visibleInjuries.length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] font-mono text-destructive uppercase">Visible Injuries</span>
                  <ul className="mt-1 space-y-1">
                    {analysis.injuryAnalysis.visibleInjuries.map((inj, i) => (
                      <li key={i} className="text-xs text-destructive flex items-start gap-1.5">
                        <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" /> {inj}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.injuryAnalysis.suspectedInjuries && analysis.injuryAnalysis.suspectedInjuries.length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] font-mono text-warning uppercase">Suspected Injuries</span>
                  <ul className="mt-1 space-y-1">
                    {analysis.injuryAnalysis.suspectedInjuries.map((inj, i) => (
                      <li key={i} className="text-xs text-warning flex items-start gap-1.5">
                        <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" /> {inj}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(!analysis.injuryAnalysis.visibleInjuries?.length && !analysis.injuryAnalysis.suspectedInjuries?.length) && (
                <p className="text-xs text-success font-mono">No injuries detected</p>
              )}
            </div>

            {/* Recommendations */}
            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <div className="p-4 rounded-lg border border-primary/15 bg-primary/5">
                <span className="text-[10px] font-mono text-primary uppercase tracking-widest font-bold">Recommendations</span>
                <ul className="mt-2 space-y-2">
                  {analysis.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 text-[10px] font-bold font-mono">
                        {i + 1}
                      </span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
