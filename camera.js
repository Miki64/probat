// camera.js – Module caméra pour BuildScan

const Camera = (() => {
  let stream = null;
  let facingMode = 'environment'; // caméra arrière par défaut
  let torchOn = false;
  let torchTrack = null;

  const video = document.getElementById('camera-video');

  /**
   * Démarre le flux caméra
   */
  async function start() {
    await stop(); // stop d'abord si déjà actif

    const constraints = {
      video: {
        facingMode,
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;

      // Attendre que la vidéo soit prête
      await new Promise(resolve => {
        video.onloadedmetadata = resolve;
        if (video.readyState >= 2) resolve();
      });
      await video.play();

      // Récupère le track pour la torche
      const tracks = stream.getVideoTracks();
      torchTrack = tracks.length > 0 ? tracks[0] : null;
      torchOn = false;

    } catch (err) {
      console.error('Camera error:', err);
      throw err;
    }
  }

  /**
   * Arrête le flux caméra
   */
  async function stop() {
    torchOn = false;
    torchTrack = null;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  /**
   * Retourne la caméra (avant/arrière)
   */
  async function flip() {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    await start();
  }

  /**
   * Active / désactive la lampe torche
   */
  async function toggleTorch() {
    if (!torchTrack) return false;
    const capabilities = torchTrack.getCapabilities();
    if (!capabilities.torch) return false;

    torchOn = !torchOn;
    try {
      await torchTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
    } catch { torchOn = !torchOn; }
    return torchOn;
  }

  /**
   * Capture l'image courante → retourne un data URL + les dimensions
   */
  function capture() {
    const w = video.videoWidth  || video.clientWidth;
    const h = video.videoHeight || video.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: w, height: h };
  }

  /**
   * Indique si l'API caméra est disponible
   */
  function isAvailable() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  return { start, stop, flip, toggleTorch, capture, isAvailable };
})();
