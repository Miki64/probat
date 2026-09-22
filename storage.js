// storage.js – Gestion localStorage pour BuildScan

const STORAGE_KEY = 'buildscan_measures';
const SESSION_KEY = 'buildscan_session_start';

const Storage = {
  /**
   * Initialise la session si besoin
   */
  initSession() {
    if (!localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, new Date().toISOString());
    }
  },

  /**
   * Retourne la date de début de session formatée
   */
  getSessionStart() {
    const iso = localStorage.getItem(SESSION_KEY);
    if (!iso) return '–';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) +
           ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  },

  /**
   * Retourne toutes les mesures sauvegardées
   * @returns {Array}
   */
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  },

  /**
   * Sauvegarde une mesure
   * @param {Object} measure
   */
  save(measure) {
    const all = this.getAll();
    const entry = {
      id:        Date.now(),
      createdAt: new Date().toISOString(),
      ...measure,
    };
    all.unshift(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return entry;
  },

  /**
   * Supprime une mesure par son ID
   * @param {number} id
   */
  delete(id) {
    const all = this.getAll().filter(m => m.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  },

  /**
   * Efface toutes les mesures
   */
  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  },

  /**
   * Retourne le total de surface de toutes les mesures
   */
  getTotalSurface() {
    return this.getAll().reduce((sum, m) => sum + (m.surfaceM2 || 0), 0);
  },
};
