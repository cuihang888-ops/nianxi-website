(function () {
  'use strict';
  const embedded = window.parent !== window;
  if (!embedded) return;
  document.documentElement.dataset.embedded = 'true';
  window.ANHE_CALENDAR_VISIBLE = true;
  const shell = document.querySelector('.app-shell');
  let previous = '';
  function measure() {
    if (!shell || document.fullscreenElement) return;
    const height = Math.ceil(shell.getBoundingClientRect().height);
    const ready = window.__ready === true;
    const signature = height + ':' + ready;
    if (signature === previous) return;
    previous = signature;
    window.parent.postMessage({ type: 'anhe-calendar-layout', height, ready }, window.location.origin);
  }
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin || event.source !== window.parent || !event.data) return;
    if (event.data.type === 'anhe-calendar-visibility') window.ANHE_CALENDAR_VISIBLE = event.data.visible === true;
    if (event.data.type === 'anhe-calendar-measure') { previous = ''; measure(); }
  });
  new ResizeObserver(measure).observe(shell);
  document.addEventListener('fullscreenchange', measure);
  window.addEventListener('resize', measure);
  const timer = window.setInterval(measure, 1000);
  window.addEventListener('pagehide', function () { window.clearInterval(timer); }, { once: true });
  measure();
})();
