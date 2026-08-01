const QUALITIES = [ "1080", "720", "540", "480" ];

export default new class Tosho {
  url=atob("aHR0cHM6Ly9mZWVkLmFuaW1ldG9zaG8ueHl6L2pzb24=");

  isDubbed(entry) {
    const title = [
      entry.torrentName,
      entry.releaseName,
      entry.name,
      entry.title,
      entry.torrent_name
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return (
      /\bdual\b/.test(title) ||
      /\bmulti audio\b/.test(title) ||
      /\bmultiaudio\b/.test(title) ||
      /\bdub\b/.test(title) ||
      /\bdubbed\b/.test(title) ||
      /\beng dub\b/.test(title) ||
      /\benglish dub\b/.test(title) ||
      /\beng audio\b/.test(title) ||
      /\benglish audio\b/.test(title)
    );
  }

  _buildQuery({resolution: resolution, exclusions: exclusions}) {
    if (!exclusions?.length && !resolution) return "";

    const parts = [];

    if (exclusions?.length) {
      parts.push(`!("${exclusions.join('"|"')}")`);
    }

    if (resolution) {
      parts.push(`!(*${QUALITIES.filter(q => q !== resolution).join("*|*")}*)`);
    }

    return "&qx=1&q=" + parts.join("");
  }

  map(entries, batch = !1, useTorrent = !1) {
    return entries.filter(entry => this.isDubbed(entry)).map(entry => ({
      title: entry.title || entry.torrent_name,
      link: useTorrent ? entry.torrent_url : entry.magnet_uri,
      seeders: (entry.seeders || 0) >= 3e4 ? 0 : entry.seeders || 0,
      leechers: (entry.leechers || 0) >= 3e4 ? 0 : entry.leechers || 0,
      downloads: entry.torrent_downloaded_count || 0,
      hash: entry.info_hash,
      size: entry.total_size,
      accuracy: entry.anidb_fid && !batch ? "high" : "medium",
      type: batch ? "batch" : void 0,
      date: new Date(1e3 * entry.timestamp)
    }));
  }

  async single({anidbEid: anidbEid, resolution: resolution, exclusions: exclusions}, options) {
    if (!navigator.onLine) return [];
    if (!anidbEid) throw new Error("No anidbEid provided");
    const query = this._buildQuery({
      resolution: resolution,
      exclusions: exclusions
    }), res = await fetch(this.url + "?eid=" + anidbEid + query), data = await res.json();
    return data.length ? this.map(data, !1, options?.useTorrent) : [];
  }

  async batch({anidbAid: anidbAid, resolution: resolution, exclusions: exclusions, episode: episode}, options) {
    if (!navigator.onLine) return [];
    if (!anidbAid) throw new Error("No anidbAid provided");
    const query = this._buildQuery({
      resolution: resolution,
      exclusions: exclusions
    }), res = await fetch(this.url + "?order=size-d&aid=" + anidbAid + query), data = (await res.json()).filter(entry => entry.num_files >= Math.min(24, Math.max(2, episode ?? 1)));
    return data.length ? this.map(data, !0, options?.useTorrent) : [];
  }

  async movie({anidbAid: anidbAid, resolution: resolution, exclusions: exclusions}, options) {
    if (!navigator.onLine) return [];
    if (!anidbAid) throw new Error("No anidbAid provided");
    const query = this._buildQuery({
      resolution: resolution,
      exclusions: exclusions
    }), res = await fetch(this.url + "?aid=" + anidbAid + query), data = await res.json();
    return data.length ? this.map(data, !1, options?.useTorrent) : [];
  }

  async test() {
    try {
      if (!(await fetch(this.url)).ok) throw new Error(`Failed to load data from ${this.url}! Is the site down?`);
      return !0;
    } catch (error) {
      throw new Error(`Could not reach ${this.url}! Does the site work in your region?`);
    }
  }
};
