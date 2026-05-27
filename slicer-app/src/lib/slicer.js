import * as THREE from 'three';

// Utility: Greatest Common Divisor
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    let t = b;
    b = a % b;
    a = t;
  }
  return a;
}

// Format a collapsed sequence array into crochet shorthand
function formatSequence(seq) {
  let result = [];
  let currentStr = seq[0];
  let count = 1;
  
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === currentStr && seq[i] === 'sc') {
      count++;
    } else {
      result.push(count > 1 ? `${count}${currentStr}` : currentStr);
      currentStr = seq[i];
      count = 1;
    }
  }
  result.push(count > 1 ? `${count}${currentStr}` : currentStr);
  return result.join(', ');
}

// Distribute operations evenly to avoid seam stacking
function distribute(countA, strA, countB, strB, roundIdx) {
  if (countA <= 0 && countB <= 0) return '';
  if (countA <= 0) return `${countB}${strB}`;
  if (countB <= 0) return `${countA}${strA}`;

  const G = gcd(countA, countB);
  const periodA = countA / G;
  const periodB = countB / G;
  const periodTotal = periodA + periodB;
  
  // Stagger alternating rounds
  let phase = roundIdx % 2 === 0 ? 0 : periodTotal / 2;
  
  let periodSeq = [];
  for (let i = 0; i < periodTotal; i++) {
    phase += periodA;
    if (phase >= periodTotal) {
      phase -= periodTotal;
      periodSeq.push(strA);
    } else {
      periodSeq.push(strB);
    }
  }
  
  const periodStr = formatSequence(periodSeq);
  if (G === 1) return periodStr;
  return `${G} * [ ${periodStr} ]`;
}

