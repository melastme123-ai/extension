const QUALITIES = [ "1080", "720", "540", "480" ];

const DUBBED_REGEX = /\b(?:dub|dubs|dubbed|dual|dual[\s._-]*audio|eng[\s._-]*dub|english[\s._-]*dub)\b/i;

// Things that usually mean a release is a batch.
const BATCH_REGEX = /\b(?:batch|complete|complete series|complete season|season\s*\d{1,2}|s\d{1,2}|episodes?\s*\d{1,3}\s*[-~]\s*\d{1,3}|eps?\s*\d{1,3}\s*[-~]\s*\d{1,3}|\d{1,3}\s*[-~]\s*\d{1,3})\b/i;

// Things that usually mean a release is only one episode.
const SINGLE_EPISODE_REGEX = /(?:^|[\s._\-[\(])(?:e?p?\s*)?\d{1,3}(?:v\d)?(?:[\s._\-\]\)]|$)|s\d{1,2}e\d{1,3}/i;

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

  getReleases(data) {
    return data?.data?.releases || [];
  }

  isDubbed(entry) {
    return DUBBED_REGEX.test(entry.title || "");
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
    const title = entry.title || "";
    const fileCount = this.getFileCount(entry);

    if (typeof fileCount === "number") {
      const minFiles = Math.min(24, Math.max(2, episode ?? 1));
      return fileCount >= minFiles;
    }

    if (BATCH_REGEX.test(title)) {
      return true;
    }

    if (SINGLE_EPISODE_REGEX.test(title)) {
      return false;
    }

    return false;
  }

  map(entries, batch = false, useTorrent = false, excl = []) {
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
    const json = await res.json();

    const releases = this.getReleases(json);
    const excl = this.buildExclusions(resolution, exclusions);

    return releases.length
      ? this.map(releases, false, options?.useTorrent, excl)
      : [];
  }

  async batch({ anidbAid, resolution, exclusions = [], episode }, options) {
    if (!navigator.onLine) return [];
    if (!anidbAid) throw new Error("No anidbAid provided");

    const res = await fetch(this.url + "series/anidb/" + anidbAid + "?limit=100");
    const json = await res.json();

    const releases = this.getReleases(json);
    const excl = this.buildExclusions(resolution, exclusions);

    const batchReleases = releases.filter(entry =>
      this.isBatch(entry, episode)
    );

    return batchReleases.length
      ? this.map(batchReleases, true, options?.useTorrent, excl)
      : [];
  }

  async movie({ anidbAid, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];
    if (!anidbAid) throw new Error("No anidbAid provided");

    const res = await fetch(this.url + "series/anidb/" + anidbAid + "?limit=100");
    const json = await res.json();

    const releases = this.getReleases(json);
    const excl = this.buildExclusions(resolution, exclusions);

    return releases.length
      ? this.map(releases, false, options?.useTorrent, excl)
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
