// ===============================
// CSVXpressGold — app.js (FULL) — vNext
// Fix: cambio "Margine Cliente Finale % (default)" aggiorna subito le righe con margine=0
// Tabella: servizi VISIBILI e modificabili
// Preventivo Cliente: servizi INCLUSI ma NON mostrati
// Preventivo Riv: servizi opzionali (toggleMostraServizi)
// ===============================

// -------------------------------
// Service Worker
// -------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./service-worker.js")
    .then(function (reg) {
      console.log("Service Worker registrato", reg);
    })
    .catch(function (err) {
      console.error("Service Worker non registrato", err);
    });
}

// -------------------------------
// Stato (nomi leggibili)
// -------------------------------
var priceList = [];          // ex: listino
var quoteItems = [];         // ex: articoliAggiunti
var autoFillServices = true; // ex: autoPopolaCosti

// Alias retro-compatibilità (se qualche altro file usa i vecchi nomi)
var listino = priceList;
var articoliAggiunti = quoteItems;
var autoPopolaCosti = autoFillServices;

// -------------------------------
// Utils
// -------------------------------
function round2(num) {
  return Math.round(num * 100) / 100;
}

function toNumber(v) {
  v = parseFloat(String(v == null ? "" : v).replace(",", "."));
  return isNaN(v) ? 0 : v;
}

function clampMin(v, min) {
  return v < min ? min : v;
}

function resetArray(arr) {
  arr.length = 0;
}

// -------------------------------
// DOM helpers
// -------------------------------
function getEl(id) {
  return document.getElementById(id);
}

function el(tag) {
  return document.createElement(tag);
}

function escapeHtml(s) {
  s = s == null ? "" : String(s);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function debounce(fn, ms) {
  var t = null;
  return function () {
    clearTimeout(t);
    var args = arguments;
    t = setTimeout(function () {
      fn.apply(null, args);
    }, ms);
  };
}

// -------------------------------
// ANAGRAFICA (opzionale)
// -------------------------------
var ANAG_KEY = "csvxpressgold_anagrafica_v2";

function hasAnagraficaUI() {
  return !!getEl("anagraficaAzienda");
}

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
    node.value = clear ? "" : v || "";
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
  try {
    localStorage.setItem(ANAG_KEY, JSON.stringify(getAnagraficaFromUI()));
  } catch (e) {}
}

function loadAnagrafica(clear) {
  if (!hasAnagraficaUI()) return;
  try {
    if (clear) {
      setAnagraficaToUI(null, true);
      return;
    }
    var raw = localStorage.getItem(ANAG_KEY);
    if (!raw) return;
    setAnagraficaToUI(JSON.parse(raw), false);
  } catch (e) {}
}

