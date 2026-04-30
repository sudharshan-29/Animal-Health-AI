import { pipeline, env } from '@xenova/transformers';

// Configure environment for browser usage
env.allowLocalModels = false;
env.useBrowserCache = true;

let classifierPipeline: any = null;
let initializing = false;

export async function initVisionAI() {
  if (classifierPipeline) return classifierPipeline;
  if (initializing) return null; // Prevent multiple concurrent inits
  
  initializing = true;
  try {
    classifierPipeline = await pipeline(
      'zero-shot-image-classification', 
      'Xenova/clip-vit-base-patch32'
    );
    console.log("Vision AI pipeline initialized.");
  } catch (error) {
    console.error("Failed to initialize Vision AI:", error);
  } finally {
    initializing = false;
  }
  
  return classifierPipeline;
}

export type VisionResult = {
  label: string;
  score: number;
  region?: 'head' | 'spine' | 'forelimb' | 'hindlimb' | 'body' | 'unknown';
  orientation?: 'left' | 'right' | 'front' | 'unknown';
};

export async function detectVisualAnomalies(dataUrl: string): Promise<VisionResult[]> {
  if (!classifierPipeline) {
    await initVisionAI();
  }
  if (!classifierPipeline) return [];

  const candidateLabels = [
    'wound on head', 
    'wound on forelimb', 
    'wound on hindlimb', 
    'wound on spine',
    'lesion on body',
    'bloody injury',
    'open wound on leg',
    'broken leg animal',
    'fractured limb',
    'scar on body',
    'healthy animal coat',
    'animal facing left',
    'animal facing right',
    'limping animal',
    'stiff gait',
    'swelling on leg'
  ];
  
  try {
    const results = await classifierPipeline(dataUrl, candidateLabels);
    return (results as any[]).map(r => {
      let region: VisionResult['region'] = 'unknown';
      let orientation: VisionResult['orientation'] = 'unknown';
      
      if (r.label.includes('head')) region = 'head';
      else if (r.label.includes('forelimb')) region = 'forelimb';
      else if (r.label.includes('hindlimb') || r.label.includes('leg')) region = 'hindlimb';
      else if (r.label.includes('spine')) region = 'spine';
      else if (r.label.includes('body')) region = 'body';
      
      if (r.label.includes('facing left')) orientation = 'left';
      else if (r.label.includes('facing right')) orientation = 'right';
      
      return {
        label: r.label,
        score: r.score,
        region,
        orientation
      };
    });
  } catch (error) {
    console.error("Vision AI classification failed:", error);
    return [];
  }
}
