import cron from 'node-cron';
import { getAllBundles, createNAVSnapshot } from '../db/queries';
import { getLiveNAV, checkAndUpdateResolutions } from './pricing';

/**
 * Refresh probabilities for all active bundles.
 * Fetches live Polymarket data, updates DB, and checks for resolutions.
 */
async function refreshAllBundles(): Promise<void> {
  const startTime = Date.now();

  try {
    const bundles = await getAllBundles();
    const activeBundles = bundles.filter((b) => b.status === 'active');

    let totalLegsUpdated = 0;
    let totalNewlyResolved = 0;

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
      } catch (err) {
        console.error(`Cron: failed to refresh bundle ${bundle.id} (${bundle.name}):`, err);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[cron] Refreshed ${activeBundles.length} bundles, ${totalLegsUpdated} legs updated, ${totalNewlyResolved} newly resolved (${elapsed}ms)`
    );
  } catch (err) {
    console.error('[cron] refreshAllBundles failed:', err);
  }
}

/**
 * Start all cron jobs. Call once after server starts.
 */
export function startCronJobs(): void {
  // Every 2 minutes: refresh all active bundle probabilities
  cron.schedule('*/2 * * * *', () => {
    console.log('[cron] Starting bundle refresh...');
    refreshAllBundles();
  });

  console.log('[cron] Price refresh cron scheduled (every 2 minutes)');
}
