import { pipeline, env } from '@xenova/transformers';

// Configure environment for browser usage
env.allowLocalModels = false;
env.useBrowserCache = true;

let detectorPipeline: any = null;
let initializing = false;

export async function initYoloAI() {
  if (detectorPipeline) return detectorPipeline;
  if (initializing) return null; // Prevent multiple concurrent inits
  
  initializing = true;
  try {
    // Using YOLOv8 nano for optimal browser performance
    detectorPipeline = await pipeline('object-detection', 'Xenova/yolov8n');
    console.log("YOLO AI pipeline initialized.");
  } catch (error) {
    console.error("Failed to initialize YOLO AI:", error);
  } finally {
    initializing = false;
  }
  
  return detectorPipeline;
}

export type BoundingBox = {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
};

export type DetectionResult = {
  label: string;
  score: number;
  box: BoundingBox;
};

export async function detectAnimalROI(dataUrl: string): Promise<DetectionResult | null> {
  if (!detectorPipeline) {
    await initYoloAI();
  }
  if (!detectorPipeline) return null;

  try {
    const results = await detectorPipeline(dataUrl);
    // Common veterinary/animal classes in COCO
    const animalClasses = ['dog', 'cat', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'bird'];
    
    const detections = (results as any[])
      .filter(r => animalClasses.includes(r.label) && r.score > 0.35)
      .sort((a, b) => b.score - a.score);
    
    // Return the primary subject
    return detections[0] || null;
  } catch (error) {
    console.error("YOLO AI detection failed:", error);
    return null;
  }
}

/**
 * Utility to crop a dataURL image to a specific bounding box
 */
export async function cropImageToROI(dataUrl: string, box: BoundingBox): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const width = (box.xmax - box.xmin) * img.width;
      const height = (box.ymax - box.ymin) * img.height;
      const x = box.xmin * img.width;
      const y = box.ymin * img.height;

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
