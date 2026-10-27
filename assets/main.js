const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// the head script keeps the page hidden until its font is ready; entrance
// motion starts only once the page is actually visible
const root = document.documentElement;
function whenShown(cb) {
  if (!root.classList.contains("loading")) return cb();
  const mo = new MutationObserver(() => {
    if (root.classList.contains("loading")) return;
    mo.disconnect();
    cb();
  });
  mo.observe(root, { attributes: true, attributeFilter: ["class"] });
}

/* ---------- mobile menu ---------- */
const sheet = document.querySelector(".sheet");
const menuBtn = document.querySelector(".menu-btn");
// while the sheet is open the page behind it is inert, so keyboard focus and
// screen readers stay in the menu; closing hands focus back to the Menu button
const setMenu = (open, focus = true) => {
  if (!sheet || sheet.classList.contains("open") === open) return;
  sheet.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  document.querySelectorAll("body > :not(.sheet)").forEach((el) => (el.inert = open));
  if (focus) (open ? sheet.querySelector("button") : menuBtn).focus();
};
menuBtn?.addEventListener("click", () => setMenu(true));
sheet?.querySelector("button").addEventListener("click", () => setMenu(false));
addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));
// a page left through the menu comes back from the back/forward cache closed
addEventListener("pagehide", () => setMenu(false, false));

/* ---------- split text into glyph spans ---------- */
function split(el) {
  const text = el.textContent;
  el.setAttribute("aria-label", text);
  el.textContent = "";
  el.classList.add("is-split");
  // glyphs are grouped per word so lines only break between words
  const glyphs = [];
  text.split(" ").forEach((word, wi) => {
    if (wi > 0) glyphs.push(addGlyph(el, " ", glyphs.length, "g sp"));
    const w = document.createElement("span");
    w.className = "w";
    el.appendChild(w);
    for (const ch of word) glyphs.push(addGlyph(w, ch, glyphs.length));
  });
  return glyphs;
}

function addGlyph(parent, ch, i, cls = "g") {
  const s = document.createElement("span");
  s.className = cls;
  s.setAttribute("aria-hidden", "true");
  s.textContent = ch;
  s.style.setProperty("--i", i);
  parent.appendChild(s);
  return s;
}

const pageTitle = document.querySelector(".page-head h1");
if (pageTitle) {
  const titleGlyphs = split(pageTitle);
  titleGlyphs[titleGlyphs.length - 1].addEventListener("animationend", () => pageTitle.classList.add("done"), { once: true });
  // without motion there is no animationend; release the glyph layers at once
  if (reduced) pageTitle.classList.add("done");
  whenShown(() => requestAnimationFrame(() => pageTitle.classList.add("play")));
}

/* ---------- entrances: stagger in reading order within each section ---------- */
document.querySelectorAll("section, header.page-head, footer").forEach((sec) => {
  sec.querySelectorAll("[data-in]").forEach((el, i) => el.style.setProperty("--s", i));
});
document.querySelectorAll(".slope .ln").forEach((p) => p.style.setProperty("--len", Math.ceil(p.getTotalLength()) + 2));
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    // a picture reveals only once it is decoded, so its fade or wipe never
    // starts on a blank or half-drawn image or stalls while a phone decodes it
    // (a request that hangs without failing reveals after 8 s regardless)
    const imgs = [...e.target.querySelectorAll("img")];
    Promise.race([Promise.all(imgs.map((img) => img.decode().catch(() => {}))), wait(8000)])
      .then(() => e.target.classList.add("in"));
  }),
  { rootMargin: "0px 0px -12% 0px" }
);
whenShown(() => document.querySelectorAll("[data-in], .slope").forEach((el) => io.observe(el)));

/* ---------- reading progress ---------- */
const bar = document.querySelector(".progress");
if (bar) {
  const upd = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
  };
  addEventListener("scroll", upd, { passive: true });
  upd();
}

/* ---------- page changes: fetch a page as soon as the visitor shows intent ---------- */
// hovering, touching or tabbing to a link starts loading its page, so by the
// click it usually comes from the cache and the change feels immediate
const warmed = new Set();
const warm = (e) => {
  const a = e.target.closest?.("a[href]");
  if (!a || a.origin !== location.origin || !a.pathname.endsWith(".html") || a.pathname === location.pathname) return;
  if (warmed.has(a.pathname)) return;
  warmed.add(a.pathname);
  fetch(a.pathname).catch(() => warmed.delete(a.pathname));
};
["pointerover", "touchstart", "focusin"].forEach((t) => addEventListener(t, warm, { passive: true }));

