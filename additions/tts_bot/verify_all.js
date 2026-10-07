// Simulation and End-to-End Verification Script for TTS-Bot
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function runSimulation() {
  console.log('====================================================');
  console.log('       TTS-BOT FULL PIPELINE SIMULATION TEST        ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Google Sheets Automation Tab
  try {
    console.log('[TEST 1/5] Fetching Google Sheet (Tab: Automation)...');
    const url1 = 'https://docs.google.com/spreadsheets/d/1wAh6we1CsSuPVbCOD5vRyO3KJqNKBbcdq7LBZVlI268/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent('Automation');
    const r1 = await fetch(url1);
    const text1 = await r1.text();
    const rows1 = text1.split('\n').filter(l => l.trim().length > 0);
    if (rows1.length > 50) {
      console.log(`  -> SUCCESS: ${rows1.length - 1} records loaded from Automation tab.`);
      console.log(`  -> Sample 1: ${rows1[1].slice(0, 90)}...`);
      passed++;
    } else {
      throw new Error(`Unexpected record count: ${rows1.length}`);
    }
  } catch (err) {
    console.error('  -> FAILED:', err.message);
    failed++;
  }

  // 2. Google Sheets Phan 2 Tab
  try {
    console.log('\n[TEST 2/5] Fetching Google Sheet (Tab: Phần 2)...');
    const url2 = 'https://docs.google.com/spreadsheets/d/1wAh6we1CsSuPVbCOD5vRyO3KJqNKBbcdq7LBZVlI268/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent('Phần 2');
    const r2 = await fetch(url2);
    const text2 = await r2.text();
    const rows2 = text2.split('\n').filter(l => l.trim().length > 0);
    if (rows2.length > 50) {
      console.log(`  -> SUCCESS: ${rows2.length - 1} records loaded from Phần 2 tab.`);
      console.log(`  -> Sample 1: ${rows2[1].slice(0, 90)}...`);
      passed++;
    } else {
      throw new Error(`Unexpected record count: ${rows2.length}`);
    }
  } catch (err) {
    console.error('  -> FAILED:', err.message);
    failed++;
  }

  // 3. HideProxy Live Connectivity
  try {
    console.log('\n[TEST 3/5] Checking HideProxy API (http://127.0.0.1:10101)...');
    const rHp = await fetch('http://127.0.0.1:10101/api/filter/country');
    const dHp = await rHp.json();
    const rStates = await fetch('http://127.0.0.1:10101/api/filter/state?country=us');
    const dStates = await rStates.json();
    if (dHp.code === 200 && dStates.code === 200) {
      console.log(`  -> SUCCESS: HideProxy is ONLINE.`);
      console.log(`  -> Available countries: ${dHp.total}, US States: ${dStates.total}`);
      passed++;
    } else {
      throw new Error(`HideProxy error code: ${dHp.code}`);
    }
  } catch (err) {
    console.error('  -> FAILED:', err.message);
    failed++;
  }

  // 4. AdsPower Live Connectivity & Profile Query
  try {
    console.log('\n[TEST 4/5] Checking AdsPower API (http://127.0.0.1:50325)...');
    const rAp = await fetch('http://127.0.0.1:50325/api/v1/user/list?page=1&page_size=3', {
      headers: { Authorization: 'Bearer c9ea96522fba29ee72f2fee511b77868008da729dcdcc201' }
    });
    const dAp = await rAp.json();
    if (dAp.code === 0 && dAp.data) {
      console.log(`  -> SUCCESS: AdsPower is ONLINE.`);
      console.log(`  -> Sample Profiles count in group: ${dAp.data.list?.length || 0}`);
      passed++;
    } else {
      throw new Error(`AdsPower returned: ${JSON.stringify(dAp)}`);
    }
  } catch (err) {
    console.error('  -> FAILED:', err.message);
    failed++;
  }

  // 5. 2-Side Studio (CR80 Crop & Apple iPhone 15 Pro EXIF Injection)
  try {
    console.log('\n[TEST 5/5] Testing 2-Side Studio (CR80 Crop & iPhone 15 Pro EXIF Injection)...');
    const inputPhoto = 'D:\\Download\\132_DEBRA_BROWN_AR_FRONT_PHOTO.jpg';
    const outputPhoto = path.resolve('F:\\herd\\fox-auto\\additions\\tts_bot\\runtime\\verify_test.jpg');
    const cliScript = path.resolve('F:\\herd\\fox-auto\\additions\\tts_bot\\process_cli.py');

    if (!fs.existsSync(inputPhoto)) {
      throw new Error(`Test input photo not found: ${inputPhoto}`);
    }

    const res = await new Promise((resolve, reject) => {
      const p = spawn('py', ['-3', cliScript, '--input', inputPhoto, '--output', outputPhoto, '--preset', 'iPhone 15 Pro', '--crop']);
      let buf = '';
      p.stdout.on('data', d => buf += d);
      p.stderr.on('data', d => buf += d);
      p.on('close', code => {
        if (code === 0) resolve(JSON.parse(buf.trim()));
        else reject(new Error(buf || `Process exited with code ${code}`));
      });
    });

    if (res.ok && fs.existsSync(outputPhoto)) {
      const stats = fs.statSync(outputPhoto);
      console.log(`  -> SUCCESS: Processed photo created (${(stats.size / 1024).toFixed(0)} KB)`);
      console.log(`  -> EXIF Device: ${res.exif?.device}, Preset: ${res.exif?.preset}, Software: ${res.exif?.software}`);
      passed++;
    } else {
      throw new Error(`Failed to generate photo: ${JSON.stringify(res)}`);
    }
  } catch (err) {
    console.error('  -> FAILED:', err.message);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`SIMULATION SUMMARY: ${passed}/5 Passed, ${failed}/5 Failed`);
  console.log('====================================================\n');
}

runSimulation();
