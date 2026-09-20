const playerHref = (id, streamId = id) =>
  `/player?self-link=${encodeURIComponent(`https://zapp-gw.web.app/beacon/video-preload/${id}/streams/${streamId}`)}`;

export const artworkHref = (id) => `https://warhammertv.com/art/${id}.svg`;

function entry({ id, streamId, title, type, collection, summary, year, length, parentSeriesId, releaseDate, artwork }) {
  return {
    id: String(id),
    type: { value: type },
    title,
    summary,
    _webLink: type === 'series' ? `/series/${id}` : playerHref(id, streamId),
    ...(artwork ? { media_group: [{ type: 'image', media_item: [{ key: 'image_base', src: artworkHref(id) }] }] } : {}),
    extensions: {
      production_year: year,
      ...(releaseDate ? { release_date: releaseDate } : {}),
      length,
      position: Number(id),
      free: true,
      requires_authentication: false,
      seo_keywords: [collection, 'Warhammer'],
      ...(parentSeriesId
        ? {
            social_url: `/tv-show/${parentSeriesId}-fixture-series/season/1-season-1/`,
          }
        : {}),
    },
  };
}

export const fixtureDocument = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Warhammer TV fixture</title></head>
  <body><main id="source-root"><h1>Original Warhammer TV fixture</h1></main></body>
</html>`;

export const homePayload = {
  serverLoadedFeeds: [
    {
      feed: {
        title: 'Animations',
        entry: [
          entry({
            id: 101,
            title: 'Example Series',
            type: 'series',
            collection: 'Animations',
            summary: 'A fixture series.',
            year: 2025,
            releaseDate: '2025-01-10',
            artwork: true,
          }),
          entry({
            id: 25852,
            title: 'Battle Report ...Report?',
            type: 'series',
            collection: 'Animations',
            summary: 'An invalid series that must not be shown.',
            year: 2025,
          }),
          entry({
            id: 201,
            title: 'Example Battle',
            type: 'episodes',
            collection: 'Animations',
            summary: 'A fixture battle episode.',
            year: 2025,
            length: 24,
            parentSeriesId: 101,
          }),
        ],
      },
    },
    {
      feed: {
        title: 'Painting & Building',
        entry: [
          entry({
            id: 301,
            streamId: 399,
            title: 'Brush Control',
            type: 'video',
            collection: 'Painting & Building',
            summary: 'A fixture painting tutorial.',
            year: 2024,
            releaseDate: '2024-06-01',
            length: 18,
          }),
        ],
      },
    },
  ],
};

export const seriesPayload = {
  screenEntry: {
    id: '101',
    title: 'Example Series',
    extensions: {
      title: 'Example Series',
      description: 'A deterministic series fixture.',
      production_year: 2025,
      episode_count: 2,
    },
  },
  serverLoadedFeeds: [
    {
      feed: {
        title: 'Episodes',
        entry: [
          entry({
            id: 201,
            title: 'Example Battle',
            type: 'episodes',
            collection: 'Episodes',
            summary: 'The first fixture episode.',
            year: 2025,
            length: 24,
            parentSeriesId: 101,
            artwork: true,
          }),
          entry({
            id: 202,
            title: 'Example Reinforcements',
            type: 'episodes',
            collection: 'Episodes',
            summary: 'The second fixture episode.',
            year: 2025,
            length: 27,
            parentSeriesId: 101,
          }),
        ],
      },
    },
  ],
};

export const paintingDeskPayload = {
  screenEntry: {
    id: '25751',
    title: 'Painting Desk',
    extensions: {
      title: 'Painting Desk',
      description: 'A fixture collection with 26 videos.',
      production_year: 2025,
      episode_count: 26,
    },
  },
  serverLoadedFeeds: [
    {
      feed: {
        title: 'Painting Desk: Season 1',
        entry: Array.from({ length: 26 }, (_, index) =>
          entry({
            id: 400 + index,
            title: `Painting Desk Video ${index + 1}`,
            type: 'episodes',
            collection: 'Painting Desk: Season 1',
            summary: `Painting Desk fixture video ${index + 1}.`,
            year: 2025,
            length: 20 + index,
            parentSeriesId: 25751,
          }),
        ),
      },
    },
  ],
};
