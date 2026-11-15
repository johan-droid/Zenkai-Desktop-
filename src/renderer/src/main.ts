import Hls from "hls.js";
import type { DownloadItem } from "../../shared/ipc-contract";

// Anime Catalog Data Interface
interface AnimeItem {
  id: number;
  title: string;
  romajiTitle?: string;
  coverImage: string;
  bannerImage?: string;
  score: number;
  format: string;
  episodes: number;
  year: number;
  synopsis: string;
  genres: string[];
}

// Built-in Curated Anime Roster (Immediate Instant Render & Offline Resilient)
const FALLBACK_ANIME: AnimeItem[] = [
  {
    id: 151807,
    title: "Solo Leveling: Arise",
    romajiTitle: "Ore dake Level Up na Ken",
    coverImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80",
    bannerImage: "https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1600&q=80",
    score: 8.9,
    format: "TV SERIES",
    episodes: 24,
    year: 2026,
    synopsis: "In a world where hunters, humans who possess magical powers, battle deadly monsters to protect humanity, Sung Jinwoo finds himself in a mysterious double dungeon that grants him the ability to level up indefinitely.",
    genres: ["Action", "Fantasy", "Adventure"],
  },
  {
    id: 21,
    title: "One Piece",
    romajiTitle: "ONE PIECE",
    coverImage: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80",
    score: 9.2,
    format: "TV SERIES",
    episodes: 1120,
    year: 1999,
    synopsis: "Monkey D. Luffy refuses to let anyone or anything stand in the way of his quest to become the king of all pirates. With a course charted for the treacherous waters of the Grand Line, this is one captain who'll never give up until he's claimed the greatest treasure on Earth.",
    genres: ["Action", "Adventure", "Comedy"],
  },
  {
    id: 154587,
    title: "Frieren: Beyond Journey's End",
    romajiTitle: "Sousou no Frieren",
    coverImage: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80",
    score: 9.3,
    format: "TV SERIES",
    episodes: 28,
    year: 2024,
    synopsis: "The adventure is over, but life goes on for an elf mage just beginning to learn what living is all about. Elf mage Frieren and her courageous fellow adventurers have defeated the Demon King and brought peace to the land.",
    genres: ["Adventure", "Drama", "Fantasy"],
  },
  {
    id: 145064,
    title: "Jujutsu Kaisen Season 2",
    romajiTitle: "Jujutsu Kaisen 2nd Season",
    coverImage: "https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=600&q=80",
    score: 8.8,
    format: "TV SERIES",
    episodes: 23,
    year: 2023,
    synopsis: "The past comes to light when second-year students Satoru Gojo and Suguru Geto are tasked with escorting the Star Plasma Vessel, Riko Amanai, to Master Tengen.",
    genres: ["Action", "Supernatural", "Fantasy"],
  },
  {
    id: 101922,
    title: "Demon Slayer: Kimetsu no Yaiba",
    romajiTitle: "Kimetsu no Yaiba",
    coverImage: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80",
    score: 8.6,
    format: "TV SERIES",
    episodes: 26,
    year: 2019,
    synopsis: "Tanjiro Kamado, a kindhearted boy who sells charcoal for a living, finds his family slaughtered by a demon. To make matters worse, his younger sister Nezuko has been transformed into a demon herself.",
    genres: ["Action", "Fantasy", "Historical"],
  },
  {
    id: 127230,
    title: "Chainsaw Man",
    romajiTitle: "Chainsaw Man",
    coverImage: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80",
    score: 8.7,
    format: "TV SERIES",
    episodes: 12,
    year: 2022,
    synopsis: "Denji is a teenage boy living with a Chainsaw Devil named Pochita. Due to the debt his father left behind, he has been living a rock-bottom life while harvesting devil corpses with Pochita.",
    genres: ["Action", "Supernatural", "Gore"],
  },
];

