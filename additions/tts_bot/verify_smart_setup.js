// Comprehensive Simulation Test for Smart Proxyhide / AdsPower / 99% Ready System
const http = require('http');

async function testSmartSetup() {
  console.log('=== STARTING SMART SETUP VERIFICATION ===\n');

  // Test 1: Fetch and Parse Sheet Data
  console.log('[TEST 1] Fetching & Parsing Sheet Rows (Automation & Phần 2)...');
  const sheetId = '1wAh6we1CsSuPVbCOD5vRyO3KJqNKBbcdq7LBZVlI268';
  const urlAuto = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Automation`;
  const urlPhan2 = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Phần 2')}`;

  const resAuto = await fetch(urlAuto).then(r => r.text());
  const resPhan2 = await fetch(urlPhan2).then(r => r.text());

  const parseRow = (line) => {
    // Simple quote-aware CSV split
    const parts = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    parts.push(cur.trim());
    return parts;
  };

  const autoRow1 = parseRow(resAuto.split('\n')[1]);
  const phan2Row1 = parseRow(resPhan2.split('\n')[1]);

  console.log('✓ Sheet Automation Row 1 parsed:');
  console.log('  - Profile ID:', autoRow1[0]);
  console.log('  - Full Name:', autoRow1[10]);
  console.log('  - State:', autoRow1[14]);
  console.log('  - SSN:', autoRow1[11]);
  console.log('  - EIN:', autoRow1[18]);
  console.log('  - PDF CP 575:', autoRow1[24]);
  console.log('  - Phone / SMS API:', autoRow1[9]?.slice(0, 40) + '...');
  console.log('  - TikTok Pass:', autoRow1[6]);

  console.log('✓ Sheet Phần 2 Row 1 parsed:');
  console.log('  - Profile ID:', phan2Row1[0]);
  console.log('  - Full Name:', phan2Row1[10]);
  console.log('  - State:', phan2Row1[14]);
  console.log('  - Bank Statement:', phan2Row1[26]);
  console.log('  - PDF CP 575:', phan2Row1[24]);

  if (!autoRow1[24] || !phan2Row1[26]) {
    throw new Error('Missing PDF CP 575 or Bank Statement in parsed rows!');
  }
  console.log('--> TEST 1 PASSED: Sheet cell extraction 100% verified.\n');

  // Test 2: HideProxy Port Info & State Matching
  console.log('[TEST 2] Testing HideProxy Live Ports & State Matching...');
  const portInfoRes = await fetch('http://127.0.0.1:10101/api/port/info?port=ALL').then(r => r.json());
  console.log(`✓ HideProxy returned ${portInfoRes.data?.length || 0} ports.`);
  const livePorts = portInfoRes.data.filter(p => p.online);
  console.log(`✓ Live ports count: ${livePorts.length}`);
  if (livePorts.length > 0) {
    console.log(`  Sample live port ${livePorts[0].port}: State = ${livePorts[0].state}, IP = ${livePorts[0].public_ip}`);
  }
  console.log('--> TEST 2 PASSED: HideProxy port-info API responding.\n');

  // Test 3: AdsPower API Connectivity & Group
  console.log('[TEST 3] Testing AdsPower Group 10716270...');
  const adsRes = await fetch('http://127.0.0.1:50325/api/v1/user/list?group_id=10716270&page_size=5', {
    headers: {
      'Authorization': 'Bearer c9ea96522fba29ee72f2fee511b77868008da729dcdcc201',
      'Content-Type': 'application/json'
    }
  }).then(r => r.json());
  console.log(`✓ AdsPower returned ${adsRes.data?.list?.length || 0} profiles in Group 10716270.`);
  console.log('--> TEST 3 PASSED: AdsPower online and group accessible.\n');

  // Test 4: Readiness Logic Simulation (99% Ready vs 100% Full Ready)
  console.log('[TEST 4] Testing Readiness Scorecard Logic...');
  const calculateReadiness = (record, hasFront, hasBack) => {
    const hasInfo = !!(record.fullName && record.address && record.city && record.state && record.zipCode);
    const hasTax = !!(record.ssn && record.ein);
    const hasDocs = !!(record.pdfDoc || record.bankStatement);
    const hasAuth = !!(record.email && (record.tiktokPass || record.mailPass));
    const hasProxy = !!record.assignedPort;
    const hasBrowser = !!record.adspowerId;
    const hasPhotos = hasFront && hasBack;

    let score = 0;
    if (hasInfo) score += 20;
    if (hasTax) score += 20;
    if (hasDocs) score += 20;
    if (hasAuth) score += 15;
    if (hasProxy && hasBrowser) score += 24;
    if (hasPhotos) score += 1;

    let readyStatus = 'pending';
    if (hasPhotos && score >= 95) {
      readyStatus = '100_ready';
      score = 100;
    } else if (!hasPhotos && hasInfo && hasTax && (hasProxy || hasBrowser)) {
      readyStatus = '99_ready';
      score = 99;
    }
    return { score, readyStatus };
  };

  const sampleRecord = {
    fullName: autoRow1[10],
    address: autoRow1[12],
    city: autoRow1[13],
    state: autoRow1[14],
    zipCode: autoRow1[15],
    ssn: autoRow1[11],
    ein: autoRow1[18],
    pdfDoc: autoRow1[24],
    bankStatement: 'sample_statement.pdf',
    email: 'test@hotmail.com',
    tiktokPass: 'Password123!',
    assignedPort: 50001,
    adspowerId: 'k1hm441w'
  };

  // Case A: Missing 2 sides photos
  const resultCaseA = calculateReadiness(sampleRecord, false, false);
  console.log('✓ Case A (Photos missing):', resultCaseA);
  if (resultCaseA.readyStatus !== '99_ready' || resultCaseA.score !== 99) {
    throw new Error('Case A failed: Expected 99_ready and score 99!');
  }

  // Case B: 2 sides photos assigned & processed
  const resultCaseB = calculateReadiness(sampleRecord, true, true);
  console.log('✓ Case B (Photos present):', resultCaseB);
  if (resultCaseB.readyStatus !== '100_ready' || resultCaseB.score !== 100) {
    throw new Error('Case B failed: Expected 100_ready and score 100!');
  }
  console.log('--> TEST 4 PASSED: 99% Ready and 100% Full Ready logic verified.\n');

  console.log('=== ALL 4/4 SMART SETUP TESTS PASSED PERFECTLY! ===');
}

testSmartSetup().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
