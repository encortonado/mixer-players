/*
 * Player Swap — Nimo (bookmarklet)
 *
 * Coloca o player da Nimo por cima do player da Twitch ou da Kick, mantendo o chat.
 * 1o clique: ativa (na primeira vez pergunta o canal da Nimo). 2o clique: fecha.
 *
 * Regras para continuar funcionando como favorito (javascript:):
 *  - nada de "#" nem "%" no codigo (o navegador trata os dois de forma especial);
 *  - uma unica linha depois de minificar (o build.js confere isso).
 * Depois de mexer neste arquivo, rode o build.js para gerar a versao minificada.
 */
(function () {
  var PRESET = "__NIMO_CHANNEL__"; // o instalador troca por um canal fixo, se houver
  var KEY = "tn-nimo-channel";
  var WRAP = /^(popout|embed|live|moderator)$/i;
  var RESERVED = /^(directory|videos?|clips?|categories|category|browse|following|search|settings|dashboard|downloads?|subscriptions|inventory|wallet|drops|friends|messages|turbo|jobs|store|lives|games?|login|signup)$/i;

  var isKick = /(^|\.)kick\.com$/.test(location.hostname);
  var isTwitch = /(^|\.)twitch\.tv$/.test(location.hostname);

  // 2o clique: fecha o que estiver aberto.
  if (window.__tnNimo) {
    window.__tnNimo.destroy();
    return;
  }
  if (!isKick && !isTwitch) {
    alert("Abra uma live da Twitch ou da Kick e clique de novo.");
    return;
  }
  if (/\/(videos?|clips?)(\/|$)/i.test(location.pathname)) {
    alert("A troca só funciona em lives (não em vídeos ou clipes).");
    return;
  }

  function dec(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  // Aceita so o nome ("meucanal", "@meucanal") ou um link ("https://www.nimo.tv/meucanal").
  function parse(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (/[\/.:]/.test(s)) {
      var u;
      try {
        u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : "https://" + s);
      } catch (e) {
        return "";
      }
      var p = u.pathname.split("/").filter(Boolean).map(dec);
      if (p.length > 1 && WRAP.test(p[0])) p = p.slice(1);
      var n = p[0] || "";
      return RESERVED.test(n) ? "" : n.replace(/^@/, "");
    }
    return s.replace(/^@/, "");
  }

  function load() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }

  var channel = parse(load()) || parse(PRESET);
  if (!channel) {
    var typed = prompt("Canal da Nimo (nome ou link):");
    if (typed === null) return;
    channel = parse(typed);
    if (!channel) {
      alert("Não achei o canal nesse texto.");
      return;
    }
    save(channel);
  }

  var startPath = location.pathname.split("/")[1] || "";
  var player = null, movedPos = false, prevPos = "";
  var paused = [], bound = [];
  var sched = null, hideTimer = null;

  function embedUrl() {
    return "https://www.nimo.tv/embed/" + encodeURIComponent(channel);
  }

  function el(tag, css) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    return e;
  }

  function btn(text, label, fn) {
    var b = el("button", "width:34px;height:34px;padding:0;border:0;border-radius:50px;background:rgba(255,255,255,.2);color:white;font:16px/34px system-ui,sans-serif;text-align:center;cursor:pointer");
    b.type = "button";
    b.textContent = text;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      fn();
    });
    return b;
  }

  // ---- Elementos do overlay ----
  var box = el("div", "position:absolute;top:0;left:0;right:0;bottom:0;display:flex;z-index:2147483000;background:black");
  box.id = "tn-nimo-overlay";

  var frame = el("iframe", "flex:1;min-width:0;border:0;display:block");
  frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
  frame.allowFullscreen = true;
  frame.src = embedUrl();

  var msg = el("div", "position:absolute;top:0;left:0;right:0;bottom:0;z-index:1;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;text-align:center;color:white;font:14px system-ui,sans-serif;background:rgba(0,0,0,.85)");

  var bar = el("div", "position:absolute;top:8px;right:8px;z-index:2;display:flex;gap:6px;padding:4px;border-radius:50px;background:rgba(0,0,0,.55);transition:opacity .25s");
  var actions = el("div", "display:flex;gap:6px");
  actions.append(
    btn("↻", "Recarregar o player", reload),
    btn("⚙", "Trocar o canal da Nimo", change),
    btn("✕", "Fechar", destroy)
  );
  bar.append(actions, btn("⋯", "Mostrar controles", showBar));
  box.append(frame, msg, bar);

  // ---- Controles ----
  function showBar() {
    actions.style.display = "flex";
    bar.style.opacity = "1";
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBar, 4000);
  }
  function hideBar() {
    actions.style.display = "none";
    bar.style.opacity = ".55";
  }

  function reload() {
    msg.style.display = "none";
    frame.src = "about:blank";
    setTimeout(function () { frame.src = embedUrl(); }, 60);
  }

  function change() {
    var v = prompt("Canal da Nimo (nome ou link):", channel);
    if (v === null) return;
    var c = parse(v);
    if (!c) {
      alert("Não achei o canal nesse texto.");
      return;
    }
    channel = c;
    save(c);
    reload();
  }

  // Se a pagina bloquear o iframe (CSP), avisa e oferece abrir a Nimo em outra aba.
  function onCsp(e) {
    if (!/nimo\.tv/i.test(e.blockedURI || "")) return;
    msg.textContent = "";
    var t = el("div");
    t.textContent = "A página bloqueou o player da Nimo aqui.";
    var a = el("a", "color:rgb(150,200,255);font-weight:600");
    a.href = embedUrl();
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Abrir a Nimo em outra aba";
    msg.append(t, a);
    msg.style.display = "flex";
  }

  // ---- Player original ----
  function usable(e) {
    if (!e) return false;
    var r = e.getBoundingClientRect();
    return r.width >= 200 && r.height >= 100;
  }

  function findPlayer() {
    var e = document.querySelector(isKick ? '[id="video-holder"]' : '[data-a-target="video-player"]');
    if (usable(e)) return e;

    // Plano B: o maior <video> da pagina e os ancestrais com o mesmo tamanho dele.
    var vs = document.querySelectorAll("video");
    var best = null, area = 0;
    for (var i = 0; i < vs.length; i++) {
      var r = vs[i].getBoundingClientRect();
      if (r.width * r.height > area) {
        area = r.width * r.height;
        best = vs[i];
      }
    }
    if (!best) return null;
    var vr = best.getBoundingClientRect();
    if (vr.width < 200) return null;
    var cur = best.parentElement, res = cur;
    for (var j = 0; j < 6 && cur && cur !== document.body; j++) {
      var cr = cur.getBoundingClientRect();
      if (Math.abs(cr.width - vr.width) <= 4 && Math.abs(cr.height - vr.height) <= 4) {
        res = cur;
        cur = cur.parentElement;
      } else {
        break;
      }
    }
    return res;
  }

  function onPlay(e) {
    e.target.pause();
  }

  // Pausa o video original (sem mexer em volume/mute) e mantem pausado.
  function quiet() {
    var vs = player.querySelectorAll("video");
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (bound.indexOf(v) < 0) {
        bound.push(v);
        v.addEventListener("play", onPlay);
      }
      if (!v.paused) {
        v.pause();
        if (paused.indexOf(v) < 0) paused.push(v);
      }
    }
  }

  function restorePos() {
    if (player && movedPos) player.style.position = prevPos;
    movedPos = false;
  }

  function attach() {
    var p = findPlayer();
    if (!p) return false;
    if (box.parentElement !== p) {
      restorePos();
      player = p;
      if (getComputedStyle(p).position === "static") {
        prevPos = p.style.position;
        p.style.position = "relative";
        movedPos = true;
      }
      p.appendChild(box);
    }
    quiet();
    return true;
  }

  // Twitch e Kick sao SPAs: o player pode ser recriado e a URL muda sem recarregar.
  function tick() {
    if ((location.pathname.split("/")[1] || "") !== startPath) {
      destroy();
      return;
    }
    attach();
  }

  var mo = new MutationObserver(function () {
    clearTimeout(sched);
    sched = setTimeout(tick, 400);
  });

  function destroy() {
    mo.disconnect();
    clearTimeout(sched);
    clearTimeout(hideTimer);
    document.removeEventListener("securitypolicyviolation", onCsp);
    if (box.parentElement) box.parentElement.removeChild(box);
    restorePos();
    bound.forEach(function (v) { v.removeEventListener("play", onPlay); });
    paused.forEach(function (v) {
      try {
        var pr = v.play();
        if (pr && pr.catch) pr.catch(function () {});
      } catch (e) {}
    });
    delete window.__tnNimo;
  }

  if (!attach()) {
    alert("Não achei o player. Espere o vídeo carregar na página e tente de novo.");
    return;
  }
  mo.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("securitypolicyviolation", onCsp);
  window.__tnNimo = { destroy: destroy };
  showBar();
})();
