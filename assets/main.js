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
// the stagger counts from the first block revealed together in its section,
// so content further down a long section does not wait for blocks above it
// that appeared long ago
const sectionOf = (el) => el.closest("section, header.page-head, footer");
const io = new IntersectionObserver(
  (entries) => {
    const shown = entries.filter((e) => e.isIntersecting).map((e) => e.target);
    const first = new Map();
    for (const el of shown) {
      const s = el.style.getPropertyValue("--s");
      if (s !== "") first.set(sectionOf(el), Math.min(first.get(sectionOf(el)) ?? Infinity, +s));
    }
    shown.forEach((el) => {
      const s = el.style.getPropertyValue("--s");
      if (s !== "") el.style.setProperty("--s", +s - first.get(sectionOf(el)));
      io.unobserve(el);
      // a picture reveals only once it is decoded, so its fade or wipe never
      // starts on a blank or half-drawn image or stalls while a phone decodes it
      // (a request that hangs without failing reveals after 8 s regardless)
      const imgs = [...el.querySelectorAll("img")];
      Promise.race([Promise.all(imgs.map((img) => img.decode().catch(() => {}))), wait(8000)])
        .then(() => el.classList.add("in"));
    });
  },
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
  const tile = hero.querySelector(".hero-tile");
  // phones: Safari colours its bars from the body's background, which is black
  // while the hero is in view (style.css round 22); once the hero has scrolled
  // away the body takes the page colour again, so the bottom bar at the end of
  // the page stays light. A reload or Back shows the page where it was left
  // before the page learns its scroll position (one from the back/forward
  // cache first reports the top), so until 300 ms after it is shown the class
  // keeps what it was when the page was left (kept in history.state);
  // otherwise the bottom bar flashed black
  let heroInView = true, holdUntil = 0;
  const showPast = () => {
    if (performance.now() < holdUntil || root.classList.contains("past-hero") === !heroInView) return;
    root.classList.toggle("past-hero", !heroInView);
    history.replaceState({ ...history.state, pastHero: !heroInView }, "");
  };
  const hold = () => {
    holdUntil = performance.now() + 300;
    setTimeout(showPast, 310);
  };
  if (["reload", "back_forward"].includes(performance.getEntriesByType("navigation")[0]?.type) && history.state?.pastHero) {
    root.classList.add("past-hero");
    holdUntil = Infinity;
    addEventListener("load", hold);
  }
  addEventListener("pageshow", (e) => e.persisted && hold());
  new IntersectionObserver(([e]) => {
    heroInView = e.isIntersecting;
    showPast();
  }).observe(tile);
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
  // swapped in only once decoded: on a dead network a broken image would
  // leave the tile black, so the first frame stays instead
  const showStill = () => {
    const img = new Image();
    img.src = video.dataset.still;
    img.decode().then(() => (still.src = img.src), () => {});
  };

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
    // one file (hero-full.mp4): the intro pulls focus once and eases to rest
    // on the loop's first frame at LOOP_START (a keyframe); from there the
    // 15 s loop repeats, each wrap a seek back to LOOP_START, which costs what
    // the loop attribute did. One element and one play(): no priming, no
    // handover between two videos, no playbackRate changes (each one can
    // stall the iPhone's player). Regenerate with the media script; if the
    // file changes, update LOOP_START
    const LOOP_START = 6.04;
    const hasRVFC = "requestVideoFrameCallback" in video;
    const toLoopStart = () => (video.currentTime = LOOP_START);
    // an ended video is paused, and play() would start it over from the intro
    const replay = () => {
      if (video.ended) toLoopStart();
      return video.play();
    };
    video.addEventListener("ended", () => replay().catch(onRefused));
    // the still covers the video until it has put a frame on screen while
    // playing (iOS paints a not-yet-playing video black); no time cap: the
    // still is the same picture, so waiting longer costs nothing.
    // The wrap rides on the frames too: one frame early, so the seek's
    // latency hides under a frame at rest
    // the currentTime check keeps a late callback for a frame from before the
    // wrap from seeking again to where the video already is (freezes WebKit)
    // showFrom: the still hides only for a frame at or after it (the tap path
    // shows the end still, so frames from before the loop must stay under it)
    let frames = 0, rv = 0, showFrom = 0;
    const onPicture = (t) => {
      if (!video.paused && t >= showFrom) tile.classList.add("playing");
      if (!video.seeking && video.currentTime > LOOP_START + 1 && t >= video.duration - (hasRVFC ? 0.1 : 0.35)) toLoopStart();
    };
    const onFrame = (now, meta) => {
      frames++;
      onPicture(meta.mediaTime);
      rv = video.requestVideoFrameCallback(onFrame);
    };
    if (hasRVFC) {
      rv = video.requestVideoFrameCallback(onFrame);
      // backup for a browser that never sends a frame callback: a clock that
      // has run a second while playing means a picture is being drawn
      video.addEventListener("timeupdate", () => {
        if (!frames && !video.paused && video.currentTime > 1) tile.classList.add("playing");
      });
    } else video.addEventListener("timeupdate", () => onPicture(video.currentTime));

    // started, so the watchdog keeps it moving
    let playing = false;
    // video refused and no image fallback: hold the sharp end frame and start
    // the loop on a tap, which is always allowed; the listeners stay until a
    // start succeeds (a scroll's touchend is no user activation)
    const tapToStart = () => {
      showFrom = LOOP_START - 0.1;
      showStill();
      // positioned once, and only from far away: a small seek, or one to
      // where it already is, can freeze it
      if (video.currentTime < LOOP_START - 1) toLoopStart();
      const gestures = ["touchend", "click", "keydown"];
      const go = () => {
        // a video that failed to load (network gone) plays only after a
        // reload, which rewinds it and paints black: the end still stays up
        // (showFrom) until the loop's first frame is drawn
        if (video.error) {
          tile.classList.remove("playing");
          video.load();
          toLoopStart();
        }
        video.play().then(() => {
          playing = true;
          gestures.forEach((t) => removeEventListener(t, go));
        }, () => {});
      };
      gestures.forEach((t) => addEventListener(t, go, { passive: true }));
    };
    // refused after it had run (Low Power Mode switched on meanwhile): wait
    // for a tap. A refusal while hidden may be temporary, so it is ignored
    const onRefused = (e) => {
      if (e.name !== "NotAllowedError" || !playing || document.hidden) return;
      playing = false;
      tapToStart();
    };

    // Low Power Mode refuses every video, but Safari also plays an mp4 inside
    // <img> like an animated image, which no autoplay rule covers; the intro
    // runs once that way, then the loop takes over on its last frame. The
    // loop file loads only after the intro, so it never takes its bandwidth
    const INTRO_MS = 6080; // motion length of data-img-intro (the file holds its end frame 1 s longer)
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
    // a new image starts its slow zoom from the beginning; match the still's
    const show = (img) => {
      tile.appendChild(img);
      const [ref] = still.getAnimations();
      const [own] = img.getAnimations();
      if (ref && own) own.currentTime = ref.currentTime;
    };
    const playAsImages = async () => {
      const intro = await loadImg(video.dataset.imgIntro);
      show(intro);
      // underneath the intro: its end frame, which holds if the loop is late
      showStill();
      const next = loadImg(video.dataset.imgLoop);
      next.catch(() => {});
      // an <img> mp4 repeats: swap just before the intro's motion ends; the
      // file holds its last frame 1 s longer, so a late timer still lands on
      // it, and if the loop is not there by then, take the intro away rather
      // than let it start over on its blurred first frame
      await wait(INTRO_MS - 70);
      const end = setTimeout(() => intro.remove(), 800);
      show(await next);
      clearTimeout(end);
      // the intro stays underneath until the loop has surely painted
      setTimeout(() => intro.remove(), 300);
    };
    const start = () => {
      playing = true;
      video.play().catch((e) => {
        // a pause (Back) aborted it: no refusal, the watchdog starts it again
        if (e.name === "AbortError") return;
        playing = false;
        if (e.name === "NotAllowedError") return playAsImages().catch(tapToStart);
        tapToStart();
      });
    };

    // self-healing, once a second: browsers pause video on their own (back/
    // forward cache, background tabs, power saving), and WebKit can freeze
    // the picture (clock runs, nothing drawn) or the clock. One repair per
    // freeze, cleared by the next drawn frame. Nothing is judged on a late
    // tick (busy main thread: frame callbacks could not run), while hidden,
    // off screen or seeking, nor on the first tick after any of those
    // after a repair that drew nothing, the next one waits 8 judged ticks
    let lastHeal = performance.now(), lastT = -1, lastFrames = 0, stuck = 0, seekTicks = 0, repaired = 0, kicked = false;
    const repair = (clockRan) => {
      repaired = 8;
      stuck = 0;
      const t = video.currentTime;
      // a big seek wakes a frozen picture (small ones do not); a stopped
      // clock needs a real restart
      if (clockRan) video.currentTime = t >= LOOP_START + 1 ? t - 1 : t + 1;
      else {
        video.pause();
        video.play().catch(() => {});
      }
    };
    const heal = () => {
      const late = performance.now() - lastHeal > 1500;
      lastHeal = performance.now();
      if (!video.seeking) seekTicks = 0;
      // a seek that has not landed after 5 s is judged like anything else
      // (iOS once took 13 s to land one)
      if (!playing || late || document.hidden || !heroInView || (video.seeking && ++seekTicks <= 5)) {
        lastT = -1;
        return;
      }
      if (video.paused) return void replay().catch(onRefused);
      const t = video.currentTime, prev = lastT, ran = prev >= 0 && t - prev > 0.5;
      // until a first frame callback arrives, frames are judged by the clock
      const drew = hasRVFC && frames ? frames !== lastFrames : ran;
      lastT = t;
      lastFrames = frames;
      if (drew) {
        repaired = 0;
        stuck = 0;
        kicked = false;
        return;
      }
      if (prev < 0 || (repaired && --repaired)) return;
      // the clock ran a real stretch, but no frame reached the screen (a
      // stall that just resumed moves the clock only a little). The callback
      // chain itself can stall, so it is renewed first; a seek follows only
      // if the next tick still sees no frame
      if (ran) {
        if (kicked) return repair(true);
        kicked = true;
        video.cancelVideoFrameCallback(rv);
        rv = video.requestVideoFrameCallback(onFrame);
        return;
      }
      // a stopped clock counts only once the data is there: iOS reports a
      // video still waiting for the network as able to play (readyState 3),
      // and a restart then only restarts the wait; one stuck there for 6 s
      // is restarted anyway
      if (t === prev && video.readyState >= 3 && ++stuck >= (video.readyState >= 4 ? 2 : 6)) repair(false);
      else if (t !== prev) stuck = 0;
    };
    setInterval(heal, 1000);
    // a hide shorter than a tick must not count frames from before it
    document.addEventListener("visibilitychange", () => {
      lastT = -1;
      if (!document.hidden && playing && video.paused) replay().catch(onRefused);
    });
    // Back: WebKit can bring the page back with a frozen picture or clock,
    // sometimes after drawing one frame; about 20 frames are due in 800 ms.
    // Only a frozen picture with a running clock and the data there is
    // repaired here, and only by a seek (a restart would just restart a
    // network wait); everything else is left to the watchdog
    addEventListener("pageshow", (e) => {
      if (!e.persisted || !playing) return;
      lastT = -1;
      replay().catch(onRefused);
      const t0 = video.currentTime, n = frames;
      setTimeout(() => {
        if (hasRVFC && heroInView && !document.hidden && !video.paused && !video.seeking && !repaired &&
            video.readyState >= 3 && frames - n < 5 && video.currentTime - t0 > 0.4) repair(true);
      }, 800);
    });

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
      // mouse only: a touch that starts a scroll must not nudge the video
      if (e.pointerType !== "mouse") return;
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
    // capped like the head script's font gate, so a slow font cannot hold the hero
    Promise.race([document.fonts.ready, wait(1500)]).then(visible).then(async () => {
      reserveRole();
      // again once the font is in (the gate above may not have waited for it),
      // and on resize only when the width changed (iOS resizes on scroll)
      document.fonts.ready.then(reserveRole);
      let roleWidth = innerWidth;
      addEventListener("resize", () => {
        if (innerWidth === roleWidth) return;
        roleWidth = innerWidth;
        reserveRole();
      });
      hero.classList.add("tile-in");
      // the focus pull starts at the first paint (iOS holds the paint while a
      // video starts), so the file loads while the tile fades in and the
      // picture is moving when the typing starts
      requestAnimationFrame(() => requestAnimationFrame(start));
      await wait(700);
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

/* ---------- contact form ---------- */
document.querySelector(".contact")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const status = form.querySelector(".form-status");
  const btn = form.querySelector("button");
  btn.disabled = true;
  status.textContent = "Sending...";
  try {
    const res = await fetch(form.action, { method: "POST", headers: { Accept: "application/json" }, body: new FormData(form) });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    form.reset();
    status.textContent = "Sent. Thank you!";
  } catch (err) {
    status.innerHTML = 'That did not send. Please reach me on <a href="https://www.linkedin.com/in/nilsbeham/" target="_blank" rel="noopener">LinkedIn</a> instead.';
    console.error(err);
  } finally {
    btn.disabled = false;
  }
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
