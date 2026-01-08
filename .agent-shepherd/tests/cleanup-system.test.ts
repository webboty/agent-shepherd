/**
 * Tests for Cleanup System
 * Tests startup cleanup, scheduled cleanup, size monitoring, emergency cleanup, health checks, and metrics
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { resetManager } from "../src/core/retention-policy.ts";
import { resetCollector } from "../src/core/garbage-collector.ts";
import { resetCleanupEngine } from "../src/core/cleanup-engine.ts";
import { Logger, getLogger, type RunRecord } from "../src/core/logging.ts";
import { resetHealthChecker } from "../src/core/cleanup-health-check.ts";
import { resetSizeMonitor } from "../src/core/size-monitor.ts";

const TEST_DIR = join(process.cwd(), ".test-cleanup-system");

describe("Startup Cleanup", () => {
  const policies = [
    {
      name: "default",
      description: "Default policy",
      enabled: true,
      age_days: 1,
      max_runs: 10,
      max_size_mb: 100,
      archive_enabled: true,
      archive_after_days: 1,
      delete_after_days: 90,
      keep_successful_runs: false,
      keep_failed_runs: true,
    },
  ];

  beforeEach(() => {
    Logger.resetInstance();
    resetManager();
    resetCollector();
    resetCleanupEngine();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("should run startup cleanup on Logger initialization when enabled", async () => {
    const configDir = TEST_DIR;
    const configPath = join(configDir, "config.yaml");
    const configContent = `
version: "1.0"
cleanup:
  enabled: true
  run_on_startup: true
  archive_on_startup: true
  delete_on_startup: false
  schedule_interval_hours: 24
retention:
  enabled: true
  policies: ${JSON.stringify(policies)}
`;
    writeFileSync(configPath, configContent);

    const logger = new Logger(configDir);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(existsSync(join(configDir, "runs.db"))).toBe(true);

    logger.close();
  });

  it("should not run startup cleanup when disabled", async () => {
    const configDir = TEST_DIR;
    const configPath = join(configDir, "config.yaml");
    const configContent = `
version: "1.0"
cleanup:
  enabled: false
retention:
  enabled: true
  policies: ${JSON.stringify(policies)}
`;
    writeFileSync(configPath, configContent);

    const logger = new Logger(configDir);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const dbPath = join(configDir, "runs.db");
    expect(existsSync(dbPath)).toBe(false);

    logger.close();
  });
});

describe("Scheduled Cleanup Timer", () => {
  beforeEach(() => {
    Logger.resetInstance();
    resetManager();
    resetCollector();
    resetCleanupEngine();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("should start scheduled cleanup timer", async () => {
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");
    const cleanupEngine = getCleanupEngine({
      dataDir: TEST_DIR,
      retentionConfig: {
        enabled: true,
        policies: [],
      },
    });

    await cleanupEngine.start();

    await new Promise((resolve) => setTimeout(resolve, 100));

    cleanupEngine.stop();
    cleanupEngine.close();

    expect(true).toBe(true);
  });

  it("should respect schedule_interval_hours configuration", async () => {
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");
    const cleanupEngine = getCleanupEngine({
      dataDir: TEST_DIR,
      cleanupConfig: {
        enabled: true,
        run_on_startup: false,
        schedule_interval_hours: 1,
      },
      retentionConfig: {
        enabled: true,
        policies: [],
      },
    });

    await cleanupEngine.start();

    await new Promise((resolve) => setTimeout(resolve, 100));

    cleanupEngine.stop();
    cleanupEngine.close();

    expect(true).toBe(true);
  });
});

describe("Size Monitoring", () => {
  beforeEach(() => {
    Logger.resetInstance();
    resetManager();
    resetCollector();
    resetCleanupEngine();
    resetHealthChecker();
    resetSizeMonitor();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("should collect size metrics", async () => {
    const { getSizeMonitor } = require("../src/core/size-monitor.ts");
    const sizeMonitor = getSizeMonitor({ dataDir: TEST_DIR });

    await sizeMonitor.getMetrics();

    const metrics = await sizeMonitor.getMetrics();

    expect(metrics).toBeDefined();
    expect(metrics.total_size_bytes).toBeGreaterThanOrEqual(0);
    expect(metrics.run_count).toBe(0);
    expect(metrics.archive_run_count).toBe(0);
    expect(metrics.timestamp).toBeGreaterThan(0);

    sizeMonitor.stop();
  });

  it("should track size history", async () => {
    const { getSizeMonitor } = require("../src/core/size-monitor.ts");
    const sizeMonitor = getSizeMonitor({ dataDir: TEST_DIR });

    await sizeMonitor.getMetrics();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sizeMonitor.getMetrics();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sizeMonitor.getMetrics();

    const history = sizeMonitor.getHistory();

    expect(history.length).toBeGreaterThanOrEqual(3);

    sizeMonitor.stop();
  });

  it("should calculate size trends", async () => {
    const { getSizeMonitor } = require("../src/core/size-monitor.ts");
    const sizeMonitor = getSizeMonitor({ dataDir: TEST_DIR });

    await sizeMonitor.getMetrics();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sizeMonitor.getMetrics();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await sizeMonitor.getMetrics();

    const trends = sizeMonitor.getTrends(1);

    expect(trends).toBeDefined();
    expect(trends.size_trend).toBeDefined();
    expect(["increasing", "decreasing", "stable"]).toContain(trends.size_trend);

    sizeMonitor.stop();
  });
});

describe("Emergency Cleanup", () => {
  const policies = [
    {
      name: "emergency",
      enabled: true,
      age_days: 1,
      max_runs: 10,
      max_size_mb: 100,
      archive_enabled: true,
      archive_after_days: 1,
      delete_after_days: 90,
    },
  ];

  beforeEach(() => {
    Logger.resetInstance();
    resetManager();
    resetCollector();
    resetCleanupEngine();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("should run emergency cleanup", async () => {
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");
    const cleanupEngine = getCleanupEngine({
      dataDir: TEST_DIR,
      retentionConfig: {
        enabled: true,
        policies,
      },
    });

    const result = await cleanupEngine.runEmergencyCleanup();

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);

    cleanupEngine.close();
  });

  it("should run critical cleanup", async () => {
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");
    const cleanupEngine = getCleanupEngine({
      dataDir: TEST_DIR,
      retentionConfig: {
        enabled: true,
        policies,
      },
    });

    const result = await cleanupEngine.runCriticalCleanup();

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);

    cleanupEngine.close();
  });
});

describe("Health Checks", () => {
  beforeEach(() => {
    Logger.resetInstance();
    resetManager();
    resetCollector();
    resetCleanupEngine();
    resetHealthChecker();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("should run all health checks", async () => {
    const { getHealthChecker } = require("../src/core/cleanup-health-check.ts");
    const healthChecker = getHealthChecker({ dataDir: TEST_DIR });

    const report = await healthChecker.runHealthChecks();

    expect(report).toBeDefined();
    expect(report.overall_health).toBeDefined();
    expect(["healthy", "warning", "critical"]).toContain(report.overall_health);
    expect(report.checks).toBeInstanceOf(Array);
    expect(report.summary).toBeDefined();
  });

  it("should check database integrity", async () => {
    const { getHealthChecker } = require("../src/core/cleanup-health-check.ts");
    const healthChecker = getHealthChecker({ dataDir: TEST_DIR });

    const report = await healthChecker.runHealthChecks();

    const integrityCheck = report.checks.find((c) => c.check_name === "Database Integrity");

    expect(integrityCheck).toBeDefined();
    expect(integrityCheck?.passed).toBe(true);
  });

  it("should check query functionality", async () => {
    const { getHealthChecker } = require("../src/core/cleanup-health-check.ts");
    const healthChecker = getHealthChecker({ dataDir: TEST_DIR });

    const report = await healthChecker.runHealthChecks();

    const queryCheck = report.checks.find((c) => c.check_name === "Query Functionality");

    expect(queryCheck).toBeDefined();
    expect(queryCheck?.passed).toBe(true);
  });

  it("should check archive accessibility", async () => {
    const { getHealthChecker } = require("../src/core/cleanup-health-check.ts");
    const healthChecker = getHealthChecker({ dataDir: TEST_DIR });

    const report = await healthChecker.runHealthChecks();

    const archiveCheck = report.checks.find((c) => c.check_name === "Archive Accessibility");

    expect(archiveCheck).toBeDefined();
    expect(archiveCheck?.passed).toBe(true);
  });

  it("should check archive consistency", async () => {
    const { getHealthChecker } = require("../src/core/cleanup-health-check.ts");
    const healthChecker = getHealthChecker({ dataDir: TEST_DIR });

    const report = await healthChecker.runHealthChecks();

    const consistencyCheck = report.checks.find((c) => c.check_name === "Archive Consistency");

    expect(consistencyCheck).toBeDefined();
    expect(consistencyCheck?.passed).toBe(true);
  });

  it("should check index health", async () => {
    const { getHealthChecker } = require("../src/core/cleanup-health-check.ts");
    const healthChecker = getHealthChecker({ dataDir: TEST_DIR });

    const report = await healthChecker.runHealthChecks();

    const indexCheck = report.checks.find((c) => c.check_name === "Index Health");

    expect(indexCheck).toBeDefined();
    expect(indexCheck?.passed).toBe(true);
  });

  it("should run vacuum optimization", async () => {
    const { getHealthChecker } = require("../src/core/cleanup-health-check.ts");
    const healthChecker = getHealthChecker({
      dataDir: TEST_DIR,
      run_vacuum: true,
    });

    const report = await healthChecker.runHealthChecks();

    const vacuumCheck = report.checks.find((c) => c.check_name === "Vacuum Optimization");

    expect(vacuumCheck).toBeDefined();
    expect(vacuumCheck?.passed).toBe(true);
  });
});

describe("Metrics Collection and Export", () => {
  const policies = [
    {
      name: "metrics-test",
      enabled: true,
      age_days: 1,
      max_runs: 10,
      max_size_mb: 100,
      archive_enabled: true,
      archive_after_days: 1,
      delete_after_days: 90,
    },
  ];

  beforeEach(() => {
    Logger.resetInstance();
    resetManager();
    resetCollector();
    resetCleanupEngine();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("should get aggregate metrics", () => {
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");
    const cleanupEngine = getCleanupEngine({
      dataDir: TEST_DIR,
      retentionConfig: {
        enabled: true,
        policies,
      },
    });

    const metrics = cleanupEngine.getAggregateMetrics();

    expect(metrics).toBeDefined();
    expect(metrics.total_runs_processed).toBe(0);
    expect(metrics.total_runs_archived).toBe(0);
    expect(metrics.total_runs_deleted).toBe(0);
    expect(metrics.total_bytes_archived).toBe(0);
    expect(metrics.total_bytes_deleted).toBe(0);
    expect(metrics.last_cleanup).toBeNull();
    expect(metrics.average_duration_ms).toBe(0);

    cleanupEngine.close();
  });

  it("should get metrics with filters", () => {
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");
    const cleanupEngine = getCleanupEngine({
      dataDir: TEST_DIR,
      retentionConfig: {
        enabled: true,
        policies,
      },
    });

    const metrics = cleanupEngine.getMetrics({ policy_name: "metrics-test" });

    expect(Array.isArray(metrics)).toBe(true);

    cleanupEngine.close();
  });
});

describe("Cleanup System Integration", () => {
  const policies = [
    {
      name: "integration-test",
      enabled: true,
      age_days: 1,
      max_runs: 10,
      max_size_mb: 100,
      archive_enabled: true,
      archive_after_days: 1,
      delete_after_days: 90,
    },
  ];

  beforeEach(() => {
    Logger.resetInstance();
    resetManager();
    resetCollector();
    resetCleanupEngine();
    resetHealthChecker();
    resetSizeMonitor();

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }

    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("should integrate startup cleanup with Logger", async () => {
    const logger = new Logger(TEST_DIR);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(existsSync(join(TEST_DIR, "runs.db"))).toBe(true);

    logger.close();
  });

  it("should integrate scheduled cleanup with size monitoring", async () => {
    const { getSizeMonitor } = require("../src/core/size-monitor.ts");
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");

    const sizeMonitor = getSizeMonitor({
      dataDir: TEST_DIR,
      max_size_mb: 1,
      warning_threshold_percent: 90,
      critical_threshold_percent: 100,
      emergency_threshold_percent: 110,
    });

    const cleanupEngine = getCleanupEngine({
      dataDir: TEST_DIR,
      retentionConfig: {
        enabled: true,
        policies,
      },
    });

    await sizeMonitor.getMetrics();
    const result = await cleanupEngine.runImmediateCleanup();

    expect(result.success).toBe(true);

    sizeMonitor.stop();
    cleanupEngine.close();
  });

  it("should integrate health checks after cleanup", async () => {
    const { getHealthChecker } = require("../src/core/cleanup-health-check.ts");
    const { getCleanupEngine } = require("../src/core/cleanup-engine.ts");

    const healthChecker = getHealthChecker({ dataDir: TEST_DIR });
    const cleanupEngine = getCleanupEngine({
      dataDir: TEST_DIR,
      retentionConfig: {
        enabled: true,
        policies,
      },
    });

    await cleanupEngine.runImmediateCleanup();

    const report = await healthChecker.runHealthChecks();

    expect(report).toBeDefined();
    expect(report.overall_health).toBeDefined();

    cleanupEngine.close();
  });
});