class ZenkaiDesktopApp {
  private currentTab = "discover";
  private activeAnime: AnimeItem = FALLBACK_ANIME[0];
  private activeEpisode = 1;
  private hls: Hls | null = null;
  private isPlaying = false;
  private autoPauseTimeout: number | null = null;
  private downloadPollTimer: number | null = null;
  private knownDownloads: DownloadItem[] = [];

  // DOM Elements
  private videoEl: HTMLVideoElement;
  private autoPauseAlert: HTMLElement;
  private selectServer: HTMLSelectElement;
  private selectAudio: HTMLSelectElement;
  private selectEpisode: HTMLSelectElement;
  private downloadsBadge: HTMLElement;
  private downloadsContainer: HTMLElement;
  private offlineContainer: HTMLElement;
  private trendingGrid: HTMLElement;
  private toastContainer: HTMLElement;
  private settingsModal: HTMLDialogElement;
  private manualDownloadModal: HTMLDialogElement;

  constructor() {
    this.videoEl = document.getElementById("zenkaiVideoPlayer") as HTMLVideoElement;
    this.autoPauseAlert = document.getElementById("playerAutoPauseAlert") as HTMLElement;
    this.selectServer = document.getElementById("selectServer") as HTMLSelectElement;
    this.selectAudio = document.getElementById("selectAudio") as HTMLSelectElement;
    this.selectEpisode = document.getElementById("selectEpisode") as HTMLSelectElement;
    this.downloadsBadge = document.getElementById("downloadsActiveBadge") as HTMLElement;
    this.downloadsContainer = document.getElementById("downloadsListContainer") as HTMLElement;
    this.offlineContainer = document.getElementById("offlineLibraryContainer") as HTMLElement;
    this.trendingGrid = document.getElementById("trendingGrid") as HTMLElement;
    this.toastContainer = document.getElementById("toastContainer") as HTMLElement;
    this.settingsModal = document.getElementById("settingsModal") as HTMLDialogElement;
    this.manualDownloadModal = document.getElementById("manualDownloadModal") as HTMLDialogElement;

    this.init();
  }

  private async init(): Promise<void> {
    this.bindNavigation();
    this.bindPlayerEvents();
    this.bindSettings();
    this.bindActions();
    this.bindBridgeEvents();

    this.renderAnimeGrid(FALLBACK_ANIME);
    void this.fetchLiveTrendingAnime();

    // Start background download state polling (every 1.5s)
    this.startDownloadPolling();

    // Load initial settings
    await this.loadSettingsIntoUI();

    // Show initial Hero showcase
    this.updateHeroShowcase(FALLBACK_ANIME[0]);
  }

