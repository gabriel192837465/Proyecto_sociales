const fs = require('fs');
const path = require('path');

const coverageFile = path.join(__dirname, '..', 'coverage', 'coverage-final.json');
if (!fs.existsSync(coverageFile)) {
  console.error("Coverage file not found");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));

const targetFiles = [
  'src/server/ws/handlers/alumno-entra.js',
  'src/server/application/use-cases/reconectar-alumno.js',
  'src/server/ws/dispatcher.js',
  'src/server/application/use-cases/avanzar-pregunta.js',
  'src/client/features/alumno/state.js',
  'src/client/features/alumno/socket.js',
  'src/client/features/alumno/index.js',
  'src/server/http/middleware/cors.js'
];

const results = {};

for (const key of Object.keys(data)) {
  const normKey = key.replace(/\\/g, '/');
  const matched = targetFiles.find(tf => normKey.endsWith(tf));
  if (matched) {
    const fileCoverage = data[key];
    
    // Lines
    const s = fileCoverage.s;
    const totalLines = Object.keys(s).length;
    const coveredLines = Object.values(s).filter(v => v > 0).length;
    const linePercent = totalLines > 0 ? (coveredLines / totalLines) * 100 : 100;
    
    // Branches
    const b = fileCoverage.b;
    let totalBranches = 0;
    let coveredBranches = 0;
    for (const branchId of Object.keys(b)) {
      const branchArray = b[branchId];
      totalBranches += branchArray.length;
      coveredBranches += branchArray.filter(v => v > 0).length;
    }
    const branchPercent = totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 100;
    
    // Find uncovered lines
    const uncoveredLines = [];
    const statementMap = fileCoverage.statementMap;
    for (const stmtId of Object.keys(s)) {
      if (s[stmtId] === 0) {
        const line = statementMap[stmtId].start.line;
        if (!uncoveredLines.includes(line)) {
          uncoveredLines.push(line);
        }
      }
    }
    uncoveredLines.sort((a, b) => a - b);
    
    // Format uncovered lines ranges
    const formatRanges = (lines) => {
      if (lines.length === 0) return '—';
      const ranges = [];
      let start = lines[0];
      let prev = lines[0];
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === prev + 1) {
          prev = lines[i];
        } else {
          ranges.push(start === prev ? `L${start}` : `L${start}-${prev}`);
          start = lines[i];
          prev = lines[i];
        }
      }
      ranges.push(start === prev ? `L${start}` : `L${start}-${prev}`);
      return ranges.join(', ');
    };
    
    results[matched] = {
      linePercent: linePercent.toFixed(1) + '%',
      branchPercent: branchPercent.toFixed(1) + '%',
      uncovered: formatRanges(uncoveredLines),
      rating: linePercent >= 95 ? '✅ Excellent' : (linePercent >= 80 ? '⚠️ Acceptable' : '⚠️ Low')
    };
  }
}

fs.writeFileSync(path.join(__dirname, '..', 'coverage-summary-result.json'), JSON.stringify(results, null, 2));
console.log("Coverage parsing complete");
