// ─── U-SPOT Strategy Version & Parameter API ─────────────────────────
// Spec Section 40 & 41: /api/strategy
// Returns active strategy versions, weights, parameters, and research presets

import { NextRequest, NextResponse } from 'next/server';
import {
  getStrategyVersions,
  getStrategyParameters,
  saveStrategyVersion,
  saveStrategyParameter,
  getStorageStatus,
} from '@/lib/services/signal-store';
import {
  STRATEGY_PRESETS,
  DEFAULT_STRATEGY_PARAMS,
  validateStrategyParameters,
  strategyParamsToVersionRecord,
} from '@/lib/services/strategy-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version') || undefined;

    const [versions, parameters] = await Promise.all([
      getStrategyVersions(),
      getStrategyParameters(version),
    ]);

    const status = getStorageStatus();

    return NextResponse.json({
      success: true,
      data: {
        activeVersion: versions.find((v) => v.isActive) ?? versions[0] ?? null,
        versions,
        parameters,
        presets: STRATEGY_PRESETS,
        defaults: DEFAULT_STRATEGY_PARAMS,
      },
      dataSource: status.source,
      storageStatus: status,
    });
  } catch (err) {
    console.error('[/api/strategy] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve strategy data',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, version, parameter, parameters, versionName } = body;

    // 1. Validate Parameters
    if (type === 'validate' && parameters) {
      const validation = validateStrategyParameters(parameters);
      return NextResponse.json({
        success: true,
        validation,
      });
    }

    // 2. Save Strategy Version (from StrategyResearchParameters or StrategyVersionRecord)
    if (type === 'version') {
      let recordToSave = version;
      if (!recordToSave && parameters) {
        recordToSave = strategyParamsToVersionRecord(parameters, Boolean(body.isActive));
      }

      if (!recordToSave) {
        return NextResponse.json(
          { success: false, error: 'Missing version or parameters to save' },
          { status: 400 }
        );
      }

      const res = await saveStrategyVersion(recordToSave);
      return NextResponse.json({
        success: res.success,
        source: res.source,
        version: recordToSave.version,
      });
    }

    // 3. Activate Strategy Version
    if (type === 'activate' && (versionName || version)) {
      const targetVersion = versionName || (typeof version === 'string' ? version : version.version);
      const versions = await getStrategyVersions();
      const existing = versions.find((v) => v.version === targetVersion);

      if (!existing) {
        return NextResponse.json(
          { success: false, error: `Strategy version ${targetVersion} not found` },
          { status: 404 }
        );
      }

      // Re-save with isActive: true
      const updated = { ...existing, isActive: true };
      const res = await saveStrategyVersion(updated);
      return NextResponse.json({
        success: res.success,
        source: res.source,
        activeVersion: targetVersion,
      });
    }

    // 4. Save Fine-Grained Parameter
    if (type === 'parameter' && parameter) {
      const res = await saveStrategyParameter(parameter);
      return NextResponse.json({
        success: res.success,
        source: res.source,
        parameter: parameter.parameterKey,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Invalid request. Must specify type: 'version' | 'activate' | 'validate' | 'parameter'",
      },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update strategy',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

