const QUALITIES = [ "1080", "720", "540", "480" ];

const DUBBED_REGEX = /\b(?:dubs?|dubbed|dual(?:[\s._-]*audio)?)\b/i;

const BATCH_REGEX = /\b(?:batch|complete|season|s\d{1,2}|ep(?:isodes?)?\s*\d+\s*[-~]\s*\d+|\d+\s*[-~]\s*\d+)\b/i;

export default new class Tosho {
  url = atob("aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ueHl6L2pzb24vdjEv");

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
    return DUBBED_REGEX.test(entry.title || "");
  }

  isBatch(entry, episode) {
    const title = entry.title || "";

    if (entry.num_files >= Math.min(24, Math.max(2, episode ?? 1))) {
      return true;
    }

    return BATCH_REGEX.test(title);
  }

  map(entries, useTorrent = false, excl = [], batch = false) {
    const exclusions = excl.map(e => String(e).toLowerCase());

    return entries
      .filter(entry => {
        const title = entry.title || "";
        const lowerTitle = title.toLowerCase();

        if (!this.isDubbed(entry)) return false;

        if (exclusions.length && exclusions.some(e => lowerTitle.includes(e))) {
          return false;
        }

        return true;
      })
      .map(entry => ({
        title: entry.title,
        link: useTorrent ? entry.torrent_url : entry.magnet,
        seeders: (entry.seeders || 0) >= 3e4 ? 0 : entry.seeders || 0,
        leechers: (entry.leechers || 0) >= 3e4 ? 0 : entry.leechers || 0,
        downloads: entry.downloads || 0,
        hash: entry.info_hash,
        size: entry.size_bytes,
        accuracy: "medium",
        type: batch ? "batch" : void 0,
        date: new Date(entry.date_added)
      }));
  }

  async single({ anidbEid, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];
    if (!anidbEid) throw new Error("No anidbEid provided");

    const res = await fetch(this.url + "episodes/" + anidbEid + "?limit=100");
    const data = await res.json();

    const excl = this.buildExclusions(resolution, exclusions);

    return data?.data?.releases?.length
      ? this.map(data.data.releases, options?.useTorrent, excl)
      : [];
  }

  async batch({ anidbAid, resolution, exclusions = [], episode }, options) {
    if (!navigator.onLine) return [];
    if (!anidbAid) throw new Error("No anidbAid provided");

    const res = await fetch(this.url + "series/anidb/" + anidbAid + "?limit=100");
    const data = await res.json();

    const excl = this.buildExclusions(resolution, exclusions);

    if (!data?.data?.releases?.length) return [];

    const batchReleases = data.data.releases.filter(entry =>
      this.isBatch(entry, episode)
    );

    return batchReleases.length
      ? this.map(batchReleases, options?.useTorrent, excl, true)
      : [];
  }

  async movie({ anidbAid, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];
    if (!anidbAid) throw new Error("No anidbAid provided");

    const res = await fetch(this.url + "series/anidb/" + anidbAid + "?limit=100");
    const data = await res.json();

    const excl = this.buildExclusions(resolution, exclusions);

    return data?.data?.releases?.length
      ? this.map(data.data.releases, options?.useTorrent, excl)
      : [];
  }

  async test() {
    try {
      if (!(await fetch(this.url)).ok) {
        throw new Error(`Failed to load data from ${this.url}! Is the site down?`);
      }

      return true;
    } catch (error) {
      throw new Error(`Could not reach ${this.url}! Does the site work in your region?`);
    }
  }
};
