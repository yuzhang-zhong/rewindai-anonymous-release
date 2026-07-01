const apiUrl = process.env.REWINDAI_API_URL || 'http://127.0.0.1:8000';
const allowDemoStorage = process.argv.includes('--allow-demo-storage')
  || process.env.REWINDAI_ALLOW_DEMO_STORAGE === '1';

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  console.warn(`WARN ${message}`);
}

async function main() {
  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) {
    fail(`StorySage API health returned HTTP ${response.status}`);
    return;
  }

  const health = await response.json();
  pass('StorySage API health endpoint responds');

  const runtime = health.runtime || {};
  const warnings = Array.isArray(runtime.warnings) ? runtime.warnings : [];
  const goLiveBlockers = Array.isArray(runtime.go_live_blockers) ? runtime.go_live_blockers : [];
  const database = runtime.database || {};
  const storage = runtime.storage || {};
  const mirofish = runtime.mirofish || {};

  if (health.providers?.llm?.configured) {
    pass(`LLM provider configured: ${health.providers.llm.provider || 'unknown'} / ${health.providers.llm.model_name || 'unknown model'}`);
  } else {
    fail('LLM provider is not configured');
  }

  if (health.auth?.jwt_secret?.configured && !health.auth.jwt_secret.using_development_fallback) {
    pass('JWT secret is configured without development fallback');
  } else {
    fail('JWT secret is missing or using development fallback');
  }

  const sqliteInTmp = Boolean(database.sqlite)
    && typeof storage.data_dir === 'string'
    && storage.data_dir.startsWith('/tmp');
  const sqliteWarning = warnings.some(warning => /sqlite.*\/tmp|\/tmp.*sqlite/i.test(warning));

  if (runtime.go_live_ready === false && goLiveBlockers.length > 0) {
    const message = `StorySage runtime is not go-live ready: ${goLiveBlockers.join('; ')}`;
    if (allowDemoStorage) {
      warn(message);
    } else {
      fail(message);
    }
  } else if (sqliteInTmp || sqliteWarning) {
    const message = 'DATABASE_URL uses SQLite in /tmp; records can disappear or split across serverless instances. Configure external Postgres before real participant collection.';
    if (allowDemoStorage) {
      warn(message);
    } else {
      fail(message);
    }
  } else {
    pass('Database does not report /tmp SQLite storage');
  }

  if (mirofish.base_url_is_local || !mirofish.graph_sync_enabled) {
    warn('MiroFish graph sync is not production-connected; graph features may rely on fallback/mock behavior until a public MiroFish backend is configured.');
  } else {
    pass('MiroFish graph sync reports production-ready configuration');
  }

  for (const warning of warnings) {
    warn(warning);
  }

  if (process.exitCode) {
    console.error('\nRewindAI production readiness failed. Small demo flows may still work, but do not collect real participants until the failing items are fixed.');
  } else {
    console.log('\nPASS RewindAI production readiness gate completed.');
  }
}

main().catch(error => {
  fail(error instanceof Error ? error.message : String(error));
});
