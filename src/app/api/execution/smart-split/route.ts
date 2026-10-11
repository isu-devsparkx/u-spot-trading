// ─── U-SPOT Algorithmic TWAP/VWAP Smart Order Execution API Route (Phase 46) ─
// Handles creation, stepping, simulation, and inspection of algorithmic spot split orders.

import { NextRequest, NextResponse } from 'next/server';
import {
  createSmartOrderPlan,
  executeTrancheStep,
  simulateFullSmartExecution,
  getSmartOrderPlanById,
  getAllSmartOrderPlans,
} from '@/lib/services/smart-order-execution';
import type { SmartExecutionAlgorithm } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const planId = searchParams.get('id');

    if (planId) {
      const plan = getSmartOrderPlanById(planId);
      if (!plan) {
        return NextResponse.json(
          { success: false, error: `Execution plan ${planId} not found` },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, plan });
    }

    const plans = getAllSmartOrderPlans();
    return NextResponse.json({ success: true, plans, count: plans.length });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch execution plans' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'CREATE';

    if (action === 'CREATE') {
      const {
        symbol = 'BTC/USDT',
        totalSizeUsdt = 10000,
        durationMinutes = 5,
        tranchesCount = 8,
        algorithm = 'TWAP',
        arrivalBenchmarkPrice = 68000,
        maxSlippageBps = 25,
      } = body;

      const plan = createSmartOrderPlan({
        symbol,
        totalSizeUsdt: Number(totalSizeUsdt),
        durationMinutes: Number(durationMinutes),
        tranchesCount: Number(tranchesCount),
        algorithm: algorithm as SmartExecutionAlgorithm,
        arrivalBenchmarkPrice: Number(arrivalBenchmarkPrice),
        maxSlippageBps: Number(maxSlippageBps),
      });

      return NextResponse.json({ success: true, plan });
    }

    if (action === 'STEP') {
      const { planId, trancheIndex, currentMarketPrice } = body;
      const existing = getSmartOrderPlanById(planId);
      if (!existing) {
        return NextResponse.json(
          { success: false, error: `Execution plan ${planId} not found` },
          { status: 404 }
        );
      }

      const updated = executeTrancheStep(
        existing,
        Number(trancheIndex),
        Number(currentMarketPrice)
      );

      return NextResponse.json({ success: true, plan: updated });
    }

    if (action === 'SIMULATE') {
      const {
        symbol = 'BTC/USDT',
        totalSizeUsdt = 10000,
        durationMinutes = 5,
        tranchesCount = 8,
        algorithm = 'TWAP',
        arrivalBenchmarkPrice = 68000,
        maxSlippageBps = 25,
        priceSequence,
      } = body;

      const plan = simulateFullSmartExecution(
        {
          symbol,
          totalSizeUsdt: Number(totalSizeUsdt),
          durationMinutes: Number(durationMinutes),
          tranchesCount: Number(tranchesCount),
          algorithm: algorithm as SmartExecutionAlgorithm,
          arrivalBenchmarkPrice: Number(arrivalBenchmarkPrice),
          maxSlippageBps: Number(maxSlippageBps),
        },
        priceSequence
      );

      return NextResponse.json({ success: true, plan });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Execution operation failed' },
      { status: 500 }
    );
  }
}
