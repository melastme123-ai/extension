const QUALITIES = ["1080", "720", "540", "480"];

const SEASON_TO_MONTH = {
  WINTER: 1,
  SPRING: 4,
  SUMMER: 7,
  FALL: 10
};

const DUB_PATTERNS = [
  // Dub, Dubbed, Eng Dub, English Dub, EnglishDub, etc.
  /(?:^|[\s._()[\]{}-])(?:eng(?:lish)?[ ._-]*)?dub(?:bed)?(?:$|[\s._()[\]{}-])/i,

  // Dual Audio, Dual-Audio, Dual_Audio, etc.
  /(?:^|[\s._()[\]{}-])dual[ ._-]*audio(?:$|[\s._()[\]{}-])/i,

  // English Audio or Eng Audio
  /(?:^|[\s._()[\]{}-])(?:eng|english)[ ._-]*audio(?:$|[\s._()[\]{}-])/i
];

function mediaStartDate(media) {
  const month = Math.max(
    (media.startDate?.month ?? SEASON_TO_MONTH[media.season] ?? 1) - 2,
    0
  );

  const year =
    media.seasonYear ??
    media.startDate?.year ??
    new Date().getFullYear();

  return new Date(year, month).toISOString();
}

function isDubbed(entry) {
  const title = entry.torrentName || entry.releaseName || "";

  return DUB_PATTERNS.some(pattern => pattern.test(title));
}

export default new class AniSearchDub {
  url = atob(
    "aHR0cHM6Ly9hcGkuYW5pc2VhcmNoLm9yZy90b3JyZW50cz8="
  );

  *_buildName(resolution, exclusions = []) {
    for (const exclusion of exclusions) {
      if (exclusion) {
        yield `not.ilike.*${exclusion}*`;
      }
    }

    if (resolution) {
      for (const quality of QUALITIES.filter(
        quality => quality !== resolution
      )) {
        yield `not.ilike.*${quality}*`;
      }
    }
  }

  async _fetch(fetch, search, exclusions, batch = false) {
    for (const exclusion of exclusions) {
      search.append("name", exclusion);
    }

    const response = await fetch(this.url + search.toString());

    if (!response.ok) {
      throw new Error(
        `Failed to fetch results. Status: ${response.status}`
      );
    }

    const json = await response.json();

    if (!Array.isArray(json)) {
      throw new Error("Invalid response from server!");
    }

    return json
      .filter(isDubbed)
      .map(entry => ({
        title: entry.torrentName || entry.releaseName,
        link: entry.torrentFileUrl,
        seeders: 0,
        leechers: 0,
        downloads: 0,
        hash: entry.infohash,
        size: entry.length,
        accuracy: "medium",
        type: batch ? "batch" : undefined,
        date: new Date(entry.createdAt)
      }));
  }

  async single(
    {
      anidbEid,
      resolution,
      exclusions,
      fetch,
      media
    },
    options
  ) {
    if (!navigator.onLine) {
      return [];
    }

    if (!anidbEid) {
      throw new Error("No anidbEid provided");
    }

    const search = new URLSearchParams({
      eid: anidbEid.toString(),
      includeFiles: "false",
      after: mediaStartDate(media)
    });

    return this._fetch(
      fetch,
      search,
      this._buildName(resolution, exclusions)
    );
  }

  async batch(
    {
      anidbAid,
      resolution,
      exclusions,
      episode,
      media,
      fetch
    },
    options
  ) {
    if (!navigator.onLine) {
      return [];
    }

    if (!anidbAid) {
      throw new Error("No anidbAid provided");
    }

    const search = new URLSearchParams({
      aid: anidbAid.toString(),
      fileCount:
        "gte." + Math.min(24, Math.max(2, episode ?? 1)),
      includeFiles: "false",
      after: mediaStartDate(media)
    });

    return this._fetch(
      fetch,
      search,
      this._buildName(resolution, exclusions),
      true
    );
  }

  async movie(
    {
      anidbAid,
      resolution,
      exclusions,
      fetch,
      media
    },
    options
  ) {
    if (!navigator.onLine) {
      return [];
    }

    if (!anidbAid) {
      throw new Error("No anidbAid provided");
    }

    const search = new URLSearchParams({
      aid: anidbAid.toString(),
      includeFiles: "false",
      after: mediaStartDate(media)
    });

    return this._fetch(
      fetch,
      search,
      this._buildName(resolution, exclusions)
    );
  }

  async test() {
    try {
      const response = await fetch(this.url);

      if (!response.ok) {
        throw new Error(
          `Failed to load data from ${this.url}! Is the site down?`
        );
      }

      return true;
    } catch (error) {
      throw new Error(
        `Could not reach ${this.url}! Does the site work in your region?`
      );
    }
  }
};
