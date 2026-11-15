import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Origin': 'https://zenkaii.pages.dev',
  'Referer': 'https://zenkaii.pages.dev/',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

const MEDIA_FIELDS = `
  fragment MediaFields on Media {
    id
    idMal
    title { romaji english native }
    coverImage { extraLarge large color }
    bannerImage
    season
    description(asHtml: false)
    genres
    averageScore
    popularity
    episodes
    duration
    format
    status
    seasonYear
    trailer { id site thumbnail }
    nextAiringEpisode { episode airingAt timeUntilAiring }
  }
`;

const CARD_FIELDS = `
  fragment CardFields on Media {
    id
    idMal
    title { romaji english native }
    coverImage { extraLarge large color }
    bannerImage
    season
    genres
    averageScore
    episodes
    format
    status
    seasonYear
  }
`;

const HOME_QUERY = `
  query ($season: MediaSeason, $year: Int) {
    trending: Page(perPage: 20) {
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ...MediaFields }
    }
    season: Page(perPage: 18) {
      media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, isAdult: false) { ...CardFields }
    }
    popular: Page(perPage: 18) {
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ...CardFields }
    }
    top: Page(perPage: 18) {
      media(type: ANIME, sort: SCORE_DESC, isAdult: false) { ...CardFields }
    }
    upcoming: Page(perPage: 18) {
      media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, isAdult: false) { ...CardFields }
    }
  }
  ${MEDIA_FIELDS}
  ${CARD_FIELDS}
`;

const LATEST_EPISODES_QUERY = `
  query {
    Page(page: 1, perPage: 20) {
      airingSchedules(notYetAired: false, sort: TIME_DESC) {
        id
        airingAt
        episode
        media {
          id
          title { english romaji native }
          coverImage { extraLarge large color }
          bannerImage
          format
          genres
          season
          seasonYear
          averageScore
        }
      }
    }
  }
`;

const DETAILS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ...MediaFields
      meanScore
      favourites
      source
      countryOfOrigin
      siteUrl
      startDate { year month day }
      endDate { year month day }
      synonyms
      studios { edges { isMain node { id name } } }
      tags { name rank isMediaSpoiler }
      rankings { rank type allTime year season context }
      characters(sort: [ROLE, RELEVANCE], perPage: 12) {
        edges {
          role
          node { id name { full } image { large } }
          voiceActors(language: JAPANESE, sort: RELEVANCE) { id name { full } image { large } }
        }
      }
      staff(sort: RELEVANCE, perPage: 8) {
        edges { role node { id name { full } image { large } } }
      }
      relations {
        edges {
          relationType(version: 2)
          node {
            id type
            title { romaji english native }
            coverImage { large color }
            format status averageScore seasonYear episodes
          }
        }
      }
      recommendations(sort: RATING_DESC, perPage: 14) {
        nodes {
          mediaRecommendation {
            id
            title { romaji english native }
            coverImage { large color }
            averageScore format episodes seasonYear
          }
        }
      }
      externalLinks { site url }
      streamingEpisodes { title thumbnail }
      stats {
        scoreDistribution { score amount }
        statusDistribution { status amount }
      }
    }
  }
  ${MEDIA_FIELDS}
`;

function getSeason() {
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  if (month >= 0 && month <= 2) return { season: 'WINTER', year };
  if (month >= 3 && month <= 5) return { season: 'SPRING', year };
  if (month >= 6 && month <= 8) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}

async function scrape() {
  console.log('[scraper] Scraping authentic Zenkai Web data from AniList & Zenkai endpoints...');
  const { season, year } = getSeason();

  // 1. Fetch Home Data
  console.log(`[scraper] Fetching home data for season: ${season} ${year}...`);
  const homeRes = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      query: HOME_QUERY,
      variables: { season, year },
    }),
  });

  if (!homeRes.ok) {
    throw new Error(`Failed to fetch home data: ${homeRes.status} ${homeRes.statusText}`);
  }

  const homeJson = await homeRes.json();
  const homeData = {
    trending: homeJson.data.trending.media,
    season: homeJson.data.season.media,
    popular: homeJson.data.popular.media,
    top: homeJson.data.top.media,
    upcoming: homeJson.data.upcoming.media,
  };

  console.log(`[scraper] Successfully scraped home data.`);

  // 2. Fetch Latest Airing Episodes
  console.log('[scraper] Fetching latest airing episodes...');
  const latestRes = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query: LATEST_EPISODES_QUERY }),
  });

  let latestEpisodes = [];
  if (latestRes.ok) {
    const latestJson = await latestRes.json();
    latestEpisodes = latestJson.data?.Page?.airingSchedules || [];
    console.log(`[scraper] Scraped ${latestEpisodes.length} latest episodes.`);
  }

  // 3. Fetch Details for One Piece (id: 21)
  console.log('[scraper] Fetching One Piece (id: 21) details...');
  let details21 = null;
  try {
    const detailsRes = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ query: DETAILS_QUERY, variables: { id: 21 } }),
    });
    if (detailsRes.ok) {
      const dj = await detailsRes.json();
      details21 = dj.data?.Media;
      console.log('[scraper] Scraped One Piece details successfully.');
    }
  } catch (err) {
    console.warn('[scraper] Warning: Failed to fetch One Piece details:', err.message);
  }

  const payload = {
    scrapedAt: new Date().toISOString(),
    season,
    year,
    home: homeData,
    latestEpisodes,
    details: {
      21: details21,
    },
  };

  const dataDir = path.join(__dirname, '../src/renderer/src/data');
  const publicDir = path.join(__dirname, '../public');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const targetJson = path.join(dataDir, 'fallback-home.json');
  const publicJson = path.join(publicDir, 'home-data.json');

  fs.writeFileSync(targetJson, JSON.stringify(payload, null, 2), 'utf-8');
  fs.writeFileSync(publicJson, JSON.stringify(payload, null, 2), 'utf-8');

  console.log(`[scraper] Wrote full scraped dataset to:\n  - ${targetJson}\n  - ${publicJson}`);
}

scrape().catch((err) => {
  console.error('[scraper] Error:', err);
  process.exit(1);
});
