const QUALITIES = [ "1080", "720", "540", "480" ];

const DUBBED_REGEX = /\b(?:dub|dubs|dubbed|dual|dual[\s._-]*audio|eng[\s._-]*dub|english[\s._-]*dub|multi[\s._-]*audio|multi[\s._-]*dub)\b/i;

const STRONG_BATCH_REGEX = /\b(?:batch|complete|complete[\s._-]*series|complete[\s._-]*season|complete[\s._-]*collection|all[\s._-]*episodes|season[\s._-]*pack|series[\s._-]*pack|episodes?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}|eps?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}|\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3})\b/i;

const SINGLE_EPISODE_REGEX = /\b(?:s\d{1,2}e\d{1,3}|episode[\s._-]*\d{1,3}|ep[\s._-]*\d{1,3}|e\d{1,3})\b/i;

const PLAIN_SINGLE_EPISODE_REGEX = /(?:^|[\s\]])-\s*\d{1,3}(?:v\d)?(?=[\s\[])/i;

const WEAK_BATCH_REGEX = /\b(?:season[\s._-]*\d{1,2}|s\d{1,2})\b/i;

export default new class ToshoDubbed {
  // New AnimeTosho v1 API
  url = atob("aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ueHl6L2pzb24vdjEv");

  // General AnimeTosho JSON feed for title fallback
  searchUrl = atob("aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ueHl6L2pzb24vdjEvc2VhcmNo");

  cleanCount(value) {
    const count = Number(value || 0);
    return count >= 30000 ? 0 : count;
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

  buildExclusions(resolution, exclusions = []) {
    const list = Array.isArray(exclusions) ? exclusions : [];

    if (!resolution) return list;

    return list.concat(
      QUALITIES
        .filter(q => q !== String(resolution))
        .map(q => `${q}p`)
    );
  }

  getReleases(data) {
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

  isDubbed(entry) {
    return DUBBED_REGEX.test(this.getTitle(entry));
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

    if (WEAK_BATCH_REGEX.test(title)) {
      return true;
    }

    return false;
  }

  shouldExclude(entry, exclusions = []) {
    const title = this.getTitle(entry).toLowerCase();

    return exclusions.some(exclusion =>
      title.includes(String(exclusion).toLowerCase())
    );
  }

  map(entries, batch = false, useTorrent = false, exclusions = []) {
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

  titleVariants(titles = []) {
    const cleaned = this.unique(
      titles
        .filter(title => typeof title === "string" && title.trim())
        .map(title => this.cleanSearchTitle(title))
    );

    const extra = [];

    for (const title of cleaned) {
      const words = title.split(/\s+/).filter(Boolean);

      // For very long titles, search the first few words too.
      if (words.length > 4) {
        extra.push(words.slice(0, 4).join(" "));
        extra.push(words.slice(0, 6).join(" "));
      }

      // If title has a dash-style subtitle, also search the main part.
      const mainPart = title.split(/\s+-\s+|\s+:\s+/)[0]?.trim();
      if (mainPart && mainPart.length >= 3) extra.push(mainPart);
    }

    // Helpful fallback for this anime because AnimeTosho title uses SHIBOYUGI.
    const joined = cleaned.join(" ").toLowerCase();
    if (
      joined.includes("death games") ||
      joined.includes("shibou yuugi") ||
      joined.includes("shibou yugi") ||
      joined.includes("playing death")
    ) {
      extra.push("SHIBOYUGI");
      extra.push("Playing Death Games");
      extra.push("Shibou Yuugi");
    }

    return this.unique([...cleaned, ...extra]).slice(0, 8);
  }

  buildFeedUrls(query) {
    const urls = [];

    for (const base of this.searchUrls) {
      urls.push(base + "?qx=1&q=" + encodeURIComponent(query));
      urls.push(base + "?q=" + encodeURIComponent(query));
    }

    return urls;
  }

  async feedSearch(query) {
    try {
      const res = await fetch(
        this.searchUrl + "?q=" + encodeURIComponent(query) + "&limit=100"
      );
  
      if (!res.ok) return [];
  
      const json = await res.json();
  
      return json?.data?.releases || [];
    } catch {
      return [];
    }
  }

  async titleSearch({ titles = [], resolution, exclusions = [] }, options, batch = false, episode) {
    if (!titles?.length) return [];

    const variants = this.titleVariants(titles);
    const allResults = [];

    for (const title of variants) {
      const queries = this.unique([
        `${title} dub`,
        `${title} dubbed`,
        `${title} english dub`,
        `${title} dual audio`,
        title
      ]);

      for (const q of queries) {
        const results = await this.feedSearch(q);
        allResults.push(...results);
      }
    }

    const seen = new Set();

    const deduped = allResults.filter(entry => {
      const key = entry.info_hash || this.getMagnet(entry) || this.getTitle(entry);

      if (!key || seen.has(key)) return false;

      seen.add(key);
      return true;
    });

    const excl = this.buildExclusions(resolution, exclusions);

    const filtered = batch
      ? deduped.filter(entry => this.isBatch(entry, episode))
      : deduped;

    return this.map(filtered, batch, options?.useTorrent, excl);
  }

  async single({ anidbEid, anidbAid, titles = [], resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];

    if (!anidbEid && anidbAid) {
      const movieResults = await this.movie({ anidbAid, titles, resolution, exclusions }, options);

      if (movieResults.length) return movieResults;

      return this.titleSearch({ titles, resolution, exclusions }, options, false);
    }

    if (!anidbEid) {
      return this.titleSearch({ titles, resolution, exclusions }, options, false);
    }

    try {
      const res = await fetch(this.url + "episodes/" + anidbEid + "?limit=100");

      if (res.ok) {
        const json = await res.json();
        const releases = this.getReleases(json);
        const excl = this.buildExclusions(resolution, exclusions);

        const results = releases.length
          ? this.map(releases, false, options?.useTorrent, excl)
          : [];

        if (results.length) return results;
      }
    } catch {}

    return this.titleSearch({ titles, resolution, exclusions }, options, false);
  }

  async batch({ anidbAid, titles = [], resolution, exclusions = [], episode }, options) {
    if (!navigator.onLine) return [];

    if (!anidbAid) {
      return this.titleSearch({ titles, resolution, exclusions }, options, true, episode);
    }

    try {
      const res = await fetch(this.url + "series/anidb/" + anidbAid + "?limit=300");

      if (res.ok) {
        const json = await res.json();
        const releases = this.getReleases(json);
        const excl = this.buildExclusions(resolution, exclusions);

        const batchReleases = releases.filter(entry =>
          this.isBatch(entry, episode)
        );

        const results = batchReleases.length
          ? this.map(batchReleases, true, options?.useTorrent, excl)
          : [];

        if (results.length) return results;
      }
    } catch {}

    return this.titleSearch({ titles, resolution, exclusions }, options, true, episode);
  }

  async movie({ anidbAid, titles = [], resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];

    if (!anidbAid) {
      return this.titleSearch({ titles, resolution, exclusions }, options, false);
    }

    try {
      const res = await fetch(this.url + "series/anidb/" + anidbAid + "?limit=300");

      if (res.ok) {
        const json = await res.json();
        const releases = this.getReleases(json);
        const excl = this.buildExclusions(resolution, exclusions);

        const results = releases.length
          ? this.map(releases, false, options?.useTorrent, excl)
          : [];

        if (results.length) return results;
      }
    } catch {}

    return this.titleSearch({ titles, resolution, exclusions }, options, false);
  }

  async test() {
    try {
      const res = await fetch(this.url);

      if (!res.ok) {
        throw new Error(`Failed to load data from ${this.url}! Is the site down?`);
      }

      return true;
    } catch {
      throw new Error(`Could not reach ${this.url}! Does the site work in your region?`);
    }
  }
};
