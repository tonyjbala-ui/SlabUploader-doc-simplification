function roundHalfUp(value, decimals) {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return sign * Number(Math.round(Number(abs + 'e' + decimals)) + 'e-' + decimals);
}
function computeScale(px, L) {
  return px / L;
}
function computeSqft(maskPx, scale) {
  return roundHalfUp(maskPx / (scale * scale) / 144, 2);
}
function computeBdft(sqft, thickness) {
  return roundHalfUp(sqft * thickness, 2);
}

const checks = [];
function eq(name, a, b) {
  const ok = Object.is(a, b) || (typeof a === 'number' && Math.abs(a - b) < 1e-9);
  checks.push({ name, ok, a, b });
}

eq('TV scale 960/96', computeScale(960, 96), 10);
eq('1 sqft from 14400px @ 10px/in', computeSqft(14400, 10), 1);
eq('bdft identity 1sqft x 1in', computeBdft(1, 1), 1);
eq('bdft no /12', computeBdft(12.34, 2), 24.68);
eq('half-up 11.525', roundHalfUp(11.525, 2), 11.53);

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}: got ${c.a} expected ${c.b}`);
}
if (failed.length) {
  console.error(`${failed.length} failed`);
  process.exit(1);
}
console.log(`${checks.length} passed`);
