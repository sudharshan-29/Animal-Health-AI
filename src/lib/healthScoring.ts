// Health Scoring Engine
// Analyzes pose keypoints to generate health metrics

export interface Keypoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  name?: string;
}

export interface HealthScore {
  lamenessScore: number;       // 0-100 (0 = healthy, 100 = severe)
  movementAnomaly: number;     // 0-100
  stepSymmetry: number;        // 0-100 (100 = perfect symmetry)
  strideConsistency: number;   // 0-100
  overallHealth: number;       // 0-100 (100 = healthy)
  confidence: number;          // 0-1
}

export interface Alert {
  id: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  score?: number;
}

export interface GaitMetrics {
  stepFrequency: number;
  strideLength: number;
  leftRightRatio: number;
  speedVariation: number;
}

const FRAME_BUFFER_SIZE = 30;
let keypointBuffer: Keypoint[][] = [];

export function addKeypointFrame(keypoints: Keypoint[]) {
  keypointBuffer.push(keypoints);
  if (keypointBuffer.length > FRAME_BUFFER_SIZE) {
    keypointBuffer.shift();
  }
}

export function clearBuffer() {
  keypointBuffer = [];
}

function dist(a: Keypoint, b: Keypoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function angle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magA = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magC = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (magA === 0 || magC === 0) return 180;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magA * magC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

// Analyze static pose symmetry from a single frame
function analyzeStaticSymmetry(kps: Keypoint[]): number {
  if (kps.length < 17) return 50; // not enough keypoints

  // Compare left vs right body distances from midline
  // MediaPipe indices: 11=L shoulder, 12=R shoulder, 23=L hip, 24=R hip, 25=L knee, 26=R knee, 27=L ankle, 28=R ankle
  const pairs = [
    [11, 12], // shoulders
    [23, 24], // hips
    [25, 26], // knees
    [27, 28], // ankles
  ];

  // Midline reference: average of shoulders and hips
  const midX = kps.length > 24 ? (kps[11].x + kps[12].x + kps[23].x + kps[24].x) / 4 : (kps[11].x + kps[12].x) / 2;

  let symmetrySum = 0;
  let count = 0;

  for (const [l, r] of pairs) {
    if (l < kps.length && r < kps.length) {
      const leftDist = Math.abs(kps[l].x - midX);
      const rightDist = Math.abs(kps[r].x - midX);
      const maxDist = Math.max(leftDist, rightDist, 0.001);
      const minDist = Math.min(leftDist, rightDist);
      symmetrySum += (minDist / maxDist);
      count++;
    }
  }

  // Also compare Y positions of paired joints (should be roughly equal)
  for (const [l, r] of pairs) {
    if (l < kps.length && r < kps.length) {
      const yDiff = Math.abs(kps[l].y - kps[r].y);
      // Normalize by body height
      const bodyHeight = kps.length > 28 ? Math.abs(kps[0].y - Math.max(kps[27].y, kps[28].y)) : 0.5;
      const ySymmetry = Math.max(0, 1 - (yDiff / Math.max(bodyHeight, 0.01)) * 3);
      symmetrySum += ySymmetry;
      count++;
    }
  }

  if (count === 0) return 50;
  return Math.max(0, Math.min(100, (symmetrySum / count) * 100));
}

// Analyze posture quality from a single frame
function analyzePosture(kps: Keypoint[]): number {
  if (kps.length < 29) return 50;

  let postureScore = 100;

  // Check if body is tilted (shoulders should be roughly level)
  const shoulderTilt = Math.abs(kps[11].y - kps[12].y);
  const hipTilt = Math.abs(kps[23].y - kps[24].y);
  const bodyHeight = Math.abs(kps[0].y - Math.max(kps[27].y, kps[28].y));
  
  if (bodyHeight > 0.01) {
    // Shoulder tilt penalty
    postureScore -= (shoulderTilt / bodyHeight) * 150;
    // Hip tilt penalty
    postureScore -= (hipTilt / bodyHeight) * 150;
  }

  // Check knee angles (very bent or hyperextended = issue)
  const leftKneeAngle = angle(kps[23], kps[25], kps[27]);
  const rightKneeAngle = angle(kps[24], kps[26], kps[28]);

  // Normal knee angle during standing: ~170-180
  const leftKneeDeviation = Math.abs(175 - leftKneeAngle);
  const rightKneeDeviation = Math.abs(175 - rightKneeAngle);
  postureScore -= (leftKneeDeviation / 180) * 30;
  postureScore -= (rightKneeDeviation / 180) * 30;

  // Check spine alignment (nose → mid-shoulder → mid-hip should be roughly straight)
  const midShoulder = { x: (kps[11].x + kps[12].x) / 2, y: (kps[11].y + kps[12].y) / 2 };
  const midHip = { x: (kps[23].x + kps[24].x) / 2, y: (kps[23].y + kps[24].y) / 2 };
  const spineDeviation = Math.abs(midShoulder.x - midHip.x);
  postureScore -= (spineDeviation / Math.max(bodyHeight, 0.01)) * 80;

  return Math.max(0, Math.min(100, postureScore));
}

// Analyze lameness indicators from pose
function analyzeLamenessFromPose(kps: Keypoint[]): number {
  if (kps.length < 29) return 0;

  let lamenessIndicators = 0;

  // Weight distribution asymmetry (check hip-ankle alignment differences)
  const leftLegLength = dist(kps[23], kps[25]) + dist(kps[25], kps[27]);
  const rightLegLength = dist(kps[24], kps[26]) + dist(kps[26], kps[28]);
  const legRatio = Math.min(leftLegLength, rightLegLength) / Math.max(leftLegLength, rightLegLength, 0.001);
  lamenessIndicators += (1 - legRatio) * 100;

  // Check for favoring one side (body lean)
  const midHip = (kps[23].x + kps[24].x) / 2;
  const midAnkle = (kps[27].x + kps[28].x) / 2;
  const bodyLean = Math.abs(midHip - midAnkle);
  lamenessIndicators += bodyLean * 80;

  // Knee angle asymmetry
  const leftKnee = angle(kps[23], kps[25], kps[27]);
  const rightKnee = angle(kps[24], kps[26], kps[28]);
  const kneeAsymmetry = Math.abs(leftKnee - rightKnee) / 180;
  lamenessIndicators += kneeAsymmetry * 60;

  return Math.max(0, Math.min(100, lamenessIndicators));
}

// Temporal analysis functions
function analyzeStepSymmetry(frames: Keypoint[][]): number {
  if (frames.length < 2) {
    return analyzeStaticSymmetry(frames[0]);
  }

  const leftMovements: number[] = [];
  const rightMovements: number[] = [];

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];
    if (prev.length > 28 && curr.length > 28) {
      leftMovements.push(dist(prev[27], curr[27]));
      rightMovements.push(dist(prev[28], curr[28]));
    }
  }

  if (leftMovements.length === 0) {
    return analyzeStaticSymmetry(frames[frames.length - 1]);
  }

  const leftAvg = leftMovements.reduce((a, b) => a + b, 0) / leftMovements.length;
  const rightAvg = rightMovements.reduce((a, b) => a + b, 0) / rightMovements.length;
  const maxAvg = Math.max(leftAvg, rightAvg, 0.0001);
  const ratio = Math.min(leftAvg, rightAvg) / maxAvg;
  return Math.min(100, ratio * 100);
}

