// ===============================
// CSVXpressGold — app.js (FULL) — vNext (UPDATED)
// - WhatsApp: Riv / Cliente / Netto (senza margine) leggibili
// - Sempre: Codice + Netto (bene) + "prezzi IVA esclusa"
// - Noleggio: canoni NON doppi (una sola tabella coerente con includiRID)
// ===============================

// -------------------------------
// Service Worker
// -------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js")
    .then(function (reg) { console.log("SW ok", reg); })
    .catch(function (err) { console.error("SW err", err); });
}

// -------------------------------
// Stato
// -------------------------------
var priceList = [];
var quoteItems = [];
var autoFillServices = true;

// Alias retro-compatibilità
var listino = priceList;
var articoliAggiunti = quoteItems;
var autoPopolaCosti = autoFillServices;

// -------------------------------
// Utils
// -------------------------------
function round2(n) { return Math.round(n * 100) / 100; }

function toNumber(v) {
  v = parseFloat(String(v == null ? "" : v).replace(",", "."));
  return isNaN(v) ? 0 : v;
}

function clampMin(v, min) { return v < min ? min : v; }

function resetArray(arr) { arr.length = 0; }

// -------------------------------
// DOM helpers
// -------------------------------
function getEl(id) { return document.getElementById(id); }
function el(tag) { return document.createElement(tag); }

function escapeHtml(s) {
  s = s == null ? "" : String(s);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function debounce(fn, ms) {
  var t = null;
  return function () {
    clearTimeout(t);
    var args = arguments;
    t = setTimeout(function () { fn.apply(null, args); }, ms);
  };
}

// -------------------------------
// ANAGRAFICA (opzionale)
// -------------------------------
var ANAG_KEY = "csvxpressgold_anagrafica_v2";

function hasAnagraficaUI() { return !!getEl("anagraficaAzienda"); }

function getAnagraficaFromUI() {
  function val(id) {
    var node = getEl(id);
    return node ? (node.value || "").trim() : "";
  }
  return {
    tipo: val("anagraficaTipo") || "rivenditore",
    azienda: val("anagraficaAzienda"),
    referente: val("anagraficaReferente"),
    email: val("anagraficaEmail"),
    cell: val("anagraficaCell"),
    indirizzo: val("anagraficaIndirizzo"),
    piva: val("anagraficaPiva"),
    cf: val("anagraficaCf"),
    note: val("anagraficaNote"),
  };
}

function setAnagraficaToUI(data, clear) {
  data = data || {};
  function set(id, v) {
    var node = getEl(id);
    if (!node) return;
    node.value = clear ? "" : (v || "");
  }
  set("anagraficaTipo", data.tipo || "rivenditore");
  set("anagraficaAzienda", data.azienda);
  set("anagraficaReferente", data.referente);
  set("anagraficaEmail", data.email);
  set("anagraficaCell", data.cell);
  set("anagraficaIndirizzo", data.indirizzo);
  set("anagraficaPiva", data.piva);
  set("anagraficaCf", data.cf);
  set("anagraficaNote", data.note);
}

function saveAnagrafica() {
  if (!hasAnagraficaUI()) return;
  try { localStorage.setItem(ANAG_KEY, JSON.stringify(getAnagraficaFromUI())); } catch (e) {}
}

function loadAnagrafica(clear) {
  if (!hasAnagraficaUI()) return;
  try {
    if (clear) { setAnagraficaToUI(null, true); return; }
    var raw = localStorage.getItem(ANAG_KEY);
    if (!raw) return;
    setAnagraficaToUI(JSON.parse(raw), false);
  } catch (e) {}
}

function bindAnagraficaAutosave() {
  if (!hasAnagraficaUI()) return;

  loadAnagrafica(false);

  var ids = [
    "anagraficaTipo","anagraficaAzienda","anagraficaReferente","anagraficaEmail",
    "anagraficaCell","anagraficaIndirizzo","anagraficaPiva","anagraficaCf","anagraficaNote"
  ];
  var saver = debounce(saveAnagrafica, 300);

  for (var i = 0; i < ids.length; i++) {
    (function (id) {
      var node = getEl(id);
      if (!node) return;
      node.addEventListener("input", saver, false);
      node.addEventListener("change", saver, false);
    })(ids[i]);
  }
}

function getAnagraficaForVariant(variant) {
  if (!hasAnagraficaUI()) return {};
  var a = getAnagraficaFromUI();
  a._variant = variant;
  return a;
}

// -------------------------------
// Bootstrap
// -------------------------------
document.addEventListener("DOMContentLoaded", function () {
  bindAnagraficaAutosave();

  var csvInput = getEl("csvFileInput");
  if (csvInput) csvInput.addEventListener("change", handleCSVUpload, false);

  var search = getEl("searchListino");
  if (search) search.addEventListener("input", refreshPriceListSelect, false);

  var btnAdd = getEl("btnAddFromListino");
  if (btnAdd) btnAdd.addEventListener("click", addItemFromPriceList, false);

  var btnManual = getEl("btnManual");
  if (btnManual) btnManual.addEventListener("click", showManualItemRow, false);

  // Auto servizi
  var toggleCosti = getEl("toggleCosti");
  if (toggleCosti) {
    autoFillServices = !!toggleCosti.checked;
    autoPopolaCosti = autoFillServices;

    toggleCosti.addEventListener("change", function () {
      autoFillServices = !!toggleCosti.checked;
      autoPopolaCosti = autoFillServices;

      for (var i = 0; i < quoteItems.length; i++) {
        var it = quoteItems[i];
        if (!autoFillServices) {
          it.costoTrasporto = 0;
          it.costoInstallazione = 0;
        } else {
          var base = findInPriceList(it.codice);
          if (base) {
            it.costoTrasporto = toNumber(base.costoTrasporto);
            it.costoInstallazione = toNumber(base.costoInstallazione);
          }
        }
      }

      renderItemsTable();
      updateTotals();
      updateRentalBox();
    }, false);
  }

  // Bottoni report (se esistono)
  var btnWA = getEl("btnWA");
  if (btnWA) btnWA.addEventListener("click", sendWhatsAppReport, false);

  var btnWACli = getEl("btnWACliente");
  if (btnWACli) btnWACli.addEventListener("click", sendWhatsAppReportCliente, false);

  var btnWAnm = getEl("btnWASenzaMargine");
  if (btnWAnm) btnWAnm.addEventListener("click", sendWhatsAppReportNoMargin, false);

  var btnTXT = getEl("btnTXT");
  if (btnTXT) btnTXT.addEventListener("click", exportTxtReport, false);

  var btnTXTnm = getEl("btnTXTSenzaMargine");
  if (btnTXTnm) btnTXTnm.addEventListener("click", exportTxtReportNoMargin, false);

  // Preventivi
  var btnPrevR = getEl("btnPrevRiv");
  if (btnPrevR) btnPrevR.addEventListener("click", function () { openPrintableQuote("riv"); }, false);

  var btnPrevC = getEl("btnPrevCli");
  if (btnPrevC) btnPrevC.addEventListener("click", function () { openPrintableQuote("cli"); }, false);

  // Noleggio
  var selDur = getEl("noleggioDurata");
  if (selDur) selDur.addEventListener("change", updateRentalBox, false);

  var btnNT = getEl("btnNoleggioTXT");
  if (btnNT) btnNT.addEventListener("click", downloadRentalTXT, false);

  // Noleggio avanzato
  var elGm = getEl("noleggioGiorniMese");
  if (elGm) elGm.addEventListener("input", updateRentalBox, false);

  var elOg = getEl("noleggioOreGiorno");
  if (elOg) elOg.addEventListener("input", updateRentalBox, false);

  var elRid = getEl("noleggioRidMensile");
  if (elRid) elRid.addEventListener("input", updateRentalBox, false);

  var elInc = getEl("noleggioIncludiRID");
  if (elInc) elInc.addEventListener("change", updateRentalBox, false);

  var elTab = getEl("noleggioMostraTabellaCanoni");
  if (elTab) elTab.addEventListener("change", updateRentalBox, false);

  // Fix default cliente
  var defaultCli = getEl("margineCliDefault");
  if (defaultCli) defaultCli.addEventListener("input", function () {
    renderItemsTable();
    updateTotals();
    updateRentalBox();
  }, false);

  renderItemsTable();
  updateTotals();
  updateRentalBox();
});

// -------------------------------
// CSV upload
// -------------------------------
function handleCSVUpload(event) {
  var file = event.target.files[0];
  if (!file) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      if (!results.data || !results.data.length) {
        var errEl = getEl("csvError");
        if (errEl) errEl.style.display = "block";
        return;
      }

      resetArray(priceList);

      for (var i = 0; i < results.data.length; i++) {
        var row = results.data[i] || {};
        priceList.push({
          codice: (row["Codice"] || "").trim(),
          descrizione: (row["Descrizione"] || "").trim(),
          prezzoLordo: toNumber(row["PrezzoLordo"] || "0"),
          sconto: 0,
          sconto2: 0,
          margine: 0, // 0 = usa default cliente
          costoTrasporto: toNumber(row["CostoTrasporto"] || "0"),
          costoInstallazione: toNumber(row["CostoInstallazione"] || "0"),
          quantita: 1,
          venduto: 0,
        });
      }

      listino = priceList;

      var errEl2 = getEl("csvError");
      if (errEl2) errEl2.style.display = "none";

      refreshPriceListSelect();
    },
    error: function () {
      var errEl3 = getEl("csvError");
      if (errEl3) errEl3.style.display = "block";
    },
  });
}