document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

/* ---------- hero: video + typed name + rotating role ---------- */
const hero = document.querySelector(".hero");
if (hero) {
  const video = hero.querySelector(".v-intro");
  const loop = hero.querySelector(".v-loop");
  const tile = hero.querySelector(".hero-tile");
  const name = hero.querySelector(".name");
  const roleText = hero.querySelector(".role-text");
  const roleCaret = hero.querySelector(".r-caret");
  const roles = JSON.parse(hero.dataset.roles);

  const glyphs = split(name);
  const caret = document.createElement("span");
  caret.className = "caret";
  caret.setAttribute("aria-hidden", "true");
  name.appendChild(caret);
  const placeCaret = (g) => {
    caret.style.transform = `translateX(${g ? g.offsetLeft + g.offsetWidth + 2 : 0}px)`;
  };
  addEventListener("resize", () => placeCaret(glyphs.filter((g) => g.classList.contains("on")).pop()));

  async function typeName() {
    for (const g of glyphs) {
      g.classList.add("on");
      placeCaret(g);
      // a person pauses slightly at the word gap; elsewhere a small jitter
      await wait(g.classList.contains("sp") ? 260 : 100 + Math.random() * 60);
    }
    await wait(180);
    caret.style.opacity = "0";
  }

  let shownRole = "";
  const setRole = (t) => (roleText.textContent = shownRole = t);
  async function cycleRoles() {
    for (let i = 0; ; i++) {
      const word = roles[i % roles.length];
      roleCaret.classList.remove("blink");
      for (let k = 1; k <= word.length; k++) {
        setRole(word.slice(0, k));
        await wait(65 + Math.random() * 45);
      }
      roleCaret.classList.add("blink");
      await wait(3000);
      roleCaret.classList.remove("blink");
      for (let k = word.length; k >= 0; k--) {
        setRole(word.slice(0, k));
        await wait(32);
      }
      await wait(450);
    }
  }

  const still = tile.querySelector(".v-still");
  const showStill = () => (still.src = video.dataset.still);

  if (reduced) {
    video.removeAttribute("autoplay");
    video.pause();
    showStill();
    hero.classList.add("tile-in");
    glyphs.forEach((g) => g.classList.add("on"));
    caret.remove();
    roleText.textContent = roles[0];
    roleText.classList.add("live");
    hero.classList.add("ready", "settled");
  } else {
    // the intro pulls focus once; the loop starts on its exact last frame and
    // keeps breathing between soft and sharper, so the hero never freezes
    // the loop file runs at the calm pace (15 s per cycle); the first cycle
    // plays at a medium 12 s pace, then eases down once the visitor stays
    const FIRST_RATE = 15 / 12;
    // a few small steps rather than one per frame: each rate change goes to
    // the platform's video player, and hundreds of them can make it hitch
    const easeLoopDown = () => {
      const t0 = performance.now();
      const step = setInterval(() => {
        const p = Math.min(1, (performance.now() - t0) / 5000);
        loop.playbackRate = FIRST_RATE + (1 - FIRST_RATE) * (1 - Math.pow(1 - p, 3));
        if (p === 1) clearInterval(step);
      }, 250);
    };
    let lastT = 0;
    const onWrap = () => {
      if (loop.currentTime + 0.5 < lastT) {
        loop.removeEventListener("timeupdate", onWrap);
        easeLoopDown();
      }
      lastT = loop.currentTime;
    };
    // which video should be moving: the intro while it pulls focus, then the loop
    let phase = "wait";
    const current = () => (phase === "intro" ? video : phase === "loop" ? loop : null);
    // resolves once a video has put a frame on screen, so nothing above it
    // fades away while it is still black; capped, so a callback the browser
    // never sends cannot hold the hero
    const firstFrame = (v) => Promise.race([
      new Promise((resolve) => {
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => resolve());
        else v.addEventListener("timeupdate", resolve, { once: true });
      }),
      wait(600),
    ]);
    // WebKit (Safari on the Mac) can stop delivering frames after a small seek
    // (a fraction of a second, or to the position the video already holds):
    // the clock runs on, but the picture stays put until a seek of half a
    // second or more. So videos only ever seek by at least that much
    const BIG_SEEK = 0.5;
    const seekTo = (v, t) => {
      if (Math.abs(v.currentTime - t) >= BIG_SEEK) v.currentTime = t;
    };
    const startLoop = () => loop.play()
      .then(() => firstFrame(loop))
      .then(() => tile.classList.add("looping"));
    const toLoop = () => {
      if (phase === "loop") return;
      phase = "loop";
      seekTo(loop, 0);
      loop.playbackRate = FIRST_RATE;
      loop.addEventListener("timeupdate", onWrap);
      startLoop().catch(() => {
        // video refused and no image fallback: hold the sharp end frame and
        // start the loop on the first tap, which is always allowed
        showStill();
        const gestures = ["touchend", "click", "keydown"];
        const go = () => {
          gestures.forEach((t) => removeEventListener(t, go));
          startLoop().catch(console.error);
        };
        gestures.forEach((t) => addEventListener(t, go, { passive: true }));
      });
    };
    video.addEventListener("ended", toLoop);

    // self-healing: browsers pause or freeze video on their own (Safari's
    // back/forward cache brings the page back with a frozen video; background
    // tabs and power saving pause it), so once a second the video that should
    // be moving is checked, and restarted if it is not
    // when each video last put a frame on screen: a picture can freeze while
    // the clock keeps running, which the clock alone cannot show
    const shownAt = new Map(), shownTime = new Map();
    const trackFrames = (v) => {
      if (!v.requestVideoFrameCallback) return;
      const onFrame = (now, meta) => {
        shownAt.set(v, performance.now());
        shownTime.set(v, meta.mediaTime);
        v.requestVideoFrameCallback(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
    };
    trackFrames(video);
    trackFrames(loop);
    let lastSeen = -1, frozen = 0, watched = null;
    // grace for a video that just became the one to watch (or a page that
    // just became visible again): it has not had the chance to draw yet
    const rearm = () => {
      watched = current();
      if (watched) shownAt.set(watched, performance.now());
    };
    const heal = () => {
      const v = current();
      if (!v || document.hidden) return;
      if (v !== watched) rearm();
      if (v === video && (video.ended || video.currentTime > video.duration - 0.1)) return toLoop();
      const restart = () => (v === loop ? startLoop() : v.play()).catch(() => {});
      if (v.paused) return restart();
      // the clock runs but no frame has reached the screen for 1.5 s: a big
      // seek wakes the picture (small ones do not). It goes back to the frame
      // that froze when that is far enough away, so playback carries on from
      // there; lastT is moved too, so the loop does not take it for its wrap
      if (v.requestVideoFrameCallback && v.currentTime !== lastSeen && performance.now() - (shownAt.get(v) || 0) > 1500) {
        const frozenAt = shownTime.get(v);
        const to = frozenAt !== undefined && Math.abs(v.currentTime - frozenAt) >= BIG_SEEK ? frozenAt
          : v.currentTime >= 1.5 ? v.currentTime - 1 : v.currentTime + 1;
        if (v === loop) lastT = to;
        v.currentTime = to;
        shownAt.set(v, performance.now());
      }
      if (v.readyState >= 3 && v.currentTime === lastSeen && ++frozen >= 2) {
        frozen = 0;
        v.pause();
        restart();
      } else if (v.currentTime !== lastSeen) frozen = 0;
      lastSeen = v.currentTime;
    };
    setInterval(heal, 1000);
    document.addEventListener("visibilitychange", () => {
      rearm();
      heal();
    });
    addEventListener("pageshow", (e) => {
      const v = current();
      if (!e.persisted || !v) return;
      rearm();
      v.pause();
      (v === loop ? startLoop() : v.play()).catch(() => {});
    });

    // phones never preload video, so a muted play-and-pause fetches the files
    // while the name types; otherwise the intro would start late and the
    // picture would stop at the handover while the loop downloads. It starts
    // only after the page has painted (iOS holds the first paint while a video
    // starts), intro first. A refusal (an iPhone in Low Power Mode) is known
    // long before it matters
    // no rewind afterwards: the playhead moves a few hundredths of a second at
    // most, where the picture is at rest, and a small seek could freeze it
    const prime = (v) => v.play().then(() => {
      // a real start may have come first; only pause a video still waiting
      if (v !== current()) v.pause();
    });
    let painted;
    const canPlay = new Promise((resolve) => (painted = resolve))
      .then(() => prime(video))
      .then(() => true, () => false);
    canPlay.then((ok) => ok && prime(loop)).catch(() => {});

    // Low Power Mode refuses every video, but Safari also plays an mp4 inside
    // <img> like an animated image, which no autoplay rule covers; the intro
    // runs once that way, then the loop takes over on its last frame
    const loadImg = async (src) => {
      const img = new Image();
      img.className = "v-img";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.src = src;
      // rejects where a browser cannot show mp4 as an image (all but Safari)
      await img.decode();
      return img;
    };
    const asImage = (v) => canPlay.then((ok) => (ok ? null : loadImg(v.querySelector("source").src)));
    const introImg = asImage(video);
    const loopImg = asImage(loop);
    // where mp4 cannot be an image, the refusal is handled by toLoop below;
    // these keep the unused attempts from reporting as unhandled errors
    introImg.catch(() => {});
    loopImg.catch(() => {});
    // a new image starts its slow zoom from the beginning; match the still's
    const show = (img) => {
      tile.appendChild(img);
      const [ref] = still.getAnimations();
      const [own] = img.getAnimations();
      if (ref && own) own.currentTime = ref.currentTime;
    };
    const playAsImages = async () => {
      const intro = await introImg;
      show(intro);
      // swap just before the intro (6.08 s) ends: a late swap would flash its first,
      // blurred frame again as the image repeats
      const [next] = await Promise.all([loopImg, wait(6080 - 70)]);
      show(next);
      // the intro stays underneath until the loop has surely painted
      setTimeout(() => intro.remove(), 300);
    };
    const startIntro = async () => {
      // preloading normally settles within a moment; never hold the intro on it
      const ok = await Promise.race([canPlay, wait(600).then(() => null)]);
      if (ok === false) return playAsImages();
      phase = "intro";
      try {
        await video.play();
      } catch {
        phase = "wait";
        return playAsImages();
      }
      await firstFrame(video);
      tile.classList.add("playing");
    };

    // slight parallax: the video drifts against the pointer
    // the loop only runs while the pointer moves or the video is settling back,
    // so it costs nothing during the page's entrance
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    const drift = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      tile.style.setProperty("--tx", `${cx.toFixed(2)}px`);
      tile.style.setProperty("--ty", `${cy.toFixed(2)}px`);
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(drift) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(drift); };
    tile.addEventListener("pointermove", (e) => {
      const r = tile.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * -18;
      ty = ((e.clientY - r.top) / r.height - 0.5) * -14;
      kick();
    });
    tile.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
    // the role line starts empty; its static fallback text is only for no-JS
    roleText.textContent = "";
    roleText.classList.add("live");
    roleCaret.style.opacity = "0";
    // staged: the still, blurred tile fades in, then the focus pull and the
    // typed name start together, the first role follows, and the rest of the
    // column settles in last
    // a page opened in a background tab starts its entrance when first seen
    const visible = () => new Promise((resolve) => {
      if (document.visibilityState === "visible") return resolve();
      const onShow = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", onShow);
        resolve();
      };
      document.addEventListener("visibilitychange", onShow);
    });
    // the longest role wraps onto two lines on narrow screens; reserve the
    // tallest role's height so the column below never jumps as roles change.
    // Measured in one task (nothing paints in between) and again on resize
    const role = roleText.parentElement;
    const reserveRole = () => {
      role.style.minHeight = "";
      let tallest = 0;
      for (const r of roles) {
        roleText.textContent = r;
        tallest = Math.max(tallest, role.getBoundingClientRect().height);
      }
      roleText.textContent = shownRole;
      role.style.minHeight = `${tallest}px`;
    };
    document.fonts.ready.then(visible).then(async () => {
      reserveRole();
      addEventListener("resize", reserveRole);
      hero.classList.add("tile-in");
      requestAnimationFrame(() => requestAnimationFrame(painted));
      await wait(700);
      // the focus pull starts with the typing, so the picture never stands still
      startIntro().catch(toLoop);
      await typeName();
      await wait(250);
      roleCaret.style.opacity = "1";
      await wait(700);
      hero.classList.add("ready");
      setTimeout(() => hero.classList.add("settled"), 3200);
      document.dispatchEvent(new Event("hero:ready"));
      cycleRoles();
    });
  }
}

