const QUALITIES = [ "1080", "720", "540", "480" ];

const DUBBED_REGEX = /\b(?:dub|dubs|dubbed|dual|dual[\s._-]*audio|eng[\s._-]*dub|english[\s._-]*dub)\b/i;

const STRONG_BATCH_REGEX = /\b(?:batch|complete|complete[\s._-]*series|complete[\s._-]*season|all[\s._-]*episodes|episodes?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}|eps?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}|\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3})\b/i;

const SINGLE_EPISODE_REGEX = /\b(?:s\d{1,2}e\d{1,3}|episode[\s._-]*\d{1,3}|ep[\s._-]*\d{1,3}|e\d{1,3})\b/i;

const WEAK_BATCH_REGEX = /\b(?:season[\s._-]*\d{1,2}|s\d{1,2})\b/i;

export default new class NyaaDubbed {
  base = "https://nyaa.si/?page=rss";

  cleanTitle(title = "") {
    return title.replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
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

  buildRssUrl(query) {
    const params = new URLSearchParams({
      page: "rss",
      q: query,
      c: "1_2",
      f: "0"
    });

    return this.base + "?" + params.toString();
  }

  text(node, name) {
    const found = [...node.children].find(el =>
      el.localName?.toLowerCase() === name.toLowerCase()
    );

    return found?.textContent?.trim() || "";
  }

  parseSize(sizeText = "") {
    const match = sizeText.match(/([\d.]+)\s*([KMGT]?i?B|[KMGT]?B)/i);
    if (!match) return 0;

    const value = Number(match[1]);
    const unit = match[2].toUpperCase();

    const units = {
      B: 1,
      KB: 1e3,
      MB: 1e6,
      GB: 1e9,
      TB: 1e12,
      KIB: 1024,
      MIB: 1024 ** 2,
      GIB: 1024 ** 3,
      TIB: 1024 ** 4
    };

    return Math.round(value * (units[unit] || 1));
  }

  magnetFromHash(hash, title) {
    if (!hash) return "";

    return "magnet:?xt=urn:btih:" + hash + "&dn=" + encodeURIComponent(title);
  }

  isDubbed(title = "") {
    return DUBBED_REGEX.test(title);
  }

  isBatch(title = "") {
    if (STRONG_BATCH_REGEX.test(title)) return true;
    if (SINGLE_EPISODE_REGEX.test(title)) return false;
    if (WEAK_BATCH_REGEX.test(title)) return true;

    return false;
  }

  shouldExclude(title, excl = []) {
    const lowerTitle = title.toLowerCase();
    return excl.some(item => lowerTitle.includes(String(item).toLowerCase()));
  }

  parseItem(item) {
    const title = this.text(item, "title");
    const link = this.text(item, "link");
    const pubDate = this.text(item, "pubDate");

    const hash =
      this.text(item, "infoHash") ||
      this.text(item, "infohash") ||
      "";

    const seeders = Number(this.text(item, "seeders") || 0);
    const leechers = Number(this.text(item, "leechers") || 0);
    const downloads = Number(this.text(item, "downloads") || 0);
    const size = this.parseSize(this.text(item, "size"));

    const magnet = link.startsWith("magnet:")
      ? link
      : this.magnetFromHash(hash, title);

    const torrentUrl = link.startsWith("http")
      ? link
      : "";

    return {
      rawTitle: title,
      title,
      magnet,
      torrentUrl,
      hash,
      seeders,
      leechers,
      downloads,
      size,
      date: pubDate ? new Date(pubDate) : new Date()
    };
  }

  async rssSearch(query) {
    const res = await fetch(this.buildRssUrl(query));
    const xmlText = await res.text();

    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const items = [...doc.querySelectorAll("item")];

    return items.map(item => this.parseItem(item));
  }

  async searchQueries(queries) {
    const results = [];

    for (const query of queries) {
      try {
        results.push(...await this.rssSearch(query));
      } catch {}
    }

    const seen = new Set();

    return results.filter(item => {
      const key = item.hash || item.magnet || item.torrentUrl || item.title;

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }

  map(entries, batch = false, useTorrent = false, excl = []) {
    return entries
      .filter(entry => this.isDubbed(entry.title))
      .filter(entry => !this.shouldExclude(entry.title, excl))
      .map(entry => ({
        title: entry.title,
        link: useTorrent && entry.torrentUrl ? entry.torrentUrl : entry.magnet || entry.torrentUrl,
        seeders: entry.seeders >= 3e4 ? 0 : entry.seeders,
        leechers: entry.leechers >= 3e4 ? 0 : entry.leechers,
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

    const title = this.cleanTitle(titles[0]);
    const ep = episode ? episode.toString().padStart(2, "0") : "";

    const queries = ep
      ? [
          `${title} ${ep} dub`,
          `${title} ${ep} dubbed`,
          `${title} ${ep} dual audio`,
          `${title} ${ep} english dub`
        ]
      : [
          `${title} dub`,
          `${title} dubbed`,
          `${title} dual audio`,
          `${title} english dub`
        ];

    const excl = this.buildExclusions(resolution, exclusions);
    const results = await this.searchQueries(queries);

    return this.map(results, false, options?.useTorrent, excl);
  }

  async batch({ titles, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];
    if (!titles?.length) return [];

    const title = this.cleanTitle(titles[0]);

    const queries = [
      `${title} batch dub`,
      `${title} batch dual audio`,
      `${title} complete dual audio`,
      `${title} season dual audio`,
      `${title} dubbed`
    ];

    const excl = this.buildExclusions(resolution, exclusions);
    const results = await this.searchQueries(queries);

    const batches = results.filter(entry => this.isBatch(entry.title));

    return this.map(batches, true, options?.useTorrent, excl);
  }

  async movie({ titles, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];
    if (!titles?.length) return [];

    const title = this.cleanTitle(titles[0]);

    const queries = [
      `${title} dub`,
      `${title} dubbed`,
      `${title} dual audio`,
      `${title} english dub`
    ];

    const excl = this.buildExclusions(resolution, exclusions);
    const results = await this.searchQueries(queries);

    return this.map(results, false, options?.useTorrent, excl);
  }

  async test() {
    try {
      const res = await fetch(this.buildRssUrl("test"));
      return res.ok;
    } catch {
      throw new Error("Could not reach Nyaa RSS. Does the site work in your region?");
    }
  }
};