function bindAnagraficaAutosave() {
  if (!hasAnagraficaUI()) return;

  loadAnagrafica(false);

  var ids = [
    "anagraficaTipo",
    "anagraficaAzienda",
    "anagraficaReferente",
    "anagraficaEmail",
    "anagraficaCell",
    "anagraficaIndirizzo",
    "anagraficaPiva",
    "anagraficaCf",
    "anagraficaNote",
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
  a._label = a.tipo === "cliente" ? "Cliente finale" : "Rivenditore";
  a._variant = variant;
  return a;
}
// ===============================
// Bootstrap
// ===============================
document.addEventListener("DOMContentLoaded", function () {
  // badge versione
  try {
    var VER = document.documentElement.getAttribute("data-ver") || "dev";
    var badge = getEl("verBadge");
    if (badge) badge.textContent = "ver " + VER;
  } catch (e) {}

  bindAnagraficaAutosave();

  var csvInput = getEl("csvFileInput");
  if (csvInput) csvInput.addEventListener("change", handleCSVUpload, false);

  var search = getEl("searchListino");
  if (search) search.addEventListener("input", refreshPriceListSelect, false);

  var btnAdd = getEl("btnAddFromListino");
  if (btnAdd) btnAdd.addEventListener("click", addItemFromPriceList, false);

  var btnManual = getEl("btnManual");
  if (btnManual) btnManual.addEventListener("click", showManualItemRow, false);

  // Toggle auto servizi
  var toggleCosti = getEl("toggleCosti");
  if (toggleCosti) {
    autoFillServices = !!toggleCosti.checked;
    autoPopolaCosti = autoFillServices;

    toggleCosti.addEventListener(
      "change",
      function () {
        autoFillServices = !!toggleCosti.checked;
        autoPopolaCosti = autoFillServices;

        // OFF: azzera servizi su tutte le righe
        // ON : ripristina servizi dal listino (se trovati)
        for (var i = 0; i < quoteItems.length; i++) {
          var item = quoteItems[i];
          if (!autoFillServices) {
            item.costoTrasporto = 0;
            item.costoInstallazione = 0;
          } else {
            var base = findInPriceList(item.codice);
            if (base) {
              item.costoTrasporto = toNumber(base.costoTrasporto);
              item.costoInstallazione = toNumber(base.costoInstallazione);
            }
          }
        }

        renderItemsTable();
        updateTotals();
        updateRentalBox();
      },
      false
    );
  }

  // Report
  var btnWA = getEl("btnWA");
  if (btnWA) btnWA.addEventListener("click", sendWhatsAppReport, false);

  var btnTXT = getEl("btnTXT");
  if (btnTXT) btnTXT.addEventListener("click", exportTxtReport, false);

  var btnWAnm = getEl("btnWASenzaMargine");
  if (btnWAnm) btnWAnm.addEventListener("click", sendWhatsAppReportNoMargin, false);

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

    // ✅ Noleggio avanzato (se presenti i campi in HTML)
  var elGm = getEl("noleggioGiorniMese");
  if (elGm) elGm.addEventListener("input", updateRentalBox, false);

  var elOg = getEl("noleggioOreGiorno");
  if (elOg) elOg.addEventListener("input", updateRentalBox, false);

  var elRid = getEl("noleggioRidMensile");
  if (elRid) elRid.addEventListener("input", updateRentalBox, false);

  var elIncRid = getEl("noleggioIncludiRID");
  if (elIncRid) elIncRid.addEventListener("change", updateRentalBox, false);

  var elTab = getEl("noleggioMostraTabellaCanoni");
  if (elTab) elTab.addEventListener("change", updateRentalBox, false);

  // ✅ Fix: se cambio default cliente (es. 25), le righe con margine=0 si aggiornano subito
  var defaultCustomerMarginInput = getEl("margineCliDefault");
  if (defaultCustomerMarginInput) {
    defaultCustomerMarginInput.addEventListener(
      "input",
      function () {
        renderItemsTable();
        updateTotals();
        updateRentalBox();
      },
      false
    );
  }

  // (se ti serve ancora per altri punti)
  var defaultResellerMarginInput = getEl("margineRivDefault");
  if (defaultResellerMarginInput) {
    defaultResellerMarginInput.addEventListener("input", updateRentalBox, false);
  }

  var radios = document.getElementsByName("scontoClienteMode");
  for (var r = 0; r < radios.length; r++) {
    radios[r].addEventListener("change", updateRentalBox, false);
  }

  renderItemsTable();
  updateTotals();
  updateRentalBox();
});

// ===============================
// Modalità Sconto Cliente Finale
// ===============================
function getCustomerDiscountMode() {
  var nodes = document.getElementsByName("scontoClienteMode");
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].checked) return nodes[i].value;
  }
  return "bene";
}

// calcola sconto% inverso
function calcCustomerDiscountPercent(prezzoLordo, prezzoClienteUnit, serviziUnit) {
  var mode = getCustomerDiscountMode();
  prezzoLordo = toNumber(prezzoLordo);
  prezzoClienteUnit = toNumber(prezzoClienteUnit);
  serviziUnit = toNumber(serviziUnit);

  var base = prezzoLordo;
  var fin = prezzoClienteUnit;

  if (mode === "totale") {
    base = prezzoLordo + serviziUnit;
    fin = prezzoClienteUnit + serviziUnit;
  }

  if (!base || base <= 0) return 0;

  var s = (1 - fin / base) * 100;
  if (s < 0) s = 0;
  if (s > 99.99) s = 99.99;
  return round2(s);
}