  // --- 1. Tab Navigation ---
  private bindNavigation(): void {
    const tabBtns = document.querySelectorAll<HTMLButtonElement>(".nav-tab-btn");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    // Keyboard shortcut Ctrl+K focuses search
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const searchInput = document.getElementById("searchInput") as HTMLInputElement;
        searchInput?.focus();
      }
    });

    const searchInput = document.getElementById("searchInput") as HTMLInputElement;
    searchInput?.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      if (!q) {
        this.renderAnimeGrid(FALLBACK_ANIME);
        return;
      }
      const filtered = FALLBACK_ANIME.filter(
        (a) => a.title.toLowerCase().includes(q) || (a.romajiTitle && a.romajiTitle.toLowerCase().includes(q))
      );
      this.renderAnimeGrid(filtered);
    });
  }

  private switchTab(tabName: string): void {
    this.currentTab = tabName;
    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
    });
    document.querySelectorAll(".tab-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.id === `pane-${tabName}`);
    });

    if (tabName === "downloads" || tabName === "offline") {
      void this.refreshDownloads();
    }
  }

  // --- 2. Anime Catalog & Discovery ---
  private async fetchLiveTrendingAnime(): Promise<void> {
    try {
      const query = `
        query {
          Page(page: 1, perPage: 12) {
            media(type: ANIME, sort: TRENDING_DESC) {
              id
              title { english romaji }
              coverImage { large extraLarge }
              bannerImage
              averageScore
              format
              episodes
              seasonYear
              description
              genres
            }
          }
        }
      `;
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const mediaList = data?.data?.Page?.media;
      if (Array.isArray(mediaList) && mediaList.length > 0) {
        const mapped: AnimeItem[] = mediaList.map((m: any) => ({
          id: m.id,
          title: m.title.english || m.title.romaji || "Anime",
          romajiTitle: m.title.romaji,
          coverImage: m.coverImage.extraLarge || m.coverImage.large,
          bannerImage: m.bannerImage || m.coverImage.extraLarge,
          score: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : 8.5,
          format: m.format ? m.format.replace(/_/g, " ") : "TV",
          episodes: m.episodes || 12,
          year: m.seasonYear || 2026,
          synopsis: m.description ? m.description.replace(/<[^>]*>?/gm, "") : "Stream now on Zenkai Desktop.",
          genres: m.genres || ["Action"],
        }));
        this.renderAnimeGrid(mapped);
        this.updateHeroShowcase(mapped[0]);
      }
    } catch {
      // Fallback roster is already rendered
    }
  }

  private updateHeroShowcase(anime: AnimeItem): void {
    const backdrop = document.getElementById("heroBackdrop") as HTMLImageElement;
    const score = document.getElementById("heroScore") as HTMLElement;
    const format = document.getElementById("heroFormat") as HTMLElement;
    const year = document.getElementById("heroYear") as HTMLElement;
    const title = document.getElementById("heroTitle") as HTMLElement;
    const subtitle = document.getElementById("heroSubtitle") as HTMLElement;
    const synopsis = document.getElementById("heroSynopsis") as HTMLElement;

    if (backdrop && (anime.bannerImage || anime.coverImage)) {
      backdrop.src = anime.bannerImage || anime.coverImage;
    }
    if (score) score.textContent = `★ ${anime.score}`;
    if (format) format.textContent = anime.format;
    if (year) year.textContent = String(anime.year);
    if (title) title.textContent = anime.title;
    if (subtitle) subtitle.textContent = anime.romajiTitle || anime.genres.join(" • ");
    if (synopsis) synopsis.textContent = anime.synopsis;

    const btnHeroWatch = document.getElementById("btnHeroWatch");
    if (btnHeroWatch) {
      btnHeroWatch.onclick = () => this.loadAnimeIntoPlayer(anime, 1);
    }

    const btnHeroDownload = document.getElementById("btnHeroDownload");
    if (btnHeroDownload) {
      btnHeroDownload.onclick = () => this.triggerDownload(anime, 1);
    }
  }

  private renderAnimeGrid(animeList: AnimeItem[]): void {
    if (!this.trendingGrid) return;
    this.trendingGrid.innerHTML = "";

    animeList.forEach((anime) => {
      const card = document.createElement("div");
      card.className = "anime-card";
      card.innerHTML = `
        <div class="anime-card-cover">
          <img src="${anime.coverImage}" alt="${anime.title}" loading="lazy" />
          <div class="anime-card-badge">★ ${anime.score}</div>
          <div class="anime-card-episodes">${anime.episodes} EP</div>
        </div>
        <div class="anime-card-details">
          <div class="anime-card-title">${anime.title}</div>
          <div class="anime-card-meta">
            <span>${anime.format}</span>
            <span>${anime.year}</span>
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        this.loadAnimeIntoPlayer(anime, 1);
      });

      this.trendingGrid.appendChild(card);
    });
  }

  // --- 3. Video Player & Stream Engine ---
  private loadAnimeIntoPlayer(anime: AnimeItem, episode = 1): void {
    this.activeAnime = anime;
    this.activeEpisode = episode;

    const showTitle = document.getElementById("playerShowTitle");
    const showEp = document.getElementById("playerShowEpisode");
    const showSyn = document.getElementById("playerShowSynopsis");

    if (showTitle) showTitle.textContent = anime.title;
    if (showEp) showEp.textContent = `Episode ${episode} of ${anime.episodes}`;
    if (showSyn) showSyn.textContent = anime.synopsis;

    // Populate episode select options
    this.selectEpisode.innerHTML = "";
    for (let i = 1; i <= Math.min(anime.episodes || 12, 100); i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `Episode ${i}`;
      if (i === episode) opt.selected = true;
      this.selectEpisode.appendChild(opt);
    }

    this.switchTab("player");
    void this.resolveAndPlayStream();
  }

  private async resolveAndPlayStream(): Promise<void> {
    const server = this.selectServer.value;
    const audio = this.selectAudio.value as "sub" | "dub";
    const episode = this.activeEpisode;
    const anilistId = this.activeAnime.id;

    this.showToast(`Resolving stream: ${this.activeAnime.title} (Ep ${episode})...`);

    try {
      if (window.zenkai?.downloads?.resolve) {
        const resolved = await window.zenkai.downloads.resolve({
          anilistId,
          episode,
          audio,
          server,
        });

        if (resolved.playable && resolved.streamUrl) {
          this.playHlsStream(resolved.streamUrl);
          this.showToast(`Stream connected via ${server.toUpperCase()}!`);
          return;
        }
      }

      // Fallback sample stream if live stream resolver is offline
      const demoStream = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
      this.playHlsStream(demoStream);
      this.showToast("Playback ready.");
    } catch (err: unknown) {
      console.warn("[Player] Stream resolve error:", err);
      // Fallback
      const demoStream = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
      this.playHlsStream(demoStream);
    }
  }

  private playHlsStream(url: string): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        enableWorker: true,
      });
      this.hls = hls;
      hls.loadSource(url);
      hls.attachMedia(this.videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void this.videoEl.play();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.warn("[HLS Error]", data);
        }
      });
    } else if (this.videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      this.videoEl.src = url;
      void this.videoEl.play();
    }
  }

  private bindPlayerEvents(): void {
    this.videoEl.addEventListener("play", () => {
      this.isPlaying = true;
      this.syncDiscordRpc(true);
    });

    this.videoEl.addEventListener("pause", () => {
      this.isPlaying = false;
      this.syncDiscordRpc(false);
    });

    this.videoEl.addEventListener("ended", () => {
      this.isPlaying = false;
      this.syncDiscordRpc(false);
      // Auto-advance to next episode if available
      if (this.activeEpisode < this.activeAnime.episodes) {
        this.loadAnimeIntoPlayer(this.activeAnime, this.activeEpisode + 1);
      }
    });

    this.selectEpisode.addEventListener("change", () => {
      this.activeEpisode = Number(this.selectEpisode.value) || 1;
      void this.resolveAndPlayStream();
    });

    this.selectServer.addEventListener("change", () => {
      void this.resolveAndPlayStream();
    });

    this.selectAudio.addEventListener("change", () => {
      void this.resolveAndPlayStream();
    });

    // PiP Button
    const btnPip = document.getElementById("btnPipToggle");
    btnPip?.addEventListener("click", () => {
      if (document.pictureInPictureElement) {
        void document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && this.videoEl) {
        void this.videoEl.requestPictureInPicture();
      }
    });

    // Download Current Episode Button
    const btnDl = document.getElementById("btnDownloadCurrent");
    btnDl?.addEventListener("click", () => {
      this.triggerDownload(this.activeAnime, this.activeEpisode);
    });
  }

  private syncDiscordRpc(playing: boolean): void {
    const pill = document.getElementById("playerRpcPill");
    if (!window.zenkai?.rpc) return;

    if (playing) {
      if (pill) pill.style.display = "flex";
      void window.zenkai.rpc.set({
        title: this.activeAnime.title,
        details: `Watching Episode ${this.activeEpisode}`,
        startedAt: Math.floor(Date.now() / 1000),
      });
    } else {
      void window.zenkai.rpc.clear();
    }
  }

  // --- 4. Downloads Hub ---
  private triggerDownload(anime: AnimeItem, ep: number): void {
    const audio = (this.selectAudio?.value as "sub" | "dub") || "sub";
    const server = this.selectServer?.value || "megaplay";
    const id = `dl-${anime.id}-${ep}-${audio}`;
    const name = `${anime.title} - Episode ${ep} [${audio.toUpperCase()}].ts`;

    if (window.zenkai?.downloads?.start) {
      void window.zenkai.downloads.start({
        id,
        anilistId: anime.id,
        episode: ep,
        audio,
        server,
        withSubtitles: true,
        name,
      });
      this.showToast(`Queued download: ${name}`);
      this.switchTab("downloads");
      void this.refreshDownloads();
    }
  }

  private startDownloadPolling(): void {
    this.downloadPollTimer = window.setInterval(() => {
      void this.refreshDownloads();
    }, 1500);
  }

  private async refreshDownloads(): Promise<void> {
    if (!window.zenkai?.downloads?.list) return;

    try {
      const items = await window.zenkai.downloads.list();
      this.knownDownloads = items;

      const activeCount = items.filter((i) => i.status === "active" || i.status === "queued").length;
      const doneCount = items.filter((i) => i.status === "done").length;

      if (this.downloadsBadge) {
        this.downloadsBadge.textContent = String(activeCount);
        this.downloadsBadge.classList.toggle("active", activeCount > 0);
      }

      const statActive = document.getElementById("statActiveCount");
      const statDone = document.getElementById("statDoneCount");
      if (statActive) statActive.textContent = String(activeCount);
      if (statDone) statDone.textContent = String(doneCount);

      this.renderDownloadsQueue(items);
      this.renderOfflineLibrary(items.filter((i) => i.status === "done"));
    } catch {
      // ignore
    }
  }

  private renderDownloadsQueue(items: DownloadItem[]): void {
    if (!this.downloadsContainer) return;

    if (items.length === 0) {
      this.downloadsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📥</div>
          <div class="empty-state-title">No Active Downloads</div>
          <div class="empty-state-text">Browse anime releases or click "Download by ID" to download episodes for offline viewing.</div>
          <button class="action-btn primary" id="btnEmptyBrowse">Browse Anime</button>
        </div>
      `;
      document.getElementById("btnEmptyBrowse")?.addEventListener("click", () => {
        this.switchTab("discover");
      });
      return;
    }

    this.downloadsContainer.innerHTML = "";

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "download-card";

      const percent = item.total > 0 ? Math.min(100, Math.round((item.bytes / item.total) * 100)) : 0;
      const mbDone = (item.bytes / (1024 * 1024)).toFixed(1);
      const mbTotal = item.total > 0 ? (item.total / (1024 * 1024)).toFixed(1) : "—";
      const segText = item.segmentsTotal ? ` • ${item.segmentsDone ?? 0}/${item.segmentsTotal} segments` : "";

      card.innerHTML = `
        <div class="download-card-header">
          <div class="download-name">${item.name}</div>
          <span class="status-badge ${item.status}">${item.status}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${item.status === "active" ? "active" : ""}" style="width: ${percent}%;"></div>
        </div>
        <div class="download-card-footer">
          <div class="download-meta">
            ${percent}% • ${mbDone} MB / ${mbTotal} MB${segText}
          </div>
          <div class="download-actions">
            ${
              item.status === "done"
                ? `<button class="btn-icon-action play-done" data-play-id="${item.id}">▶ Play Offline</button>`
                : ""
            }
            <button class="btn-icon-action remove" data-remove-id="${item.id}">Remove</button>
          </div>
        </div>
      `;

      card.querySelector(`[data-remove-id="${item.id}"]`)?.addEventListener("click", () => {
        void this.removeDownloadItem(item.id);
      });

      card.querySelector(`[data-play-id="${item.id}"]`)?.addEventListener("click", () => {
        this.playOfflineItem(item);
      });

      this.downloadsContainer.appendChild(card);
    });
  }

  private renderOfflineLibrary(items: DownloadItem[]): void {
    if (!this.offlineContainer) return;

    if (items.length === 0) {
      this.offlineContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎬</div>
          <div class="empty-state-title">Library is Empty</div>
          <div class="empty-state-text">Episodes you download will appear here, ready to watch anytime with zero internet connection.</div>
        </div>
      `;
      return;
    }

    this.offlineContainer.innerHTML = "";
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "download-card";
      const mb = (item.bytes / (1024 * 1024)).toFixed(1);

      card.innerHTML = `
        <div class="download-card-header">
          <div>
            <div class="download-name">${item.name}</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">
              Saved in: ${item.path || "Downloads folder"} (${mb} MB)
            </div>
          </div>
          <span class="status-badge done">READY</span>
        </div>
        <div class="download-card-footer">
          <div class="download-meta">MPEG-TS (.ts) Stream</div>
          <div class="download-actions">
            <button class="btn-icon-action play-done" data-play-offline="${item.id}">▶ Watch Now</button>
            <button class="btn-icon-action remove" data-del-offline="${item.id}">Delete</button>
          </div>
        </div>
      `;

      card.querySelector(`[data-play-offline="${item.id}"]`)?.addEventListener("click", () => {
        this.playOfflineItem(item);
      });

      card.querySelector(`[data-del-offline="${item.id}"]`)?.addEventListener("click", () => {
        void this.removeDownloadItem(item.id);
      });

      this.offlineContainer.appendChild(card);
    });
  }

  private async removeDownloadItem(id: string): Promise<void> {
    if (window.zenkai?.downloads?.remove) {
      await window.zenkai.downloads.remove(id);
      this.showToast("Download removed.");
      void this.refreshDownloads();
    }
  }

  private playOfflineItem(item: DownloadItem): void {
    this.switchTab("player");
    const showTitle = document.getElementById("playerShowTitle");
    const showEp = document.getElementById("playerShowEpisode");
    if (showTitle) showTitle.textContent = item.name;
    if (showEp) showEp.textContent = "Offline Local File";

    if (item.path) {
      this.videoEl.src = `file://${item.path}`;
      void this.videoEl.play();
      this.showToast(`Playing local file: ${item.name}`);
    }
  }

  // --- 5. Preload Bridge Events ---
  private bindBridgeEvents(): void {
    if (!window.zenkai) return;

    // Auto-Pause event from Main Process (T6)
    window.zenkai.onPlaybackPause(() => {
      if (this.videoEl && !this.videoEl.paused) {
        this.videoEl.pause();
        this.showAutoPauseAlert();
      }
    });

    // Native Notification Click (T10)
    window.zenkai.onNotifyClick((payload) => {
      this.showToast(`Notification clicked: ${payload.id}`);
      this.switchTab("downloads");
    });

    // Deep Link Auth Callback (T11)
    window.zenkai.onAuthCallback(() => {
      this.showToast("Zenkai desktop authentication received!");
    });

    // Auto-Updater status listener (Hybrid Update Infrastructure)
    if (window.zenkai.app?.onStatus) {
      window.zenkai.app.onStatus((status) => {
        const desc = document.getElementById("updateStatusDesc");
        const card = document.getElementById("updateCardContainer");
        const cardVer = document.getElementById("updateCardVersion");
        const cardNotes = document.getElementById("updateCardNotes");
        const progressBox = document.getElementById("updateProgressBox");
        const progressBar = document.getElementById("updateProgressBar");
        const progressPercent = document.getElementById("updateProgressPercent");
        const progressBytes = document.getElementById("updateProgressBytes");
        const btnDownload = document.getElementById("btnDownloadUpdate");
        const btnRestart = document.getElementById("btnRestartUpdate");

        switch (status.status) {
          case "checking":
            if (desc) desc.textContent = "Checking update servers...";
            break;
          case "available":
            if (desc) desc.textContent = `New update available: v${status.version || ""}`;
            if (card) card.style.display = "block";
            if (cardVer) cardVer.textContent = `Version ${status.version || "New"}`;
            if (cardNotes) {
              cardNotes.textContent = status.notes || "A new update is ready for installation.";
            }
            if (progressBox) progressBox.style.display = "none";
            if (btnDownload) {
              btnDownload.style.display = "inline-flex";
              btnDownload.removeAttribute("disabled");
              btnDownload.textContent = "Download Update";
            }
            if (btnRestart) btnRestart.style.display = "none";
            this.showToast(`Update available: v${status.version || ""}. Open Settings to install.`);
            break;
          case "not-available":
            if (desc) desc.textContent = "You are running the latest version.";
            if (card) card.style.display = "none";
            break;
          case "downloading":
            if (desc) desc.textContent = "Downloading update package...";
            if (card) card.style.display = "block";
            if (progressBox) progressBox.style.display = "block";
            {
              const pct = Math.round(status.progress || 0);
              if (progressBar) progressBar.style.width = `${pct}%`;
              if (progressPercent) progressPercent.textContent = `${pct}%`;
              if (progressBytes) {
                progressBytes.textContent = `${pct}% completed`;
              }
            }
            if (btnDownload) {
              btnDownload.setAttribute("disabled", "true");
              btnDownload.textContent = "Downloading...";
            }
            break;
          case "downloaded":
            if (desc) desc.textContent = "Update ready to install.";
            if (progressBox) progressBox.style.display = "none";
            if (btnDownload) btnDownload.style.display = "none";
            if (btnRestart) btnRestart.style.display = "inline-flex";
            this.showToast("Update downloaded successfully! Restart to apply.");
            break;
          case "error":
            if (desc) desc.textContent = `Update check failed: ${status.error || "Unknown error"}`;
            if (btnDownload) btnDownload.removeAttribute("disabled");
            break;
        }
      });
    }
  }

  private showAutoPauseAlert(): void {
    if (!this.autoPauseAlert) return;
    this.autoPauseAlert.classList.add("visible");
    if (this.autoPauseTimeout) clearTimeout(this.autoPauseTimeout);
    this.autoPauseTimeout = window.setTimeout(() => {
      this.autoPauseAlert.classList.remove("visible");
    }, 4000);
  }

  // --- 6. Settings Modal & Persistence ---
  private async loadSettingsIntoUI(): Promise<void> {
    if (!window.zenkai?.settings) return;
    try {
      const s = await window.zenkai.settings.get();
      const chkPause = document.getElementById("settingPauseOnClose") as HTMLInputElement;
      const chkHw = document.getElementById("settingHwDecode") as HTMLInputElement;
      const chkRpc = document.getElementById("settingRpcEnabled") as HTMLInputElement;
      const selTheme = document.getElementById("settingTheme") as HTMLSelectElement;
      const selChannel = document.getElementById("settingChannel") as HTMLSelectElement;
      const statDir = document.getElementById("statDownloadDir");

      if (chkPause) chkPause.checked = s.pauseOnClose;
      if (chkHw) chkHw.checked = s.hwDecode;
      if (chkRpc) chkRpc.checked = s.rpcEnabled;
      if (selTheme) selTheme.value = s.theme;
      if (selChannel && s.channel) selChannel.value = s.channel;
      if (statDir && s.downloadDir) statDir.textContent = s.downloadDir;

      this.applyTheme(s.theme);

      // App version
      if (window.zenkai.app) {
        const ver = await window.zenkai.app.version();
        const verInfo = document.getElementById("settingAppVersionInfo");
        if (verInfo) {
          verInfo.textContent = `Zenkai Desktop v${ver} • Electron 45.3.2 • Single-Instance Secured`;
        }
      }
    } catch {
      // ignore
    }
  }

  private bindSettings(): void {
    const btnOpen = document.getElementById("btnOpenSettings");
    btnOpen?.addEventListener("click", () => {
      this.settingsModal.showModal();
    });

    const btnSave = document.getElementById("btnSaveSettings");
    btnSave?.addEventListener("click", () => {
      const chkPause = document.getElementById("settingPauseOnClose") as HTMLInputElement;
      const chkHw = document.getElementById("settingHwDecode") as HTMLInputElement;
      const chkRpc = document.getElementById("settingRpcEnabled") as HTMLInputElement;
      const selTheme = document.getElementById("settingTheme") as HTMLSelectElement;
      const selChannel = document.getElementById("settingChannel") as HTMLSelectElement;

      const patch = {
        pauseOnClose: chkPause.checked,
        hwDecode: chkHw.checked,
        rpcEnabled: chkRpc.checked,
        theme: selTheme.value as "system" | "dark" | "light",
        channel: (selChannel?.value as "stable" | "beta") || "stable",
      };

      if (window.zenkai?.settings) {
        void window.zenkai.settings.set(patch).then(() => {
          this.applyTheme(patch.theme);
          this.showToast("Settings saved successfully.");
        });
      }
    });

    // Update action buttons inside Settings modal
    const btnCheck = document.getElementById("btnCheckUpdate");
    btnCheck?.addEventListener("click", async () => {
      if (!window.zenkai?.app?.checkUpdate) return;
      const desc = document.getElementById("updateStatusDesc");
      if (desc) desc.textContent = "Checking update servers...";
      btnCheck.setAttribute("disabled", "true");
      try {
        const res = await window.zenkai.app.checkUpdate();
        if (!res.updateAvailable) {
          if (desc) desc.textContent = "You are on the latest version.";
          this.showToast("You are on the latest version.");
        }
      } catch {
        if (desc) desc.textContent = "Failed to check for updates.";
        this.showToast("Update check failed.");
      } finally {
        btnCheck.removeAttribute("disabled");
      }
    });

    const btnDownload = document.getElementById("btnDownloadUpdate");
    btnDownload?.addEventListener("click", async () => {
      if (!window.zenkai?.app?.startUpdateDownload) return;
      const desc = document.getElementById("updateStatusDesc");
      if (desc) desc.textContent = "Downloading update package...";
      btnDownload.setAttribute("disabled", "true");
      try {
        await window.zenkai.app.startUpdateDownload();
      } catch {
        if (desc) desc.textContent = "Download failed.";
        this.showToast("Update download failed.");
        btnDownload.removeAttribute("disabled");
      }
    });

    const btnRestart = document.getElementById("btnRestartUpdate");
    btnRestart?.addEventListener("click", async () => {
      if (!window.zenkai?.app?.installUpdate) return;
      await window.zenkai.app.installUpdate();
    });
  }

  private applyTheme(theme: string): void {
    if (theme === "dark") {
      document.documentElement.dataset.theme = "oled";
    } else if (theme === "clay") {
      document.documentElement.dataset.theme = "clay";
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  // --- 7. Actions & Web Switch ---
  private bindActions(): void {
    // Switch to Web Portal button
    const btnSwitchWeb = document.getElementById("btnSwitchWeb");
    btnSwitchWeb?.addEventListener("click", () => {
      window.location.href = "https://zenkai-web.pages.dev/";
    });

    // Manual Download by ID
    const btnManual = document.getElementById("btnManualDownload");
    btnManual?.addEventListener("click", () => {
      this.manualDownloadModal.showModal();
    });

    const btnSubmitManual = document.getElementById("btnSubmitManualDownload");
    btnSubmitManual?.addEventListener("click", () => {
      const idInput = document.getElementById("manualAnilistId") as HTMLInputElement;
      const epInput = document.getElementById("manualEpisode") as HTMLInputElement;
      const audioSelect = document.getElementById("manualAudio") as HTMLSelectElement;
      const serverSelect = document.getElementById("manualServer") as HTMLSelectElement;

      const anilistId = Number(idInput?.value) || 21;
      const ep = Number(epInput?.value) || 1;
      const audio = (audioSelect?.value as "sub" | "dub") || "sub";
      const server = serverSelect?.value || "megaplay";

      const found = FALLBACK_ANIME.find((a) => a.id === anilistId) || {
        id: anilistId,
        title: `Anime #${anilistId}`,
        coverImage: "",
        score: 8.0,
        format: "TV",
        episodes: 100,
        year: 2026,
        synopsis: "",
        genres: [],
      };

      this.triggerDownload(found, ep);
    });
  }

  private showToast(msg: string): void {
    if (!this.toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
}

// Bootstrap Application
window.addEventListener("DOMContentLoaded", () => {
  new ZenkaiDesktopApp();
});

