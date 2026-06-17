/* ============================================================
   INCLUDES — Load shared navbar & footer
   Usage: <div data-include="navbar"></div>
          <div data-include="footer"></div>
   Must be loaded before main.js
   ============================================================ */
(function () {
  'use strict';

  // Detect base path from script location
  var scriptSrc = document.currentScript ? document.currentScript.getAttribute('src') : '';
  var base = scriptSrc.replace(/\/?js\/includes\.js.*$/, '') || '.';

  // Detect current page for active nav highlighting
  var path = window.location.pathname;
  var currentPage = '';
  if (path.indexOf('/airport') !== -1) currentPage = 'airport';
  else if (path.indexOf('/leisure') !== -1) currentPage = 'leisure';
  else if (path.indexOf('/shopping') !== -1) currentPage = 'shopping';
  else if (path.indexOf('/theme-park') !== -1) currentPage = 'theme-park';
  else if (path.indexOf('/event') !== -1) currentPage = 'event';
  else if (path.indexOf('/local-trip') !== -1) currentPage = 'local-trip';
  else if (path.indexOf('/sports-shuttle') !== -1) currentPage = 'sports-shuttle';

  // Is this a subpage? (not root)
  var isSubpage = currentPage !== '';

  function loadInclude(el) {
    var name = el.getAttribute('data-include');
    var url = base + '/includes/' + name + '.html';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false); // sync to ensure DOM is ready before main.js
    xhr.send();

    if (xhr.status === 200) {
      var html = xhr.responseText.replace(/\{BASE\}/g, base);
      el.outerHTML = html;
    }
  }

  // Load all includes
  var elements = document.querySelectorAll('[data-include]');
  for (var i = 0; i < elements.length; i++) {
    loadInclude(elements[i]);
  }

  // Highlight active nav link
  if (currentPage) {
    var navLinks = document.querySelectorAll('[data-page="' + currentPage + '"]');
    for (var j = 0; j < navLinks.length; j++) {
      navLinks[j].classList.add('active');
    }
  }

  // Add solid navbar class for subpages
  var navbar = document.getElementById('navbar');
  if (navbar && isSubpage) {
    navbar.classList.add('navbar--solid');
  }

})();
