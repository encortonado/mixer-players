(() => {
  const OVERLAY_ID = "tn-swap-overlay";

  // Cada plataforma: chave do canal no storage e seletores do player (em ordem).
  // Se nenhum seletor achar, usamos o <video> da página (ver findByVideo).
  const PLATFORMS = {
    twitch: { host: "twitch.tv", key: "twitchChannel", selectors: ['[data-a-target="video-player"]'] },
    kick: { host: "kick.com", key: "kickChannel", selectors: ["#video-holder"] }
  };

  const platform = location.hostname.endsWith("kick.com") ? PLATFORMS.kick : PLATFORMS.twitch;

  let cfg = { enabled: false, twitchChannel: "", kickChannel: "", nimoChannel: "" };
  let scheduled = false;

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

  function sync() {
    scheduled = false;
    const existing = document.getElementById(OVERLAY_ID);

    if (!shouldRun()) {
      if (existing) existing.remove();
      return;
    }

    const player = findPlayer();
    if (!player) return;

    quietVideos(player);

    const src = nimoSrc();
    if (existing && existing.parentElement === player && existing.dataset.src === src) return;
    if (existing) existing.remove();

    const wrap = document.createElement("div");
    wrap.id = OVERLAY_ID;
    wrap.dataset.src = src;
    wrap.style.cssText = "position:absolute;inset:0;z-index:9999;background:#000;";

    const frame = document.createElement("iframe");
    frame.src = src;
    frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    frame.style.cssText = "width:100%;height:100%;border:0;display:block;";

    wrap.appendChild(frame);
    if (getComputedStyle(player).position === "static") player.style.position = "relative";
    player.appendChild(wrap);
  }

  // Twitch e Kick são SPAs: o DOM é recriado e a URL muda sem recarregar a página.
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(sync, 250);
  }

  function loadConfig() {
    chrome.storage.local.get(
      ["enabled", "twitchChannel", "kickChannel", "nimoChannel"],
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
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  loadConfig();
})();
