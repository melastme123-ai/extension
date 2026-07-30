const QUALITIES = [ "1080", "720", "540", "480" ];

const DUBBED_REGEX = /\b(?:dub|dubs|dubbed|dual|dual[\s._-]*audio|multi[\s._-]*audio|eng[\s._-]*dub|english[\s._-]*dub)\b/i;

const STRONG_BATCH_REGEX = /\b(?:batch|complete|complete[\s._-]*series|complete[\s._-]*season|all[\s._-]*episodes|episodes?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}|eps?[\s._-]*\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3}|s\d{1,2}e\d{1,3}[\s._-]*[-~][\s._-]*(?:s\d{1,2}e)?\d{1,3}|\d{1,3}[\s._-]*[-~][\s._-]*\d{1,3})\b/i;

const SINGLE_EPISODE_REGEX = /\b(?:s\d{1,2}e\d{1,3}|episode[\s._-]*\d{1,3}|ep[\s._-]*\d{1,3}|e\d{1,3})\b/i;

const WEAK_BATCH_REGEX = /\b(?:season[\s._-]*\d{1,2}|s\d{1,2})\b/i;

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

    if (STRONG_BATCH_REGEX.test(title)) {
      return true;
    }

    if (SINGLE_EPISODE_REGEX.test(title)) {
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

  async single({ anidbEid, anidbAid, resolution, exclusions = [] }, options) {
    if (!navigator.onLine) return [];

    if (!anidbEid && anidbAid) {
      return this.movie({ anidbAid, resolution, exclusions }, options);
    }

    if (!anidbEid) return [];

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
    if (!anidbAid) return [];

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
    if (!anidbAid) return [];

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
      const res = await fetch(atob("aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ueHl6L2pzb24="));

      if (!res.ok) {
        throw new Error("AnimeTosho API unavailable.");
      }

      return true;
    } catch {
      throw new Error("Could not reach AnimeTosho API.");
    }
  }
};