// -------------------------------
// Listino UI
// -------------------------------
function refreshPriceListSelect() {
  var select = getEl("listinoSelect");
  if (!select) return;

  var searchTerm = ((getEl("searchListino") && getEl("searchListino").value) || "").toLowerCase();
  select.innerHTML = "";

  for (var i = 0; i < priceList.length; i++) {
    var it = priceList[i];
    var hit =
      (it.codice || "").toLowerCase().indexOf(searchTerm) > -1 ||
      (it.descrizione || "").toLowerCase().indexOf(searchTerm) > -1;

    if (!hit) continue;

    var opt = el("option");
    opt.value = it.codice;
    opt.textContent = it.codice + " - " + it.descrizione + " - €" + toNumber(it.prezzoLordo).toFixed(2);
    select.appendChild(opt);
  }
}

function findInPriceList(codice) {
  for (var i = 0; i < priceList.length; i++) if (priceList[i].codice === codice) return priceList[i];
  return null;
}

function addItemFromPriceList() {
  var select = getEl("listinoSelect");
  if (!select || !select.value) return;

  var base = findInPriceList(select.value);
  if (!base) { alert("Errore: articolo non trovato nel listino."); return; }

  var newItem = {};
  for (var k in base) if (base.hasOwnProperty(k)) newItem[k] = base[k];

  if (!autoFillServices) {
    newItem.costoTrasporto = 0;
    newItem.costoInstallazione = 0;
  }

  quoteItems.push(newItem);
  articoliAggiunti = quoteItems;

  renderItemsTable();
  updateTotals();
  updateRentalBox();
}
// ===============================
// Calcoli (Netto + Margine)
// ===============================
function calcNetto(item) {
  var s1 = toNumber(item.sconto);
  var s2 = toNumber(item.sconto2);
  var lordo = toNumber(item.prezzoLordo);
  return round2(lordo * (1 - s1 / 100) * (1 - s2 / 100));
}

