import * as THREE from 'three';

export function sanitizeHumanPattern(rawText, stitchWidth, stitchHeight) {
  const lines = rawText.split('\n');
  const parsedPattern = [];
  const errors = [];
  
  let currentZ = 0;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    
    let targetStitches = null;
    const stitchMatch = line.match(/[\(\[=]\s*(\d+)\s*[\)\]]?$/);
    if (stitchMatch) {
      targetStitches = parseInt(stitchMatch[1]);
      line = line.replace(stitchMatch[0], '').trim();
    }
    
    let roundNum = parsedPattern.length + 1;
    const roundMatch = line.match(/^(?:Round|Rnd|R)?\s*(\d+)[\.\:\-]?\s*(.*)$/i);
    let instructionRaw = line;
    if (roundMatch) {
      roundNum = parseInt(roundMatch[1]);
      instructionRaw = roundMatch[2].trim();
    }
    
    let sanitized = instructionRaw.toLowerCase();
    
    if (sanitized.includes('magic ring') || sanitized.includes('mr') || sanitized.includes('mc')) {
      const mrStitches = sanitized.match(/(\d+)\s*(?:sc|single crochet)/);
      const count = mrStitches ? mrStitches[1] : (targetStitches || 6);
      sanitized = `Magic Ring: ${count}sc`;
    } else {
      sanitized = sanitized.replace(/single crochet/gi, 'sc');
      sanitized = sanitized.replace(/(sc2inc|increase|inc)/gi, 'inc');
      sanitized = sanitized.replace(/(sc2tog|decrease|invdec|dec)/gi, 'dec');
      sanitized = sanitized.replace(/\(/g, '[').replace(/\)/g, ']');

      sanitized = sanitized.replace(/\[([^\]]+)\]\s*(?:x|\*|times)\s*(\d+)/gi, "[$1] * $2");
      sanitized = sanitized.replace(/(\d+)\s*(?:x|\*|times)\s*\[([^\]]+)\]/gi, "[$2] * $1");
      
      sanitized = sanitized.replace(/([a-z0-9\s,]+)\s*(?:x|\*|times)\s*(\d+)/gi, (match, p1, p2) => {
        if (p1.includes('*') || p1.includes('[')) return match;
        return `[${p1.trim()}] * ${p2}`;
      });
      sanitized = sanitized.replace(/(\d+)\s*(?:x|\*|times)\s*([a-z0-9\s,]+)/gi, (match, p1, p2) => {
        if (p2.includes('*') || p2.includes('[')) return match;
        return `[${p2.trim()}] * ${p1}`;
      });
      
      sanitized = sanitized.replace(/(\d+)\s+(sc|inc|dec)/gi, "$1$2");
      sanitized = sanitized.replace(/(sc|inc|dec)\s+(\d+)/gi, "$2$1");
    }
    
    let ops = [];
    try {
      const mockP = { instruction: sanitized, round: roundNum, stitches: targetStitches || 1 };
      ops = parsePattern([{...mockP}]);
      
      if (!targetStitches) {
        targetStitches = ops.reduce((sum, op) => sum + (op.type === 'inc' ? 2 : 1), 0);
      }
      
      if (ops.length === 0) throw new Error("Empty operations");
      
    } catch (e) {
      errors.push({ lineIndex: i, raw: lines[i], error: "Syntax Error" });
      continue;
    }
    
    const perimeter = targetStitches * stitchWidth;
    
    parsedPattern.push({
      round: roundNum,
      instruction: sanitized,
      stitches: targetStitches,
      perimeter: perimeter,
      z: currentZ,
      originalLine: i
    });
    
    currentZ -= stitchHeight;
  }
  
  return { pattern: parsedPattern, errors };
}