// Core function to slice geometry
export function sliceGeometry(geometry, stitchWidth, stitchHeight, minStitches = 6) {
  // Ensure we have non-indexed position attributes or extract from indexed
  let positionAttribute = geometry.attributes.position;
  let indexAttribute = geometry.index;
  
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  // Find bounding box to determine start and end Z
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  const minZ = bbox.min.y; // Assuming Y is up in Three.js by default for imports
  const maxZ = bbox.max.y;
  
  // Create slices
  const numSlices = Math.floor((maxZ - minZ) / stitchHeight);
  const slices = [];
  for (let i = 0; i <= numSlices; i++) {
    slices.push({
      z: minZ + i * stitchHeight,
      perimeter: 0
    });
  }

  // Iterate over all triangles
  const numTriangles = indexAttribute ? indexAttribute.count / 3 : positionAttribute.count / 3;
  
  for (let i = 0; i < numTriangles; i++) {
    if (indexAttribute) {
      vA.fromBufferAttribute(positionAttribute, indexAttribute.getX(i * 3));
      vB.fromBufferAttribute(positionAttribute, indexAttribute.getX(i * 3 + 1));
      vC.fromBufferAttribute(positionAttribute, indexAttribute.getX(i * 3 + 2));
    } else {
      vA.fromBufferAttribute(positionAttribute, i * 3);
      vB.fromBufferAttribute(positionAttribute, i * 3 + 1);
      vC.fromBufferAttribute(positionAttribute, i * 3 + 2);
    }

    // We slice along the Y axis assuming Y is the vertical axis for most 3D models in threejs
    const triMinZ = Math.min(vA.y, vB.y, vC.y);
    const triMaxZ = Math.max(vA.y, vB.y, vC.y);

    const startSliceIdx = Math.max(0, Math.ceil((triMinZ - minZ) / stitchHeight));
    const endSliceIdx = Math.min(slices.length - 1, Math.floor((triMaxZ - minZ) / stitchHeight));

    for (let s = startSliceIdx; s <= endSliceIdx; s++) {
      const planeZ = slices[s].z;
      
      // Intersect triangle with plane Y = planeZ
      const points = [vA, vB, vC];
      let above = [];
      let below = [];
      
      for(let pt of points) {
        if(pt.y >= planeZ) above.push(pt);
        else below.push(pt);
      }

      // If all points are on one side (no strict crossing), skip
      // A crossing must have 1 point above and 2 below, or 2 above and 1 below
      if (above.length === 3 || below.length === 3) continue;

      // We have exactly 2 points on one side, 1 on the other
      const lonePt = above.length === 1 ? above[0] : below[0];
      const otherPts = above.length === 1 ? below : above;

      // Find intersection of lonePt-otherPts[0] and lonePt-otherPts[1]
      const t1 = (planeZ - lonePt.y) / (otherPts[0].y - lonePt.y);
      const t2 = (planeZ - lonePt.y) / (otherPts[1].y - lonePt.y);

      const p1 = lonePt.clone().lerp(otherPts[0], t1);
      const p2 = lonePt.clone().lerp(otherPts[1], t2);

      // Add the length of the intersection segment to the perimeter
      slices[s].perimeter += p1.distanceTo(p2);
    }
  }

  // Extract valid slices into an array
  let targetStitchesArr = [];
  for (let i = 0; i < slices.length; i++) {
    const P = slices[i].perimeter;
    if (P === 0) continue;
    const S_n = Math.max(minStitches, Math.round(P / stitchWidth));
    targetStitchesArr.push({ S_n, P, z: slices[i].z });
  }

  const pattern = [];
  if (targetStitchesArr.length === 0) return { pattern, minZ, maxZ, slices };

  const finalTargets = [];
  const firstSlice = targetStitchesArr[0];
  const lastSlice = targetStitchesArr[targetStitchesArr.length - 1];

  // BOTTOM CAP INJECTION
  if (firstSlice.S_n > minStitches) {
    let current = minStitches;
    finalTargets.push({
      S_n: current,
      P: current * stitchWidth,
      z: firstSlice.z
    });
    
    while (current < firstSlice.S_n) {
      let inc = Math.min(minStitches, firstSlice.S_n - current);
      current += inc;
      if (current < firstSlice.S_n) {
        finalTargets.push({
          S_n: current,
          P: current * stitchWidth,
          z: firstSlice.z
        });
      }
    }
  }

  // MIDDLE SLICES
  for (let s of targetStitchesArr) {
    finalTargets.push(s);
  }

  // TOP CAP INJECTION
  if (lastSlice.S_n > minStitches) {
    let current = lastSlice.S_n;
    while (current > minStitches) {
      let maxDec = Math.floor(current / 2);
      let dec = Math.min(minStitches, maxDec, current - minStitches);
      if (dec <= 0) break; // Sanity check
      current -= dec;
      
      finalTargets.push({
        S_n: current,
        P: current * stitchWidth,
        z: lastSlice.z
      });
    }
  }

  // Generate Pattern from finalTargets
  let prevStitches = 0;

  for (let i = 0; i < finalTargets.length; i++) {
    const target = finalTargets[i];
    const S_n = target.S_n;
    const roundIdx = pattern.length + 1;
    let instruction = "";

    if (prevStitches === 0) {
      instruction = `Magic Ring: ${S_n}sc`;
    } else {
      const delta = S_n - prevStitches;
      
      if (delta === 0) {
        instruction = `${S_n}sc`;
      } else if (delta > 0) {
        let K = delta;
        K = Math.min(K, prevStitches); // Cap increases
        let scCount = prevStitches - K;
        instruction = distribute(K, 'sc2inc', scCount, 'sc', roundIdx);
      } else {
        let K = Math.abs(delta);
        const maxK = Math.floor(prevStitches / 2);
        if (K > maxK) K = maxK;
        let scCount = prevStitches - 2 * K;
        instruction = distribute(K, 'sc2tog', scCount, 'sc', roundIdx);
      }
    }

    pattern.push({
      round: roundIdx,
      stitches: S_n,
      instruction: instruction,
      perimeter: target.P,
      z: target.z
    });

    prevStitches = S_n;
  }

  return { pattern, minZ, maxZ, slices };
}
