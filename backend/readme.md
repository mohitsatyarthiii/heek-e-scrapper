scraper-system/
│
├── src/
│
│  ├── server.js
│
│  ├── config/
│  │    config.js
│
│  ├── lib/
│  │    BrowserPool.js
│  │    WorkerPool.js
│  │    ProxyManager.js
│  │    Fingerprint.js
│
│  ├── utils/
│  │    email.js
│  │    parse.js
│
│  ├── scrapers/
│  │    YouTubeApiScraper.js
│  │    YouTubeBrowserScraper.js
│  │    YouTubeGoogleScraper.js
│  │
│  │    InstagramScraper.js
│  │    InstagramGoogleScraper.js
│  │
│  │    LinkedInScraper.js
│  │
│  │    XScraper.js
│
│  ├── models/
│  │    Channel.js
│  │    Queue.js
│
│  ├── services/
│  │    QueueService.js
│  │    ScraperService.js
│
│  └── sessions/
│
├── package.json
└── .env




config/config.js
2️⃣ utils/email.js
3️⃣ utils/parse.js

4️⃣ lib/ProxyManager.js
5️⃣ lib/BrowserPool.js
6️⃣ lib/WorkerPool.js

7️⃣ models/Channel.js
8️⃣ models/Queue.js

9️⃣ services/QueueService.js
🔟 services/ScraperService.js

11️⃣ scrapers/YouTubeBrowserScraper.js
12️⃣ scrapers/YouTubeGoogleScraper.js
13️⃣ scrapers/InstagramScraper.js
14️⃣ scrapers/InstagramGoogleScraper.js
15️⃣ scrapers/LinkedInScraper.js
16️⃣ scrapers/XScraper.js

17️⃣ server.js