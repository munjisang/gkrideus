/* ============================================================
   K.RIDEUS — Main JavaScript (Vanilla)
   Parallax, Scroll Reveal, Mobile Menu, YouTube Player
   ============================================================ */

(function () {
  'use strict';

  /* ── Utilities ── */
  function raf(fn) {
    let ticking = false;
    return function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(function () {
          fn();
          ticking = false;
        });
      }
    };
  }

  /* ── Smooth Scroll (anchor delegation) ──
     같은 페이지 hash 앵커(예: href="#inventory") 클릭 시 자동으로 부드러운
     스크롤. 인라인 onclick 의존을 제거하고 일관된 처리로 위임.
     querySelector로 찾을 수 없는 hash(예: 탭 라우팅용 #tab=shuttle)는
     무시되어 정상 hash 동작 유지. */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]:not([href="#"])');
    if (!link) return;
    var href = link.getAttribute('href');
    var el;
    try { el = document.querySelector(href); } catch (_) { return; }
    if (!el) return;
    e.preventDefault();
    var top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: top, behavior: 'smooth' });
  });


  /* ============================================================
     NAVBAR — Scroll-triggered background
     ============================================================ */
  var navbar = document.getElementById('navbar');

  function updateNavbar() {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', raf(updateNavbar), { passive: true });
  updateNavbar();


  /* ============================================================
     MOBILE MENU
     ============================================================ */
  var menuToggle = document.getElementById('menuToggle');
  var mobileMenu = document.getElementById('mobileMenu');
  var mobileMenuClose = document.getElementById('mobileMenuClose');

  function openMenu() {
    mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
  }

  menuToggle.addEventListener('click', openMenu);
  mobileMenuClose.addEventListener('click', closeMenu);

  // Close on link click
  document.querySelectorAll('.mobile-nav-link').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });


  /* ============================================================
     LANGUAGE SELECTOR
     ============================================================ */
  var langBtn = document.getElementById('langBtn');
  var langDropdown = document.getElementById('langDropdown');

  langBtn.addEventListener('click', function () {
    var isOpen = langDropdown.classList.toggle('open');
    langBtn.classList.toggle('open', isOpen);
    langBtn.setAttribute('aria-expanded', isOpen);
  });

  // Close on outside click
  document.addEventListener('mousedown', function (e) {
    var selector = document.getElementById('langSelector');
    if (!selector.contains(e.target)) {
      langDropdown.classList.remove('open');
      langBtn.classList.remove('open');
      langBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Apply language setting
  function applyLang(lang) {
    langBtn.firstChild.textContent = lang + ' ';
    document.querySelectorAll('.lang-option').forEach(function (o) {
      o.classList.toggle('active', o.dataset.lang === lang);
    });

    var koEls = document.querySelectorAll('[data-lang="ko"]');
    var enEls = document.querySelectorAll('[data-lang="en"]');
    var isEN = lang === 'EN';
    koEls.forEach(function (el) { el.hidden = isEN; });
    enEls.forEach(function (el) { el.hidden = !isEN; });
    document.documentElement.lang = isEN ? 'en' : 'ko';
    // Swap placeholder text for inputs/textareas with data-placeholder-en
    document.querySelectorAll('[data-placeholder-en]').forEach(function (el) {
      if (isEN) {
        el._placeholderKo = el._placeholderKo || el.placeholder;
        el.placeholder = el.dataset.placeholderEn;
      } else {
        if (el._placeholderKo) el.placeholder = el._placeholderKo;
      }
    });
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  // Restore saved language on page load
  var savedLang = localStorage.getItem('rideus-lang');
  if (savedLang) {
    applyLang(savedLang);
  }

  // Language option buttons
  document.querySelectorAll('.lang-option').forEach(function (opt) {
    opt.addEventListener('click', function () {
      var lang = this.dataset.lang;
      localStorage.setItem('rideus-lang', lang);
      applyLang(lang);
      langDropdown.classList.remove('open');
      langBtn.classList.remove('open');
    });
  });


  /* ============================================================
     HERO SCROLL-FRAME ANIMATION (Home page only)
     ============================================================ */
  var heroBg = document.getElementById('heroBg');
  var heroContent = document.getElementById('heroContent');
  var heroCanvas = document.getElementById('heroCanvas');
  var heroFallback = document.getElementById('heroFallbackImg');
  var heroSpacer = document.getElementById('heroScrollSpacer');

  if (heroCanvas) { // Only run on home page
  var FRAME_COUNT = 192;
  var frameImages = [];
  var framesLoaded = 0;
  var framesReady = false;
  var currentFrame = -1;
  var ctx = heroCanvas.getContext('2d');

  // Size canvas to viewport
  function sizeCanvas() {
    heroCanvas.width = window.innerWidth;
    heroCanvas.height = window.innerHeight;
    if (framesReady && currentFrame >= 0) {
      drawFrame(currentFrame);
    }
  }
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  // Draw a frame cover-fit onto canvas
  function drawFrame(index) {
    var img = frameImages[index];
    if (!img || !img.complete) return;

    var cw = heroCanvas.width;
    var ch = heroCanvas.height;
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;

    // Cover fit
    var scale = Math.max(cw / iw, ch / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    var dx = (cw - dw) / 2;
    var dy = (ch - dh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // Preload frames
  function preloadFrames() {
    for (var i = 0; i < FRAME_COUNT; i++) {
      (function (idx) {
        var img = new Image();
        img.onload = function () {
          framesLoaded++;
          if (framesLoaded === FRAME_COUNT) {
            framesReady = true;
            heroCanvas.classList.add('active');
            heroFallback.style.display = 'none';
            heroBg.classList.add('frames-active');
            updateHeroScroll();
          }
        };
        var num = String(idx + 1);
        while (num.length < 4) num = '0' + num;
        img.src = 'assets/frames/frame_' + num + '.webp';
        frameImages[idx] = img;
      })(i);
    }
  }
  preloadFrames();

  // Scroll → frame mapping
  function updateHeroScroll() {
    var scrollY = window.scrollY;
    var vh = window.innerHeight;

    // Hero content fade out during first part of scroll
    var contentFade = 1 - Math.min(scrollY / (vh * 0.5), 1);
    heroContent.style.opacity = contentFade;
    heroContent.style.transform = 'translateY(' + (-scrollY * 0.15) + 'px)';

    if (!framesReady) {
      heroBg.style.transform = 'scale(1.1) translateY(' + (-scrollY * 0.05) + 'px)';
      return;
    }

    // Animation spans from scroll start to document bottom
    var animStart = vh * 0.2;
    var docHeight = document.documentElement.scrollHeight;
    var animEnd = docHeight - vh;

    var progress = (scrollY - animStart) / (animEnd - animStart);
    progress = Math.max(0, Math.min(1, progress));

    var frameIndex = Math.min(Math.floor(progress * FRAME_COUNT), FRAME_COUNT - 1);

    if (frameIndex !== currentFrame) {
      currentFrame = frameIndex;
      drawFrame(currentFrame);
    }
  }

  window.addEventListener('scroll', raf(updateHeroScroll), { passive: true });
  updateHeroScroll();

  } // end heroCanvas guard


  /* ============================================================
     SCROLL REVEAL (Phase 3 — IntersectionObserver)
     ============================================================ */
  var revealElements = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // Fallback: show everything
    revealElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }


  /* ============================================================
     YOUTUBE PLAYER — Brand Video
     ============================================================ */
  var player = null;
  var isMuted = true;
  var videoSection = document.getElementById('brandVideo');
  var muteBtn = document.getElementById('muteBtn');
  var mutedIcon = document.getElementById('mutedIcon');
  var unmutedIcon = document.getElementById('unmutedIcon');

  // Load YouTube IFrame API
  function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = initPlayer;
  }

  function initPlayer() {
    player = new YT.Player('brandVideoPlayer', {
      videoId: 'nnXqPZdG7kg',
      playerVars: {
        autoplay: 0,
        mute: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        loop: 1,
        playlist: 'nnXqPZdG7kg'
      }
    });
  }

  // Auto-play when 40% visible
  if (videoSection && 'IntersectionObserver' in window) {
    var videoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!player || !player.playVideo) return;
        try {
          if (entry.isIntersecting) {
            player.playVideo();
          } else {
            player.pauseVideo();
          }
        } catch (e) { /* player not ready */ }
      });
    }, { threshold: 0.4 });

    videoObserver.observe(videoSection);
  }

  // Mute toggle
  if (muteBtn) {
    muteBtn.addEventListener('click', function () {
      if (!player) return;
      try {
        if (isMuted) {
          player.unMute();
          mutedIcon.style.display = 'none';
          unmutedIcon.style.display = 'block';
          muteBtn.setAttribute('aria-label', '음소거');
        } else {
          player.mute();
          mutedIcon.style.display = 'block';
          unmutedIcon.style.display = 'none';
          muteBtn.setAttribute('aria-label', '음소거 해제');
        }
        isMuted = !isMuted;
      } catch (e) { /* player not ready */ }
    });
  }

  loadYouTubeAPI();


  /* ============================================================
     MOBILE BR VISIBILITY
     ============================================================ */
  // Show <br class="mobile-br"> only on mobile
  var style = document.createElement('style');
  style.textContent = '.mobile-br { display: inline; } @media (min-width: 768px) { .mobile-br { display: none; } }';
  document.head.appendChild(style);


  /* ============================================================
     HERO SLIDESHOW — Crossfade (all subpage hubs)
     Skips display:none slides so view-filtered slideshows
     (e.g. sports-shuttle sports/esports) work correctly.
     ============================================================ */
  var slideshowBg = document.querySelector('.sub-hero-bg--slideshow');
  if (slideshowBg) {
    var allSlides = slideshowBg.querySelectorAll('.hero-slide');
    var slideInterval = 5000;

    function visibleSlides() {
      return Array.prototype.filter.call(allSlides, function (s) {
        return s.offsetParent !== null; // skips display:none
      });
    }

    // Force first slide zoom-out transition on load.
    // 같은 tick에서 remove → add 하면 브라우저가 변화를 합쳐서 transition을 발동하지 않음.
    // transition을 일시적으로 끄고 시작 상태(scale 1.05, opacity 0)를 강제한 뒤,
    // 다음 프레임에 transition 복원 + .active 추가 → 깔끔한 줌아웃 트리거.
    var firstVisible = visibleSlides()[0];
    if (firstVisible) {
      firstVisible.classList.remove('active');
      firstVisible.style.transition = 'none';
      firstVisible.style.transform = 'scale(1.05)';
      firstVisible.style.opacity = '0';
      void firstVisible.offsetWidth; // force reflow with the start state
      requestAnimationFrame(function () {
        firstVisible.style.transition = '';
        firstVisible.style.transform = '';
        firstVisible.style.opacity = '';
        firstVisible.classList.add('active');
      });
    }

    setInterval(function () {
      var slides = visibleSlides();
      if (slides.length < 2) return;
      var activeIdx = -1;
      for (var i = 0; i < slides.length; i++) {
        if (slides[i].classList.contains('active')) { activeIdx = i; break; }
      }
      if (activeIdx < 0) activeIdx = 0;
      slides[activeIdx].classList.remove('active');
      var nextIdx = (activeIdx + 1) % slides.length;
      slides[nextIdx].classList.add('active');
    }, slideInterval);
  }


  /* ============================================================
     SERVICE TABS — Shuttle/Private auto-detection
     Detail pages use .sd-svc-tabs + .sd-svc-panel[data-panel].
     If the shuttle tab/panel is absent, collapse to Private-only
     layout: hide tab bar, inject "프라이빗 이동 전용" pill, force
     the private panel active. Otherwise wire normal tab switching.
     ============================================================ */
  var svcTabsContainer = document.querySelector('.sd-svc-tabs');
  var svcPanels = document.querySelectorAll('.sd-svc-panel');

  if (svcPanels.length) {
    var shuttlePanel = document.querySelector('.sd-svc-panel[data-panel="shuttle"]');
    var privatePanel = document.querySelector('.sd-svc-panel[data-panel="private"]');

    if (!shuttlePanel && privatePanel) {
      // Private-only mode
      if (svcTabsContainer) svcTabsContainer.style.display = 'none';

      var svcHeader = document.querySelector('.sd-svc-header');
      if (svcHeader && !svcHeader.querySelector('.sd-svc-mode-pill')) {
        var pillKo = document.createElement('span');
        pillKo.className = 'sd-svc-mode-pill';
        pillKo.setAttribute('data-lang', 'ko');
        pillKo.textContent = '프라이빗 이동 전용';
        var pillEn = document.createElement('span');
        pillEn.className = 'sd-svc-mode-pill';
        pillEn.setAttribute('data-lang', 'en');
        pillEn.hidden = true;
        pillEn.textContent = 'Private Transfer Only';
        svcHeader.appendChild(pillKo);
        svcHeader.appendChild(pillEn);
        // Respect current language setting
        if (document.documentElement.lang === 'en') {
          pillKo.hidden = true;
          pillEn.hidden = false;
        }
      }

      svcPanels.forEach(function (p) {
        var isPrivate = p.getAttribute('data-panel') === 'private';
        p.classList.toggle('active', isPrivate);
        if (isPrivate) p.removeAttribute('hidden');
        else p.setAttribute('hidden', '');
      });
    } else if (svcTabsContainer) {
      // Normal tab switching
      var svcTabs = svcTabsContainer.querySelectorAll('.sd-svc-tab');

      // Assign ids to panels & wire ARIA tab↔panel relationships.
      // `.sd-svc-panel[data-panel]` gets id="svc-panel-<type>"; each tab
      // points at its panel via aria-controls. This runs once at init
      // regardless of whether the user ever clicks.
      svcPanels.forEach(function (p) {
        var pt = p.getAttribute('data-panel');
        if (pt && !p.id) p.id = 'svc-panel-' + pt;
        if (!p.hasAttribute('role')) p.setAttribute('role', 'tabpanel');
        if (!p.hasAttribute('aria-labelledby')) {
          // Link panel back to its tab (tabs don't have explicit id; use data-tab lookup)
          var matchingTab = svcTabsContainer.querySelector('.sd-svc-tab[data-tab="' + pt + '"]');
          if (matchingTab) {
            if (!matchingTab.id) matchingTab.id = 'svc-tab-' + pt;
            p.setAttribute('aria-labelledby', matchingTab.id);
          }
        }
      });
      svcTabs.forEach(function (t) {
        var tt = t.getAttribute('data-tab');
        if (tt && !t.id) t.id = 'svc-tab-' + tt;
        var panel = svcTabsContainer.ownerDocument.querySelector('.sd-svc-panel[data-panel="' + tt + '"]');
        if (panel && !t.hasAttribute('aria-controls')) {
          t.setAttribute('aria-controls', panel.id);
        }
        // Initial aria-selected from existing .active class (so state is
        // exposed to assistive tech even before any click).
        t.setAttribute('aria-selected', t.classList.contains('active') ? 'true' : 'false');
        if (!t.hasAttribute('tabindex')) {
          t.setAttribute('tabindex', t.classList.contains('active') ? '0' : '-1');
        }
      });

      // Switch tabs by target name ("shuttle" / "private"). Used by both
      // click handler and hash-based init below.
      function activateTab(target, updateHash) {
        var matched = false;
        svcTabs.forEach(function (t) {
          var on = t.getAttribute('data-tab') === target;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.setAttribute('tabindex', on ? '0' : '-1');
          if (on) matched = true;
        });
        svcPanels.forEach(function (p) {
          var on = p.getAttribute('data-panel') === target;
          p.classList.toggle('active', on);
          if (on) p.removeAttribute('hidden');
          else p.setAttribute('hidden', '');
        });
        // URL hash mirrors tab state so deep links work and refresh preserves
        // selection. Use replaceState so history isn't polluted with every tap.
        if (matched && updateHash && window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#' + target);
        }
      }

      svcTabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          activateTab(tab.getAttribute('data-tab'), true);
        });
      });

      // Deep-link support: read location.hash on load. Accept "#shuttle" /
      // "#private"; ignore anything else (unrelated anchors stay respected
      // by the browser's native scroll behavior).
      var initialHash = (window.location.hash || '').replace(/^#/, '');
      if (initialHash === 'shuttle' || initialHash === 'private') {
        var panelExists = document.querySelector('.sd-svc-panel[data-panel="' + initialHash + '"]');
        if (panelExists) activateTab(initialHash, false);
      }
      // Respond to back/forward navigation that changes hash.
      window.addEventListener('hashchange', function () {
        var h = (window.location.hash || '').replace(/^#/, '');
        if (h === 'shuttle' || h === 'private') activateTab(h, false);
      });

      // Sticky-shrink: flip to compact exactly when the tab bar pins to
      // the navbar bottom. Sentinel (1px) sits above the tabs; when its
      // bottom crosses the navbar's bottom edge, sticky engages, and so
      // does .is-stuck. We also guard against the "below viewport" state
      // that IntersectionObserver reports on initial load (isIntersecting
      // is false both when sentinel is above AND when it's below the root).
      if ('IntersectionObserver' in window) {
        var STICKY_TOP_PX = 66;     // matches CSS top: 66px (measured navbar)
        var stickySentinel = document.createElement('div');
        stickySentinel.setAttribute('aria-hidden', 'true');
        stickySentinel.style.cssText = 'height:1px;margin-bottom:-1px;pointer-events:none;';
        svcTabsContainer.parentNode.insertBefore(stickySentinel, svcTabsContainer);
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            var rootTop = (e.rootBounds && e.rootBounds.top) || 0;
            var isAbove = e.boundingClientRect.bottom <= rootTop;
            svcTabsContainer.classList.toggle('is-stuck', !e.isIntersecting && isAbove);
          });
        }, { rootMargin: '-' + STICKY_TOP_PX + 'px 0px 0px 0px', threshold: 0 }).observe(stickySentinel);
      }
    }
  }

  /* Popular Destinations: card grid — JS 불필요 */

})();
