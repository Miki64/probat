// pdf-export.js – Génération PDF pour BuildScan (via jsPDF)

const PDFExport = (() => {

  /**
   * Génère et télécharge le PDF d'une mesure
   * @param {Object} measure – données de la mesure
   */
  async function generate(measure) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const PAGE_W = 210;
    const PAGE_H = 297;
    const MARGIN = 16;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    // ── Palette ──────────────────────────────────────────
    const C_BG      = [13, 17, 23];
    const C_SURFACE = [33, 38, 45];
    const C_PRIMARY = [249, 115, 22];
    const C_ACCENT  = [56, 189, 248];
    const C_TEXT    = [230, 237, 243];
    const C_TEXT2   = [139, 148, 158];
    const C_WHITE   = [255, 255, 255];

    // ── Fond global ───────────────────────────────────────
    doc.setFillColor(...C_BG);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

    // ── Header ───────────────────────────────────────────
    const HDR_H = 40;
    doc.setFillColor(...C_PRIMARY);
    doc.rect(0, 0, PAGE_W, HDR_H, 'F');

    // Logo / titre
    doc.setTextColor(...C_WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('📐 BuildScan', MARGIN, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C_WHITE);
    doc.text('Rapport de Mesure Bâtiment', MARGIN, 26);

    // Date à droite
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    doc.setFontSize(9);
    doc.setTextColor(...C_WHITE);
    doc.text(`${dateStr}  ${timeStr}`, PAGE_W - MARGIN, 18, { align: 'right' });

    let y = HDR_H + 12;

    // ── Nom de l'élément ──────────────────────────────────
    const name = measure.name || 'Sans nom';
    doc.setFillColor(...C_SURFACE);
    doc.roundedRect(MARGIN, y, CONTENT_W, 18, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C_TEXT);
    doc.text(name, MARGIN + 8, y + 11.5);
    y += 26;

    // ── Photo annotée ────────────────────────────────────
    if (measure.annotatedImageUrl) {
      try {
        const IMG_H = 90;
        // Dessine un fond arrondi pour l'image
        doc.setFillColor(...C_SURFACE);
        doc.roundedRect(MARGIN, y, CONTENT_W, IMG_H + 4, 4, 4, 'F');
        doc.addImage(measure.annotatedImageUrl, 'JPEG', MARGIN + 2, y + 2, CONTENT_W - 4, IMG_H, '', 'FAST');
        y += IMG_H + 12;
      } catch (e) {
        console.warn('Image non chargée dans le PDF', e);
        y += 4;
      }
    }

    // ── Surface principale ────────────────────────────────
    if (measure.surfaceM2 !== null && measure.surfaceM2 !== undefined) {
      doc.setFillColor(...C_PRIMARY);
      doc.roundedRect(MARGIN, y, CONTENT_W, 26, 5, 5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...C_WHITE);
      doc.text('Surface totale', MARGIN + 8, y + 9);
      doc.setFontSize(18);
      doc.text(`${measure.surfaceM2} m²`, PAGE_W - MARGIN - 8, y + 17, { align: 'right' });
      y += 34;
    }

    // ── Périmètre ─────────────────────────────────────────
    if (measure.perimeterM !== null && measure.perimeterM !== undefined) {
      doc.setFillColor(...C_SURFACE);
      doc.roundedRect(MARGIN, y, CONTENT_W, 16, 3, 3, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C_TEXT2);
      doc.text('Périmètre', MARGIN + 6, y + 8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C_ACCENT);
      doc.text(`${measure.perimeterM} m`, PAGE_W - MARGIN - 6, y + 8.5, { align: 'right' });
      y += 22;
    }

    // ── Tableau des côtés ─────────────────────────────────
    if (measure.segments && measure.segments.length > 0) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C_TEXT2);
      doc.text('DÉTAIL DES CÔTÉS', MARGIN, y);
      y += 6;

      const COL_W = CONTENT_W / 3;
      const ROW_H = 12;

      // Entêtes
      doc.setFillColor(40, 50, 60);
      doc.roundedRect(MARGIN, y, CONTENT_W, ROW_H, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C_TEXT2);
      doc.text('Côté', MARGIN + 6, y + 8);
      doc.text('Pixels', MARGIN + COL_W + 6, y + 8);
      doc.text('Mesure réelle', MARGIN + COL_W * 2 + 6, y + 8);
      y += ROW_H + 1;

      measure.segments.forEach((seg, idx) => {
        const rowFill = idx % 2 === 0 ? [28, 33, 40] : [33, 38, 45];
        doc.setFillColor(...rowFill);
        doc.rect(MARGIN, y, CONTENT_W, ROW_H, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...C_TEXT);
        doc.text(seg.label || `Côté ${idx + 1}`, MARGIN + 6, y + 8);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C_TEXT2);
        doc.text(`${seg.pxLen} px`, MARGIN + COL_W + 6, y + 8);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C_ACCENT);
        const realStr = seg.realM !== null ? `${seg.realM} m` : '–';
        doc.text(realStr, MARGIN + COL_W * 2 + 6, y + 8);

        y += ROW_H;
      });

      y += 6;
    }

    // ── Calibration utilisée ──────────────────────────────
    if (measure.calibInfo) {
      doc.setFillColor(30, 40, 50);
      doc.roundedRect(MARGIN, y, CONTENT_W, 14, 3, 3, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...C_TEXT2);
      doc.text(`Calibration : ${measure.calibInfo}`, MARGIN + 6, y + 9);
      y += 20;
    }

    // ── Notes (nom) ───────────────────────────────────────
    if (measure.notes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C_TEXT2);
      doc.text(`Notes : ${measure.notes}`, MARGIN, y);
      y += 10;
    }

    // ── Footer ────────────────────────────────────────────
    doc.setFillColor(...C_SURFACE);
    doc.rect(0, PAGE_H - 16, PAGE_W, 16, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C_TEXT2);
    doc.text('Généré par BuildScan – Application de Mesure Bâtiment', MARGIN, PAGE_H - 7);
    doc.text('buildscan.app', PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' });

    // ── Sauvegarde ────────────────────────────────────────
    const filename = `buildscan_${slugify(name)}_${formatDate(now)}.pdf`;
    doc.save(filename);
  }

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'mesure';
  }

  function formatDate(d) {
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  return { generate };
})();