/* ---------- count-up for headline numbers ---------- */
const counters = document.querySelectorAll("[data-count]");
if (counters.length && !reduced) {
  const cio = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    cio.unobserve(e.target);
    const el = e.target;
    const target = parseFloat(el.dataset.count);
    const digits = (el.dataset.count.split(".")[1] || "").length;
    // count while the number is actually visible: start once its block's
    // staggered fade-in begins, not while it is still transparent
    const box = el.closest("[data-in]");
    const delay = box ? parseFloat(getComputedStyle(box).transitionDelay) * 1000 : 0;
    setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.max(0, Math.min(1, (now - t0) / 1400));
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = (target * eased).toFixed(digits);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay);
  }), { rootMargin: "0px 0px -15% 0px" });
  counters.forEach((el) => (el.textContent = (0).toFixed((el.dataset.count.split(".")[1] || "").length)));
  whenShown(() => counters.forEach((el) => cio.observe(el)));
}

/* ---------- project cards tilt toward the pointer ---------- */
if (!reduced && matchMedia("(hover: hover)").matches) {
  document.querySelectorAll("[data-tilt]").forEach((card) => {
    const img = card.querySelector("img");
    card.addEventListener("pointermove", (e) => {
      const r = img.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      img.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) scale(1.03)`;
    });
    card.addEventListener("pointerleave", () => (img.style.transform = ""));
  });
}

/* ---------- copy email ---------- */
document.querySelectorAll("[data-copy]").forEach((btn) => {
  const label = btn.textContent;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = "Copied";
      btn.classList.add("done");
    } catch (err) {
      btn.textContent = "Copy blocked by browser";
      console.error(err);
    }
    setTimeout(() => { btn.textContent = label; btn.classList.remove("done"); }, 1800);
  });
});

/* ---------- rotating interests: words cross-fade in place ---------- */
document.querySelectorAll(".rotate").forEach((el) => {
  const words = JSON.parse(el.dataset.words);
  // screen readers ignore aria-label on a plain span; give them hidden text
  const said = document.createElement("span");
  said.className = "sr-only";
  said.textContent = el.textContent;
  el.textContent = "";
  el.appendChild(said);
  // all words share one grid cell, so the line never resizes or jumps
  const spans = words.map((w) => {
    const s = document.createElement("span");
    s.className = "rot-word";
    s.setAttribute("aria-hidden", "true");
    s.textContent = w;
    el.appendChild(s);
    return s;
  });
  let i = 0;
  spans[0].classList.add("on");
  if (reduced) return;
  const next = () => {
    const prev = spans[i];
    i = (i + 1) % spans.length;
    prev.classList.remove("on");
    prev.classList.add("out");
    setTimeout(() => prev.classList.remove("out"), 900);
    spans[i].classList.add("on");
  };
  // first switch about 3 s after the line has faded in, then a steady pace
  const start = () => setTimeout(() => { next(); setInterval(next, 3800); }, 4000);
  if (document.querySelector(".hero")) document.addEventListener("hero:ready", start, { once: true });
  else start();
});

/* ---------- "Coming soon" types itself when it scrolls into view ---------- */
document.querySelectorAll("[data-type]").forEach((el) => {
  if (reduced) return;
  const text = el.dataset.type;
  const caret = el.querySelector(".r-caret");
  const typed = document.createElement("span");
  typed.setAttribute("aria-hidden", "true");
  el.firstChild.replaceWith(typed);
  const said = document.createElement("span");
  said.className = "sr-only";
  said.textContent = text;
  el.prepend(said);
  const tio = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    tio.disconnect();
    caret.classList.remove("blink");
    await wait(300);
    for (let k = 1; k <= text.length; k++) {
      typed.textContent = text.slice(0, k);
      await wait(70 + Math.random() * 50);
    }
    caret.classList.add("blink");
  }, { rootMargin: "0px 0px -20% 0px" });
  // the font gate may still hide the page; typing waits until it shows
  whenShown(() => tio.observe(el));
});

/* ---------- about: timeline + reading focus ---------- */
whenShown(() => document.querySelectorAll("[data-tl]").forEach((el) => io.observe(el)));
const focusables = document.querySelectorAll("[data-focus]");
if (focusables.length) {
  const fio = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("focus", e.isIntersecting)),
    { rootMargin: "-30% 0px -30% 0px" });
  focusables.forEach((el) => fio.observe(el));
}