// ===============================
// CSV upload
// ===============================
function handleCSVUpload(event) {
  var file = event.target.files[0];
  if (!file) return;

  if (window.track && window.track.csv_upload_start) window.track.csv_upload_start({ method: "file_input" });
  if (window.track && window.track.csv_upload_ok) window.track.csv_upload_ok({ method: "file_input", file: file });

  var t0 = (window.performance && performance.now) ? performance.now() : Date.now();

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      var ms = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - t0);

      if (!results.data || !results.data.length) {
        var errEl = getEl("csvError");
        if (errEl) errEl.style.display = "block";
        if (window.track && window.track.csv_parse_error) window.track.csv_parse_error({ code: "empty_or_no_rows", ms: ms });
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

      // aggiorna alias
      listino = priceList;

      var rows = priceList.length;
      var cols = (results.meta && results.meta.fields && results.meta.fields.length) ? results.meta.fields.length : undefined;
      if (window.track && window.track.csv_parse_ok) window.track.csv_parse_ok({ rows: rows, cols: cols, ms: ms });

      var errEl2 = getEl("csvError");
      if (errEl2) errEl2.style.display = "none";

      refreshPriceListSelect();
    },
    error: function (err) {
      var ms2 = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - t0);
      console.error("Errore CSV:", err);
      var errEl3 = getEl("csvError");
      if (errEl3) errEl3.style.display = "block";
      if (window.track && window.track.csv_parse_error) window.track.csv_parse_error({ code: "papaparse_error", ms: ms2 });
    },
  });
}

// ===============================
// Listino UI
// ===============================
function refreshPriceListSelect() {
  var select = getEl("listinoSelect");
  if (!select) return;

  var searchTerm = ((getEl("searchListino") && getEl("searchListino").value) || "").toLowerCase();
  select.innerHTML = "";

  for (var i = 0; i < priceList.length; i++) {
    var item = priceList[i];
    var hit =
      (item.codice || "").toLowerCase().indexOf(searchTerm) > -1 ||
      (item.descrizione || "").toLowerCase().indexOf(searchTerm) > -1;

    if (hit) {
      var option = el("option");
      option.value = item.codice;
      option.textContent = item.codice + " - " + item.descrizione + " - €" + toNumber(item.prezzoLordo).toFixed(2);
      select.appendChild(option);
    }
  }
}

function findInPriceList(codice) {
  for (var i = 0; i < priceList.length; i++) {
    if (priceList[i].codice === codice) return priceList[i];
  }
  return null;
}

function addItemFromPriceList() {
  if (window.track && window.track.add_item_listino) window.track.add_item_listino();

  var select = getEl("listinoSelect");
  if (!select || !select.value) return;

  var baseItem = findInPriceList(select.value);
  if (!baseItem) {
    alert("Errore: articolo non trovato nel listino.");
    return;
  }

  // clone
  var newItem = {};
  for (var k in baseItem) if (baseItem.hasOwnProperty(k)) newItem[k] = baseItem[k];

  if (!autoFillServices) {
    newItem.costoTrasporto = 0;
    newItem.costoInstallazione = 0;
  }

  quoteItems.push(newItem);

  // aggiorna alias
  articoliAggiunti = quoteItems;

  renderItemsTable();
  updateTotals();
  updateRentalBox();
}
// ===============================
// Calcoli (Margine)
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

// margine effettivo riga: se >0 usa quello, altrimenti usa default cliente
function getEffectiveRowMargin(item) {
  var m = toNumber(item.margine);
  return m > 0 ? m : getDefaultCustomerMargin();
}

// Mantengo nome storico (se richiamato altrove)
// Ora: riv usa margine riga (se >0) altrimenti default cliente
function getMargineRiv(item) {
  return getEffectiveRowMargin(item);
}
function getMargineCli() {
  return getDefaultCustomerMargin();
}

// ===============================
// Tabella articoli
// ===============================
function tdInputNumber(index, field, value, opts) {
  opts = opts || {};
  var v = typeof value === "number" ? value : toNumber(value);

  var minAttr = opts.min != null ? " min='" + String(opts.min) + "'" : "";
  var stepAttr = opts.step != null ? " step='" + String(opts.step) + "'" : " step='0.01'";

  return (
    "<td><input type='number' value='" +
    v +
    "' data-index='" +
    index +
    "' data-field='" +
    field +
    "'" +
    minAttr +
    stepAttr +
    " oninput='aggiornaCampo(event)'></td>"
  );
}

// FUNZIONE STORICA: non rinomino perché è richiamata inline dall'HTML
function aggiornaTabellaArticoli() {
  renderItemsTable();
}

