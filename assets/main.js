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
document.querySelector(".menu-btn")?.addEventListener("click", () => {
  sheet.classList.add("open");
  sheet.querySelector("button").focus();
});
sheet?.querySelector("button").addEventListener("click", () => sheet.classList.remove("open"));
addEventListener("keydown", (e) => e.key === "Escape" && sheet?.classList.remove("open"));

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
  titleGlyphs.at(-1).addEventListener("animationend", () => pageTitle.classList.add("done"), { once: true });
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
    e.target.classList.add("in");
    io.unobserve(e.target);
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

  async function cycleRoles() {
    for (let i = 0; ; i++) {
      const word = roles[i % roles.length];
      roleCaret.classList.remove("blink");
      for (let k = 1; k <= word.length; k++) {
        roleText.textContent = word.slice(0, k);
        await wait(65 + Math.random() * 45);
      }
      roleCaret.classList.add("blink");
      await wait(3000);
      roleCaret.classList.remove("blink");
      for (let k = word.length; k >= 0; k--) {
        roleText.textContent = word.slice(0, k);
        await wait(32);
      }
      await wait(450);
    }
  }

  if (reduced) {
    video.removeAttribute("autoplay");
    video.pause();
    video.poster = video.dataset.still;
    hero.classList.add("tile-in");
    glyphs.forEach((g) => g.classList.add("on"));
    caret.remove();
    roleText.textContent = roles[0];
    roleText.classList.add("live");
    hero.classList.add("ready");
  } else {
    // the intro pulls focus once; the loop starts on its exact last frame and
    // keeps breathing between soft and sharper, so the hero never freezes
    // the loop file runs at the calm pace (15 s per cycle); the first cycle
    // plays at a medium 12 s pace, then eases down once the visitor stays
    const FIRST_RATE = 15 / 12;
    const easeLoopDown = () => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 5000);
        loop.playbackRate = FIRST_RATE + (1 - FIRST_RATE) * (1 - Math.pow(1 - p, 3));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    let lastT = 0;
    const onWrap = () => {
      if (loop.currentTime + 0.5 < lastT) {
        loop.removeEventListener("timeupdate", onWrap);
        easeLoopDown();
      }
      lastT = loop.currentTime;
    };
    const startLoop = () => loop.play().then(() => tile.classList.add("looping"));
    const toLoop = () => {
      loop.currentTime = 0;
      loop.playbackRate = FIRST_RATE;
      loop.addEventListener("timeupdate", onWrap);
      startLoop().catch(() => {
        // autoplay refused (an iPhone in Low Power Mode, for one): hold the
        // sharp end frame and start the loop on the first tap, which is always allowed
        video.poster = video.dataset.still;
        const gestures = ["touchend", "click", "keydown"];
        const go = () => {
          gestures.forEach((t) => removeEventListener(t, go));
          startLoop().catch(console.error);
        };
        gestures.forEach((t) => addEventListener(t, go, { passive: true }));
      });
    };
    video.addEventListener("ended", toLoop, { once: true });

    // iPhones in Low Power Mode refuse every video, but Safari also plays an
    // mp4 inside <img> like an animated image, which no autoplay rule covers;
    // the intro runs once that way, then the loop takes over on its last frame
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
    const playAsImages = async () => {
      const intro = await loadImg(video.querySelector("source").src);
      const next = loadImg(loop.querySelector("source").src);
      tile.appendChild(intro);
      // swap just before the intro ends: a late swap would flash its first,
      // blurred frame again as the image repeats
      const [loopImg] = await Promise.all([next, wait(6600 - 70)]);
      tile.appendChild(loopImg);
      // the intro stays underneath until the loop has surely painted
      setTimeout(() => intro.remove(), 300);
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
    // staged so only one thing moves at a time: the still, blurred tile
    // fades in, the name types, then the focus pull starts with the first
    // role, and the rest of the column settles in last
    document.fonts.ready.then(async () => {
      hero.classList.add("tile-in");
      await wait(700);
      await typeName();
      await wait(250);
      video.play().catch(() => playAsImages().catch(toLoop));
      roleCaret.style.opacity = "1";
      // give the video decoder a moment before the column starts fading in
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
        const p = Math.min(1, (now - t0) / 1400);
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
  el.setAttribute("aria-label", el.textContent);
  el.textContent = "";
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
  el.setAttribute("aria-label", text);
  el.firstChild.textContent = "";
  const tio = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    tio.disconnect();
    caret.classList.remove("blink");
    await wait(300);
    for (let k = 1; k <= text.length; k++) {
      el.firstChild.textContent = text.slice(0, k);
      await wait(70 + Math.random() * 50);
    }
    caret.classList.add("blink");
  }, { rootMargin: "0px 0px -20% 0px" });
  tio.observe(el);
});

/* ---------- about: timeline + reading focus ---------- */
document.querySelectorAll("[data-tl]").forEach((el) => io.observe(el));
const focusables = document.querySelectorAll("[data-focus]");
if (focusables.length) {
  const fio = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("focus", e.isIntersecting)),
    { rootMargin: "-30% 0px -30% 0px" });
  focusables.forEach((el) => fio.observe(el));
}
