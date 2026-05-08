/**
 * news-feed-sources.js
 *
 * Curated catalog of RSS/Atom feed sources organized by topic slug.
 * Used as a fallback when the backend (127.0.0.1:8000) is unavailable
 * or returns empty results for a topic.
 *
 * Each topic carries:
 *   id      — stable numeric ID (negative to avoid collision with backend IDs)
 *   slug    — kebab-case identifier reused for filtering / preferences
 *   name    — human-readable label
 *   icon    — single-glyph icon used in the topic chip
 *   sources — array of feed source descriptors {name, url, lang}
 *
 * Source URLs intentionally favor publishers that expose CORS-friendly RSS;
 * for blocked feeds the rss-fetcher routes through the backend or gracefully
 * skips the source.
 */

const NEWS_FEED_TOPICS = [
  {
    id: -1,
    slug: 'ai',
    name: 'AI & ML',
    icon: '🧠',
    sources: [
      { name: 'TechCrunch AI',         url: 'https://techcrunch.com/category/artificial-intelligence/feed/', lang: 'en' },
      { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', lang: 'en' },
      { name: 'VentureBeat AI',        url: 'https://venturebeat.com/category/ai/feed/', lang: 'en' },
      { name: 'Google DeepMind Blog',  url: 'https://deepmind.google/blog/rss.xml', lang: 'en' },
      { name: 'OpenAI Blog',           url: 'https://openai.com/blog/rss.xml', lang: 'en' }
    ]
  },
  {
    id: -2,
    slug: 'claude',
    name: 'Claude & Anthropic',
    icon: '🪶',
    sources: [
      { name: 'Anthropic News',        url: 'https://www.anthropic.com/news/rss.xml', lang: 'en' },
      { name: 'Anthropic Engineering', url: 'https://www.anthropic.com/engineering/rss.xml', lang: 'en' }
    ]
  },
  {
    id: -3,
    slug: 'llm',
    name: 'LLM research',
    icon: '📝',
    sources: [
      { name: 'arXiv cs.CL',         url: 'https://export.arxiv.org/rss/cs.CL', lang: 'en' },
      { name: 'arXiv cs.LG',         url: 'https://export.arxiv.org/rss/cs.LG', lang: 'en' },
      { name: 'Hugging Face Papers', url: 'https://huggingface.co/papers/rss', lang: 'en' }
    ]
  },
  {
    id: -4,
    slug: 'tech',
    name: 'Tech',
    icon: '💻',
    sources: [
      { name: 'The Verge',         url: 'https://www.theverge.com/rss/index.xml', lang: 'en' },
      { name: 'Ars Technica',      url: 'https://feeds.arstechnica.com/arstechnica/index', lang: 'en' },
      { name: 'TechCrunch',        url: 'https://techcrunch.com/feed/', lang: 'en' },
      { name: 'Hacker News',       url: 'https://hnrss.org/frontpage', lang: 'en' },
      { name: 'Wired',             url: 'https://www.wired.com/feed/rss', lang: 'en' }
    ]
  },
  {
    id: -5,
    slug: 'cz-tech',
    name: 'Tech (CZ)',
    icon: '🇨🇿',
    sources: [
      { name: 'Lupa.cz',  url: 'https://www.lupa.cz/rss/clanky/', lang: 'cs' },
      { name: 'Root.cz',  url: 'https://www.root.cz/rss/clanky/', lang: 'cs' },
      { name: 'Živě.cz',  url: 'https://www.zive.cz/rss/sc-47/default.aspx', lang: 'cs' }
    ]
  },
  {
    id: -6,
    slug: 'world',
    name: 'World',
    icon: '🌍',
    sources: [
      { name: 'BBC World',     url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en' },
      { name: 'NPR News',      url: 'https://feeds.npr.org/1001/rss.xml', lang: 'en' },
      { name: 'The Guardian',  url: 'https://www.theguardian.com/world/rss', lang: 'en' },
      { name: 'Al Jazeera',    url: 'https://www.aljazeera.com/xml/rss/all.xml', lang: 'en' }
    ]
  },
  {
    id: -7,
    slug: 'cz-news',
    name: 'Zprávy (CZ)',
    icon: '📰',
    sources: [
      { name: 'ČT24',            url: 'https://ct24.ceskatelevize.cz/rss/hlavni-zpravy', lang: 'cs' },
      { name: 'Seznam Zprávy',   url: 'https://www.seznamzpravy.cz/rss', lang: 'cs' },
      { name: 'Aktuálně.cz',     url: 'https://www.aktualne.cz/mrss.phtml?cat=zpravy', lang: 'cs' },
      { name: 'Novinky.cz',      url: 'https://www.novinky.cz/rss', lang: 'cs' },
      { name: 'iROZHLAS',        url: 'https://www.irozhlas.cz/rss/irozhlas', lang: 'cs' }
    ]
  },
  {
    id: -8,
    slug: 'business',
    name: 'Business',
    icon: '📈',
    sources: [
      { name: 'BBC Business',   url: 'https://feeds.bbci.co.uk/news/business/rss.xml', lang: 'en' },
      { name: 'Reuters Markets',url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best', lang: 'en' },
      { name: 'Bloomberg Tech', url: 'https://feeds.bloomberg.com/technology/news.rss', lang: 'en' }
    ]
  },
  {
    id: -9,
    slug: 'crypto',
    name: 'Crypto',
    icon: '🪙',
    sources: [
      { name: 'CoinDesk',     url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', lang: 'en' },
      { name: 'Cointelegraph',url: 'https://cointelegraph.com/rss', lang: 'en' },
      { name: 'Decrypt',      url: 'https://decrypt.co/feed', lang: 'en' }
    ]
  },
  {
    id: -10,
    slug: 'science',
    name: 'Science',
    icon: '🔬',
    sources: [
      { name: 'Nature',        url: 'https://www.nature.com/nature.rss', lang: 'en' },
      { name: 'ScienceDaily',  url: 'https://www.sciencedaily.com/rss/all.xml', lang: 'en' },
      { name: 'Quanta',        url: 'https://api.quantamagazine.org/feed/', lang: 'en' },
      { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', lang: 'en' }
    ]
  },
  {
    id: -11,
    slug: 'space',
    name: 'Space',
    icon: '🚀',
    sources: [
      { name: 'NASA Breaking News', url: 'https://www.nasa.gov/news-release/feed/', lang: 'en' },
      { name: 'Space.com',          url: 'https://www.space.com/feeds/all', lang: 'en' },
      { name: 'ESA Top News',       url: 'https://www.esa.int/rssfeed/Our_Activities/Space_News', lang: 'en' }
    ]
  },
  {
    id: -12,
    slug: 'gaming',
    name: 'Gaming',
    icon: '🎮',
    sources: [
      { name: 'Polygon',     url: 'https://www.polygon.com/rss/index.xml', lang: 'en' },
      { name: 'Eurogamer',   url: 'https://www.eurogamer.net/feed', lang: 'en' },
      { name: 'PC Gamer',    url: 'https://www.pcgamer.com/rss/', lang: 'en' },
      { name: 'IGN',         url: 'https://feeds.feedburner.com/ign/all', lang: 'en' }
    ]
  },
  {
    id: -13,
    slug: 'sports',
    name: 'Sports',
    icon: '⚽',
    sources: [
      { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', lang: 'en' },
      { name: 'ESPN',      url: 'https://www.espn.com/espn/rss/news', lang: 'en' }
    ]
  },
  {
    id: -14,
    slug: 'health',
    name: 'Health',
    icon: '🩺',
    sources: [
      { name: 'BBC Health',     url: 'https://feeds.bbci.co.uk/news/health/rss.xml', lang: 'en' },
      { name: 'NYT Health',     url: 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml', lang: 'en' },
      { name: 'Stat News',      url: 'https://www.statnews.com/feed/', lang: 'en' }
    ]
  },
  {
    id: -15,
    slug: 'culture',
    name: 'Culture',
    icon: '🎨',
    sources: [
      { name: 'BBC Culture',           url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', lang: 'en' },
      { name: 'NYT Arts',              url: 'https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml', lang: 'en' },
      { name: 'The New Yorker Culture',url: 'https://www.newyorker.com/feed/culture', lang: 'en' }
    ]
  },
  {
    id: -16,
    slug: 'climate',
    name: 'Climate',
    icon: '🌱',
    sources: [
      { name: 'Carbon Brief',     url: 'https://www.carbonbrief.org/feed/', lang: 'en' },
      { name: 'Inside Climate',   url: 'https://insideclimatenews.org/feed/', lang: 'en' },
      { name: 'Grist',            url: 'https://grist.org/feed/', lang: 'en' }
    ]
  },
  {
    id: -17,
    slug: 'startup',
    name: 'Startups',
    icon: '🛠',
    sources: [
      { name: 'TechCrunch Startups',  url: 'https://techcrunch.com/category/startups/feed/', lang: 'en' },
      { name: 'Sifted (EU startups)', url: 'https://sifted.eu/feed', lang: 'en' },
      { name: 'Y Combinator Blog',    url: 'https://www.ycombinator.com/blog/rss/', lang: 'en' }
    ]
  },
  {
    id: -18,
    slug: 'security',
    name: 'Security',
    icon: '🔒',
    sources: [
      { name: 'Krebs on Security',     url: 'https://krebsonsecurity.com/feed/', lang: 'en' },
      { name: 'The Hacker News',       url: 'https://feeds.feedburner.com/TheHackersNews', lang: 'en' },
      { name: 'BleepingComputer',      url: 'https://www.bleepingcomputer.com/feed/', lang: 'en' }
    ]
  }
];

window.NEWS_FEED_TOPICS = NEWS_FEED_TOPICS;