export function parsePattern(patternArray) {
  const flatStitches = [];
  
  patternArray.forEach((p) => {
    let instruction = p.instruction;
    if (instruction.startsWith("Magic Ring:")) {
      instruction = instruction.replace("Magic Ring:", "").trim();
    }
    
    let multiplier = 1;
    let content = instruction;
    
    let match = instruction.match(/^\[(.*)\]\s*\*\s*(\d+)$/);
    if (match) {
      multiplier = parseInt(match[2]);
      content = match[1];
    } else {
      match = instruction.match(/^(\d+)\s*\*\s*\[(.*)\]$/);
      if (match) {
        multiplier = parseInt(match[1]);
        content = match[2];
      }
    }
    
    const parts = content.split(',').map(s => s.trim());
    const sequence = [];
    
    parts.forEach(part => {
      const typeMatch = part.match(/^(\d*)([a-zA-Z0-9]+)$/);
      if (typeMatch) {
        let count = typeMatch[1] ? parseInt(typeMatch[1]) : 1;
        let type = typeMatch[2];
        if (type === 'sc2inc') type = 'inc';
        if (type === 'sc2tog') type = 'dec';
        
        for (let i = 0; i < count; i++) {
          sequence.push(type);
        }
      }
    });
    
    for (let m = 0; m < multiplier; m++) {
      sequence.forEach(op => {
        flatStitches.push({
          type: op,
          round: p.round,
          y: p.z,
          targetStitches: p.stitches,
          perimeter: p.perimeter
        });
      });
    }
  });
  
  return flatStitches;
}

export function generateStitchPath(patternData) {
  if (!patternData || !patternData.pattern || patternData.pattern.length === 0) return [];
  
  const flatStitches = parsePattern(patternData.pattern);
  const points = [];
  
  let currentRound = flatStitches[0]?.round;
  let currentRadius = flatStitches[0]?.perimeter / (2 * Math.PI) || 1;
  let targetStitches = flatStitches[0]?.targetStitches || 6;
  let angleStep = (2 * Math.PI) / targetStitches;
  let angle = 0;

  let nextY = flatStitches[0]?.y;
  let nextRadius = currentRadius;

  const getNextRoundData = (startIdx, currentRoundNum) => {
    for (let i = startIdx; i < flatStitches.length; i++) {
      if (flatStitches[i].round !== currentRoundNum) {
        return {
          y: flatStitches[i].y,
          radius: flatStitches[i].perimeter / (2 * Math.PI)
        };
      }
    }
    return { y: nextY, radius: currentRadius };
  };

  let nextData = getNextRoundData(0, currentRound);
  nextY = nextData.y;
  nextRadius = nextData.radius;

  let stitchIndexInRound = 0;

  const addPoint = (baseY, baseR, theta, nextY, nextR, idx, totalStitches, stitchType, roundNum) => {
    const progress = idx / totalStitches;
    const interpolatedY = baseY + (nextY - baseY) * progress;
    const interpolatedR = baseR + (nextR - baseR) * progress;
    
    const pt = new THREE.Vector3(
      interpolatedR * Math.cos(theta),
      interpolatedY,
      interpolatedR * Math.sin(theta)
    );
    pt.stitchType = stitchType;
    pt.round = roundNum;
    points.push(pt);
  };

  for (let i = 0; i < flatStitches.length; i++) {
    const op = flatStitches[i];
    
    if (op.round !== currentRound) {
       currentRound = op.round;
       currentRadius = op.perimeter / (2 * Math.PI);
       targetStitches = op.targetStitches;
       angleStep = (2 * Math.PI) / targetStitches;
       stitchIndexInRound = 0;
       
       nextData = getNextRoundData(i, currentRound);
       nextY = nextData.y;
       nextRadius = nextData.radius;
    }
    
    if (op.type === 'sc' || op.type === 'dec') {
      addPoint(op.y, currentRadius, angle, nextY, nextRadius, stitchIndexInRound, targetStitches, op.type, op.round);
      angle += angleStep;
      stitchIndexInRound++;
    } else if (op.type === 'inc') {
      addPoint(op.y, currentRadius, angle, nextY, nextRadius, stitchIndexInRound, targetStitches, 'inc', op.round);
      angle += angleStep;
      stitchIndexInRound++;
      
      addPoint(op.y, currentRadius, angle, nextY, nextRadius, stitchIndexInRound, targetStitches, 'inc', op.round);
      angle += angleStep;
      stitchIndexInRound++;
    }
  }
  
  return points;
}
