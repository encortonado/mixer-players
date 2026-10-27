(() => {
  const OVERLAY_ID = "tn-swap-overlay";
  const BASE_CSS = "z-index:2147483000;background:#000;";
  const NORMAL_CSS = "position:absolute;inset:0;" + BASE_CSS;

  // Cada plataforma: chave do canal no storage e seletores do player (em ordem).
  // Se nenhum seletor achar, usamos o <video> da página (ver findByVideo).
  const PLATFORMS = {
    twitch: { host: "twitch.tv", key: "twitchChannel", selectors: ['[data-a-target="video-player"]'] },
    kick: { host: "kick.com", key: "kickChannel", selectors: ["#injected-channel-player", "#video-holder"] }
  };

  const platform = location.hostname.endsWith("kick.com") ? PLATFORMS.kick : PLATFORMS.twitch;

  let cfg = { enabled: false, twitchChannel: "", kickChannel: "", nimoChannel: "", theater: false };
  let scheduled = false;
  let theaterTimer = null;

  const norm = (s) => (s || "").toLowerCase().replace(/_/g, "-");

  const currentChannel = () => norm(location.pathname.split("/").filter(Boolean)[0]);

  const isVodOrClip = () => /\/(videos?|clips?)(\/|$)/i.test(location.pathname);

  const nimoSrc = () =>
    cfg.nimoChannel ? `https://www.nimo.tv/embed/${encodeURIComponent(cfg.nimoChannel)}` : "";

  function shouldRun() {
    const wanted = cfg[platform.key];
    return (
      cfg.enabled &&
      wanted &&
      cfg.nimoChannel &&
      !isVodOrClip() &&
      currentChannel() === norm(wanted)
    );
  }

  // Plano B: acha o maior <video> e sobe pelos ancestrais que têm o mesmo tamanho dele
  // (a "caixa" do player, sem pegar a coluna do chat).
  function findByVideo() {
    const videos = [...document.querySelectorAll("video")].filter(
      (v) => !v.closest("#" + OVERLAY_ID)
    );
    if (!videos.length) return null;

    const area = (el) => {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    };
    const video = videos.sort((a, b) => area(b) - area(a))[0];
    const vr = video.getBoundingClientRect();
    if (vr.width < 200) return null;

    let best = video.parentElement;
    let el = best;
    for (let i = 0; i < 6 && el && el !== document.body; i++) {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - vr.width) <= 4 && Math.abs(r.height - vr.height) <= 4) {
        best = el;
        el = el.parentElement;
      } else {
        break;
      }
    }
    return best;
  }

  function findPlayer() {
    for (const sel of platform.selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return findByVideo();
  }

  // Pausa o vídeo original (sem mexer em volume/mute, que a plataforma salva).
  function quietVideos(player) {
    player.querySelectorAll("video").forEach((v) => {
      if (v.closest("#" + OVERLAY_ID)) return;
      if (!v.dataset.tnBound) {
        v.dataset.tnBound = "1";
        v.addEventListener("play", () => {
          if (shouldRun()) v.pause();
        });
      }
      if (!v.paused) v.pause();
    });
  }

  // Muda o overlay de lugar sem recarregar o iframe quando o navegador suporta moveBefore.
  function moveInto(parent, node) {
    if (node.parentElement && typeof parent.moveBefore === "function") {
      try {
        parent.moveBefore(node, null);
        return;
      } catch {
        // cai para appendChild
      }
    }
    parent.appendChild(node);
  }

  function buildOverlay(src) {
    const wrap = document.createElement("div");
    wrap.id = OVERLAY_ID;
    wrap.dataset.src = src;
    wrap.style.cssText = NORMAL_CSS;

    const frame = document.createElement("iframe");
    frame.src = src;
    frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.style.cssText = "width:100%;height:100%;border:0;display:block;";

    const btn = document.createElement("button");
    btn.id = OVERLAY_ID + "-theater";
    btn.type = "button";
    btn.style.cssText =
      "position:absolute;top:8px;right:8px;z-index:2;padding:4px 12px;" +
      "border:1px solid rgba(255,255,255,.35);border-radius:14px;" +
      "background:rgba(0,0,0,.55);color:#fff;font:600 12px/18px system-ui,sans-serif;" +
      "cursor:pointer;opacity:.4;transition:opacity .2s;";
    btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = ".4"));
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.storage.local.set({ theater: !cfg.theater });
    });

    wrap.append(frame, btn);
    return wrap;
  }

  function updateButton(wrap) {
    const btn = wrap.querySelector("#" + OVERLAY_ID + "-theater");
    if (!btn) return;
    btn.textContent = cfg.theater ? "Sair do teatro" : "Teatro";
    btn.title = cfg.theater ? "Voltar ao tamanho normal (Esc)" : "Modo teatro";
  }

  // ---- Modo teatro próprio ----
  // O overlay cobre os controles da plataforma (inclusive o botão de teatro dela), então o
  // teatro é nosso e imita o da Kick: o player da Nimo ocupa a janela inteira até a coluna
  // do chat (sem topo nem barra lateral). O chat é achado pela posição na tela, sem depender
  // de seletor do site.
  function probe(x, y, wrap) {
    return (
      document
        .elementsFromPoint(x, y)
        .find((el) => !wrap.contains(el) && el !== document.documentElement && el !== document.body) || null
    );
  }

  function theaterRect(wrap) {
    const W = document.documentElement.clientWidth;
    const H = document.documentElement.clientHeight;

    // Chat: a coluna mais externa, estreita e alta, colada na borda direita.
    let chatLeft = W - 340;
    let el = probe(W - 12, Math.round(H * 0.6), wrap);
    let best = null;
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      if (r.width > W * 0.5) break;
      if (r.right >= W - 4 && r.height >= H * 0.5) best = r;
      el = el.parentElement;
    }
    if (best) chatLeft = best.left;

    return { left: 0, top: 0, width: Math.max(300, Math.round(chatLeft)), height: H };
  }

  function layoutTheater(wrap) {
    const r = theaterRect(wrap);
    const css = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;${BASE_CSS}`;
    if (wrap.dataset.theaterCss !== css) {
      wrap.style.cssText = css;
      wrap.dataset.theaterCss = css;
    }
  }

  function stopTheaterWatch() {
    clearInterval(theaterTimer);
    theaterTimer = null;
  }

  function relayout() {
    const w = document.getElementById(OVERLAY_ID);
    if (w && w.dataset.theater) layoutTheater(w);
    else stopTheaterWatch();
  }

  function enterTheater(wrap) {
    if (wrap.parentElement !== document.body) moveInto(document.body, wrap);
    wrap.dataset.theater = "1";
    layoutTheater(wrap);
    if (!theaterTimer) theaterTimer = setInterval(relayout, 600);
  }

  function exitTheater(wrap, player) {
    if (wrap.dataset.theater) {
      delete wrap.dataset.theater;
      delete wrap.dataset.theaterCss;
      wrap.style.cssText = NORMAL_CSS;
    }
    stopTheaterWatch();

    if (!player) {
      // Saiu do teatro sem player na página: tira o overlay; ele volta quando o player aparecer.
      if (wrap.parentElement === document.body) wrap.remove();
      return;
    }
    if (wrap.parentElement !== player) {
      if (getComputedStyle(player).position === "static") player.style.position = "relative";
      moveInto(player, wrap);
    }
  }

  function sync() {
    scheduled = false;
    let wrap = document.getElementById(OVERLAY_ID);

    if (!shouldRun()) {
      if (wrap) wrap.remove();
      stopTheaterWatch();
      return;
    }

    const player = findPlayer();
    // Sem player só dá para continuar se já estamos em teatro (o overlay não depende dele).
    if (!player && !(wrap && cfg.theater)) return;
    if (player) quietVideos(player);

    const src = nimoSrc();
    if (wrap && wrap.dataset.src !== src) {
      wrap.remove();
      wrap = null;
    }
    if (!wrap) wrap = buildOverlay(src);
    updateButton(wrap);

    if (cfg.theater) enterTheater(wrap);
    else exitTheater(wrap, player);
  }

  // Twitch e Kick são SPAs: o DOM é recriado e a URL muda sem recarregar a página.
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(sync, 250);
  }

  function loadConfig() {
    chrome.storage.local.get(
      ["enabled", "twitchChannel", "kickChannel", "nimoChannel", "theater"],
      (data) => {
        cfg = { ...cfg, ...data };
        schedule();
      }
    );
  }

  chrome.storage.onChanged.addListener((changes) => {
    // O rascunho do popup só vale depois de clicar em Salvar.
    if (Object.keys(changes).every((k) => k === "draft")) return;
    loadConfig();
  });

  // Esc sai do teatro (quando o foco não está dentro do player da Nimo).
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !cfg.theater) return;
    const w = document.getElementById(OVERLAY_ID);
    if (w && w.dataset.theater) chrome.storage.local.set({ theater: false });
  });

  window.addEventListener("resize", relayout);

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  loadConfig();
})();