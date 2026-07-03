const base = atob("aHR0cHM6Ly9ueWFhc2ktYXBpLnZlcmNlbC5hcHAvYXBpL3NlYXJjaA==");

const QUALITIES = [ "1080", "720", "540", "480" ];

const DUBBED_REGEX = /\b(?:dub|dubs|dubbed|dual|dual[\s._-]*audio|eng[\s._-]*dub|english[\s._-]*dub|multi[\s._-]*audio|multi[\s._-]*dub)\b/i;

const EXPLICIT_BATCH_REGEX = /\b(?:batch|complete|complete[\s._-]*series|complete[\s._-]*season|complete[\s._-]*collection|all[\s._-]*episodes|season[\s._-]*pack|series[\s._-]*pack)\b/i;

const RANGE_BATCH_REGEX = /\b(?:episodes?|eps?)?[\s._-]*\d{1,3}[\s._-]*(?:-|~|to)[\s._-]*\d{1,3}\b/i;

const SINGLE_EPISODE_REGEX = /\b(?:s\d{1,2}e\d{1,3}|episode[\s._-]*\d{1,3}|ep[\s._-]*\d{1,3}|e\d{1,3})\b/i;

const PLAIN_SINGLE_EPISODE_REGEX = /(?:^|[\s\]])-\s*\d{1,3}(?:v\d)?(?=[\s\[])/i;

export default {
  async single(query, options) {
    const {
      titles,
      episode,
      absoluteEpisodeNumber,
      exclusions = [],
      resolution,
      fetch: fetcher
    } = query;

    if (!titles?.length) return [];

    return search({
      mode: "single",
      titles,
      episode,
      absoluteEpisode: absoluteEpisodeNumber,
      exclusions,
      resolution,
      batch: false,
      fetcher
    });
  },

  async batch(query, options) {
    const {
      titles,
      exclusions = [],
      resolution,
      fetch: fetcher
    } = query;

    if (!titles?.length) return [];

    return search({
      mode: "batch",
      titles,
      exclusions,
      resolution,
      batch: true,
      fetcher
    });
  },

  async movie(query, options) {
    const {
      titles,
      resolution,
      exclusions = [],
      fetch: fetcher
    } = query;

    if (!titles?.length) return [];

    return search({
      mode: "movie",
      titles,
      exclusions,
      resolution,
      batch: false,
      fetcher
    });
  },

  async test() {
    const res = await fetch(base + "?q=test&category=1_0");

    if (!res.ok) {
      throw new Error(`Nyaa API unavailable (HTTP ${res.status})`);
    }

    return true;
  }
};

function cleanTitle(title = "") {
  return title
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function cleanCount(value) {
  const count = Number(value || 0);
  return count >= 30000 ? 0 : count;
}

function parseSize(value) {
  if (typeof value === "number") return value;

  const text = String(value || "");
  const match = text.match(/([\d.]+)\s*([KMGT]?i?B|[KMGT]?B)/i);

  if (!match) return Number(value || 0) || 0;

  const number = Number(match[1]);
  const unit = match[2].toUpperCase();

  const units = {
    B: 1,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4
  };

  return Math.round(number * (units[unit] || 1));
}

function isDubbed(title = "") {
  return DUBBED_REGEX.test(title);
}

function isExplicitBatch(title = "") {
  return EXPLICIT_BATCH_REGEX.test(title) || RANGE_BATCH_REGEX.test(title);
}

function isClearlySingleEpisode(title = "") {
  return SINGLE_EPISODE_REGEX.test(title) || PLAIN_SINGLE_EPISODE_REGEX.test(title);
}

function episodeMatches(title = "", episode, absoluteEpisode) {
  const possible = [];

  if (episode != null) possible.push(Number(episode));
  if (absoluteEpisode != null) possible.push(Number(absoluteEpisode));

  const nums = unique(possible.filter(n => Number.isFinite(n) && n > 0));

  if (!nums.length) return true;

  return nums.some(num => {
    const ep = String(num);
    const ep2 = ep.padStart(2, "0");
    const ep3 = ep.padStart(3, "0");

    const patterns = [
      new RegExp(`\\bs\\d{1,2}e0*${ep}\\b`, "i"),
      new RegExp(`\\b(?:e|ep|episode)[\\s._-]*0*${ep}\\b`, "i"),
      new RegExp(`-[\\s._-]*(?:${ep}|${ep2}|${ep3})(?:v\\d)?(?=[\\s._\\[\\(\\]\\)]|$)`, "i"),
      new RegExp(`[\\[\\(](?:${ep}|${ep2}|${ep3})(?:v\\d)?[\\]\\)]`, "i")
    ];

    return patterns.some(pattern => pattern.test(title));
  });
}

function shouldExclude(title = "", exclusions = []) {
  const lowerTitle = title.toLowerCase();

  return exclusions.some(exclusion =>
    lowerTitle.includes(String(exclusion).toLowerCase())
  );
}

function buildExclusions(resolution, exclusions = []) {
  const list = Array.isArray(exclusions) ? exclusions : [];

  if (!resolution) return list;

  return list.concat(
    QUALITIES
      .filter(q => q !== String(resolution))
      .map(q => `${q}p`)
  );
}

function chooseTitle(titles = []) {
  const latin = titles.filter(t => /[a-zA-Z]/.test(t));
  const pool = latin.length ? latin : titles;

  return pool.reduce((a, b) => a.length <= b.length ? a : b);
}

function getExtraTitles(titles = [], mainTitle = "") {
  const latin = titles.filter(t => /[a-zA-Z]/.test(t));
  const pool = latin.length ? latin : titles;

  return pool
    .filter(t => t !== mainTitle)
    .slice(0, 2)
    .join("|||");
}

function getHash(item) {
  const hash = item.hash || "";

  if (hash) return hash;

  const magnet = item.magnet || item.Magnet || "";
  return magnet.match(/btih:([A-Za-z0-9]+)/)?.[1] || "";
}

function normalizeItem(item) {
  const title = item.title || item.Name || item.name || "Unknown";
  const magnet = item.magnet || item.Magnet || "";
  const link = item.link || item.Link || "";

  return {
    title,
    link: magnet || link || item.hash || "",
    hash: getHash(item),
    seeders: cleanCount(item.seeders ?? item.Seeders),
    leechers: cleanCount(item.leechers ?? item.Leechers),
    downloads: Number(item.downloads ?? item.Downloads ?? 0),
    size: parseSize(item.size ?? item.Size ?? 0),
    date: item.date || item.DateUploaded ? new Date(item.date || item.DateUploaded) : new Date(0),
    accuracy: item.accuracy || "medium"
  };
}

function buildParams({
  q,
  title,
  category = "1_0",
  batch = false,
  episode,
  absoluteEpisode,
  resolution,
  exclusions = [],
  extraTitles = ""
}) {
  return "?q=" + encodeURIComponent(q)
    + "&title=" + encodeURIComponent(title)
    + "&category=" + encodeURIComponent(category)
    + "&batch=" + String(batch)
    + (episode != null ? "&episode=" + encodeURIComponent(String(episode)) : "")
    + (absoluteEpisode != null ? "&absoluteEpisode=" + encodeURIComponent(String(absoluteEpisode)) : "")
    + (resolution ? "&resolution=" + encodeURIComponent(String(resolution)) : "")
    + (exclusions.length ? "&exclusions=" + encodeURIComponent(exclusions.join(",")) : "")
    + (extraTitles ? "&titles=" + encodeURIComponent(extraTitles) : "");
}

function buildQueriesForMode({
  mode,
  clean,
  episode,
  absoluteEpisode,
  resolution
}) {
  const queries = [];
  const ep = episode ?? absoluteEpisode;

  if (mode === "single") {
    if (ep == null) {
      queries.push(`${clean}`);
      queries.push(`${clean} dub`);
      queries.push(`${clean} dubbed`);
      queries.push(`${clean} english dub`);
      queries.push(`${clean} dual audio`);

      if (resolution) {
        queries.push(`${clean} ${resolution}p`);
        queries.push(`${clean} dub ${resolution}p`);
        queries.push(`${clean} dual audio ${resolution}p`);
      }

      return unique(queries);
    }

    const epRaw = String(ep);
    const ep2 = epRaw.padStart(2, "0");
    const ep3 = epRaw.padStart(3, "0");

    const epTerms = unique([
      epRaw,
      ep2,
      ep3,
      `E${epRaw}`,
      `E${ep2}`,
      `EP${epRaw}`,
      `EP${ep2}`,
      `Episode ${epRaw}`,
      `Episode ${ep2}`
    ]);

    for (const epTerm of epTerms) {
      queries.push(`${clean} ${epTerm}`);

      if (resolution) {
        queries.push(`${clean} ${epTerm} ${resolution}p`);
      }

      queries.push(`${clean} ${epTerm} dub`);
      queries.push(`${clean} ${epTerm} dubbed`);
      queries.push(`${clean} ${epTerm} english dub`);
      queries.push(`${clean} ${epTerm} dual audio`);
    }

    return unique(queries);
  }

  if (mode === "batch") {
    queries.push(`${clean} batch`);
    queries.push(`${clean} batch dub`);
    queries.push(`${clean} batch dubbed`);
    queries.push(`${clean} batch dual audio`);
    queries.push(`${clean} complete`);
    queries.push(`${clean} complete dub`);
    queries.push(`${clean} complete dual audio`);
    queries.push(`${clean} season`);
    queries.push(`${clean} season dual audio`);
    queries.push(`${clean} dub`);
    queries.push(`${clean} dubbed`);
    queries.push(`${clean} dual audio`);

    if (resolution) {
      queries.push(`${clean} batch ${resolution}p`);
      queries.push(`${clean} dual audio ${resolution}p`);
    }

    return unique(queries);
  }

  if (mode === "movie") {
    queries.push(`${clean}`);
    queries.push(`${clean} dub`);
    queries.push(`${clean} dubbed`);
    queries.push(`${clean} english dub`);
    queries.push(`${clean} dual audio`);

    if (resolution) {
      queries.push(`${clean} ${resolution}p`);
      queries.push(`${clean} dub ${resolution}p`);
      queries.push(`${clean} dual audio ${resolution}p`);
    }

    return unique(queries);
  }

  return [clean];
}

async function fetchSearch({
  q,
  title,
  batch,
  episode,
  absoluteEpisode,
  resolution,
  exclusions,
  extraTitles,
  fetcher
}) {
  const doFetch = fetcher || fetch;

  const params = buildParams({
    q,
    title,
    batch,
    episode,
    absoluteEpisode,
    resolution,
    exclusions,
    extraTitles
  });

  const res = await doFetch(base + params);

  if (!res.ok) return [];

  const data = await res.json();

  if (!Array.isArray(data)) return [];

  return data.map(normalizeItem);
}

function keepForMode(item, mode, episode, absoluteEpisode) {
  const title = item.title || "";

  if (mode === "single") {
    // Do not allow obvious batches in single results.
    if (isExplicitBatch(title)) return false;

    // A single result should look like an actual episode.
    if (!isClearlySingleEpisode(title)) return false;

    // If we know the episode number, make sure it matches.
    if (episode != null || absoluteEpisode != null) {
      return episodeMatches(title, episode, absoluteEpisode);
    }

    return true;
  }

  if (mode === "batch") {
    if (isExplicitBatch(title)) return true;

    // Allows some unlabeled batches, but rejects obvious single episodes.
    return !isClearlySingleEpisode(title);
  }

  if (mode === "movie") {
    if (isExplicitBatch(title)) return false;

    return true;
  }

  return true;
}

async function search({
  mode,
  titles,
  episode,
  absoluteEpisode,
  exclusions = [],
  resolution,
  batch,
  fetcher
}) {
  const title = chooseTitle(titles);
  const clean = cleanTitle(title);
  const extraTitles = getExtraTitles(titles, title);

  const queries = buildQueriesForMode({
    mode,
    clean,
    episode,
    absoluteEpisode,
    resolution
  });

  const allResults = [];

  for (const q of unique(queries)) {
    try {
      const results = await fetchSearch({
        q,
        title,
        batch,
        episode,
        absoluteEpisode,
        resolution,
        exclusions,
        extraTitles,
        fetcher
      });

      allResults.push(...results);
    } catch {}
  }

  const seen = new Set();

  const deduped = allResults.filter(item => {
    const key = item.hash || item.link || item.title;

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });

  const finalExclusions = buildExclusions(resolution, exclusions);

  return deduped
    .filter(item => isDubbed(item.title))
    .filter(item => !shouldExclude(item.title, finalExclusions))
    .filter(item => keepForMode(item, mode, episode, absoluteEpisode))
    .map(item => ({
      title: item.title,
      link: item.link,
      hash: item.hash,
      seeders: item.seeders,
      leechers: item.leechers,
      downloads: item.downloads,
      size: item.size,
      date: item.date,
      accuracy: item.accuracy,
      type: mode === "batch" ? "batch" : void 0
    }))
    .filter(item => item.link);
}
