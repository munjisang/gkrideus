/* ============================================================
   NAVER MAP — Lazy-load Naver Maps SDK & render map
   Ctrl + Scroll to zoom (shows tooltip otherwise)
   Supports EN/KO language switching (reloads SDK)
   ============================================================ */
(function () {
  'use strict';

  var CLIENT_ID = '79rnwdvrt2';
  var SDK_BASE = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' + CLIENT_ID;
  var mapEl = document.getElementById('naverMap');

  if (!mapEl) return;

  var lat = parseFloat(mapEl.dataset.lat);
  var lng = parseFloat(mapEl.dataset.lng);
  var currentMap = null;
  var currentLang = null;

  /* ---- Ctrl+Scroll tooltip overlay ---- */
  mapEl.style.position = mapEl.style.position || 'relative';

  var overlay = document.createElement('div');
  overlay.className = 'map-scroll-overlay';
  overlay.innerHTML =
    '<span class="map-scroll-msg">' +
    '<span data-lang="ko">Ctrl + 스크롤로 확대/축소</span>' +
    '<span data-lang="en" hidden>Use Ctrl + Scroll to zoom</span>' +
    '</span>';
  mapEl.appendChild(overlay);

  var hideTimer;
  function showOverlay() {
    overlay.classList.add('active');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      overlay.classList.remove('active');
    }, 1500);
  }

  /* ---- Detect current language ---- */
  function getLang() {
    var saved = localStorage.getItem('rideus-lang');
    return (saved === 'EN') ? 'en' : 'ko';
  }

  /* ---- Create map instance ---- */
  function createMap() {
    var position = new naver.maps.LatLng(lat, lng);
    currentMap = new naver.maps.Map(mapEl, {
      center: position,
      zoom: 15,
      scrollWheel: false,
      zoomControl: true,
      zoomControlOptions: {
        position: naver.maps.Position.TOP_RIGHT
      }
    });
    new naver.maps.Marker({ position: position, map: currentMap });

    /* Ctrl+Scroll → enable zoom temporarily */
    mapEl.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        currentMap.setOptions({ scrollWheel: true });
        var clone = new WheelEvent('wheel', e);
        mapEl.querySelector('canvas, div').dispatchEvent(clone);
        clearTimeout(currentMap._scrollTimer);
        currentMap._scrollTimer = setTimeout(function () {
          currentMap.setOptions({ scrollWheel: false });
        }, 800);
      } else {
        showOverlay();
      }
    }, { passive: false });

    if (typeof applyLang === 'function') applyLang();
  }

  /* ---- Load SDK with language param ---- */
  function loadSDK(lang, callback) {
    // Remove previous SDK script
    var old = document.getElementById('naver-map-sdk');
    if (old) old.remove();

    // Clear naver.maps so SDK re-initializes
    if (window.naver) delete window.naver.maps;

    var script = document.createElement('script');
    script.id = 'naver-map-sdk';
    script.src = SDK_BASE + '&language=' + lang;
    script.onload = callback;
    document.head.appendChild(script);
  }

  /* ---- Destroy current map ---- */
  function destroyMap() {
    if (currentMap) {
      currentMap.destroy();
      currentMap = null;
    }
    // Remove map inner DOM (SDK-generated), keep overlay
    Array.from(mapEl.children).forEach(function (child) {
      if (!child.classList.contains('map-scroll-overlay')) {
        child.remove();
      }
    });
  }

  /* ---- Init: load with current language ---- */
  function initWithLang(lang) {
    if (lang === currentLang && currentMap) return;
    currentLang = lang;
    destroyMap();
    loadSDK(lang, createMap);
  }

  initWithLang(getLang());

  /* ---- Listen for language change ---- */
  window.addEventListener('langchange', function (e) {
    var lang = e.detail.lang === 'EN' ? 'en' : 'ko';
    initWithLang(lang);
  });
})();