function renderItemsTable() {
  var tbody = document.querySelector("#articoli-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (var i = 0; i < quoteItems.length; i++) {
    var item = quoteItems[i];

    var netto = calcNetto(item);

    var qty = clampMin(toNumber(item.quantita), 1);
    qty = Math.round(qty);

    // servizi unitari (visibili)
    var shipping = toNumber(item.costoTrasporto);
    var install = toNumber(item.costoInstallazione);
    var servicesUnit = shipping + install;

    // ✅ prezzo riv con margine effettivo (default dinamico se margine=0)
    var marginEff = getEffectiveRowMargin(item);
    var priceWithMargin = calcPriceWithMargin(netto, marginEff);

    var totalRowRiv = round2((priceWithMargin + servicesUnit) * qty);

    var sold = toNumber(item.venduto);
    var diff = round2(sold - totalRowRiv);

    // ✅ valore mostrato nella cella margine:
    // se margine riga=0 -> mostra il default corrente (es. 25)
    var marginDisplayed = marginEff;

    var tr = el("tr");
    tr.innerHTML =
      "<td>" + escapeHtml(item.codice) + "</td>" +
      "<td>" + escapeHtml(item.descrizione) + "</td>" +
      "<td>" + toNumber(item.prezzoLordo).toFixed(2) + "€</td>" +
      tdInputNumber(i, "sconto", toNumber(item.sconto), { min: 0, step: 0.01 }) +
      tdInputNumber(i, "sconto2", toNumber(item.sconto2), { min: 0, step: 0.01 }) +
      tdInputNumber(i, "margine", marginDisplayed, { min: 0, step: 0.01 }) +
      "<td>" + netto.toFixed(2) + "€</td>" +
      tdInputNumber(i, "costoTrasporto", shipping, { min: 0, step: 0.01 }) +
      tdInputNumber(i, "costoInstallazione", install, { min: 0, step: 0.01 }) +
      tdInputNumber(i, "quantita", qty, { min: 1, step: 1 }) +
      "<td>" + totalRowRiv.toFixed(2) + "€</td>" +
      tdInputNumber(i, "venduto", sold, { min: 0, step: 0.01 }) +
      "<td>" + diff.toFixed(2) + "€</td>" +
      "<td><button type='button' onclick='rimuoviArticolo(" + i + ")'>Rimuovi</button></td>";

    tbody.appendChild(tr);
  }

  // aggiorna alias
  articoliAggiunti = quoteItems;
}

// FUNZIONE STORICA: chiamata inline dall'HTML
function aggiornaCampo(event) {
  var input = event.target;
  var index = parseInt(input.getAttribute("data-index"), 10);
  var field = input.getAttribute("data-field");
  var val = toNumber(input.value);

  if (!quoteItems[index]) return;

  if (field === "quantita") {
    if (val < 1) val = 1;
    val = Math.round(val);
  } else {
    if (val < 0) val = 0;
  }

  // ✅ LOGICA CHIAVE per il margine:
  // - Se l’utente modifica il campo "margine", salviamo quel valore nella riga.
  // - Se lo mette a 0, torna dinamico (usa default).
  quoteItems[index][field] = val;

  renderItemsTable();
  updateTotals();
  updateRentalBox();
}

// FUNZIONE STORICA: chiamata inline
function rimuoviArticolo(index) {
  if (window.track && window.track.remove_item) window.track.remove_item();
  quoteItems.splice(index, 1);

  renderItemsTable();
  updateTotals();
  updateRentalBox();
}

// ===============================
// Totali
// ===============================
function aggiornaTotaliGenerali() {
  updateTotals();
}

