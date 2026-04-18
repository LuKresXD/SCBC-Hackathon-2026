import cron from 'node-cron';
import { getAllBundles, createNAVSnapshot, getActiveAlertsByBundle, triggerAlert } from '../db/queries';
import { getLiveNAV, checkAndUpdateResolutions } from './pricing';
import { metrics } from './metrics';

/**
 * Refresh probabilities for all active bundles.
 * Fetches live Polymarket data, updates DB, and checks for resolutions.
 */
async function refreshAllBundles(): Promise<void> {
  const startTime = Date.now();
  let cronOk = true;
  let cronError: string | undefined;
  let activeBundlesCount = 0;
  let totalLegsUpdated = 0;
  let totalNewlyResolved = 0;

  try {
    const bundles = await getAllBundles();
    const activeBundles = bundles.filter((b) => b.status === 'active');
    activeBundlesCount = activeBundles.length;

    for (const bundle of activeBundles) {
      try {
        // Fetch and update live probabilities
        const navResult = await getLiveNAV(bundle.id);
        if (navResult) {
          totalLegsUpdated += navResult.legs.filter((l) => l.status === 'active').length;

          // Record NAV snapshot for historical charts
          await createNAVSnapshot(bundle.id, navResult.nav, navResult.legs);
        }

        // Check for newly resolved legs
        const resolved = await checkAndUpdateResolutions(bundle.id);
        totalNewlyResolved += resolved.length;

        // Check price alerts for this bundle
        if (navResult) {
          try {
            const alerts = await getActiveAlertsByBundle(bundle.id);
            const navChangePercent = bundle.issue_price > 0
              ? ((navResult.nav - bundle.issue_price) / bundle.issue_price) * 100
              : 0;

            for (const alert of alerts) {
              let shouldTrigger = false;
              if (alert.alert_type === 'above' && navResult.nav >= alert.threshold) shouldTrigger = true;
              if (alert.alert_type === 'below' && navResult.nav <= alert.threshold) shouldTrigger = true;
              if (alert.alert_type === 'change_percent' && Math.abs(navChangePercent) >= alert.threshold) shouldTrigger = true;

              if (shouldTrigger) {
                await triggerAlert(alert.id, navResult.nav);
              }
            }
          } catch (alertErr) {
            // Alert checking is non-critical, don't fail the cron
          }
        }
      } catch (err) {
        console.error(`Cron: failed to refresh bundle ${bundle.id} (${bundle.name}):`, err);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[cron] Refreshed ${activeBundlesCount} bundles, ${totalLegsUpdated} legs updated, ${totalNewlyResolved} newly resolved (${elapsed}ms)`
    );
  } catch (err) {
    cronOk = false;
    cronError = err instanceof Error ? err.message : String(err);
    console.error('[cron] refreshAllBundles failed:', err);
  } finally {
    metrics.recordCron({
      timestamp: Date.now(),
      duration_ms: Date.now() - startTime,
      bundles_refreshed: activeBundlesCount,
      legs_updated: totalLegsUpdated,
      newly_resolved: totalNewlyResolved,
      ok: cronOk,
      error: cronError,
    });
  }
}

/**
 * Start all cron jobs. Call once after server starts.
 */
export function startCronJobs(): void {
  // Every 2 minutes: refresh all active bundle probabilities
  cron.schedule('*/2 * * * *', async () => {
    console.log('[cron] Starting bundle refresh...');
    await refreshAllBundles();
  });

  console.log('[cron] Price refresh cron scheduled (every 2 minutes)');
}