function calcPriceWithMargin(netto, marginePerc) {
  marginePerc = toNumber(marginePerc);
  if (marginePerc <= 0) return round2(netto);
  if (marginePerc >= 99.99) marginePerc = 99.99;
  return round2(netto / (1 - marginePerc / 100));
}

function getDefaultCustomerMargin() {
  var input = getEl("margineCliDefault");
  return input ? toNumber(input.value) : 0;
}

function getEffectiveRowMargin(item) {
  var m = toNumber(item.margine);
  return m > 0 ? m : getDefaultCustomerMargin();
}

// compat nomi storici
function getMargineRiv(item) { return getEffectiveRowMargin(item); }
function getMargineCli() { return getDefaultCustomerMargin(); }

// ===============================
// Tabella articoli
// ===============================
function tdInputNumber(index, field, value, opts) {
  opts = opts || {};
  var v = typeof value === "number" ? value : toNumber(value);
  var minAttr = opts.min != null ? " min='" + String(opts.min) + "'" : "";
  var stepAttr = opts.step != null ? " step='" + String(opts.step) + "'" : " step='0.01'";
  return "<td><input type='number' value='" + v + "' data-index='" + index + "' data-field='" + field + "'" +
    minAttr + stepAttr + " oninput='aggiornaCampo(event)'></td>";
}

function renderItemsTable() {
  var tbody = document.querySelector("#articoli-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (var i = 0; i < quoteItems.length; i++) {
    var it = quoteItems[i];

    var netto = calcNetto(it);
    var qty = Math.round(clampMin(toNumber(it.quantita), 1));

    var ship = toNumber(it.costoTrasporto);
    var inst = toNumber(it.costoInstallazione);
    var servicesUnit = ship + inst;

    var mEff = getEffectiveRowMargin(it);
    var unitWithMargin = calcPriceWithMargin(netto, mEff);

    var rowTot = round2((unitWithMargin + servicesUnit) * qty);

    var sold = toNumber(it.venduto);
    var diff = round2(sold - rowTot);

    var tr = el("tr");
    tr.innerHTML =
      "<td>" + escapeHtml(it.codice || "") + "</td>" +
      "<td>" + escapeHtml(it.descrizione || "") + "</td>" +
      "<td>" + toNumber(it.prezzoLordo).toFixed(2) + "€</td>" +
      tdInputNumber(i, "sconto", toNumber(it.sconto), { min: 0, step: 0.01 }) +
      tdInputNumber(i, "sconto2", toNumber(it.sconto2), { min: 0, step: 0.01 }) +
      tdInputNumber(i, "margine", mEff, { min: 0, step: 0.01 }) +
      "<td>" + netto.toFixed(2) + "€</td>" +
      tdInputNumber(i, "costoTrasporto", ship, { min: 0, step: 0.01 }) +
      tdInputNumber(i, "costoInstallazione", inst, { min: 0, step: 0.01 }) +
      tdInputNumber(i, "quantita", qty, { min: 1, step: 1 }) +
      "<td>" + rowTot.toFixed(2) + "€</td>" +
      tdInputNumber(i, "venduto", sold, { min: 0, step: 0.01 }) +
      "<td>" + diff.toFixed(2) + "€</td>" +
      "<td><button type='button' onclick='rimuoviArticolo(" + i + ")'>Rimuovi</button></td>";

    tbody.appendChild(tr);
  }

  articoliAggiunti = quoteItems;
}

function aggiornaCampo(event) {
  var input = event.target;
  var idx = parseInt(input.getAttribute("data-index"), 10);
  var field = input.getAttribute("data-field");
  var val = toNumber(input.value);

  if (!quoteItems[idx]) return;

  if (field === "quantita") {
    if (val < 1) val = 1;
    val = Math.round(val);
  } else {
    if (val < 0) val = 0;
  }

  // margine=0 => dinamico (usa default cliente)
  quoteItems[idx][field] = val;

  renderItemsTable();
  updateTotals();
  updateRentalBox();
}

function rimuoviArticolo(idx) {
  quoteItems.splice(idx, 1);
  renderItemsTable();
  updateTotals();
  updateRentalBox();
}

// ===============================
// Totali
// ===============================
function updateTotals() {
  var totalNet = 0;
  var totalRiv = 0;
  var totalSold = 0;
  var totalDiff = 0;

  for (var i = 0; i < quoteItems.length; i++) {
    var it = quoteItems[i];
    var qty = Math.round(clampMin(toNumber(it.quantita), 1));

    var netto = calcNetto(it);
    var mEff = getEffectiveRowMargin(it);
    var unitWithMargin = calcPriceWithMargin(netto, mEff);

    var servicesUnit = toNumber(it.costoTrasporto) + toNumber(it.costoInstallazione);
    var rowRiv = round2((unitWithMargin + servicesUnit) * qty);

    var sold = toNumber(it.venduto);
    var diff = round2(sold - rowRiv);

    totalNet += netto * qty;
    totalRiv += rowRiv;
    totalSold += sold;
    totalDiff += diff;
  }

  var holder = getEl("totaleGenerale");
  if (!holder) return;

  holder.innerHTML =
    "<strong>Totale Netto (dopo sconti):</strong> " + round2(totalNet).toFixed(2) + "€<br>" +
    "<strong>Totale Preventivo Rivenditore (margine + servizi):</strong> " + round2(totalRiv).toFixed(2) + "€<br>" +
    "<strong>Totale Venduto (se compilato):</strong> " + round2(totalSold).toFixed(2) + "€<br>" +
    "<strong>Totale Differenza:</strong> " + round2(totalDiff).toFixed(2) + "€";
}

