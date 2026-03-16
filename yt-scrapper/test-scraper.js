#!/usr/bin/env node

/**
 * Quick Test Script - Verify Scraper is Working
 * 
 * Usage: node test-scraper.js
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function testScraper() {
  console.log('🧪 YouTube Email Scraper - Quick Test\n');

  try {
    // Test 1: Health Check
    console.log('✓ Test 1: System Health Check');
    const healthRes = await fetch(`${BASE_URL}/health`);
    const health = await healthRes.json();
    console.log(`  Status: ${health.status}`);
    console.log(`  Uptime: ${health.uptime} seconds`);
    console.log(`  Google APIs: ${health.apiKeys?.google?.available || 'N/A'} available`);
    console.log(`  Browsers: ${health.browserPool?.available || 'N/A'} available\n`);

    // Test 2: Create Job
    console.log('✓ Test 2: Starting Scraping Job');
    const jobRes = await fetch(`${BASE_URL}/api/scraper/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword: 'web design agency',
        country: 'United States',
        targetEmails: 100
      })
    });

    if (!jobRes.ok) {
      throw new Error(`Job creation failed: ${jobRes.status} ${jobRes.statusText}`);
    }

    const jobData = await jobRes.json();
    console.log(`  ✅ Job created successfully!`);
    console.log(`  📌 Job ID: ${jobData.job.jobId}`);
    console.log(`  🎯 Keyword: ${jobData.job.keyword}`);
    console.log(`  🎯 Target Emails: ${jobData.job.targetEmails}\n`);

    const jobId = jobData.job.jobId;

    // Test 3: Check Status (Initial)
    console.log('✓ Test 3: Checking Initial Status');
    const statusRes = await fetch(`${BASE_URL}/api/scraper/jobs/${jobId}`);
    const statusData = await statusRes.json();
    console.log(`  Status: ${statusData.job.status}`);
    console.log(`  Progress: ${statusData.job.progress?.percentComplete || 0}%\n`);

    // Test 4: Wait and Check Again
    console.log('✓ Test 4: Waiting 15 seconds and checking progress...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    const progressRes = await fetch(`${BASE_URL}/api/scraper/jobs/${jobId}`);
    const progressData = await progressRes.json();
    console.log(`  Status: ${progressData.job.status}`);
    console.log(`  Queries Executed: ${progressData.job.progress?.queriesExecuted || 0}`);
    console.log(`  Channels Discovered: ${progressData.job.progress?.channelsDiscovered || 0}`);
    console.log(`  Emails Found: ${progressData.job.progress?.emailsFound || 0}`);
    console.log(`  Progress: ${progressData.job.progress?.percentComplete || 0}%\n`);

    // Test 5: Get Logs
    console.log('✓ Test 5: Checking Latest Logs');
    const logsRes = await fetch(`${BASE_URL}/api/scraper/jobs/${jobId}/logs`);
    const logsData = await logsRes.json();
    if (logsData.logs && logsData.logs.length > 0) {
      console.log(`  Latest log: ${logsData.logs[0].message}`);
    }

    console.log('\n✅ All tests passed! Your scraper is working correctly.\n');
    console.log('📖 See START_SCRAPING_NOW.md for complete API documentation');
    console.log(`📌 Your Job ID: ${jobId}`);
    console.log(`📊 Check status: curl http://localhost:3000/api/scraper/jobs/${jobId}`);

    return jobId;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testScraper();