function updateTotals() {
  var totalNet = 0;
  var totalRiv = 0;
  var totalSold = 0;
  var totalDiff = 0;

  for (var i = 0; i < quoteItems.length; i++) {
    var item = quoteItems[i];

    var qty = clampMin(toNumber(item.quantita), 1);
    qty = Math.round(qty);

    var netto = calcNetto(item);
    var marginEff = getEffectiveRowMargin(item);
    var priceWithMargin = calcPriceWithMargin(netto, marginEff);

    var shipping = toNumber(item.costoTrasporto);
    var install = toNumber(item.costoInstallazione);
    var servicesUnit = shipping + install;

    var rowRiv = round2((priceWithMargin + servicesUnit) * qty);

    var sold = toNumber(item.venduto);
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
// Aggiunta manuale
// ===============================
function mostraFormArticoloManuale() {
  showManualItemRow();
}

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
    // ✅ di default il campo margine è 0 (dinamico = usa default cliente)
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

  var ids = ["manualPrezzo", "manualSconto1", "manualSconto2", "manualMargine", "manualTrasporto", "manualInstallazione", "manualQuantita", "manualVenduto"];
  for (var i = 0; i < ids.length; i++) {
    getEl(ids[i]).addEventListener("input", calcolaRigaManuale, false);
  }

  calcolaRigaManuale();
}

function calcolaRigaManuale() {
  var prezzoLordo = toNumber(getEl("manualPrezzo").value);
  var s1 = toNumber(getEl("manualSconto1").value);
  var s2 = toNumber(getEl("manualSconto2").value);

  var m = toNumber(getEl("manualMargine").value);
  var marginEff = m > 0 ? m : getDefaultCustomerMargin();

  var shipping = toNumber(getEl("manualTrasporto").value);
  var install = toNumber(getEl("manualInstallazione").value);

  var qty = clampMin(toNumber(getEl("manualQuantita").value), 1);
  qty = Math.round(qty);

  var sold = toNumber(getEl("manualVenduto").value);

  var netto = round2(prezzoLordo * (1 - s1 / 100) * (1 - s2 / 100));
  var priceWithMargin = calcPriceWithMargin(netto, marginEff);

  var totalRiv = round2((priceWithMargin + shipping + install) * qty);
  var diff = round2(sold - totalRiv);

  getEl("manualNetto").textContent = netto.toFixed(2) + "€";
  getEl("manualTotRiv").textContent = totalRiv.toFixed(2) + "€";
  getEl("manualDiff").textContent = diff.toFixed(2) + "€";
}

// FUNZIONE STORICA
function aggiungiArticoloManuale() {
  if (window.track && window.track.add_item_manual) window.track.add_item_manual();

  var newItem = {
    codice: (getEl("manualCodice").value || "").trim(),
    descrizione: (getEl("manualDescrizione").value || "").trim(),
    prezzoLordo: toNumber(getEl("manualPrezzo").value),
    sconto: toNumber(getEl("manualSconto1").value),
    sconto2: toNumber(getEl("manualSconto2").value),
    margine: toNumber(getEl("manualMargine").value), // 0 = dinamico default
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
// Report TXT / WhatsApp
// ===============================
function generaReportTesto(includeMargine) {
  var showServ = getEl("toggleMostraServizi") && getEl("toggleMostraServizi").checked;

  var report = includeMargine
    ? "Report Articoli (Rivenditore - con Margine)\n\n"
    : "Report Articoli (Netto - senza Margine)\n\n";

  var tot = 0;

  for (var i = 0; i < quoteItems.length; i++) {
    var item = quoteItems[i];
    var qty = clampMin(toNumber(item.quantita), 1);
    qty = Math.round(qty);

    var lordo = toNumber(item.prezzoLordo);
    var s1 = toNumber(item.sconto);
    var s2 = toNumber(item.sconto2);
    var netto = calcNetto(item);

    var shipping = toNumber(item.costoTrasporto);
    var install = toNumber(item.costoInstallazione);
    var servicesUnit = shipping + install;

    var line = 0;

    if (includeMargine) {
      var priceWithMargin = calcPriceWithMargin(netto, getEffectiveRowMargin(item));
      line = (priceWithMargin + servicesUnit) * qty;
    } else {
      line = (netto + servicesUnit) * qty;
    }

    line = round2(line);
    tot += line;

    report += (i + 1) + ". " + (item.codice || "") + " — " + (item.descrizione || "") + "\n";
    report += "Lordo: " + lordo.toFixed(2) + "€ | S1: " + s1.toFixed(2) + "% | S2: " + s2.toFixed(2) + "%\n";
    report += "Netto: " + netto.toFixed(2) + "€ | Q.tà: " + qty + "\n";
    if (includeMargine) report += "Margine%: " + getEffectiveRowMargin(item).toFixed(2) + "\n";
    if (showServ) report += "Trasporto: " + shipping.toFixed(2) + "€ | Installazione: " + install.toFixed(2) + "€\n";
    report += "Totale Riga: " + line.toFixed(2) + "€\n\n";
  }

  report += "TOTALE: " + round2(tot).toFixed(2) + "€\n";
  return report;
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

// nomi nuovi + alias vecchi
function sendWhatsAppReport() {
  if (window.track && window.track.report_whatsapp) window.track.report_whatsapp({ variant: "standard" });
  shareWhatsApp(generaReportTesto(true));
}
function exportTxtReport() {
  if (window.track && window.track.export_txt) window.track.export_txt({ variant: "standard" });
  openText(generaReportTesto(true));
}
function sendWhatsAppReportNoMargin() {
  if (window.track && window.track.report_whatsapp) window.track.report_whatsapp({ variant: "no_margin" });
  shareWhatsApp(generaReportTesto(false));
}
function exportTxtReportNoMargin() {
  if (window.track && window.track.export_txt) window.track.export_txt({ variant: "no_margin" });
  openText(generaReportTesto(false));
}

function inviaReportWhatsApp(){ sendWhatsAppReport(); }
function generaTXTReport(){ exportTxtReport(); }
function inviaReportWhatsAppSenzaMargine(){ sendWhatsAppReportNoMargin(); }
function generaTXTReportSenzaMargine(){ exportTxtReportNoMargin(); }

// ===============================
// Preventivi stampabili (Riv / Cliente Finale)
// ===============================
function apriPreventivo(variant) {
  openPrintableQuote(variant);
}

function openPrintableQuote(variant) {
  if (window.track && window.track.open_preventivo) window.track.open_preventivo({ variant: variant });

  var showVat = getEl("preventivoMostraIVA") && getEl("preventivoMostraIVA").checked;
  var showUnit = getEl("preventivoPrezziUnitari") && getEl("preventivoPrezziUnitari").checked;
  var vatPerc = getEl("ivaPerc") ? toNumber(getEl("ivaPerc").value) : 0;

  var title = variant === "cli" ? "Preventivo Cliente Finale" : "Preventivo Rivenditore";
  var defaultCustomerMargin = getDefaultCustomerMargin();
  var ana = getAnagraficaForVariant(variant);

  // servizi visibili SOLO su riv (opzionale)
  var showServicesInPrint = variant === "riv" && (getEl("toggleMostraServizi") && getEl("toggleMostraServizi").checked);

  var rowsHtml = "";
  var tot = 0;

  for (var i = 0; i < quoteItems.length; i++) {
    var item = quoteItems[i];
    var qty = clampMin(toNumber(item.quantita), 1);
    qty = Math.round(qty);

    var gross = toNumber(item.prezzoLordo);
    var netGood = calcNetto(item);

    var shipping = toNumber(item.costoTrasporto);
    var install = toNumber(item.costoInstallazione);
    var servicesUnit = shipping + install;

    // base unit price (bene + margine)
    var priceUnitBase = 0;
    if (variant === "cli") {
      // cliente: margine effettivo riga (0 => default cliente)
      priceUnitBase = calcPriceWithMargin(netGood, getEffectiveRowMargin(item));
    } else {
      // riv: margine effettivo riga (0 => default cliente)
      priceUnitBase = calcPriceWithMargin(netGood, getMargineRiv(item));
    }

    // Netto mostrato:
    // - cli: (bene+margine) + servizi, ma servizi NON in colonna
    // - riv: netto bene
    var netShownUnit = variant === "cli"
      ? round2(priceUnitBase + servicesUnit)
      : round2(netGood);

    // sconto mostrato
    var discountTxt = "";
    if (variant === "cli") {
      var inv = calcCustomerDiscountPercent(gross, netShownUnit, servicesUnit);
      discountTxt = inv.toFixed(2) + "%";
    } else {
      discountTxt = toNumber(item.sconto).toFixed(2) + "% + " + toNumber(item.sconto2).toFixed(2) + "%";
    }

    // Totale riga
    var rowTotal = 0;
    if (variant === "cli") {
      rowTotal = round2(netShownUnit * qty);
    } else {
      rowTotal = round2((priceUnitBase + servicesUnit) * qty);
    }
    tot += rowTotal;

    rowsHtml += "<tr>";
    rowsHtml += "<td>" + escapeHtml(item.codice) + "</td>";
    rowsHtml += "<td style='text-align:left'>" + escapeHtml(item.descrizione) + "</td>";
    rowsHtml += "<td>" + qty + "</td>";
    rowsHtml += "<td>" + gross.toFixed(2) + "€</td>";
    rowsHtml += "<td>" + escapeHtml(discountTxt) + "</td>";
    rowsHtml += "<td>" + netShownUnit.toFixed(2) + "€</td>";

    if (showUnit) {
      rowsHtml += "<td>" + (variant === "cli" ? netShownUnit.toFixed(2) : priceUnitBase.toFixed(2)) + "€</td>";
    }
    if (showServicesInPrint) {
      rowsHtml += "<td>" + servicesUnit.toFixed(2) + "€</td>";
    }

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

  // anagrafica (solo se valorizzata)
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

  if (variant === "riv") {
    var defM = getEl("margineRivDefault") ? toNumber(getEl("margineRivDefault").value).toFixed(2) : "0.00";
    html += "<div class='sub'><b>Margine Rivenditore:</b> per riga (o default " + defM + "%) — <b>Sconto mostrato:</b> S1 + S2</div>";
  }

  html += "<table><thead><tr>";
  html += "<th>Codice</th><th style='text-align:left'>Descrizione</th><th>Q.tà</th>";
  html += "<th>Lordo</th><th>Sconto</th><th>" + (variant === "cli" ? "Netto cliente" : "Netto") + "</th>";
  if (showUnit) html += "<th>Prezzo Unit.</th>";
  if (showServicesInPrint) html += "<th>Servizi</th>";
  html += "<th>Totale Riga</th>";
  html += "</tr></thead><tbody>" + rowsHtml + "</tbody></table>";

  html += "<div class='tot'>";
  html += "<div><b>Imponibile:</b> " + taxable.toFixed(2) + "€</div>";
  if (showVat) html += "<div><b>IVA (" + vatPerc.toFixed(2) + "%):</b> " + vat.toFixed(2) + "€</div>";
  html += "<div style='font-size:18px;margin-top:6px'><b>TOTALE:</b> " + totalWithVat.toFixed(2) + "€</div>";
  html += "</div>";

  // Box noleggio (opzionale)
  var showRent = getEl("noleggioMostraNelPreventivo") && getEl("noleggioMostraNelPreventivo").checked;
  if (showRent) {
    var durSel = getEl("noleggioDurata") ? getEl("noleggioDurata").value : 24;
    var outN = calcolaNoleggio(taxable, durSel);
    var showDettN = getEl("noleggioMostraDettagli") && getEl("noleggioMostraDettagli").checked;

    html += "<div class='box'>";
    html += "<div style='font-weight:700;margin-bottom:6px'>Noleggio Operativo (simulazione)</div>";
    html += "<div>Durata: <b>" + escapeHtml(String(durSel)) + " mesi</b></div>";
    html += "<div>Rata mensile: <b>" + formatNumberIT(outN.rata) + " €</b></div>";
    html += "<div>Spese contratto: <b>" + formatNumberIT(outN.spese) + " €</b></div>";
    if (showDettN) {
      html += "<div>Costo giornaliero: <b>" + formatNumberIT(outN.giorno) + " €</b> — Costo orario: <b>" + formatNumberIT(outN.ora) + " €</b></div>";
      html += "<div style='margin-top:6px;color:#444'>Spese incasso RID: 4,00 € al mese</div>";
    }
    html += "</div>";
  }

  html += "<button class='btn' onclick='window.print()'>Stampa / Salva PDF</button>";
  html += "</body></html>";

  var w = window.open("", "_blank");
  if (!w) {
    alert("Popup bloccato: abilita l'apertura finestre o usa Safari.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ===============================
// NOLEGGIO
// ===============================
function formatNumberIT(value) {
  value = typeof value === "number" ? value : toNumber(value);
  try {
    return value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch (e) {
    return value.toFixed(2).replace(".", ",");
  }
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
    5000: { 12: 0.081123, 18: 0.058239, 24: 0.045554, 36: 0.032359, 48: 0.025445, 60: 0.021358 },
    15000: { 12: 0.081433, 18: 0.058341, 24: 0.045535, 36: 0.032207, 48: 0.025213, 60: 0.021074 },
    25000: { 12: 0.08128, 18: 0.058195, 24: 0.045392, 36: 0.032065, 48: 0.025068, 60: 0.020926 },
    50000: { 12: 0.08077, 18: 0.05771, 24: 0.044915, 36: 0.031592, 48: 0.024588, 60: 0.020437 },
    100000: { 12: 0.080744, 18: 0.057686, 24: 0.044891, 36: 0.031568, 48: 0.024564, 60: 0.020413 },
  };

  var keys = [5000, 15000, 25000, 50000, 100000];
  var fascia = 100000;
  for (var i = 0; i < keys.length; i++) {
    if (importo <= keys[i]) { fascia = keys[i]; break; }
  }

  var result = {};
  var mesiList = [12, 18, 24, 36, 48, 60];
  for (var j = 0; j < mesiList.length; j++) {
    var mesi = mesiList[j];
    result[mesi] = importo * coefficienti[fascia][mesi];
  }
  return result;
}

function calcolaNoleggio(importoImponibile, durataMesi) {
  var importo = toNumber(importoImponibile);
  durataMesi = parseInt(durataMesi, 10) || 24;

  if (!importo || importo <= 0) {
    return { rata: 0, spese: 0, giorno: 0, ora: 0, canoni: null };
  }

  var canoni = calcolaCanoniPerDurate(importo);
  var rata = canoni[durataMesi] || 0;
  var spese = calcolaSpeseContratto(importo);

  var giorno = rata / 22;
  var ora = giorno / 8;

  return { rata: rata, spese: spese, giorno: giorno, ora: ora, canoni: canoni };
}

function getTaxableTotalFromItems() {
  var tot = 0;

  for (var i = 0; i < quoteItems.length; i++) {
    var item = quoteItems[i];

    var qty = clampMin(toNumber(item.quantita), 1);
    qty = Math.round(qty);

    var netto = calcNetto(item);

    // ✅ margine dinamico: se riga=0 usa default cliente
    var marginEff = getEffectiveRowMargin(item);
    var priceUnit = calcPriceWithMargin(netto, marginEff);

    var services = toNumber(item.costoTrasporto) + toNumber(item.costoInstallazione);
    var row = round2((priceUnit + services) * qty);
    tot += row;
  }

  return round2(tot);
}

function aggiornaBoxNoleggio() {
  updateRentalBox();
}

function updateRentalBox() {
  var dur = getEl("noleggioDurata");
  if (!dur) return;

  var taxable = getTaxableTotalFromItems();
  var out = calcolaNoleggio(taxable, dur.value);

  var elR = getEl("noleggioRata");
  var elS = getEl("noleggioSpese");
  var elDH = getEl("noleggioDayHour");

  if (!taxable || taxable <= 0) {
    if (elR) elR.textContent = "—";
    if (elS) elS.textContent = "—";
    if (elDH) elDH.textContent = "—";
    return;
  }

  if (elR) elR.textContent = formatNumberIT(out.rata) + " € / mese";
  if (elS) elS.textContent = formatNumberIT(out.spese) + " €";

  var showDett = getEl("noleggioMostraDettagli") && getEl("noleggioMostraDettagli").checked;
  if (elDH) {
    elDH.textContent = showDett
      ? formatNumberIT(out.giorno) + " €/giorno — " + formatNumberIT(out.ora) + " €/ora"
      : "—";
  }
}

function scaricaNoleggioTXT() {
  downloadRentalTXT();
}

function downloadRentalTXT() {
  if (window.track && window.track.noleggio_txt) window.track.noleggio_txt();

  var taxable = getTaxableTotalFromItems();
  if (!taxable || taxable <= 0) {
    alert("Aggiungi almeno un articolo prima di generare il TXT noleggio.");
    return;
  }

  var canoni = calcolaCanoniPerDurate(taxable);
  var speseContratto = calcolaSpeseContratto(taxable);

  var testo = "";
  testo += "PREVENTIVO DI NOLEGGIO OPERATIVO BCC\n";
  testo += "--------------------------------------\n\n";
  testo += "Importo (imponibile): " + formatNumberIT(taxable) + " €\n\n";

  testo += "CANONI MENSILI DISPONIBILI:\n";
  testo += "12 mesi: " + formatNumberIT(canoni[12]) + " €\n";
  testo += "18 mesi: " + formatNumberIT(canoni[18]) + " €\n";
  testo += "24 mesi: " + formatNumberIT(canoni[24]) + " €\n";
  testo += "36 mesi: " + formatNumberIT(canoni[36]) + " €\n";
  testo += "48 mesi: " + formatNumberIT(canoni[48]) + " €\n";
  testo += "60 mesi: " + formatNumberIT(canoni[60]) + " €\n";

  testo += "\n\nDETTAGLI CONTRATTUALI:\n";
  testo += "Spese di contratto: " + formatNumberIT(speseContratto) + " €\n";
  testo += "Spese incasso RID: 4,00 € al mese\n\n";

  testo += "BENEFICI FISCALI:\n";
  testo += "- Canone interamente deducibile.\n";
  testo += "- Il bene non entra nei cespiti.\n";
  testo += "- Nessuna incidenza su IRAP.\n\n";

  testo += "BENEFICI FINANZIARI:\n";
  testo += "- Non è un finanziamento.\n";
  testo += "- Non impegna le linee di credito.\n";
  testo += "- Non è un bene da ammortizzare.\n\n";

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