// ===============================
// Inserimento manuale
// ===============================
function showManualItemRow() {
  var tbody = document.querySelector("#articoli-table tbody");
  if (!tbody) return;
  if (getEl("manual-input-row")) return;

  var tr = el("tr");
  tr.id = "manual-input-row";
  tr.innerHTML =
    "<td><input type='text' id='manualCodice' placeholder='Codice'></td>" +
    "<td><input type='text' id='manualDescrizione' placeholder='Descrizione'></td>" +
    "<td><input type='number' id='manualPrezzo' placeholder='€' step='0.01'></td>" +
    "<td><input type='number' id='manualSconto1' placeholder='%' value='0' step='0.01' min='0'></td>" +
    "<td><input type='number' id='manualSconto2' placeholder='%' value='0' step='0.01' min='0'></td>" +
    "<td><input type='number' id='manualMargine' placeholder='%' value='0' step='0.01' min='0'></td>" +
    "<td><span id='manualNetto'>—</span></td>" +
    "<td><input type='number' id='manualTrasporto' placeholder='€' value='0' step='0.01' min='0'></td>" +
    "<td><input type='number' id='manualInstallazione' placeholder='€' value='0' step='0.01' min='0'></td>" +
    "<td><input type='number' id='manualQuantita' placeholder='1' value='1' min='1' step='1'></td>" +
    "<td><span id='manualTotRiv'>—</span></td>" +
    "<td><input type='number' id='manualVenduto' placeholder='€' value='0' step='0.01' min='0'></td>" +
    "<td><span id='manualDiff'>—</span></td>" +
    "<td><button type='button' onclick='aggiungiArticoloManuale()'>✅</button> " +
    "<button type='button' onclick='annullaArticoloManuale()'>❌</button></td>";

  tbody.appendChild(tr);

  var ids = ["manualPrezzo","manualSconto1","manualSconto2","manualMargine","manualTrasporto","manualInstallazione","manualQuantita","manualVenduto"];
  for (var i = 0; i < ids.length; i++) getEl(ids[i]).addEventListener("input", calcolaRigaManuale, false);

  calcolaRigaManuale();
}

function calcolaRigaManuale() {
  var prezzoLordo = toNumber(getEl("manualPrezzo").value);
  var s1 = toNumber(getEl("manualSconto1").value);
  var s2 = toNumber(getEl("manualSconto2").value);

  var m = toNumber(getEl("manualMargine").value);
  var mEff = m > 0 ? m : getDefaultCustomerMargin();

  var ship = toNumber(getEl("manualTrasporto").value);
  var inst = toNumber(getEl("manualInstallazione").value);

  var qty = Math.round(clampMin(toNumber(getEl("manualQuantita").value), 1));
  var sold = toNumber(getEl("manualVenduto").value);

  var netto = round2(prezzoLordo * (1 - s1 / 100) * (1 - s2 / 100));
  var unitWithMargin = calcPriceWithMargin(netto, mEff);

  var tot = round2((unitWithMargin + ship + inst) * qty);
  var diff = round2(sold - tot);

  getEl("manualNetto").textContent = netto.toFixed(2) + "€";
  getEl("manualTotRiv").textContent = tot.toFixed(2) + "€";
  getEl("manualDiff").textContent = diff.toFixed(2) + "€";
}

function aggiungiArticoloManuale() {
  var newItem = {
    codice: (getEl("manualCodice").value || "").trim(),
    descrizione: (getEl("manualDescrizione").value || "").trim(),
    prezzoLordo: toNumber(getEl("manualPrezzo").value),
    sconto: toNumber(getEl("manualSconto1").value),
    sconto2: toNumber(getEl("manualSconto2").value),
    margine: toNumber(getEl("manualMargine").value), // 0 = dinamico
    costoTrasporto: toNumber(getEl("manualTrasporto").value),
    costoInstallazione: toNumber(getEl("manualInstallazione").value),
    quantita: Math.round(clampMin(toNumber(getEl("manualQuantita").value), 1)),
    venduto: toNumber(getEl("manualVenduto").value),
  };

  if (!autoFillServices) {
    newItem.costoTrasporto = 0;
    newItem.costoInstallazione = 0;
  }

  quoteItems.push(newItem);

  annullaArticoloManuale();
  renderItemsTable();
  updateTotals();
  updateRentalBox();
}

