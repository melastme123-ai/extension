const QUALITIES = [ "1080", "720", "540", "480" ];

const DUBBED_REGEX = /\b(?:dub|dubs|dubbed|dual|dual[\s._-]*audio|dual[\s._-]*audio|multi[\s._-]*audio|eng[\s._-]*dub|english[\s._-]*dub)\b/i;

const STRONG_BATCH_REGEX = /\b(?:batch|complete|complete[\s._-]*series|complete[\s._-]*season|all[\s._-]*episodes|season[\s._-]*pack|series[\s._-]*pack|episodes?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}|eps?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}|\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3})\b/i;

const SINGLE_EPISODE_REGEX = /\b(?:s\d{1,2}e\d{1,3}|episode[\s._-]*\d{1,3}|ep[\s._-]*\d{1,3}|e\d{1,3})\b/i;

const PLAIN_SINGLE_EPISODE_REGEX = /(?:^|[\s\]])-\s*\d{1,3}(?:v\d)?(?=[\s._:\[\(]|$)/i;

const WEAK_BATCH_REGEX = /\b(?:season[\s._-]*\d{1,2}|s\d{1,2})\b/i;

export default new class ToshoDubbed {
  searchUrl = atob("aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ueHl6L2pzb24vdjEvc2VhcmNo");
  episodeUrl = atob("aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ueHl6L2pzb24vdjEvZXBpc29kZXMv");
  seriesUrl = atob("aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ueHl6L2pzb24vdjEvc2VyaWVzL2FuaWRiLw==");
  testUrl = atob("aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ueHl6L2pzb24=");

  getFetch(fetcher) {
    return fetcher || fetch;
  }

  async safeJson(url, fetcher) {
    try {
      const res = await this.getFetch(fetcher)(url);

      if (!res.ok) return null;

      const text = await res.text();

      if (!text || text.startsWith("RSS, Atom")) return null;

      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  getReleases(data) {
    if (Array.isArray(data)) return data;

    return data?.data?.releases || [];
  }

  getTitle(entry) {
    return entry.title || entry.torrent_name || "";
  }

  getMagnet(entry) {
    return entry.magnet || entry.magnet_uri || "";
  }

  getSize(entry) {
    return entry.size_bytes ?? entry.total_size ?? 0;
  }

  getDownloads(entry) {
    return entry.downloads ?? entry.torrent_downloaded_count ?? 0;
  }

  getDate(entry) {
    if (entry.date_added) return new Date(entry.date_added);
    if (entry.timestamp) return new Date(1000 * entry.timestamp);

    return new Date(0);
  }

  cleanCount(value) {
    const count = Number(value || 0);

    return count >= 30000 ? 0 : count;
  }

  cleanText(text = "") {
    return String(text)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  cleanSearchTitle(title = "") {
    return String(title)
      .replace(/[^\w\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  unique(list) {
    return [...new Set(list.filter(Boolean))];
  }

  chooseTitles(titles = []) {
    return this.unique(
      titles
        .filter(title => typeof title === "string" && title.trim())
        .map(title => this.cleanSearchTitle(title))
    ).slice(0, 3);
  }

  importantWords(title = "") {
    const stopWords = new Set([
      "the", "and", "for", "with", "you", "your", "that", "this",
      "from", "into", "season", "movie", "part", "episode"
    ]);

    return this.cleanText(title)
      .split(" ")
      .filter(word => word.length >= 3 && !stopWords.has(word));
  }

  titleMatches(entryTitle, titles = []) {
    const entryClean = this.cleanText(entryTitle);

    if (!entryClean || !titles.length) return true;

    return titles.some(title => {
      const titleClean = this.cleanText(title);

      if (!titleClean) return false;

      if (entryClean.includes(titleClean)) return true;

      const words = this.importantWords(title);

      if (!words.length) return true;

      const hits = words.filter(word => entryClean.includes(word)).length;
      const needed = words.length <= 2 ? words.length : Math.min(3, Math.ceil(words.length * 0.4));

      return hits >= needed;
    });
  }

  buildExclusions(resolution, exclusions = []) {
    const list = Array.isArray(exclusions) ? exclusions : [];

    if (!resolution) return list;

    return list.concat(
      QUALITIES
        .filter(q => q !== String(resolution))
        .map(q => `${q}p`)
    );
  }

  isDubbed(entry) {
    return DUBBED_REGEX.test(this.getTitle(entry));
  }

  getFileCount(entry) {
    return (
      entry.num_files ??
      entry.file_count ??
      entry.files_count ??
      entry.fileCount ??
      entry.numFiles ??
      entry.files?.length
    );
  }

  isBatch(entry, episode) {
    const title = this.getTitle(entry);
    const fileCount = this.getFileCount(entry);
    const minFiles = Math.min(24, Math.max(2, episode ?? 1));

    if (STRONG_BATCH_REGEX.test(title)) return true;

    if (SINGLE_EPISODE_REGEX.test(title) || PLAIN_SINGLE_EPISODE_REGEX.test(title)) {
      return false;
    }

    if (typeof fileCount === "number" && fileCount >= minFiles) {
      return true;
    }

    if (WEAK_BATCH_REGEX.test(title)) return true;

    return false;
  }

  episodeMatches(title = "", episode, absoluteEpisode) {
    const possible = [];

    if (episode != null) possible.push(Number(episode));
    if (absoluteEpisode != null) possible.push(Number(absoluteEpisode));

    const nums = this.unique(possible.filter(n => Number.isFinite(n) && n > 0));

    if (!nums.length) return true;

    return nums.some(num => {
      const ep = String(num);
      const ep2 = ep.padStart(2, "0");
      const ep3 = ep.padStart(3, "0");

      const patterns = [
        new RegExp(`\\bs\\d{1,2}e0*${ep}\\b`, "i"),
        new RegExp(`\\b(?:e|ep|episode)[\\s._-]*0*${ep}\\b`, "i"),
        new RegExp(`-[\\s._-]*(?:${ep}|${ep2}|${ep3})(?:v\\d)?(?=[\\s._:\\[\\(\\]\\)]|$)`, "i"),
        new RegExp(`[\\[\\(](?:${ep}|${ep2}|${ep3})(?:v\\d)?[\\]\\)]`, "i"),
        new RegExp(`\\b(?:${ep}|${ep2}|${ep3})\\s*:`, "i")
      ];

      return patterns.some(pattern => pattern.test(title));
    });
  }

  shouldExclude(entry, exclusions = []) {
    const title = this.getTitle(entry).toLowerCase();

    return exclusions.some(exclusion =>
      title.includes(String(exclusion).toLowerCase())
    );
  }

  map(entries, batch = false, useTorrent = false, excl = []) {
    const exclusions = excl.map(e => String(e).toLowerCase());

    return entries
      .filter(entry => this.isDubbed(entry))
      .filter(entry => !this.shouldExclude(entry, exclusions))
      .map(entry => ({
        title: this.getTitle(entry),
        link: useTorrent ? entry.torrent_url : this.getMagnet(entry),
        seeders: this.cleanCount(entry.seeders),
        leechers: this.cleanCount(entry.leechers),
        downloads: this.getDownloads(entry),
        hash: entry.info_hash || "",
        size: this.getSize(entry),
        accuracy: "medium",
        type: batch ? "batch" : void 0,
        date: this.getDate(entry)
      }))
      .filter(entry => entry.link);
  }

  buildQueries({ titles = [], episode, absoluteEpisode, resolution, batch = false, movie = false }) {
    const chosen = this.chooseTitles(titles);
    const queries = [];

    for (const title of chosen) {
      const ep = episode ?? absoluteEpisode;

      if (batch) {
        queries.push(`${title} dual audio`);
        queries.push(`${title} dub`);
        queries.push(`${title} batch`);
        queries.push(`${title} complete`);
      } else if (ep != null && !movie) {
        const ep2 = String(ep).padStart(2, "0");

        queries.push(`${title} ${ep2}`);
        queries.push(`${title} ${ep2} dual audio`);
        queries.push(`${title} ${ep2} dub`);
      } else {
        queries.push(`${title} dual audio`);
        queries.push(`${title} dub`);
        queries.push(`${title} english dub`);
        queries.push(title);
      }

      if (resolution) {
        queries.push(`${title} ${resolution}p dual audio`);
      }
    }

    return this.unique(queries).slice(0, 6);
  }

  async searchByTitle({ titles = [], episode, absoluteEpisode, resolution, exclusions = [], batch = false, movie = false }, options, fetcher) {
    if (!titles?.length) return [];

    const queries = this.buildQueries({
      titles,
      episode,
      absoluteEpisode,
      resolution,
      batch,
      movie
    });

    const allResults = [];

    for (const query of queries) {
      const url = this.searchUrl + "?q=" + encodeURIComponent(query) + "&limit=100";
      const json = await this.safeJson(url, fetcher);
      const releases = this.getReleases(json);

      allResults.push(...releases);
    }

    const chosenTitles = this.chooseTitles(titles);
    const seen = new Set();

    const deduped = allResults.filter(entry => {
      const key = entry.info_hash || this.getMagnet(entry) || this.getTitle(entry);

      if (!key || seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    const filtered = deduped
      .filter(entry => this.titleMatches(this.getTitle(entry), chosenTitles))
      .filter(entry => {
        if (batch) return this.isBatch(entry, episode);
        if (!movie && (episode != null || absoluteEpisode != null)) {
          if (this.isBatch(entry, episode)) return false;
          return this.episodeMatches(this.getTitle(entry), episode, absoluteEpisode);
        }

        return true;
      });

    const excl = this.buildExclusions(resolution, exclusions);

    return this.map(filtered, batch, options?.useTorrent, excl);
  }

  async searchEpisodeById(anidbEid, fetcher) {
    if (!anidbEid) return [];

    const json = await this.safeJson(this.episodeUrl + anidbEid + "?limit=100", fetcher);

    return this.getReleases(json);
  }

  async searchSeriesById(anidbAid, fetcher) {
    if (!anidbAid) return [];

    const json = await this.safeJson(this.seriesUrl + anidbAid + "?limit=100", fetcher);

    return this.getReleases(json);
  }

  async single({ anidbEid, anidbAid, titles = [], episode, absoluteEpisodeNumber, resolution, exclusions = [], fetch: fetcher }, options) {
    if (!navigator.onLine) return [];

    const excl = this.buildExclusions(resolution, exclusions);

    const episodeReleases = await this.searchEpisodeById(anidbEid, fetcher);
    const episodeResults = this.map(episodeReleases, false, options?.useTorrent, excl)
      .filter(entry => !this.isBatch(entry, episode));

    if (episodeResults.length) return episodeResults;

    const titleResults = await this.searchByTitle({
      titles,
      episode,
      absoluteEpisode: absoluteEpisodeNumber,
      resolution,
      exclusions,
      batch: false,
      movie: false
    }, options, fetcher);

    if (titleResults.length) return titleResults;

    if (anidbAid) {
      const seriesReleases = await this.searchSeriesById(anidbAid, fetcher);
      const seriesResults = this.map(seriesReleases, false, options?.useTorrent, excl)
        .filter(entry => !this.isBatch(entry, episode))
        .filter(entry => this.episodeMatches(entry.title, episode, absoluteEpisodeNumber));

      if (seriesResults.length) return seriesResults;
    }

    return [];
  }

  async batch({ anidbAid, titles = [], resolution, exclusions = [], episode, fetch: fetcher }, options) {
    if (!navigator.onLine) return [];

    const excl = this.buildExclusions(resolution, exclusions);

    const seriesReleases = await this.searchSeriesById(anidbAid, fetcher);
    const batchReleases = seriesReleases.filter(entry => this.isBatch(entry, episode));
    const batchResults = this.map(batchReleases, true, options?.useTorrent, excl);

    if (batchResults.length) return batchResults;

    return this.searchByTitle({
      titles,
      episode,
      resolution,
      exclusions,
      batch: true,
      movie: false
    }, options, fetcher);
  }

  async movie({ anidbAid, titles = [], resolution, exclusions = [], fetch: fetcher }, options) {
    if (!navigator.onLine) return [];

    const excl = this.buildExclusions(resolution, exclusions);

    const seriesReleases = await this.searchSeriesById(anidbAid, fetcher);
    const movieResults = this.map(seriesReleases, false, options?.useTorrent, excl);

    if (movieResults.length) return movieResults;

    return this.searchByTitle({
      titles,
      resolution,
      exclusions,
      batch: false,
      movie: true
    }, options, fetcher);
  }

  async test() {
    try {
      const json = await this.safeJson(this.searchUrl + "?q=dual%20audio&limit=5");

      if (!Array.isArray(json)) {
        throw new Error("AnimeTosho search endpoint did not return release JSON.");
      }

      return true;
    } catch {
      throw new Error("Could not reach AnimeTosho search JSON endpoint.");
    }
  }
};
