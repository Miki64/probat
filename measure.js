// measure.js – Module de mesure et canvas pour BuildScan

const Measure = (() => {
  // ── État ──────────────────────────────────────────────────────────
  let canvas, ctx;
  let imageObj = null;           // HTMLImageElement de la photo
  let imgW = 0, imgH = 0;        // dimensions originales de l'image
  let displayScale = 1;          // facteur canvas-display / image
  let points  = [];              // [{x, y}] en coordonnées IMAGE
  let calibPx = null;            // distance en px du segment de calibration
  let calibM  = null;            // distance réelle en mètres
  let pxPerMeter = null;         // résolution: px / m
  let selectedCalibIdx = -1;     // index du segment sélectionné pour calib
  let isDragging = false;
  let dragIdx    = -1;

  // Callbacks
  let onPointsChange = null;
  let onCalibrated   = null;

  // ── Init ──────────────────────────────────────────────────────────
  function init(_canvas, _onPointsChange, _onCalibrated) {
    canvas = _canvas;
    ctx    = canvas.getContext('2d');
    onPointsChange = _onPointsChange;
    onCalibrated   = _onCalibrated;
    _bindEvents();
  }

  // ── Image ─────────────────────────────────────────────────────────
  function loadImage(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        imageObj = img;
        imgW = img.naturalWidth;
        imgH = img.naturalHeight;
        points = [];
        calibPx = null;
        calibM  = null;
        pxPerMeter = null;
        selectedCalibIdx = -1;
        _resize();
        render();
        resolve();
      };
      img.src = dataUrl;
    });
  }

  // ── Resize (ajuste canvas à son conteneur) ─────────────────────────
  function _resize() {
    if (!canvas || !imageObj) return;
    const wrap = canvas.parentElement;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;

    // Calcule la taille d'affichage de l'image (object-fit: contain)
    const imgAspect = imgW / imgH;
    const boxAspect = cw / ch;
    let displayW, displayH;
    if (imgAspect > boxAspect) {
      displayW = cw;
      displayH = cw / imgAspect;
    } else {
      displayH = ch;
      displayW = ch * imgAspect;
    }

    canvas.width  = cw;
    canvas.height = ch;
    displayScale  = displayW / imgW;
    canvas._imgOffX = (cw - displayW) / 2;
    canvas._imgOffY = (ch - displayH) / 2;
    canvas._dispW = displayW;
    canvas._dispH = displayH;
  }

  window.addEventListener('resize', () => { if (imageObj) { _resize(); render(); } });

  // ── Coordonnées ───────────────────────────────────────────────────
  function _canvasToImg(cx, cy) {
    return {
      x: (cx - canvas._imgOffX) / displayScale,
      y: (cy - canvas._imgOffY) / displayScale,
    };
  }
  function _imgToCanvas(ix, iy) {
    return {
      x: ix * displayScale + canvas._imgOffX,
      y: iy * displayScale + canvas._imgOffY,
    };
  }
  function _ptInImg(p) {
    const c = _imgToCanvas(p.x, p.y);
    return c;
  }

  // ── Events ────────────────────────────────────────────────────────
  function _bindEvents() {
    canvas.addEventListener('pointerdown', _onDown);
    canvas.addEventListener('pointermove', _onMove);
    canvas.addEventListener('pointerup',   _onUp);
    canvas.addEventListener('pointercancel', _onUp);
  }

  function _getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      cx: (e.clientX - rect.left) * (canvas.width  / rect.width),
      cy: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  function _onDown(e) {
    e.preventDefault();
    const { cx, cy } = _getPos(e);

    // Cherche si on clique sur un point existant (drag)
    const HIT = 22 / displayScale;
    for (let i = 0; i < points.length; i++) {
      const c = _imgToCanvas(points[i].x, points[i].y);
      if (Math.hypot(cx - c.x, cy - c.y) < 22) {
        isDragging = true;
        dragIdx    = i;
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Sinon ajouter un point (max 20)
    if (points.length >= 20) return;
    const ip = _canvasToImg(cx, cy);
    // Clamp dans l'image
    ip.x = Math.max(0, Math.min(imgW, ip.x));
    ip.y = Math.max(0, Math.min(imgH, ip.y));
    points.push(ip);
    render();
    if (onPointsChange) onPointsChange([...points]);
  }

  function _onMove(e) {
    if (!isDragging || dragIdx < 0) return;
    e.preventDefault();
    const { cx, cy } = _getPos(e);
    const ip = _canvasToImg(cx, cy);
    ip.x = Math.max(0, Math.min(imgW, ip.x));
    ip.y = Math.max(0, Math.min(imgH, ip.y));
    points[dragIdx] = ip;
    render();
    if (onPointsChange) onPointsChange([...points]);
  }

  function _onUp(e) {
    if (isDragging) {
      isDragging = false;
      dragIdx    = -1;
    }
  }

  // ── Undo / Clear ──────────────────────────────────────────────────
  function undoLastPoint() {
    if (points.length > 0) {
      points.pop();
      render();
      if (onPointsChange) onPointsChange([...points]);
    }
  }

  function clearPoints() {
    points = [];
    calibPx = null;
    calibM  = null;
    pxPerMeter = null;
    selectedCalibIdx = -1;
    render();
    if (onPointsChange) onPointsChange([]);
  }

  // ── Calibration ───────────────────────────────────────────────────
  /**
   * Retourne tous les segments du polygone
   * [{label, pxLen, i, j}]
   */
  function getSegments() {
    if (points.length < 2) return [];
    const segs = [];
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      if (i === points.length - 1 && points.length < 3) break; // pas de fermeture si < 3 points
      const px = _ptDist(points[i], points[j]);
      segs.push({ label: `Côté ${i + 1}`, pxLen: Math.round(px), i, j });
    }
    return segs;
  }

  function _ptDist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  /**
   * Applique la calibration
   * @param {number} segIdx – index du segment dans getSegments()
   * @param {number} realM  – distance réelle en mètres
   */
  function applyCalibration(segIdx, realM) {
    const segs = getSegments();
    if (segIdx < 0 || segIdx >= segs.length) return;
    calibPx = segs[segIdx].pxLen;
    calibM  = realM;
    pxPerMeter = calibPx / calibM;
    selectedCalibIdx = segIdx;
    render();
    if (onCalibrated) onCalibrated(getResults());
  }

  // ── Calculs ───────────────────────────────────────────────────────
  /**
   * Surface du polygone (Shoelace / Gauss)
   * @returns {number} surface en px²
   */
  function _polygonAreaPx() {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Périmètre du polygone en px
   */
  function _perimeterPx() {
    if (points.length < 2) return 0;
    let peri = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      if (i === points.length - 1 && points.length < 3) break;
      peri += _ptDist(points[i], points[j]);
    }
    return peri;
  }

  /**
   * Retourne les résultats calibrés
   */
  function getResults() {
    const segs = getSegments();
    const areaPx = _polygonAreaPx();
    const perPx  = _perimeterPx();

    if (!pxPerMeter) {
      return {
        segments: segs.map(s => ({ ...s, realM: null })),
        surfaceM2: null,
        perimeterM: null,
        calibrated: false,
      };
    }

    const pxPerM2 = pxPerMeter * pxPerMeter;
    return {
      segments: segs.map(s => ({
        ...s,
        realM: +(s.pxLen / pxPerMeter).toFixed(3),
      })),
      surfaceM2:  +(areaPx / pxPerM2).toFixed(3),
      perimeterM: +(perPx  / pxPerMeter).toFixed(3),
      calibrated: true,
      pxPerMeter,
    };
  }

  // ── Render ────────────────────────────────────────────────────────
  function render() {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Image de fond
    if (imageObj) {
      ctx.drawImage(
        imageObj,
        canvas._imgOffX, canvas._imgOffY,
        canvas._dispW, canvas._dispH
      );
      // Overlay sombre léger
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(canvas._imgOffX, canvas._imgOffY, canvas._dispW, canvas._dispH);
    }

    if (points.length === 0) return;

    const cPts = points.map(p => _imgToCanvas(p.x, p.y));

    // ── Polygone rempli ──
    if (points.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(cPts[0].x, cPts[0].y);
      for (let i = 1; i < cPts.length; i++) ctx.lineTo(cPts[i].x, cPts[i].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(249,115,22,0.15)';
      ctx.fill();
    }

    // ── Segments ──
    const segs = getSegments();
    for (let i = 0; i < segs.length; i++) {
      const a = cPts[segs[i].i];
      const b = cPts[segs[i].j];
      const isCalib = (i === selectedCalibIdx);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      if (isCalib) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth   = 3;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(249,115,22,0.9)';
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([]);
      }
      ctx.stroke();

      // Étiquette de distance sur le segment
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;

      let label;
      if (pxPerMeter) {
        const dm = (segs[i].pxLen / pxPerMeter).toFixed(2);
        label = `${dm} m`;
      } else {
        label = segs[i].label;
      }

      _drawLabel(ctx, label, mx, my, isCalib ? '#38bdf8' : '#f97316');
    }

    // ── Ligne en cours (dernier point → curseur) ──
    // (non implémenté pour l'instant, les points parlent d'eux-mêmes)

    // ── Points ──
    for (let i = 0; i < cPts.length; i++) {
      const p = cPts[i];
      // Halo
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(249,115,22,0.2)';
      ctx.fill();
      // Cercle principal
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.stroke();
      // Numéro
      ctx.fillStyle = 'white';
      ctx.font = `bold ${Math.max(9, 11 * displayScale)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, p.x, p.y);
    }

    ctx.setLineDash([]);

    // ── Surface au centre ──
    if (points.length >= 3 && pxPerMeter) {
      const cx2 = cPts.reduce((s, p) => s + p.x, 0) / cPts.length;
      const cy2 = cPts.reduce((s, p) => s + p.y, 0) / cPts.length;
      const res = getResults();
      _drawSurfaceBadge(ctx, `${res.surfaceM2} m²`, cx2, cy2);
    }
  }

  function _drawLabel(ctx, text, x, y, color) {
    ctx.save();
    const pad = 5;
    ctx.font = 'bold 11px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(13,17,23,0.8)';
    ctx.beginPath();
    ctx.roundRect(x - tw/2 - pad, y - 10, tw + pad*2, 20, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function _drawSurfaceBadge(ctx, text, x, y) {
    ctx.save();
    const pad = 12;
    ctx.font = 'bold 16px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + pad * 2;
    const bh = 32;
    ctx.fillStyle = 'rgba(249,115,22,0.9)';
    ctx.beginPath();
    ctx.roundRect(x - bw/2, y - bh/2, bw, bh, 8);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ── Export canvas avec annotations ────────────────────────────────
  function getAnnotatedDataUrl() {
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // ── API publique ──────────────────────────────────────────────────
  return {
    init,
    loadImage,
    undoLastPoint,
    clearPoints,
    getSegments,
    applyCalibration,
    getResults,
    render,
    getAnnotatedDataUrl,
    get points() { return [...points]; },
    get calibrated() { return !!pxPerMeter; },
  };
})();
