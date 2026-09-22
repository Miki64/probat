// app.js – Orchestrateur principal BuildScan

/* ════════════════════════════════════════════════
   État global
   ════════════════════════════════════════════════ */
const AppState = {
  currentScreen: 'home',
  capturedDataUrl: null,  // photo capturée
  results: null,          // résultats calibrés
  measures: [],           // mesures en session
};

/* ════════════════════════════════════════════════
   DOM refs
   ════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const screens = {
  home:    $('screen-home'),
  camera:  $('screen-camera'),
  measure: $('screen-measure'),
  history: $('screen-history'),
};

/* ════════════════════════════════════════════════
   Navigation
   ════════════════════════════════════════════════ */
function navigate(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  const target = screens[name];
  if (!target) return;
  target.classList.add('active');
  AppState.currentScreen = name;

  // Back button
  const showBack = name !== 'home';
  $('btn-back').classList.toggle('hidden', !showBack);

  // History btn
  $('btn-history').classList.toggle('hidden', name === 'history');
}

$('btn-back').addEventListener('click', () => {
  if (AppState.currentScreen === 'camera') {
    Camera.stop();
    navigate('home');
  } else if (AppState.currentScreen === 'measure') {
    navigate('home');
    Measure.clearPoints();
  } else if (AppState.currentScreen === 'history') {
    navigate('home');
  } else {
    navigate('home');
  }
});

$('btn-history').addEventListener('click', () => {
  if (AppState.currentScreen === 'camera') Camera.stop();
  renderHistory();
  navigate('history');
});

/* ════════════════════════════════════════════════
   SPLASH
   ════════════════════════════════════════════════ */
function initSplash() {
  setTimeout(() => {
    const splash = $('splash-screen');
    const app    = $('app');
    splash.classList.add('fade-out');
    app.classList.remove('hidden');
    setTimeout(() => splash.remove(), 600);
    updateHomeStats();
  }, 1800);
}

/* ════════════════════════════════════════════════
   HOME
   ════════════════════════════════════════════════ */
function updateHomeStats() {
  Storage.initSession();
  const all = Storage.getAll();
  $('stat-count-val').textContent   = all.length;
  const totalSurf = Storage.getTotalSurface();
  $('stat-surface-val').textContent = totalSurf > 0 ? `${totalSurf.toFixed(2)} m²` : '0 m²';
  $('stat-session-val').textContent = Storage.getSessionStart();
}

// Bouton "Nouvelle mesure" → caméra
$('btn-new-measure').addEventListener('click', async () => {
  if (!Camera.isAvailable()) {
    showToast('Caméra non disponible sur ce navigateur.', 'error');
    return;
  }
  navigate('camera');
  try {
    await Camera.start();
  } catch (err) {
    showToast('Impossible d\'accéder à la caméra. Vérifiez les autorisations.', 'error');
    navigate('home');
  }
});

