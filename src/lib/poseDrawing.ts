// Pose skeleton drawing utilities
// Draws keypoints and connections on a canvas overlay

import type { Keypoint } from './healthScoring';

// MediaPipe pose connections (pairs of keypoint indices)
const POSE_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7],    // face
  [0, 4], [4, 5], [5, 6], [6, 8],    // face
  [9, 10],                             // mouth
  [11, 12],                            // shoulders
  [11, 13], [13, 15],                  // left arm
  [12, 14], [14, 16],                  // right arm
  [11, 23], [12, 24],                  // torso
  [23, 24],                            // hips
  [23, 25], [25, 27],                  // left leg
  [24, 26], [26, 28],                  // right leg
  [27, 29], [29, 31],                  // left foot
  [28, 30], [30, 32],                  // right foot
  [15, 17], [15, 19], [15, 21],       // left hand
  [16, 18], [16, 20], [16, 22],       // right hand
];

const KEYPOINT_COLOR = '#22d3aa';
const CONNECTION_COLOR = 'rgba(34, 211, 170, 0.6)';
const HIGHLIGHT_COLOR = '#f59e0b';

export function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  keypoints: Keypoint[],
  width: number,
  height: number,
  lamenessScore: number = 0
) {
  ctx.clearRect(0, 0, width, height);

  if (keypoints.length === 0) return;

  // Draw connections
  ctx.lineWidth = 2;
  for (const [i, j] of POSE_CONNECTIONS) {
    if (i < keypoints.length && j < keypoints.length) {
      const kpA = keypoints[i];
      const kpB = keypoints[j];
      const visA = kpA.visibility ?? 1;
      const visB = kpB.visibility ?? 1;

      if (visA < 0.3 || visB < 0.3) continue;

      // Highlight legs if lameness detected
      const isLeg = (i >= 23 && i <= 32) || (j >= 23 && j <= 32);
      ctx.strokeStyle = isLeg && lamenessScore > 30 ? HIGHLIGHT_COLOR : CONNECTION_COLOR;
      ctx.globalAlpha = Math.min(visA, visB);

      ctx.beginPath();
      ctx.moveTo(kpA.x * width, kpA.y * height);
      ctx.lineTo(kpB.x * width, kpB.y * height);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;

  // Draw keypoints
  for (let i = 0; i < keypoints.length; i++) {
    const kp = keypoints[i];
    const vis = kp.visibility ?? 1;
    if (vis < 0.3) continue;

    const isLeg = i >= 23 && i <= 32;
    const color = isLeg && lamenessScore > 30 ? HIGHLIGHT_COLOR : KEYPOINT_COLOR;
    const radius = isLeg && lamenessScore > 30 ? 5 : 3;

    ctx.fillStyle = color;
    ctx.globalAlpha = vis;
    ctx.beginPath();
    ctx.arc(kp.x * width, kp.y * height, radius, 0, 2 * Math.PI);
    ctx.fill();

    // Glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(kp.x * width, kp.y * height, radius * 0.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.globalAlpha = 1;
}
