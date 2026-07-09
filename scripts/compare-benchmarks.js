const fs = require('fs');

function main() {
  const mainFile = process.argv[2];
  const prFile = process.argv[3];

  if (!mainFile || !prFile) {
    console.error('Usage: node compare-benchmarks.js <main-results.json> <pr-results.json>');
    process.exit(1);
  }

  const mainResults = JSON.parse(fs.readFileSync(mainFile, 'utf8'));
  const prResults = JSON.parse(fs.readFileSync(prFile, 'utf8'));

  let failed = false;
  const threshold = 1.10; // 10% regression threshold

  let markdown = '--- Benchmark Comparison ---\n';
  markdown += '| Test | Main (ms) | PR (ms) | Change | Status |\n';
  markdown += '| --- | --- | --- | --- | --- |\n';

  for (const key of Object.keys(mainResults)) {
    const mainTime = mainResults[key];
    const prTime = prResults[key];

    if (!prTime) continue;

    const ratio = prTime / mainTime;
    const changePct = ((ratio - 1) * 100).toFixed(2);
    let status = '✅ Pass';

    if (ratio > threshold) {
      status = '❌ Fail';
      failed = true;
    }

    markdown += `| ${key} | ${mainTime.toFixed(3)} | ${prTime.toFixed(3)} | ${changePct > 0 ? '+' : ''}${changePct}% | ${status} |\n`;
  }

  console.log(markdown);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  }

  if (failed) {
    console.error('\n❌ Performance regression detected! Execution time increased by more than 10%.');
    process.exit(1);
  } else {
    console.log('\n✅ All benchmarks passed the regression check.');
  }
}

main();
