// ar.js – Module WebXR AR pour BuildScan
// Utilise l'API WebXR Hit-Test pour mesurer en réalité augmentée
// Les distances retournées sont en mètres (coordonnées monde réel)

const AR = (() => {

  // ── État ──────────────────────────────────────────────────────────
  let xrSession    = null;
  let xrRefSpace   = null;
  let hitTestSrc   = null;
  let glCanvas     = null;
  let gl           = null;
  let rafId        = null;
  let isRunning    = false;

  let currentHitPose  = null;  // pose du curseur AR actuel
  let placedPoints    = [];    // [{x,y,z}] coordonnées monde réel
  let onFrame         = null;  // callback(hitPose, placedPoints, results)
  let onPointPlaced   = null;  // callback(points)

  // ── Vérification support ─────────────────────────────────────────
  async function isSupported() {
    if (!navigator.xr) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch { return false; }
  }

  // ── Démarrage session AR ─────────────────────────────────────────
  async function startSession(overlayEl, _onFrame, _onPointPlaced) {
    onFrame        = _onFrame;
    onPointPlaced  = _onPointPlaced;
    placedPoints   = [];

    // Canvas WebGL caché (requis par WebXR)
    glCanvas = document.createElement('canvas');
    gl = glCanvas.getContext('webgl', { xrCompatible: true });

    const sessionInit = {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation'],
      domOverlay: overlayEl ? { root: overlayEl } : undefined,
    };

    xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);
    xrSession.addEventListener('end', _onSessionEnd);

    // Couche de rendu
    const baseLayer = new XRWebGLLayer(xrSession, gl);
    await xrSession.updateRenderState({ baseLayer });

    // Référentiel local
    xrRefSpace = await xrSession.requestReferenceSpace('local');

    // Source de hit-test (depuis le viewer = centre caméra)
    const viewerSpace = await xrSession.requestReferenceSpace('viewer');
    hitTestSrc = await xrSession.requestHitTestSource({ space: viewerSpace });

    isRunning = true;
    rafId = xrSession.requestAnimationFrame(_onXRFrame);
  }

  // ── Boucle de rendu AR ───────────────────────────────────────────
  function _onXRFrame(time, frame) {
    if (!isRunning) return;
    rafId = xrSession.requestAnimationFrame(_onXRFrame);

    const hitResults = frame.getHitTestResults(hitTestSrc);
    if (hitResults.length > 0) {
      const hit  = hitResults[0];
      const pose = hit.getPose(xrRefSpace);
      if (pose) {
        currentHitPose = pose.transform.position; // {x, y, z}
      }
    } else {
      currentHitPose = null;
    }

    if (onFrame) {
      onFrame(currentHitPose, [...placedPoints], _computeResults());
    }
  }

  // ── Placer un point à la position actuelle du curseur AR ─────────
  function placePoint() {
    if (!currentHitPose || !isRunning) return false;
    placedPoints.push({ ...currentHitPose });
    if (onPointPlaced) onPointPlaced([...placedPoints], _computeResults());
    return true;
  }

  // ── Annuler dernier point ────────────────────────────────────────
  function undoLastPoint() {
    if (placedPoints.length > 0) {
      placedPoints.pop();
      if (onPointPlaced) onPointPlaced([...placedPoints], _computeResults());
    }
  }

  function clearPoints() {
    placedPoints = [];
    if (onPointPlaced) onPointPlaced([], null);
  }

  // ── Calculs monde réel ───────────────────────────────────────────
  function _dist3D(a, b) {
    return Math.sqrt(
      Math.pow(b.x - a.x, 2) +
      Math.pow(b.y - a.y, 2) +
      Math.pow(b.z - a.z, 2)
    );
  }

  /**
   * Distance horizontale (plan sol XZ) entre 2 points
   */
  function _distH(a, b) {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.z - a.z, 2));
  }

  /**
   * Surface d'un polygone 3D projeté sur le plan sol (XZ)
   * Algorithme de Shoelace
   */
  function _areaPlanXZ(pts) {
    if (pts.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].z;
      area -= pts[j].x * pts[i].z;
    }
    return Math.abs(area) / 2;
  }

  function _computeResults() {
    if (placedPoints.length < 2) return null;

    const segments = [];
    for (let i = 0; i < placedPoints.length; i++) {
      const j = (i + 1) % placedPoints.length;
      if (i === placedPoints.length - 1 && placedPoints.length < 3) break;
      const dist = _distH(placedPoints[i], placedPoints[j]);
      segments.push({
        label: `Côté ${i + 1}`,
        realM: +dist.toFixed(3),
        i, j,
      });
    }

    let surfaceM2   = null;
    let perimeterM  = null;

    if (placedPoints.length >= 3) {
      surfaceM2  = +_areaPlanXZ(placedPoints).toFixed(3);
      perimeterM = +segments.reduce((s, seg) => s + seg.realM, 0).toFixed(3);
    } else if (placedPoints.length === 2) {
      perimeterM = +_distH(placedPoints[0], placedPoints[1]).toFixed(3);
    }

    return {
      segments,
      surfaceM2,
      perimeterM,
      calibrated: true, // AR = toujours calibré (coords réelles)
      pointCount: placedPoints.length,
    };
  }

  // ── Capture d'une frame AR (screenshot WebXR) ────────────────────
  function captureFrame() {
    // Retourne un canvas-based snapshot de la vue courante
    // (Le gl canvas contient la dernière frame rendue par WebXR)
    try {
      return glCanvas ? glCanvas.toDataURL('image/jpeg', 0.85) : null;
    } catch { return null; }
  }

  // ── Arrêt de la session ──────────────────────────────────────────
  async function stopSession() {
    isRunning = false;
    if (hitTestSrc) { try { hitTestSrc.cancel(); } catch {} hitTestSrc = null; }
    if (xrSession)  { try { await xrSession.end(); } catch {} xrSession = null; }
    currentHitPose = null;
  }

  function _onSessionEnd() {
    isRunning = false;
    xrSession = null;
    hitTestSrc = null;
  }

  // ── Getters ──────────────────────────────────────────────────────
  return {
    isSupported,
    startSession,
    stopSession,
    placePoint,
    undoLastPoint,
    clearPoints,
    captureFrame,
    get isRunning()       { return isRunning; },
    get currentHitPose()  { return currentHitPose; },
    get points()          { return [...placedPoints]; },
    get results()         { return _computeResults(); },
  };
})();
