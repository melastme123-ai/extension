const QUALITIES = [ "1080", "720", "540", "480" ];

const DUBBED_REGEX = /\b(?:dub|dubs|dubbed|dual|dual[\s._-]*audio|eng[\s._-]*dub|english[\s._-]*dub)\b/i;

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

  map(entries, useTorrent = false, excl = [], batch = false) {
    const exclusions = excl.map(e => String(e).toLowerCase());

    return entries
      .filter(entry => {
        const title = entry.title || "";
        const lowerTitle = title.toLowerCase();

        if (!DUBBED_REGEX.test(title)) return false;

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

  async batch({ anidbAid, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];
    if (!anidbAid) throw new Error("No anidbAid provided");

    const res = await fetch(this.url + "series/anidb/" + anidbAid + "?limit=100");
    const data = await res.json();

    const excl = this.buildExclusions(resolution, exclusions);

    return data?.data?.releases?.length
      ? this.map(data.data.releases, options?.useTorrent, excl, true)
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
