const QUALITIES = [ "1080", "720", "540", "480" ];

const DUBBED_REGEX = /\b(?:dub|dubs|dubbed|dual|dual[\s._-]*audio|eng[\s._-]*dub|english[\s._-]*dub|multi[\s._-]*audio|multi[\s._-]*dub)\b/i;

const EXPLICIT_BATCH_REGEX = /\b(?:batch|complete|complete[\s._-]*series|complete[\s._-]*season|complete[\s._-]*collection|all[\s._-]*episodes|season[\s._-]*pack|series[\s._-]*pack)\b/i;

const RANGE_BATCH_REGEX = /\b(?:episodes?|eps?)?[\s._-]*\d{1,3}[\s._-]*(?:-|~|to)[\s._-]*\d{1,3}\b/i;

const SINGLE_EPISODE_REGEX = /\b(?:s\d{1,2}e\d{1,3}|episode[\s._-]*\d{1,3}|ep[\s._-]*\d{1,3}|e\d{1,3})\b/i;

const PLAIN_SINGLE_EPISODE_REGEX = /(?:^|[\s\]])-\s*\d{1,3}(?:v\d)?(?=[\s\[])/i;

const WEAK_BATCH_REGEX = /\b(?:season[\s._-]*\d{1,2}|s\d{1,2})\b/i;

export default new class NyaaDubbed {
  base = "https://nyaasi-api.vercel.app/api/search";

  cleanTitle(title = "") {
    return title
      .replace(/[^\w\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  unique(list) {
    return [...new Set(list.filter(Boolean))];
  }

  cleanCount(value) {
    const count = Number(value || 0);
    return count >= 30000 ? 0 : count;
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

  isDubbed(title = "") {
    return DUBBED_REGEX.test(title);
  }

  isBatch(title = "") {
    if (EXPLICIT_BATCH_REGEX.test(title)) return true;
    if (RANGE_BATCH_REGEX.test(title)) return true;

    if (SINGLE_EPISODE_REGEX.test(title)) return false;
    if (PLAIN_SINGLE_EPISODE_REGEX.test(title)) return false;

    if (WEAK_BATCH_REGEX.test(title)) return true;

    return false;
  }

  shouldExclude(title = "", exclusions = []) {
    const lowerTitle = title.toLowerCase();

    return exclusions.some(exclusion =>
      lowerTitle.includes(String(exclusion).toLowerCase())
    );
  }

  parseSize(sizeText = "") {
    const match = String(sizeText).match(/([\d.]+)\s*([KMGT]?i?B|[KMGT]?B)/i);

    if (!match) return 0;

    const value = Number(match[1]);
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

    return Math.round(value * (units[unit] || 1));
  }

  getHash(magnet = "") {
    return magnet.match(/btih:([A-Za-z0-9]+)/)?.[1] || "";
  }

  normalizeItem(item) {
    const title = item.Name || item.name || item.title || "";
    const magnet = item.Magnet || item.magnet || "";
    const torrent = item.Torrent || item.torrent || item.Link || item.link || "";

    return {
      title,
      magnet,
      torrent,
      hash: this.getHash(magnet),
      seeders: this.cleanCount(item.Seeders ?? item.seeders),
      leechers: this.cleanCount(item.Leechers ?? item.leechers),
      downloads: Number(item.Downloads || item.downloads || 0),
      size: this.parseSize(item.Size || item.size || ""),
      date: new Date(item.DateUploaded || item.date || item.created_at || Date.now())
    };
  }

  async search(query) {
    const res = await fetch(this.base + encodeURIComponent(query));
    const data = await res.json();

    if (!Array.isArray(data)) return [];

    return data.map(item => this.normalizeItem(item));
  }

  async searchMany(queries) {
    const results = [];

    for (const query of this.unique(queries)) {
      try {
        results.push(...await this.search(query));
      } catch {}
    }

    const seen = new Set();

    return results.filter(item => {
      const key = item.hash || item.magnet || item.torrent || item.title;

      if (!key || seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }

  titleVariants(titles = []) {
    return this.unique(
      titles
        .slice(0, 3)
        .map(title => this.cleanTitle(title))
    );
  }

  map(entries, batch = false, useTorrent = false, exclusions = []) {
    return entries
      .filter(entry => this.isDubbed(entry.title))
      .filter(entry => !this.shouldExclude(entry.title, exclusions))
      .map(entry => ({
        title: entry.title,
        link: useTorrent && entry.torrent ? entry.torrent : entry.magnet || entry.torrent,
        seeders: entry.seeders,
        leechers: entry.leechers,
        downloads: entry.downloads,
        hash: entry.hash,
        size: entry.size,
        accuracy: "medium",
        type: batch ? "batch" : void 0,
        date: entry.date
      }))
      .filter(entry => entry.link);
  }

  async single({ titles, episode, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];
    if (!titles?.length) return [];

    const variants = this.titleVariants(titles);
    const ep = episode ? episode.toString().padStart(2, "0") : "";
    const queries = [];

    for (const title of variants) {
      if (ep) {
        queries.push(`${title} ${ep} dub`);
        queries.push(`${title} ${ep} dubbed`);
        queries.push(`${title} ${ep} english dub`);
        queries.push(`${title} ${ep} dual audio`);
      } else {
        queries.push(`${title} dub`);
        queries.push(`${title} dubbed`);
        queries.push(`${title} english dub`);
        queries.push(`${title} dual audio`);
      }
    }

    const results = await this.searchMany(queries);
    const excl = this.buildExclusions(resolution, exclusions);

    return this.map(results, false, options?.useTorrent, excl);
  }

  async batch({ titles, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];
    if (!titles?.length) return [];

    const variants = this.titleVariants(titles);
    const queries = [];

    for (const title of variants) {
      queries.push(`${title} batch dub`);
      queries.push(`${title} batch dual audio`);
      queries.push(`${title} complete dub`);
      queries.push(`${title} complete dual audio`);
      queries.push(`${title} season dual audio`);
      queries.push(`${title} dubbed`);
      queries.push(`${title} dual audio`);
    }

    const results = await this.searchMany(queries);
    const batches = results.filter(entry => this.isBatch(entry.title));
    const excl = this.buildExclusions(resolution, exclusions);

    return this.map(batches, true, options?.useTorrent, excl);
  }

  async movie({ titles, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];
    if (!titles?.length) return [];

    const variants = this.titleVariants(titles);
    const queries = [];

    for (const title of variants) {
      queries.push(`${title} dub`);
      queries.push(`${title} dubbed`);
      queries.push(`${title} english dub`);
      queries.push(`${title} dual audio`);
    }

    const results = await this.searchMany(queries);
    const excl = this.buildExclusions(resolution, exclusions);

    return this.map(results, false, options?.useTorrent, excl);
  }

  async test() {
    try {
      const res = await fetch(this.base + encodeURIComponent("one piece dub"));

      if (!res.ok) {
        throw new Error("Failed to reach Nyaa proxy API.");
      }

      return true;
    } catch {
      throw new Error("Could not reach the Nyaa proxy API. The proxy may be down or blocked.");
    }
  }
}();
