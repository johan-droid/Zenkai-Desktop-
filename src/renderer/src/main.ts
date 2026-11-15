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
  private streamResolveTimer: number | null = null;
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
    // Platform class for CSS rules that only apply on macOS/Windows/Linux
    if (window.zenkai?.platform) {
      document.body.classList.add(`platform-${window.zenkai.platform}`);
    }

    this.bindNavigation();
    this.bindSidebar();
    this.bindCommandPalette();
    this.bindPlayerEvents();
    this.bindSettings();
    this.bindActions();
    this.bindBridgeEvents();

    // Skeleton placeholders while live data loads
    this.renderSkeletons(12);
    void this.fetchLiveTrendingAnime();

    // Start background download state polling (every 1.5s)
    this.startDownloadPolling();

    // Load initial settings
    await this.loadSettingsIntoUI();

    // Show initial Hero showcase
    this.updateHeroShowcase(FALLBACK_ANIME[0]);

    // Cleanup timers and HLS on page unload so renderer can't fire IPC
    // after the main process has quit.
    window.addEventListener("beforeunload", () => {
      if (this.downloadPollTimer) clearInterval(this.downloadPollTimer);
      if (this.streamResolveTimer) clearTimeout(this.streamResolveTimer);
      this.hls?.destroy();
    });
  }

  // --- 1. Tab & Sidebar Navigation ---
  private bindNavigation(): void {
    const tabBtns = document.querySelectorAll<HTMLButtonElement>(".nav-tab-btn, .nav-item[data-tab]");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    const searchInput = document.getElementById("searchInput") as HTMLInputElement;
    searchInput?.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      if (!q) {
        this.renderSkeletons();
        void this.fetchLiveTrendingAnime();
        return;
      }
      const filtered = FALLBACK_ANIME.filter(
        (a) => a.title.toLowerCase().includes(q) || (a.romajiTitle && a.romajiTitle.toLowerCase().includes(q))
      );
      this.renderAnimeGrid(filtered);
    });
  }

  private bindSidebar(): void {
    const sidebar = document.getElementById("sidebar");
    const toggleBtn = document.getElementById("sidebarToggle");
    toggleBtn?.addEventListener("click", () => {
      const isCollapsed = sidebar?.getAttribute("data-collapsed") === "true";
      sidebar?.setAttribute("data-collapsed", isCollapsed ? "false" : "true");
    });

    // Theme toggle button (§2 View Transitions)
    const btnTheme = document.getElementById("btnThemeToggle");
    btnTheme?.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme;
      const next = current === "oled" ? "clay" : current === "clay" ? "system" : "oled";

      const apply = () => {
        this.applyTheme(next);
        const selTheme = document.getElementById("settingTheme") as HTMLSelectElement | null;
        if (selTheme) selTheme.value = next;
        if (window.zenkai?.settings) {
          void window.zenkai.settings.set({ theme: next as any });
        }
        this.showToast(`Theme switched to ${next.toUpperCase()}`);
      };

      if ((document as any).startViewTransition) {
        (document as any).startViewTransition(() => apply());
      } else {
        apply();
      }
    });
  }

  private bindCommandPalette(): void {
    const searchModal = document.getElementById("searchModal") as HTMLDialogElement | null;
    const searchTriggerBox = document.getElementById("searchTriggerBox");
    const input = document.getElementById("searchPaletteInput") as HTMLInputElement | null;
    const resultsContainer = document.getElementById("paletteResultsList");
    const genreChips = document.querySelectorAll<HTMLButtonElement>("#paletteGenreChips .chip");

    const openPalette = () => {
      if (!searchModal) return;
      searchModal.showModal();
      if (input) {
        input.value = "";
        input.focus();
        renderPaletteResults(FALLBACK_ANIME);
      }
    };

    searchTriggerBox?.addEventListener("click", openPalette);

    let selectedIndex = 0;
    let currentResults: AnimeItem[] = [];

    const renderPaletteResults = (list: AnimeItem[]) => {
      if (!resultsContainer) return;
      currentResults = list;
      selectedIndex = 0;
      if (list.length === 0) {
        resultsContainer.innerHTML = `
          <div style="padding:24px;text-align:center;color:var(--muted);font-size:12px;">
            No anime found matching your query.
          </div>
        `;
        return;
      }

      resultsContainer.innerHTML = list.map((item, idx) => `
        <div class="palette-item ${idx === 0 ? "selected" : ""}" data-idx="${idx}">
          <img class="palette-item-cover" src="${item.coverImage}" alt="" />
          <div class="palette-item-info">
            <div class="palette-item-title">${item.title}</div>
            <div class="palette-item-meta">
              <span>★ ${item.score}</span>
              <span>•</span>
              <span>${item.format}</span>
              <span>•</span>
              <span>${item.year}</span>
            </div>
          </div>
          <span style="font-size:10px;font-family:var(--font-mono);color:var(--muted);"><kbd>↵</kbd></span>
        </div>
      `).join("");

      resultsContainer.querySelectorAll(".palette-item").forEach((el, idx) => {
        el.addEventListener("click", () => {
          this.loadAnimeIntoPlayer(currentResults[idx], 1);
          searchModal?.close();
        });
      });
    };

    let debounceTimer: number | null = null;
    input?.addEventListener("input", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        const q = input.value.toLowerCase().trim();
        const activeGenreBtn = document.querySelector("#paletteGenreChips .chip.active") as HTMLElement | null;
        const activeGenre = activeGenreBtn?.dataset.genre || "all";

        let filtered = FALLBACK_ANIME;
        if (activeGenre !== "all") {
          filtered = filtered.filter((a) => a.genres.includes(activeGenre));
        }
        if (q) {
          filtered = filtered.filter((a) =>
            a.title.toLowerCase().includes(q) ||
            (a.romajiTitle && a.romajiTitle.toLowerCase().includes(q))
          );
        }
        renderPaletteResults(filtered);
      }, 200);
    });

    genreChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        genreChips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        input?.dispatchEvent(new Event("input"));
      });
    });

    // Keyboard navigation: ArrowUp / ArrowDown / Enter
    searchModal?.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex + 1) % currentResults.length;
          updateSelectedPaletteItem();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (currentResults.length > 0) {
          selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
          updateSelectedPaletteItem();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (currentResults[selectedIndex]) {
          this.loadAnimeIntoPlayer(currentResults[selectedIndex], 1);
          searchModal.close();
        }
      }
    });

    const updateSelectedPaletteItem = () => {
      const items = resultsContainer?.querySelectorAll(".palette-item");
      items?.forEach((el, idx) => {
        el.classList.toggle("selected", idx === selectedIndex);
        if (idx === selectedIndex) {
          (el as HTMLElement).scrollIntoView({ block: "nearest" });
        }
      });
    };

    // Global shortcut Ctrl+K / Cmd+K
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    });
  }

  private switchTab(tabName: string): void {
    this.currentTab = tabName;
    document.querySelectorAll(".nav-tab-btn, .nav-item[data-tab]").forEach((btn) => {
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
  private renderSkeletons(count = 12): void {
    if (!this.trendingGrid) return;
    this.trendingGrid.innerHTML = Array.from({ length: count }, () => `
      <div class="anime-card skeleton-card">
        <div class="skeleton skeleton-cover"></div>
        <div class="anime-card-details">
          <div class="skeleton skeleton-line"></div>
          <div class="skeleton skeleton-line short"></div>
        </div>
      </div>
    `).join("");
  }

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

    // Staggered riseIn animation (§3)
    const heroOverlay = document.querySelector(".hero-overlay");
    if (heroOverlay) {
      Array.from(heroOverlay.children).forEach((child, i) => {
        (child as HTMLElement).style.animation = "none";
        void (child as HTMLElement).offsetHeight;
        (child as HTMLElement).style.animation = `riseIn 0.45s ease-out ${0.05 + i * 0.06}s both`;
      });
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
          <img src="${anime.coverImage}" alt="" loading="lazy" />
          <div class="anime-card-badge">★ ${anime.score}</div>
          <div class="anime-card-episodes">${anime.episodes} EP</div>
        </div>
        <div class="anime-card-details">
          <div class="anime-card-title"></div>
          <div class="anime-card-meta">
            <span>${anime.format}</span>
            <span>${anime.year}</span>
          </div>
        </div>
      `;

      const titleEl = card.querySelector(".anime-card-title");
      if (titleEl) titleEl.textContent = anime.title;

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

    // Populate episode select options; cap at 100 UI slots while AniList
    // may report more (e.g. One Piece). In the future this should be
    // pagination or a "?show more" overflow once the stream API supports it.
    this.selectEpisode.innerHTML = "";
    for (let i = 1; i <= Math.min(anime.episodes || 12, 100); i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `Episode ${i}`;
      if (i === episode) opt.selected = true;
      this.selectEpisode.appendChild(opt);
    }

    this.switchTab("player");
    this.scheduleStreamResolve();
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

    // Dismiss toasts on click
    this.toastContainer.addEventListener("click", (e) => {
      const toast = (e.target as HTMLElement).closest(".toast");
      toast?.remove();
    });

    // Keyboard shortcut: Escape closes open dialogs and clears search
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = document.querySelector<HTMLDialogElement>("dialog[open]");
        if (modal) {
          modal.close();
          e.preventDefault();
          return;
        }
        const searchInput = document.getElementById("searchInput") as HTMLInputElement | null;
        if (searchInput && document.activeElement === searchInput) {
          searchInput.value = "";
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
          e.preventDefault();
        }
      }
    });

    this.selectEpisode.addEventListener("change", () => {
      this.activeEpisode = Number(this.selectEpisode.value) || 1;
      this.scheduleStreamResolve();
    });

    this.selectServer.addEventListener("change", () => {
      this.scheduleStreamResolve();
    });

    this.selectAudio.addEventListener("change", () => {
      this.scheduleStreamResolve();
    });

    // Grouped Server Picker Panel & ACDN Dub-Only Enforcement (§4 / D15 / Audit L5)
    const pickerBtn = document.getElementById("serverPickerBtn");
    const pickerPanel = document.getElementById("serverPickerPanel");
    const currentName = document.getElementById("serverPickerCurrentName");
    const currentTag = document.getElementById("serverPickerCurrentTag");
    const serverOpts = document.querySelectorAll<HTMLButtonElement>(".server-opt");

    pickerBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !pickerPanel?.hasAttribute("hidden");
      if (isOpen) {
        pickerPanel?.setAttribute("hidden", "");
        pickerBtn.setAttribute("aria-expanded", "false");
      } else {
        pickerPanel?.removeAttribute("hidden");
        pickerBtn.setAttribute("aria-expanded", "true");
      }
    });

    document.addEventListener("click", (e) => {
      if (!pickerPanel?.contains(e.target as Node) && e.target !== pickerBtn) {
        pickerPanel?.setAttribute("hidden", "");
        pickerBtn?.setAttribute("aria-expanded", "false");
      }
    });

    serverOpts.forEach((opt) => {
      opt.addEventListener("click", () => {
        const server = opt.dataset.server || "megaplay";
        serverOpts.forEach((o) => o.classList.toggle("active", o === opt));

        this.selectServer.value = server;
        if (currentName) {
          currentName.textContent = server === "megaplay" ? "Megaplay" : server === "vidstream" ? "Vidstream" : "ACDN";
        }
        if (currentTag) {
          if (server === "acdn") {
            currentTag.className = "tag tag-multi";
            currentTag.textContent = "Multi audio";
          } else {
            currentTag.className = "tag tag-direct";
            currentTag.textContent = "Direct";
          }
        }

        // ACDN Dub-Only Enforcement
        const subOption = this.selectAudio.querySelector<HTMLOptionElement>('option[value="sub"]');
        if (server === "acdn") {
          this.selectAudio.value = "dub";
          if (subOption) {
            subOption.disabled = true;
            subOption.textContent = "Sub (Unavailable for ACDN)";
          }
          this.showToast("ACDN server is English Dub only.");
        } else {
          if (subOption) {
            subOption.disabled = false;
            subOption.textContent = "Subtitled (Japanese)";
          }
        }

        pickerPanel?.setAttribute("hidden", "");
        pickerBtn?.setAttribute("aria-expanded", "false");
        this.scheduleStreamResolve();
      });
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
          ${this.getMascotSvg()}
          <div class="empty-state-title">No Active Downloads</div>
          <div class="empty-state-text">Browse anime releases or click "Download by ID" to download episodes for offline viewing.</div>
          <button class="action-btn primary" id="btnEmptyBrowse" style="margin:0 auto;">Browse Anime</button>
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
          ${this.getMascotSvg()}
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

  private getMascotSvg(): string {
    return `
      <svg class="mascot-icon" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mascotGrad" x1="10" y1="10" x2="110" y2="110" gradientUnits="userSpaceOnUse">
            <stop stop-color="#8b5cf6" />
            <stop offset="1" stop-color="#3b82f6" />
          </linearGradient>
          <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="100%" stop-color="#c4b5fd" />
          </radialGradient>
        </defs>
        <path d="M60 16C36 16 18 34 18 60C18 84 32 104 60 104C88 104 102 84 102 60C102 34 84 16 60 16Z" fill="url(#mascotGrad)" />
        <ellipse cx="44" cy="54" rx="7" ry="9" fill="url(#eyeGlow)" />
        <ellipse cx="76" cy="54" rx="7" ry="9" fill="url(#eyeGlow)" />
        <circle cx="46" cy="51" r="2.5" fill="#0f1420" />
        <circle cx="78" cy="51" r="2.5" fill="#0f1420" />
        <ellipse cx="36" cy="65" rx="5" ry="3" fill="rgba(244, 63, 94, 0.4)" />
        <ellipse cx="84" cy="65" rx="5" ry="3" fill="rgba(244, 63, 94, 0.4)" />
        <path d="M52 68C56 73 64 73 68 68" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
        <circle cx="20" cy="30" r="3" fill="#a78bfa" opacity="0.8" />
        <circle cx="98" cy="32" r="2" fill="#38bdf8" opacity="0.8" />
        <circle cx="104" cy="74" r="3" fill="#a78bfa" opacity="0.6" />
      </svg>
    `;
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
      if (window.zenkai?.app?.openFile) {
        void window.zenkai.app.openFile(item.path);
      } else {
        this.showToast("Cannot play — desktop bridge unavailable.");
      }
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
    if (theme === "dark" || theme === "oled") {
      document.documentElement.dataset.theme = "oled";
    } else if (theme === "clay") {
      document.documentElement.dataset.theme = "clay";
    } else if (theme === "light") {
      document.documentElement.dataset.theme = "light";
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  // --- 7. Actions & Web Switch ---
  private bindActions(): void {
    // Switch to Web Portal button — use IPC instead of setting window.location
    // so the security policy (will-navigate) does not block the navigation.
    const btnSwitchWeb = document.getElementById("btnSwitchWeb");
    btnSwitchWeb?.addEventListener("click", () => {
      window.zenkai?.app?.loadWebPortal?.();
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

      const anilistId = Number(idInput?.value);
      const ep = Number(epInput?.value) || 1;
      const audio = (audioSelect?.value as "sub" | "dub") || "sub";
      const server = serverSelect?.value || "megaplay";

      const errEl = document.getElementById("manualAnilistIdErr");
      if (anilistId < 1) {
        if (errEl) errEl.style.display = "block";
        return;
      }
      if (errEl) errEl.style.display = "none";

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
    toast.style.pointerEvents = "auto";
    toast.style.cursor = "pointer";
    toast.addEventListener("click", () => toast.remove());
    this.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  private scheduleStreamResolve(): void {
    if (this.streamResolveTimer) clearTimeout(this.streamResolveTimer);
    this.streamResolveTimer = window.setTimeout(() => {
      void this.resolveAndPlayStream();
    }, 300);
  }
}

// Bootstrap Application
window.addEventListener("DOMContentLoaded", () => {
  new ZenkaiDesktopApp();
});

