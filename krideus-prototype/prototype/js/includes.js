/* 공통 GNB/푸터 로더 — 동기 XHR include + {BASE} 치환 + active + 언어토글 + drawer + 스크롤 전환
 * 사용: <body data-base="../"> (홈="" / 허브="../" / 상세="../../")
 *       <div data-include="navbar"></div> / <div data-include="footer"></div>
 *       <script src="{BASE}js/includes.js"></script> (본문 끝, defer 불필요 — 동기)
 *       상세처럼 fixed+스크롤 배경전환이 필요하면 <body data-nav-mode="scroll"> */
(function () {
  'use strict';
  var BASE = document.body.getAttribute('data-base') || '';

  /* data-lang 토글 보장: 일부 페이지 CSS(display:flex 등)가 [hidden] 기본 display:none을
     무력화해 한/영이 동시에 노출되는 것 방지 — 숨김 언어를 !important로 강제 */
  (function () {
    var hs = document.createElement('style');
    hs.textContent = '[data-lang][hidden]{display:none!important}';
    (document.head || document.documentElement).appendChild(hs);
  })();

  /* 1) include 로드 (동기 XHR — src/js/includes.js 패턴 계승, 빌드 회피) */
  var slots = document.querySelectorAll('[data-include]');
  for (var i = 0; i < slots.length; i++) {
    var el = slots[i], name = el.getAttribute('data-include');
    try {
      var x = new XMLHttpRequest();
      x.open('GET', BASE + 'includes/' + name + '.html', false);
      x.send();
      if (x.status === 200 || x.status === 0) {
        el.outerHTML = x.responseText.replace(/\{BASE\}/g, BASE);
      }
    } catch (e) { /* 로드 실패 시 빈 슬롯 유지 */ }
  }

  /* 2) 현재 경로 기반 active */
  var path = location.pathname;
  var key = path.indexOf('/event/') > -1 ? 'event'
          : path.indexOf('/movement/') > -1 ? 'movement'
          : (path.indexOf('/travel/') > -1 || path.indexOf('/theme-park/') > -1) ? 'travel' : '';
  if (key) {
    var act = document.querySelectorAll('[data-nav="' + key + '"]');
    for (var j = 0; j < act.length; j++) { act[j].setAttribute('aria-current', 'page'); }
  }

  /* 3) 언어 토글 (전 페이지 통일) */
  function applyLang(lang) {
    /* 인자 미지정/오류 시 현재 저장 언어 유지 — 동적 렌더 후 applyLang() 빈 호출(지도 콜백 등)이
       KR로 덮어쓰는 것 방지. 데모 기본은 EN(저장값이 'KR'일 때만 KR). */
    if (lang !== 'KR' && lang !== 'EN') {
      var sv = null; try { sv = localStorage.getItem('rideus-lang'); } catch (e) {}
      lang = (sv === 'KR') ? 'KR' : 'EN';
    }
    var ko = (lang === 'KR');
    document.querySelectorAll('[data-lang]').forEach(function (n) {
      var isKo = n.getAttribute('data-lang') === 'ko';
      n.hidden = ko ? !isKo : isKo;
    });
    /* 입력 필드 value/placeholder 언어 전환 — 기본값(미수정)일 때만 교체, 사용자 입력값은 보존 */
    document.querySelectorAll('input[data-val-ko],input[data-ph-ko]').forEach(function (i) {
      var kv = i.getAttribute('data-val-ko'), ev = i.getAttribute('data-val-en');
      if (kv != null && (i.value === kv || i.value === ev || i.value === '')) i.value = ko ? kv : ev;
      var kp = i.getAttribute('data-ph-ko'), ep = i.getAttribute('data-ph-en');
      if (kp != null) i.placeholder = ko ? kp : (ep || kp);
    });
    document.querySelectorAll('[data-setlang]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-setlang') === lang);
    });
    document.documentElement.setAttribute('lang', ko ? 'ko' : 'en');
    try { localStorage.setItem('rideus-lang', lang); } catch (e) {}
    /* 페이지별 후처리(예약패널 요금·placeholder 등)는 langchange로 위임 */
    try { window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } })); } catch (e) {}
  }
  window.applyLang = applyLang;
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-setlang]');
    if (b) { applyLang(b.getAttribute('data-setlang')); }
  });
  var saved = null;
  try { saved = localStorage.getItem('rideus-lang'); } catch (e) {}
  /* 데모 단계: 영어 기본값 — 저장된 선택이 'KR'일 때만 한국어, 그 외(미저장/EN)는 영어 */
  applyLang(saved === 'KR' ? 'KR' : 'EN');

  /* 4) 모바일 drawer */
  var nav = document.getElementById('nav');
  var burger = document.getElementById('navBurger');
  if (nav && burger) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    var drawer = document.getElementById('navDrawer');
    if (drawer) {
      drawer.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          nav.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  /* 5) fixed nav 스크롤 배경 전환 (상세: <body data-nav-mode="scroll">) — .nav.is-solid 토글 */
  if (nav && document.body.getAttribute('data-nav-mode') === 'scroll') {
    var onScroll = function () { nav.classList.toggle('is-solid', window.scrollY > 24); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();