// Bouton "Depuis la galerie"
$('file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    AppState.capturedDataUrl = ev.target.result;
    navigate('measure');
    await startMeasureScreen(AppState.capturedDataUrl);
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

/* ════════════════════════════════════════════════
   CAMERA SCREEN
   ════════════════════════════════════════════════ */
$('btn-capture').addEventListener('click', () => {
  const { dataUrl } = Camera.capture();
  AppState.capturedDataUrl = dataUrl;
  Camera.stop();
  navigate('measure');
  startMeasureScreen(dataUrl);
});

$('btn-flip-camera').addEventListener('click', async () => {
  try { await Camera.flip(); }
  catch { showToast('Retournement caméra non disponible.', 'error'); }
});

$('btn-torch').addEventListener('click', async () => {
  const on = await Camera.toggleTorch();
  $('btn-torch').classList.toggle('active', on);
  if (on === false && !on) showToast('Lampe torche non disponible sur ce device.', 'error');
});

/* ════════════════════════════════════════════════
   MEASURE SCREEN
   ════════════════════════════════════════════════ */
let measureState = 'placing'; // 'placing' | 'calibrating' | 'calibrated'

async function startMeasureScreen(dataUrl) {
  measureState = 'placing';
  AppState.results = null;

  // Init canvas
  const canvas = $('measure-canvas');
  Measure.init(canvas, onPointsChange, onCalibrated);

  // Ajuste le canvas au conteneur
  const wrap = $('measure-canvas-wrap');
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;

  await Measure.loadImage(dataUrl);

  // UI state
  setMeasureStep(1, 'Posez les coins de la surface à mesurer');
  hideAllPanels();
}

function onPointsChange(pts) {
  const count = pts.length;

  if (measureState === 'placing') {
    if (count >= 3) {
      setMeasureStep(1, `${count} points posés – validez ou ajoutez encore des points`);
      showPanel('validate');
      $('btn-validate-count').textContent = count;
    } else if (count > 0) {
      setMeasureStep(1, `${count}/3 points minimum posés`);
      hideAllPanels();
    } else {
      setMeasureStep(1, 'Posez les coins de la surface à mesurer');
      hideAllPanels();
    }
  }
}

function onCalibrated(results) {
  AppState.results = results;
  measureState = 'calibrated';
  renderResults(results);
  setMeasureStep(3, 'Mesures calculées !');
  showPanel('results');
  showPanel('save');
}

// Valider le polygone → passer à la calibration
$('btn-validate-polygon').addEventListener('click', () => {
  measureState = 'calibrating';
  setMeasureStep(2, 'Sélectionnez un côté pour calibrer l\'échelle');
  hideAllPanels();
  renderCalibPanel();
  showPanel('calibrate');
});

// Annuler dernier point
$('btn-undo-point').addEventListener('click', () => {
  Measure.undoLastPoint();
});

// Effacer tout
$('btn-clear-points').addEventListener('click', () => {
  if (measureState === 'calibrated') {
    measureState = 'placing';
    AppState.results = null;
    setMeasureStep(1, 'Posez les coins de la surface à mesurer');
    hideAllPanels();
  }
  Measure.clearPoints();
});

// Calibration – sélection de segment
let selectedSegIdx = -1;

function renderCalibPanel() {
  const segs = Measure.getSegments();
  const list = $('calibrate-segment-list');
  list.innerHTML = '';
  selectedSegIdx = segs.length > 0 ? 0 : -1;

  segs.forEach((seg, i) => {
    const btn = document.createElement('button');
    btn.className = `calib-seg-btn${i === 0 ? ' selected' : ''}`;
    btn.innerHTML = `
      <span class="calib-seg-label">${seg.label}</span>
      <span class="calib-seg-px">${seg.pxLen} px</span>
    `;
    btn.addEventListener('click', () => {
      list.querySelectorAll('.calib-seg-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSegIdx = i;
    });
    list.appendChild(btn);
  });
}

$('btn-apply-calib').addEventListener('click', () => {
  if (selectedSegIdx < 0) {
    showToast('Sélectionnez d\'abord un côté.', 'error');
    return;
  }
  let val = parseFloat($('calib-distance').value);
  if (isNaN(val) || val <= 0) {
    showToast('Entrez une distance valide.', 'error');
    return;
  }
  const unit = $('calib-unit').value;
  if (unit === 'cm') val /= 100;

  Measure.applyCalibration(selectedSegIdx, val);
  showToast('Calibration appliquée ✓', 'success');
});

// Rendu des résultats dans le panneau
function renderResults(results) {
  const grid = $('results-grid');
  grid.innerHTML = '';

  if (results && results.segments) {
    results.segments.forEach(seg => {
      const div = document.createElement('div');
      div.className = 'result-item';
      div.innerHTML = `
        <div class="result-label">${seg.label}</div>
        <div class="result-value">${seg.realM !== null ? seg.realM + ' m' : '–'}</div>
      `;
      grid.appendChild(div);
    });
  }

  $('result-surface').textContent = results && results.surfaceM2 !== null
    ? `${results.surfaceM2} m²`
    : '–';
}

// Export PDF
$('btn-export-pdf').addEventListener('click', async () => {
  if (!AppState.results || !AppState.results.calibrated) {
    showToast('Calibrez d\'abord la mesure.', 'error');
    return;
  }
  showToast('Génération du PDF…');
  try {
    const annotated = Measure.getAnnotatedDataUrl();
    const name = $('element-name').value.trim() || 'Mesure';
    const segs = AppState.results.segments;
    const calibSeg = segs.find((_, i) => true); // premier
    const calibInfo = calibSeg
      ? `${calibSeg.label} = ${calibSeg.realM} m (${calibSeg.pxLen} px)`
      : '';

    await PDFExport.generate({
      name,
      annotatedImageUrl: annotated,
      surfaceM2:   AppState.results.surfaceM2,
      perimeterM:  AppState.results.perimeterM,
      segments:    AppState.results.segments,
      calibInfo,
    });
    showToast('PDF téléchargé ! 📄', 'success');
  } catch (e) {
    console.error(e);
    showToast('Erreur lors de la génération du PDF.', 'error');
  }
});

// Sauvegarder
$('btn-save-measure').addEventListener('click', () => {
  if (!AppState.results || !AppState.results.calibrated) {
    showToast('Calibrez d\'abord la mesure.', 'error');
    return;
  }
  const name = $('element-name').value.trim() || 'Mesure sans nom';
  const annotated = Measure.getAnnotatedDataUrl();

  Storage.save({
    name,
    annotatedImageUrl: annotated,
    surfaceM2:   AppState.results.surfaceM2,
    perimeterM:  AppState.results.perimeterM,
    segments:    AppState.results.segments,
  });

  showToast(`"${name}" sauvegardé ✓`, 'success');
  updateHomeStats();
});

/* ── Helpers panels ── */
function hideAllPanels() {
  ['calibrate', 'results', 'save', 'validate'].forEach(p => {
    $(`panel-${p}`).classList.add('hidden');
  });
}
function showPanel(name) {
  $(`panel-${name}`).classList.remove('hidden');
}
function setMeasureStep(step, text) {
  $('step-badge').textContent = step;
  $('toolbar-instruction').textContent = text;
}

/* ════════════════════════════════════════════════
   HISTORY SCREEN
   ════════════════════════════════════════════════ */
function renderHistory() {
  const list    = $('history-list');
  const measures = Storage.getAll();

  if (measures.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p class="empty-title">Aucune mesure sauvegardée</p>
        <p class="empty-sub">Vos mesures apparaîtront ici après les avoir sauvegardées.</p>
      </div>`;
    return;
  }

  list.innerHTML = '';
  measures.forEach(m => {
    const card = document.createElement('div');
    card.className = 'history-card';

    const date = new Date(m.createdAt);
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) +
                    ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const chips = (m.segments || []).slice(0, 4).map(s =>
      `<span class="metric-chip"><span class="mc-label">${s.label} :</span><span class="mc-value">${s.realM} m</span></span>`
    ).join('');

    card.innerHTML = `
      <div class="history-card-img-wrap">
        ${m.annotatedImageUrl
          ? `<img class="history-card-img" src="${m.annotatedImageUrl}" alt="Photo de ${m.name}" loading="lazy"/>`
          : `<div class="history-card-no-img">🏠</div>`
        }
      </div>
      <div class="history-card-body">
        <div class="history-card-top">
          <span class="history-card-name">${m.name || 'Sans nom'}</span>
          <span class="history-card-date">${dateStr}</span>
        </div>
        <div class="history-card-metrics">
          ${chips}
          ${m.surfaceM2 !== null ? `<span class="metric-chip surface-chip"><span class="mc-label">Surface :</span><span class="mc-value">${m.surfaceM2} m²</span></span>` : ''}
          ${m.perimeterM !== null ? `<span class="metric-chip"><span class="mc-label">Périm. :</span><span class="mc-value">${m.perimeterM} m</span></span>` : ''}
        </div>
        <div class="history-card-actions">
          <button class="btn-secondary" data-id="${m.id}" data-action="pdf">
            <svg class="btn-icon-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
            PDF
          </button>
          <button class="btn-secondary" data-id="${m.id}" data-action="delete" style="color: var(--color-danger); border-color: rgba(239,68,68,0.3);">
            <svg class="btn-icon-left" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6l-1 14H6L5 6M8 6V4h8v2"/></svg>
            Supprimer
          </button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  // Actions sur les cartes
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id     = parseInt(btn.dataset.id);
    const action = btn.dataset.action;
    const measure = Storage.getAll().find(m => m.id === id);
    if (!measure) return;

    if (action === 'pdf') {
      showToast('Génération du PDF…');
      try {
        await PDFExport.generate(measure);
        showToast('PDF téléchargé ! 📄', 'success');
      } catch { showToast('Erreur PDF.', 'error'); }
    } else if (action === 'delete') {
      Storage.delete(id);
      renderHistory();
      updateHomeStats();
      showToast('Mesure supprimée.', 'success');
    }
  });
}

$('btn-clear-history').addEventListener('click', () => {
  if (!confirm('Effacer toutes les mesures sauvegardées ?')) return;
  Storage.clearAll();
  renderHistory();
  updateHomeStats();
  showToast('Historique effacé.', 'success');
});

/* ════════════════════════════════════════════════
   TOAST
   ════════════════════════════════════════════════ */
let toastTimeout = null;

function showToast(msg, type = '') {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className = `toast${type ? ' toast-' + type : ''}`;
  toast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

/* ════════════════════════════════════════════════
   MODAL
   ════════════════════════════════════════════════ */
$('modal-close').addEventListener('click', () => {
  $('modal-overlay').classList.add('hidden');
});
$('modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('modal-overlay')) $('modal-overlay').classList.add('hidden');
});

/* ════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  Storage.initSession();
  initSplash();
  navigate('home');
});
