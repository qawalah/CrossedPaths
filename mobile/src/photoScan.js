import * as MediaLibrary from "expo-media-library";

const BATCH_SIZE = 200; // assets fetched per getAssetsAsync page
const CONCURRENCY = 16; // getAssetInfoAsync calls in flight at once

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(worker));
  return out;
}

/** Reads the GPS position + time saved in the phone's photos (on the device; nothing is sent).
 *  Returns [{t, lat, lon}] sorted by time. Throws if photo access is refused. */
export async function scanPhotoLibrary({ from, to, onProgress }) {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (perm.status !== "granted") throw new Error("Photo library access is needed to scan for geotagged photos");
  const baseOpts = {
    mediaType: [MediaLibrary.MediaType.photo],
    sortBy: [MediaLibrary.SortBy.creationTime],
    createdAfter: from ? from.getTime() : undefined,
    createdBefore: to ? to.getTime() : undefined,
  };
  const points = [];
  let scanned = 0;
  let after;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({ ...baseOpts, first: BATCH_SIZE, after });
    const infos = await mapLimit(page.assets, CONCURRENCY, async (asset) => {
      try {
        return await MediaLibrary.getAssetInfoAsync(asset);
      } catch (e) {
        return null;
      }
    });
    for (const info of infos) {
      scanned++;
      const loc = info && info.location;
      if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) && (loc.latitude !== 0 || loc.longitude !== 0)) {
        points.push({ t: Math.round((info.creationTime || Date.now()) / 1000), lat: loc.latitude, lon: loc.longitude });
      }
    }
    if (onProgress) onProgress({ scanned, total: page.totalCount, found: points.length });
    after = page.endCursor;
    hasNextPage = page.hasNextPage;
  }
  points.sort((a, b) => a.t - b.t);
  return { points, scanned };
}