function analyzeMovementConsistency(frames: Keypoint[][]): number {
  if (frames.length < 2) {
    return analyzePosture(frames[0]);
  }

  const movements: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    let totalMovement = 0;
    const count = Math.min(frames[i].length, frames[i - 1].length);
    for (let j = 0; j < count; j++) {
      totalMovement += dist(frames[i - 1][j], frames[i][j]);
    }
    movements.push(totalMovement / Math.max(count, 1));
  }

  const mean = movements.reduce((a, b) => a + b, 0) / movements.length;
  const variance = movements.reduce((sum, m) => sum + (m - mean) ** 2, 0) / movements.length;
  const cv = Math.sqrt(variance) / Math.max(mean, 0.001);

  return Math.max(0, Math.min(100, 100 - cv * 200));
}

export function computeHealthScore(): HealthScore {
  const frames = [...keypointBuffer];

  if (frames.length === 0) {
    return {
      lamenessScore: 0, movementAnomaly: 0, stepSymmetry: 0,
      strideConsistency: 0, overallHealth: 0, confidence: 0,
    };
  }

  const latestFrame = frames[frames.length - 1];
  const symmetry = analyzeStepSymmetry(frames);
  const consistency = analyzeMovementConsistency(frames);
  const lamenessFromPose = analyzeLamenessFromPose(latestFrame);

  // Lameness: blend temporal and static analysis
  const temporalLameness = Math.max(0, Math.min(100, (100 - symmetry) * 2));
  const lamenessScore = frames.length >= 5
    ? temporalLameness * 0.7 + lamenessFromPose * 0.3
    : lamenessFromPose * 0.5 + temporalLameness * 0.5;

  const movementAnomaly = Math.max(0, Math.min(100, (100 - consistency) * 1.5));

  const overallHealth = Math.max(0, Math.min(100,
    symmetry * 0.3 + consistency * 0.3 + (100 - lamenessScore) * 0.2 + (100 - movementAnomaly) * 0.2
  ));

  const confidence = frames.length === 1 ? 0.4 : Math.min(1, frames.length / FRAME_BUFFER_SIZE);

  return {
    lamenessScore: Math.round(lamenessScore * 10) / 10,
    movementAnomaly: Math.round(movementAnomaly * 10) / 10,
    stepSymmetry: Math.round(symmetry * 10) / 10,
    strideConsistency: Math.round(consistency * 10) / 10,
    overallHealth: Math.round(overallHealth * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
  };
}

export function generateAlerts(score: HealthScore): Alert[] {
  const alerts: Alert[] = [];
  if (score.confidence === 0) return alerts;
  const now = new Date();

  if (score.lamenessScore > 60) {
    alerts.push({
      id: `lameness-${now.getTime()}`,
      type: 'critical',
      message: `Severe lameness detected (score: ${score.lamenessScore})`,
      timestamp: now, score: score.lamenessScore,
    });
  } else if (score.lamenessScore > 30) {
    alerts.push({
      id: `lameness-${now.getTime()}`,
      type: 'warning',
      message: `Mild lameness indicators (score: ${score.lamenessScore})`,
      timestamp: now, score: score.lamenessScore,
    });
  }

  if (score.movementAnomaly > 50) {
    alerts.push({
      id: `anomaly-${now.getTime()}`,
      type: 'warning',
      message: `Abnormal movement pattern (anomaly: ${score.movementAnomaly})`,
      timestamp: now, score: score.movementAnomaly,
    });
  } else if (score.movementAnomaly > 25) {
    alerts.push({
      id: `anomaly-${now.getTime()}`,
      type: 'info',
      message: `Minor movement irregularity (anomaly: ${score.movementAnomaly})`,
      timestamp: now, score: score.movementAnomaly,
    });
  }

  if (score.stepSymmetry < 60) {
    alerts.push({
      id: `symmetry-${now.getTime()}`,
      type: 'critical',
      message: `Significant gait asymmetry (symmetry: ${score.stepSymmetry}%)`,
      timestamp: now, score: score.stepSymmetry,
    });
  } else if (score.stepSymmetry < 80) {
    alerts.push({
      id: `symmetry-${now.getTime()}`,
      type: 'warning',
      message: `Moderate asymmetry detected (symmetry: ${score.stepSymmetry}%)`,
      timestamp: now, score: score.stepSymmetry,
    });
  }

  if (score.overallHealth < 50) {
    alerts.push({
      id: `health-${now.getTime()}`,
      type: 'critical',
      message: `Overall health score critically low (${score.overallHealth}%)`,
      timestamp: now, score: score.overallHealth,
    });
  } else if (score.overallHealth < 70) {
    alerts.push({
      id: `health-${now.getTime()}`,
      type: 'warning',
      message: `Overall health below normal (${score.overallHealth}%)`,
      timestamp: now, score: score.overallHealth,
    });
  }

  if (alerts.length === 0 && score.confidence > 0) {
    alerts.push({
      id: `ok-${now.getTime()}`,
      type: 'info',
      message: `All metrics within normal range (health: ${score.overallHealth}%)`,
      timestamp: now, score: score.overallHealth,
    });
  }

  return alerts;
}

export function computeGaitMetrics(): GaitMetrics {
  const frames = [...keypointBuffer];
  
  if (frames.length < 2) {
    if (frames.length === 1 && frames[0].length > 28) {
      const kps = frames[0];
      const leftLeg = dist(kps[23], kps[25]) + dist(kps[25], kps[27]);
      const rightLeg = dist(kps[24], kps[26]) + dist(kps[26], kps[28]);
      const ratio = Math.round((Math.min(leftLeg, rightLeg) / Math.max(leftLeg, rightLeg, 0.001)) * 100) / 100;
      return {
        stepFrequency: 0,
        strideLength: Math.round((leftLeg + rightLeg) / 2 * 500) / 10,
        leftRightRatio: ratio,
        speedVariation: 0,
      };
    }
    return { stepFrequency: 0, strideLength: 0, leftRightRatio: 0, speedVariation: 0 };
  }

  const movements: number[] = [];
  let leftTotal = 0, rightTotal = 0, legCount = 0;

  for (let i = 1; i < frames.length; i++) {
    let total = 0;
    const count = Math.min(frames[i].length, frames[i - 1].length);
    for (let j = 0; j < count; j++) {
      total += dist(frames[i - 1][j], frames[i][j]);
    }
    movements.push(total / Math.max(count, 1));

    if (frames[i].length > 28 && frames[i - 1].length > 28) {
      leftTotal += dist(frames[i - 1][27], frames[i][27]);
      rightTotal += dist(frames[i - 1][28], frames[i][28]);
      legCount++;
    }
  }

  const avgMovement = movements.reduce((a, b) => a + b, 0) / movements.length;
  const variance = movements.reduce((s, m) => s + (m - avgMovement) ** 2, 0) / movements.length;

  const lrRatio = legCount > 0
    ? Math.round((Math.min(leftTotal, rightTotal) / Math.max(leftTotal, rightTotal, 0.001)) * 100) / 100
    : 0;

  return {
    stepFrequency: Math.round(avgMovement * 300) / 10,
    strideLength: Math.round(avgMovement * 500) / 10,
    leftRightRatio: lrRatio,
    speedVariation: Math.round(Math.sqrt(variance) * 1000) / 10,
  };
}