function annullaArticoloManuale() {
  var row = getEl("manual-input-row");
  if (row && row.parentNode) row.parentNode.removeChild(row);
}
// ===============================
// REPORT WhatsApp / TXT (leggibile)
// ===============================
function formatNumberIT(value) {
  value = typeof value === "number" ? value : toNumber(value);
  try { return value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch (e) { return value.toFixed(2).replace(".", ","); }
}

function moneyIT(v) { return formatNumberIT(toNumber(v)) + " €"; }

function waLine() { return "────────────────────"; }

function waHeader(title) { return "📄 *" + title + "*\n_(prezzi IVA esclusa)_\n\n"; }

function getShowServiziReport() {
  return !!(getEl("toggleMostraServizi") && getEl("toggleMostraServizi").checked);
}

function shareWhatsApp(text) {
  var appUrl = "whatsapp://send?text=" + encodeURIComponent(text);
  var webUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(text);
  setTimeout(function () { window.open(webUrl, "_blank"); }, 800);
  window.location = appUrl;
}

function openText(content) {
  var w = window.open("", "_blank");
  if (!w) { alert("Popup bloccato: abilita l'apertura finestre o usa Safari."); return; }
  w.document.open();
  w.document.write(
    "<!doctype html><html><head><meta charset='utf-8'><title>TXT</title></head>" +
    "<body style='font-family:monospace;white-space:pre-wrap;padding:12px;'>" +
    escapeHtml(content) +
    "</body></html>"
  );
  w.document.close();
}

// -------------------------------
// Riga RIV (con margine)
// -------------------------------
function waItemRiv(item, idx, showServ) {
  var codice = (item.codice || "").trim();
  var descr = (item.descrizione || "").trim();

  var qty = Math.round(clampMin(toNumber(item.quantita), 1));
  var lordo = toNumber(item.prezzoLordo);
  var s1 = toNumber(item.sconto);
  var s2 = toNumber(item.sconto2);

  var netto = calcNetto(item);
  var ship = toNumber(item.costoTrasporto);
  var inst = toNumber(item.costoInstallazione);
  var servicesUnit = ship + inst;

  var mEff = getEffectiveRowMargin(item);
  var unitWithMargin = calcPriceWithMargin(netto, mEff);
  var totRow = round2((unitWithMargin + servicesUnit) * qty);

  var out = "";
  out += waLine() + "\n";
  out += "🧾 *" + escapeHtml(descr || ("Articolo " + (idx + 1))) + "*\n";
  out += "Codice: " + escapeHtml(codice || "—") + "\n\n";
  out += "• Lordo: " + moneyIT(lordo) + "\n";
  out += "• Sconti: S1 " + formatNumberIT(s1) + "% – S2 " + formatNumberIT(s2) + "%\n";
  out += "• Netto (bene): " + moneyIT(netto) + "\n";
  out += "• Quantità: " + qty + "\n";
  out += "• Margine%: " + formatNumberIT(mEff) + "%\n";

  if (showServ) {
    out += "\n🚚 Trasporto: " + moneyIT(ship) + "\n";
    out += "🛠 Installazione: " + moneyIT(inst) + "\n";
  } else {
    out += "\n_(Totale riga include eventuali servizi)_\n";
  }

  out += "\n💰 *Totale riga*: " + moneyIT(totRow) + "\n";
  out += waLine() + "\n";

  return { text: out, rowTotal: totRow };
}

// -------------------------------
// Riga CLIENTE (chiavi in mano)
// -------------------------------
function waItemCli(item, idx) {
  var codice = (item.codice || "").trim();
  var descr = (item.descrizione || "").trim();

  var qty = Math.round(clampMin(toNumber(item.quantita), 1));
  var netto = calcNetto(item);

  var ship = toNumber(item.costoTrasporto);
  var inst = toNumber(item.costoInstallazione);
  var servicesUnit = ship + inst;

  var mEff = getEffectiveRowMargin(item);
  var unitWithMargin = calcPriceWithMargin(netto, mEff);
  var unitFinal = round2(unitWithMargin + servicesUnit);
  var totRow = round2(unitFinal * qty);

  var out = "";
  out += waLine() + "\n";
  out += "🧾 *" + escapeHtml(descr || ("Articolo " + (idx + 1))) + "*\n";
  out += "Codice: " + escapeHtml(codice || "—") + "\n\n";
  out += "• Quantità: " + qty + "\n";
  out += "• Netto (bene): " + moneyIT(netto) + "\n";
  out += "• Fornitura *chiavi in mano*\n";
  out += "  (prodotto + trasporto + installazione)\n";
  out += "• Prezzo unitario finale: " + moneyIT(unitFinal) + "\n";
  out += "\n💰 *Totale riga*: " + moneyIT(totRow) + "\n";
  out += waLine() + "\n";

  return { text: out, rowTotal: totRow };
}

// -------------------------------
// Riga NETTO (senza margine reale)
// totale = (netto + servizi) * qty
// -------------------------------
function waItemNoMargin(item, idx, showServ) {
  var codice = (item.codice || "").trim();
  var descr = (item.descrizione || "").trim();

  var qty = Math.round(clampMin(toNumber(item.quantita), 1));
  var lordo = toNumber(item.prezzoLordo);
  var s1 = toNumber(item.sconto);
  var s2 = toNumber(item.sconto2);
  var netto = calcNetto(item);

  var ship = toNumber(item.costoTrasporto);
  var inst = toNumber(item.costoInstallazione);
  var servicesUnit = ship + inst;

  var unit = round2(netto + servicesUnit);
  var totRow = round2(unit * qty);

  var out = "";
  out += waLine() + "\n";
  out += "🧾 *" + escapeHtml(descr || ("Articolo " + (idx + 1))) + "*\n";
  out += "Codice: " + escapeHtml(codice || "—") + "\n\n";
  out += "• Lordo: " + moneyIT(lordo) + "\n";
  out += "• Sconti: S1 " + formatNumberIT(s1) + "% – S2 " + formatNumberIT(s2) + "%\n";
  out += "• Netto (bene): " + moneyIT(netto) + "\n";
  out += "• Quantità: " + qty + "\n";

  if (showServ) {
    out += "\n🚚 Trasporto: " + moneyIT(ship) + "\n";
    out += "🛠 Installazione: " + moneyIT(inst) + "\n";
  }

  out += "\n💰 *Totale riga*: " + moneyIT(totRow) + "\n";
  out += waLine() + "\n";

  return { text: out, rowTotal: totRow };
}

// -------------------------------
// Generatore report
// variant: "riv" | "cli" | "no_margin"
// -------------------------------
function generateWhatsAppReport(variant) {
  variant = (variant === "cli" || variant === "no_margin") ? variant : "riv";

  if (!quoteItems || !quoteItems.length) {
    alert("Aggiungi almeno un articolo prima di generare il report.");
    return "";
  }

  var showServ = getShowServiziReport();

  var title =
    (variant === "cli") ? "PREVENTIVO – CLIENTE FINALE" :
    (variant === "no_margin") ? "REPORT – NETTO (SENZA MARGINE)" :
    "REPORT ARTICOLI – RIVENDITORE";

  var text = waHeader(title);

  var tot = 0;
  for (var i = 0; i < quoteItems.length; i++) {
    var it = quoteItems[i];

    var pack =
      (variant === "cli") ? waItemCli(it, i) :
      (variant === "no_margin") ? waItemNoMargin(it, i, showServ) :
      waItemRiv(it, i, showServ);

    text += pack.text + "\n";
    tot += pack.rowTotal;
  }

  tot = round2(tot);
  text += "🔢 *TOTALE*\n";
  text += "➡️ *" + moneyIT(tot) + "*\n";
  text += "_(IVA esclusa)_\n";

  return text;
}

// Wrapper moderni
function sendWhatsAppReport() { shareWhatsApp(generateWhatsAppReport("riv")); }
function sendWhatsAppReportCliente() { shareWhatsApp(generateWhatsAppReport("cli")); }
function sendWhatsAppReportNoMargin() { shareWhatsApp(generateWhatsAppReport("no_margin")); }

function exportTxtReport() { openText(generateWhatsAppReport("riv")); }
function exportTxtReportNoMargin() { openText(generateWhatsAppReport("no_margin")); }

// Wrapper compatibili vecchi nomi
function inviaReportWhatsApp(){ sendWhatsAppReport(); }
function generaTXTReport(){ exportTxtReport(); }
function inviaReportWhatsAppSenzaMargine(){ sendWhatsAppReportNoMargin(); }
function generaTXTReportSenzaMargine(){ exportTxtReportNoMargin(); }
// ===============================
// Preventivi stampabili (Riv / Cliente)
// ===============================
function apriPreventivo(variant) { openPrintableQuote(variant); }

function openPrintableQuote(variant) {
  var showVat = getEl("preventivoMostraIVA") && getEl("preventivoMostraIVA").checked;
  var showUnit = getEl("preventivoPrezziUnitari") && getEl("preventivoPrezziUnitari").checked;
  var vatPerc = getEl("ivaPerc") ? toNumber(getEl("ivaPerc").value) : 0;

  var title = variant === "cli" ? "Preventivo Cliente Finale" : "Preventivo Rivenditore";
  var ana = getAnagraficaForVariant(variant);

  var showServicesInPrint = variant === "riv" && (getEl("toggleMostraServizi") && getEl("toggleMostraServizi").checked);

  var rowsHtml = "";
  var tot = 0;

  for (var i = 0; i < quoteItems.length; i++) {
    var it = quoteItems[i];
    var qty = Math.round(clampMin(toNumber(it.quantita), 1));

    var gross = toNumber(it.prezzoLordo);
    var netGood = calcNetto(it);

    var ship = toNumber(it.costoTrasporto);
    var inst = toNumber(it.costoInstallazione);
    var servicesUnit = ship + inst;

    var priceUnitBase =
      (variant === "cli")
        ? calcPriceWithMargin(netGood, getEffectiveRowMargin(it))
        : calcPriceWithMargin(netGood, getMargineRiv(it));

    var netShownUnit = (variant === "cli") ? round2(priceUnitBase + servicesUnit) : round2(netGood);

    var rowTotal = (variant === "cli")
      ? round2(netShownUnit * qty)
      : round2((priceUnitBase + servicesUnit) * qty);

    tot += rowTotal;

    rowsHtml += "<tr>";
    rowsHtml += "<td>" + escapeHtml(it.codice || "") + "</td>";
    rowsHtml += "<td style='text-align:left'>" + escapeHtml(it.descrizione || "") + "</td>";
    rowsHtml += "<td>" + qty + "</td>";
    rowsHtml += "<td>" + gross.toFixed(2) + "€</td>";
    rowsHtml += "<td>" + netShownUnit.toFixed(2) + "€</td>";
    if (showUnit) rowsHtml += "<td>" + netShownUnit.toFixed(2) + "€</td>";
    if (showServicesInPrint) rowsHtml += "<td>" + servicesUnit.toFixed(2) + "€</td>";
    rowsHtml += "<td><b>" + rowTotal.toFixed(2) + "€</b></td>";
    rowsHtml += "</tr>";
  }

  tot = round2(tot);
  var taxable = tot;
  var vat = showVat ? round2(taxable * (vatPerc / 100)) : 0;
  var totalWithVat = showVat ? round2(taxable + vat) : taxable;

  var html = "";
  html += "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>" + escapeHtml(title) + "</title>";
  html += "<style>";
  html += "body{font-family:Arial;margin:18px;color:#111}";
  html += "h1{margin:0 0 6px 0;font-size:20px}";
  html += ".sub{color:#444;margin-bottom:10px}";
  html += ".box{border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#fafafa;margin:10px 0}";
  html += "table{width:100%;border-collapse:collapse;margin-top:10px}";
  html += "th,td{border:1px solid #ddd;padding:8px;text-align:center;font-size:12px}";
  html += "th{background:#f3f5f7}";
  html += ".tot{margin-top:12px;font-size:14px;line-height:1.6}";
  html += ".btn{margin-top:14px;display:inline-block;padding:10px 12px;border:1px solid #ccc;background:#f8f8f8;cursor:pointer}";
  html += "@media print{.btn{display:none}}";
  html += "</style></head><body>";

  html += "<h1>" + escapeHtml(title) + "</h1>";
  html += "<div class='sub'>Generato da CSVXpressGold — " + new Date().toLocaleString() + "</div>";
  html += "<div class='sub'><b>Nota:</b> prezzi IVA esclusa</div>";

  var hasAny = (ana.azienda || ana.referente || ana.indirizzo || ana.email || ana.cell || ana.piva || ana.cf || ana.note);
  if (hasAny) {
    html += "<div class='box'>";
    html += "<div style='font-weight:700;margin-bottom:6px'>Anagrafica</div>";
    if (ana.azienda) html += "<div><b>Azienda:</b> " + escapeHtml(ana.azienda) + "</div>";
    if (ana.referente) html += "<div><b>Referente:</b> " + escapeHtml(ana.referente) + "</div>";
    if (ana.indirizzo) html += "<div><b>Indirizzo:</b> " + escapeHtml(ana.indirizzo) + "</div>";
    if (ana.email) html += "<div><b>Email:</b> " + escapeHtml(ana.email) + "</div>";
    if (ana.cell) html += "<div><b>Cellulare:</b> " + escapeHtml(ana.cell) + "</div>";
    if (ana.piva) html += "<div><b>P.IVA:</b> " + escapeHtml(ana.piva) + "</div>";
    if (ana.cf) html += "<div><b>C.F.:</b> " + escapeHtml(ana.cf) + "</div>";
    if (ana.note) html += "<div><b>Note:</b> " + escapeHtml(ana.note) + "</div>";
    html += "</div>";
  }

  html += "<table><thead><tr>";
  html += "<th>Codice</th><th style='text-align:left'>Descrizione</th><th>Q.tà</th>";
  html += "<th>Lordo</th><th>" + (variant === "cli" ? "Netto cliente" : "Netto") + "</th>";
  if (showUnit) html += "<th>Prezzo Unit.</th>";
  if (showServicesInPrint) html += "<th>Servizi</th>";
  html += "<th>Totale Riga</th>";
  html += "</tr></thead><tbody>" + rowsHtml + "</tbody></table>";

  html += "<div class='tot'>";
  html += "<div><b>Imponibile:</b> " + taxable.toFixed(2) + "€</div>";
  if (showVat) html += "<div><b>IVA (" + vatPerc.toFixed(2) + "%):</b> " + vat.toFixed(2) + "€</div>";
  html += "<div style='font-size:18px;margin-top:6px'><b>TOTALE:</b> " + totalWithVat.toFixed(2) + "€</div>";
  html += "</div>";

  html += "<button class='btn' onclick='window.print()'>Stampa / Salva PDF</button>";
  html += "</body></html>";

  var w = window.open("", "_blank");
  if (!w) { alert("Popup bloccato: abilita l'apertura finestre o usa Safari."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ===============================
// NOLEGGIO — no canoni doppi
// ===============================
function getNoleggioConfig() {
  var ridEl = getEl("noleggioRidMensile");
  var incEl = getEl("noleggioIncludiRID");
  var gmEl = getEl("noleggioGiorniMese");
  var ogEl = getEl("noleggioOreGiorno");

  var ridMensile = ridEl ? toNumber(ridEl.value) : 4;
  if (ridMensile < 0) ridMensile = 0;

  var includiRID = incEl ? !!incEl.checked : true;

  var giorniMese = gmEl ? Math.round(toNumber(gmEl.value)) : 22;
  if (giorniMese < 1) giorniMese = 1;

  var oreGiorno = ogEl ? toNumber(ogEl.value) : 8;
  if (oreGiorno < 0.25) oreGiorno = 0.25;

  return { ridMensile: round2(ridMensile), includiRID: includiRID, giorniMese: giorniMese, oreGiorno: oreGiorno };
}

function calcolaSpeseContratto(importo) {
  if (importo < 5001) return 75;
  if (importo < 10001) return 100;
  if (importo < 25001) return 150;
  if (importo < 50001) return 225;
  return 300;
}

function calcolaCanoniPerDurate(importo) {
  var coefficienti = {
    5000:  { 12: 0.081123, 18: 0.058239, 24: 0.045554, 36: 0.032359, 48: 0.025445, 60: 0.021358 },
    15000: { 12: 0.081433, 18: 0.058341, 24: 0.045535, 36: 0.032207, 48: 0.025213, 60: 0.021074 },
    25000: { 12: 0.081280, 18: 0.058195, 24: 0.045392, 36: 0.032065, 48: 0.025068, 60: 0.020926 },
    50000: { 12: 0.080770, 18: 0.057710, 24: 0.044915, 36: 0.031592, 48: 0.024588, 60: 0.020437 },
    100000:{ 12: 0.080744, 18: 0.057686, 24: 0.044891, 36: 0.031568, 48: 0.024564, 60: 0.020413 }
  };

  var keys = [5000, 15000, 25000, 50000, 100000];
  var fascia = 100000;
  for (var i = 0; i < keys.length; i++) { if (importo <= keys[i]) { fascia = keys[i]; break; } }

  var res = {};
  var mesiList = [12, 18, 24, 36, 48, 60];
  for (var j = 0; j < mesiList.length; j++) res[mesiList[j]] = importo * coefficienti[fascia][mesiList[j]];
  return res;
}

function calcolaNoleggio(importoImponibile, durataMesi, cfg) {
  cfg = cfg || getNoleggioConfig();
  var importo = toNumber(importoImponibile);
  durataMesi = parseInt(durataMesi, 10) || 24;

  if (!importo || importo <= 0) return { rataMostrata: 0, spese: 0, giorno: 0, ora: 0, canoni: null };

  var canoni = calcolaCanoniPerDurate(importo);
  var rataBase = toNumber(canoni[durataMesi] || 0);
  var spese = calcolaSpeseContratto(importo);

  var rataMostrata = cfg.includiRID ? (rataBase + cfg.ridMensile) : rataBase;
  var giorno = rataMostrata / cfg.giorniMese;
  var ora = giorno / cfg.oreGiorno;

  return { rataMostrata: rataMostrata, spese: spese, giorno: giorno, ora: ora, canoni: canoni };
}

function getTaxableTotalFromItems() {
  var tot = 0;
  for (var i = 0; i < quoteItems.length; i++) {
    var it = quoteItems[i];
    var qty = Math.round(clampMin(toNumber(it.quantita), 1));
    var netto = calcNetto(it);
    var mEff = getEffectiveRowMargin(it);
    var unitWithMargin = calcPriceWithMargin(netto, mEff);
    var services = toNumber(it.costoTrasporto) + toNumber(it.costoInstallazione);
    tot += round2((unitWithMargin + services) * qty);
  }
  return round2(tot);
}

function updateRentalBox() {
  var dur = getEl("noleggioDurata");
  if (!dur) return;

  var taxable = getTaxableTotalFromItems();
  var cfg = getNoleggioConfig();
  var out = calcolaNoleggio(taxable, dur.value, cfg);

  var elR = getEl("noleggioRata");
  var elS = getEl("noleggioSpese");
  var elDH = getEl("noleggioDayHour");

  if (!taxable || taxable <= 0) {
    if (elR) elR.textContent = "—";
    if (elS) elS.textContent = "—";
    if (elDH) elDH.textContent = "—";
    renderCanoniTableIfAny(null, cfg);
    return;
  }

  if (elR) elR.textContent = formatNumberIT(out.rataMostrata) + " € / mese" + (cfg.includiRID ? " (incl. RID)" : "");
  if (elS) elS.textContent = formatNumberIT(out.spese) + " €";

  var showDett = getEl("noleggioMostraDettagli") && getEl("noleggioMostraDettagli").checked;
  if (elDH) elDH.textContent = showDett ? (formatNumberIT(out.giorno) + " €/giorno — " + formatNumberIT(out.ora) + " €/ora") : "—";

  renderCanoniTableIfAny(out, cfg);
}

function renderCanoniTableIfAny(out, cfg) {
  var wrap = getEl("noleggioCanoniWrap");
  var table = getEl("noleggioCanoniTable");
  var chk = getEl("noleggioMostraTabellaCanoni");
  if (!table) return;

  var tbody = table.querySelector("tbody");
  if (!tbody) return;

  var mustShow = chk ? !!chk.checked : false;
  tbody.innerHTML = "";

  if (!mustShow || !out || !out.canoni) {
    if (wrap) wrap.style.display = "none";
    return;
  }

  if (wrap) wrap.style.display = "block";

  var mesiList = [12, 18, 24, 36, 48, 60];
  for (var i = 0; i < mesiList.length; i++) {
    var m = mesiList[i];
    var base = toNumber(out.canoni[m] || 0);
    var shown = cfg.includiRID ? (base + toNumber(cfg.ridMensile)) : base;

    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td style='text-align:center'>" + m + "</td>" +
      "<td style='text-align:right'>" + formatNumberIT(base) + " €</td>" +
      "<td style='text-align:right'>" + formatNumberIT(shown) + " €</td>";

    tbody.appendChild(tr);
  }
}

function scaricaNoleggioTXT() { downloadRentalTXT(); }

function downloadRentalTXT() {
  var taxable = getTaxableTotalFromItems();
  if (!taxable || taxable <= 0) {
    alert("Aggiungi almeno un articolo prima di generare il TXT noleggio.");
    return;
  }

  var durEl = getEl("noleggioDurata");
  var durSel = durEl ? parseInt(durEl.value, 10) : 24;
  if (!durSel || durSel <= 0) durSel = 24;

  var cfg = getNoleggioConfig();
  var out = calcolaNoleggio(taxable, durSel, cfg);
  var canoni = calcolaCanoniPerDurate(taxable);
  var speseContratto = calcolaSpeseContratto(taxable);

  var showDett = getEl("noleggioMostraDettagli") && getEl("noleggioMostraDettagli").checked;
  var showTable = getEl("noleggioMostraTabellaCanoni") && getEl("noleggioMostraTabellaCanoni").checked;

  var testo = "";
  testo += "PREVENTIVO DI NOLEGGIO OPERATIVO BCC (simulazione)\n";
  testo += "-----------------------------------------------\n";
  testo += "(prezzi IVA esclusa)\n\n";
  testo += "Importo (imponibile): " + formatNumberIT(taxable) + " €\n";
  testo += "Durata selezionata: " + durSel + " mesi\n\n";
  testo += "RID mensile: " + formatNumberIT(cfg.ridMensile) + " € / mese\n";
  testo += "RID incluso nella rata mostrata: " + (cfg.includiRID ? "SI" : "NO") + "\n";
  testo += "Parametri: " + cfg.giorniMese + " gg/mese — " + cfg.oreGiorno + " ore/giorno\n\n";
  testo += "RATA MENSILE: " + formatNumberIT(out.rataMostrata) + " €" + (cfg.includiRID ? " (all-in)\n" : " (base)\n");
  testo += "Spese di contratto: " + formatNumberIT(speseContratto) + " €\n\n";

  if (showDett) {
    testo += "Costo giornaliero: " + formatNumberIT(out.giorno) + " €\n";
    testo += "Costo orario: " + formatNumberIT(out.ora) + " €\n\n";
  }

  if (showTable) {
    testo += "CANONI MENSILI DISPONIBILI " + (cfg.includiRID ? "(all-in):\n" : "(base):\n");
    var mesiList = [12, 18, 24, 36, 48, 60];
    for (var i = 0; i < mesiList.length; i++) {
      var m = mesiList[i];
      var base = toNumber(canoni[m] || 0);
      var shown = cfg.includiRID ? (base + toNumber(cfg.ridMensile)) : base;
      testo += m + " mesi: " + formatNumberIT(shown) + " €\n";
    }
    testo += "\n";
  }

  try {
    var blob = new Blob([testo], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "preventivo_noleggio_" + Math.round(taxable) + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    openText(testo);
  }
}
