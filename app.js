// ===============================
// CSVXpressGold — app.js (FULL)
// Preventivi (Riv/Cliente) + Margine + Noleggio + TXT
// + Sconto Cliente Finale (inverso) selezionabile
// + Anagrafica (opzionale) salvata in localStorage
// ===============================

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js')
    .then(function(reg){ console.log("Service Worker registrato", reg); })
    .catch(function(err){ console.error("Service Worker non registrato", err); });
}

// Stato
var listino = [];
var articoliAggiunti = [];
var autoPopolaCosti = true;

// Utils
function roundTwo(num) { return Math.round(num * 100) / 100; }
function n(v){
  v = parseFloat(String(v == null ? "" : v).replace(",", "."));
  return isNaN(v) ? 0 : v;
}
function clampMin(v, min){ return v < min ? min : v; }

// DOM helpers
function byId(id){ return document.getElementById(id); }
function createEl(tag){ return document.createElement(tag); }
function esc(s){
  s = (s == null) ? "" : String(s);
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function debounce(fn, ms){
  var t=null;
  return function(){
    clearTimeout(t);
    var args = arguments;
    t=setTimeout(function(){ fn.apply(null,args); }, ms);
  };
}

// ===============================
// ANAGRAFICA (opzionale) — localStorage
// ===============================
var ANAG_KEY = "csvxpressgold_anagrafica_v1";

function mountAnagraficaUI(){
  var prevSec = byId("preventivi-section");
  if (!prevSec) return;
  if (byId("anagrafica-section")) return;

  var sec = document.createElement("section");
  sec.id = "anagrafica-section";
  sec.setAttribute("data-zone","anagrafica");
  sec.innerHTML =
    "<h2>Anagrafica (opzionale)</h2>" +
    "<p class='hint'>Puoi lasciare i campi vuoti e continuare. I dati si salvano sul dispositivo.</p>" +

    "<div class='panel'>" +
      "<h3>Rivenditore</h3>" +
      "<div class='grid'>" +
        "<div><label>Azienda</label><input id='riv_azienda' type='text' placeholder='Ragione sociale'></div>" +
        "<div><label>Referente</label><input id='riv_ref' type='text' placeholder='Nome e cognome'></div>" +
        "<div><label>Indirizzo</label><input id='riv_ind' type='text' placeholder='Via, CAP, Città, Prov.'></div>" +
        "<div><label>Email</label><input id='riv_email' type='text' placeholder='email@azienda.it'></div>" +
        "<div><label>Cellulare</label><input id='riv_cell' type='text' placeholder='+39 ...'></div>" +
        "<div><label>P.IVA / C.F.</label><input id='riv_piva' type='text' placeholder='Partita IVA / Codice fiscale'></div>" +
      "</div>" +
    "</div>" +

    "<div class='panel'>" +
      "<h3>Cliente Finale</h3>" +
      "<div class='grid'>" +
        "<div><label>Azienda</label><input id='cli_azienda' type='text' placeholder='Ragione sociale'></div>" +
        "<div><label>Referente</label><input id='cli_ref' type='text' placeholder='Nome e cognome'></div>" +
        "<div><label>Indirizzo</label><input id='cli_ind' type='text' placeholder='Via, CAP, Città, Prov.'></div>" +
        "<div><label>Email</label><input id='cli_email' type='text' placeholder='email@cliente.it'></div>" +
        "<div><label>Cellulare</label><input id='cli_cell' type='text' placeholder='+39 ...'></div>" +
        "<div><label>P.IVA / C.F.</label><input id='cli_piva' type='text' placeholder='Partita IVA / Codice fiscale'></div>" +
      "</div>" +
    "</div>" +

    "<div class='row'>" +
      "<button type='button' id='btnSaveAnag' class='secondary'>Salva Anagrafica</button>" +
      "<button type='button' id='btnClearAnag'>Svuota</button>" +
    "</div>";

  prevSec.parentNode.insertBefore(sec, prevSec);

  loadAnagrafica();

  byId("btnSaveAnag").addEventListener("click", saveAnagrafica, false);
  byId("btnClearAnag").addEventListener("click", function(){
    try{ localStorage.removeItem(ANAG_KEY); }catch(e){}
    loadAnagrafica(true);
  }, false);

  var ids = ["riv_azienda","riv_ref","riv_ind","riv_email","riv_cell","riv_piva","cli_azienda","cli_ref","cli_ind","cli_email","cli_cell","cli_piva"];
  for (var i=0;i<ids.length;i++){
    (function(id){
      var el = byId(id);
      if (!el) return;
      el.addEventListener("input", debounce(saveAnagrafica, 350), false);
    })(ids[i]);
  }
}

function getAnagraficaFromUI(){
  function val(id){ var el=byId(id); return el ? (el.value||"").trim() : ""; }
  return {
    riv: { azienda:val("riv_azienda"), referente:val("riv_ref"), indirizzo:val("riv_ind"), email:val("riv_email"), cell:val("riv_cell"), piva:val("riv_piva") },
    cli: { azienda:val("cli_azienda"), referente:val("cli_ref"), indirizzo:val("cli_ind"), email:val("cli_email"), cell:val("cli_cell"), piva:val("cli_piva") }
  };
}

function setAnagraficaToUI(data, clear){
  data = data || {};
  function set(id,v){ var el=byId(id); if(el) el.value = clear ? "" : (v||""); }
  set("riv_azienda", data.riv && data.riv.azienda);
  set("riv_ref", data.riv && data.riv.referente);
  set("riv_ind", data.riv && data.riv.indirizzo);
  set("riv_email", data.riv && data.riv.email);
  set("riv_cell", data.riv && data.riv.cell);
  set("riv_piva", data.riv && data.riv.piva);

  set("cli_azienda", data.cli && data.cli.azienda);
  set("cli_ref", data.cli && data.cli.referente);
  set("cli_ind", data.cli && data.cli.indirizzo);
  set("cli_email", data.cli && data.cli.email);
  set("cli_cell", data.cli && data.cli.cell);
  set("cli_piva", data.cli && data.cli.piva);
}

function saveAnagrafica(){
  try{
    localStorage.setItem(ANAG_KEY, JSON.stringify(getAnagraficaFromUI()));
  }catch(e){}
}

function loadAnagrafica(clear){
  try{
    if(clear){ setAnagraficaToUI(null,true); return; }
    var raw = localStorage.getItem(ANAG_KEY);
    if(!raw) return;
    setAnagraficaToUI(JSON.parse(raw), false);
  }catch(e){}
}

function getAnagraficaForVariant(variant){
  var a = getAnagraficaFromUI();
  return (variant === "cli") ? a.cli : a.riv;
}

// ===============================
// Bootstrap
// ===============================
document.addEventListener("DOMContentLoaded", function () {

  // badge versione (se presente)
  try {
    var VER = document.documentElement.getAttribute('data-ver') || 'dev';
    var badge = document.getElementById("verBadge");
    if (badge) badge.textContent = "ver " + VER;
  } catch(e) {}

  // monta UI anagrafica (opzionale)
  mountAnagraficaUI();

  byId("csvFileInput").addEventListener("change", handleCSVUpload, false);
  byId("searchListino").addEventListener("input", aggiornaListinoSelect, false);

  byId("btnAddFromListino").addEventListener("click", aggiungiArticoloDaListino, false);
  byId("btnManual").addEventListener("click", mostraFormArticoloManuale, false);

  byId("toggleCosti").addEventListener("change", function(){
    autoPopolaCosti = byId("toggleCosti").checked;
    var tms = byId("toggleMostraServizi");
    if (tms) tms.disabled = !autoPopolaCosti;

    for (var i=0;i<articoliAggiunti.length;i++){
      var a = articoliAggiunti[i];
      if (!autoPopolaCosti){
        a.costoTrasporto = 0;
        a.costoInstallazione = 0;
      } else {
        var base = trovaInListino(a.codice);
        if (base){
          a.costoTrasporto = base.costoTrasporto || 0;
          a.costoInstallazione = base.costoInstallazione || 0;
        }
      }
    }

    aggiornaTabellaArticoli();
    aggiornaTotaliGenerali();
    aggiornaBoxNoleggio();
  }, false);

  byId("btnWA").addEventListener("click", inviaReportWhatsApp, false);
  byId("btnTXT").addEventListener("click", generaTXTReport, false);

  byId("btnWASenzaMargine").addEventListener("click", inviaReportWhatsAppSenzaMargine, false);
  byId("btnTXTSenzaMargine").addEventListener("click", generaTXTReportSenzaMargine, false);

  byId("btnPrevRiv").addEventListener("click", function(){ apriPreventivo('riv'); }, false);
  byId("btnPrevCli").addEventListener("click", function(){ apriPreventivo('cli'); }, false);

  // NOLEGGIO UI
  var selDur = byId("noleggioDurata");
  if (selDur) selDur.addEventListener("change", aggiornaBoxNoleggio, false);

  var btnNT = byId("btnNoleggioTXT");
  if (btnNT) btnNT.addEventListener("click", scaricaNoleggioTXT, false);

  byId("margineCliDefault").addEventListener("input", function(){ aggiornaBoxNoleggio(); }, false);
  byId("margineRivDefault").addEventListener("input", function(){ aggiornaBoxNoleggio(); }, false);

  var radios = document.getElementsByName("scontoClienteMode");
  for (var r=0;r<radios.length;r++){
    radios[r].addEventListener("change", function(){ aggiornaBoxNoleggio(); }, false);
  }

  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
  aggiornaBoxNoleggio();
});

// ===============================
// Modalità Sconto Cliente Finale
// ===============================
function getScontoClienteMode(){
  var nodes = document.getElementsByName("scontoClienteMode");
  for (var i=0;i<nodes.length;i++){
    if (nodes[i].checked) return nodes[i].value;
  }
  return "bene";
}

// calcola sconto% inverso
function calcScontoClientePerc(prezzoLordo, prezzoClienteUnit, serviziUnit){
  var mode = getScontoClienteMode();
  prezzoLordo = n(prezzoLordo);
  prezzoClienteUnit = n(prezzoClienteUnit);
  serviziUnit = n(serviziUnit);

  var base = prezzoLordo;
  var fin = prezzoClienteUnit;

  if (mode === "totale"){
    base = prezzoLordo + serviziUnit;
    fin = prezzoClienteUnit + serviziUnit;
  }

  if (!base || base <= 0) return 0;

  var s = (1 - (fin / base)) * 100;
  if (s < 0) s = 0;
  if (s > 99.99) s = 99.99;
  return roundTwo(s);
}

// ===============================
// CSV upload
// ===============================
function handleCSVUpload(event) {
  var file = event.target.files[0];
  if (!file) return;

  if (window.track && window.track.csv_upload_start) window.track.csv_upload_start({ method: 'file_input' });
  if (window.track && window.track.csv_upload_ok) window.track.csv_upload_ok({ method: 'file_input', file: file });

  var t0 = (window.performance && performance.now) ? performance.now() : Date.now();

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      var ms = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - t0);

      if (!results.data || !results.data.length) {
        var errEl = byId("csvError");
        if (errEl) errEl.style.display = "block";
        if (window.track && window.track.csv_parse_error) window.track.csv_parse_error({ code: 'empty_or_no_rows', ms: ms });
        return;
      }

      listino = [];
      for (var i=0;i<results.data.length;i++){
        var row = results.data[i] || {};
        listino.push({
          codice: (row["Codice"] || "").trim(),
          descrizione: (row["Descrizione"] || "").trim(),
          prezzoLordo: n(row["PrezzoLordo"] || "0"),
          sconto: 0,
          sconto2: 0,
          margine: 0,
          costoTrasporto: n(row["CostoTrasporto"] || "0"),
          costoInstallazione: n(row["CostoInstallazione"] || "0"),
          quantita: 1,
          venduto: 0
        });
      }

      var rows = listino.length;
      var cols = (results.meta && results.meta.fields && results.meta.fields.length) ? results.meta.fields.length : undefined;
      if (window.track && window.track.csv_parse_ok) window.track.csv_parse_ok({ rows: rows, cols: cols, ms: ms });

      var errEl2 = byId("csvError");
      if (errEl2) errEl2.style.display = "none";

      aggiornaListinoSelect();
    },
    error: function(err) {
      var ms2 = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - t0);
      console.error("Errore CSV:", err);
      var errEl3 = byId("csvError");
      if (errEl3) errEl3.style.display = "block";
      if (window.track && window.track.csv_parse_error) window.track.csv_parse_error({ code: 'papaparse_error', ms: ms2 });
    }
  });
}

// ===============================
// Listino UI
// ===============================
function aggiornaListinoSelect() {
  var select = byId("listinoSelect");
  if (!select) return;
  var searchTerm = (byId("searchListino").value || "").toLowerCase();
  select.innerHTML = "";

  for (var i=0;i<listino.length;i++){
    var item = listino[i];
    var hit =
      (item.codice || "").toLowerCase().indexOf(searchTerm) > -1 ||
      (item.descrizione || "").toLowerCase().indexOf(searchTerm) > -1;

    if (hit){
      var option = createEl("option");
      option.value = item.codice;
      option.textContent = item.codice + " - " + item.descrizione + " - €" + item.prezzoLordo.toFixed(2);
      select.appendChild(option);
    }
  }
}

function trovaInListino(codice){
  for (var i=0;i<listino.length;i++){
    if (listino[i].codice === codice) return listino[i];
  }
  return null;
}

function aggiungiArticoloDaListino() {
  if (window.track && window.track.add_item_listino) window.track.add_item_listino();

  var select = byId("listinoSelect");
  if (!select || !select.value) return;

  var articolo = trovaInListino(select.value);
  if (!articolo) { alert("Errore: articolo non trovato nel listino."); return; }

  var nuovo = {};
  for (var k in articolo) if (articolo.hasOwnProperty(k)) nuovo[k] = articolo[k];

  if (!autoPopolaCosti){
    nuovo.costoTrasporto = 0;
    nuovo.costoInstallazione = 0;
  }

  articoliAggiunti.push(nuovo);
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
  aggiornaBoxNoleggio();
}

// ===============================
// Calcoli (Margine)
// ===============================
function calcNetto(a){
  var s1 = n(a.sconto);
  var s2 = n(a.sconto2);
  var lordo = n(a.prezzoLordo);
  return roundTwo(lordo * (1 - s1/100) * (1 - s2/100));
}

function calcPrezzoConMargine(netto, marginePerc){
  marginePerc = n(marginePerc);
  if (marginePerc <= 0) return roundTwo(netto);
  if (marginePerc >= 99.99) marginePerc = 99.99;
  return roundTwo(netto / (1 - marginePerc/100));
}

function getMargineRiv(a){
  var m = n(a.margine);
  if (m > 0) return m;
  return n(byId("margineRivDefault").value);
}

function getMargineCli(){
  return n(byId("margineCliDefault").value);
}

// ===============================
// Tabella articoli
// ===============================
function tdInp(index, field, value, minVal){
  var v = (typeof value === "number") ? value : n(value);
  var minAttr = (minVal != null) ? (" min='" + String(minVal) + "'") : "";
  return "<td><input type='number' value='" + v + "' data-index='" + index + "' data-field='" + field + "'" + minAttr + " oninput='aggiornaCampo(event)'></td>";
}

function aggiornaTabellaArticoli() {
  var tbody = document.querySelector("#articoli-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];

    var netto = calcNetto(a);
    var mRiv = getMargineRiv(a);
    var prezzoRiv = calcPrezzoConMargine(netto, mRiv);

    var q = clampMin(n(a.quantita), 1);
    var serv = n(a.costoTrasporto) + n(a.costoInstallazione);
    var totRiv = roundTwo((prezzoRiv + serv) * q);

    var venduto = n(a.venduto);
    var diff = roundTwo(venduto - totRiv);

    var tr = createEl("tr");
    tr.innerHTML =
      "<td>" + esc(a.codice) + "</td>" +
      "<td>" + esc(a.descrizione) + "</td>" +
      "<td>" + n(a.prezzoLordo).toFixed(2) + "€</td>" +
      tdInp(i,"sconto", n(a.sconto)) +
      tdInp(i,"sconto2", n(a.sconto2)) +
      tdInp(i,"margine", n(a.margine)) +
      "<td>" + netto.toFixed(2) + "€</td>" +
      tdInp(i,"costoTrasporto", n(a.costoTrasporto)) +
      tdInp(i,"costoInstallazione", n(a.costoInstallazione)) +
      tdInp(i,"quantita", q, 1) +
      "<td>" + totRiv.toFixed(2) + "€</td>" +
      tdInp(i,"venduto", venduto) +
      "<td>" + diff.toFixed(2) + "€</td>" +
      "<td><button type='button' onclick='rimuoviArticolo(" + i + ")'>Rimuovi</button></td>";

    tbody.appendChild(tr);
  }
}

function aggiornaCampo(event) {
  var input = event.target;
  var index = parseInt(input.getAttribute("data-index"),10);
  var field = input.getAttribute("data-field");

  var val = n(input.value);
  if ((field==="sconto" || field==="sconto2" || field==="margine") && val < 0) val = 0;
  if (field==="quantita" && val < 1) val = 1;

  articoliAggiunti[index][field] = val;

  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
  aggiornaBoxNoleggio();
}

function rimuoviArticolo(index) {
  if (window.track && window.track.remove_item) window.track.remove_item();
  articoliAggiunti.splice(index, 1);
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
  aggiornaBoxNoleggio();
}

// ===============================
// Totali
// ===============================
function aggiornaTotaliGenerali() {
  var totNetto = 0;
  var totRiv = 0;
  var totVend = 0;
  var totDiff = 0;

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);

    var netto = calcNetto(a);
    var prezzoRiv = calcPrezzoConMargine(netto, getMargineRiv(a));

    var serv = n(a.costoTrasporto) + n(a.costoInstallazione);
    var totRigaRiv = roundTwo((prezzoRiv + serv) * q);

    var venduto = n(a.venduto);
    var diff = roundTwo(venduto - totRigaRiv);

    totNetto += netto * q;
    totRiv += totRigaRiv;
    totVend += venduto;
    totDiff += diff;
  }

  var holder = byId("totaleGenerale");
  if (!holder) return;

  var html = "";
  html += "<strong>Totale Netto (dopo sconti):</strong> " + totNetto.toFixed(2) + "€<br>";
  html += "<strong>Totale Preventivo Rivenditore (margine + servizi):</strong> " + totRiv.toFixed(2) + "€<br>";
  html += "<strong>Totale Venduto (se compilato):</strong> " + totVend.toFixed(2) + "€<br>";
  html += "<strong>Totale Differenza:</strong> " + totDiff.toFixed(2) + "€";
  holder.innerHTML = html;
}

// ===============================
// Aggiunta manuale
// ===============================
function mostraFormArticoloManuale() {
  var tbody = document.querySelector("#articoli-table tbody");
  if (!tbody) return;
  if (byId("manual-input-row")) return;

  var tr = createEl("tr");
  tr.id = "manual-input-row";
  tr.innerHTML =
    "<td><input type='text' id='manualCodice' placeholder='Codice'></td>" +
    "<td><input type='text' id='manualDescrizione' placeholder='Descrizione'></td>" +
    "<td><input type='number' id='manualPrezzo' placeholder='€' step='0.01'></td>" +
    "<td><input type='number' id='manualSconto1' placeholder='%' value='0' step='0.01'></td>" +
    "<td><input type='number' id='manualSconto2' placeholder='%' value='0' step='0.01'></td>" +
    "<td><input type='number' id='manualMargine' placeholder='%' value='0' step='0.01'></td>" +
    "<td><span id='manualNetto'>—</span></td>" +
    "<td><input type='number' id='manualTrasporto' placeholder='€' value='0' step='0.01'></td>" +
    "<td><input type='number' id='manualInstallazione' placeholder='€' value='0' step='0.01'></td>" +
    "<td><input type='number' id='manualQuantita' placeholder='1' value='1' min='1'></td>" +
    "<td><span id='manualTotRiv'>—</span></td>" +
    "<td><input type='number' id='manualVenduto' placeholder='€' value='0' step='0.01'></td>" +
    "<td><span id='manualDiff'>—</span></td>" +
    "<td><button type='button' onclick='aggiungiArticoloManuale()'>✅</button> <button type='button' onclick='annullaArticoloManuale()'>❌</button></td>";

  tbody.appendChild(tr);

  var ids = ["manualPrezzo","manualSconto1","manualSconto2","manualMargine","manualTrasporto","manualInstallazione","manualQuantita","manualVenduto"];
  for (var i=0;i<ids.length;i++){
    byId(ids[i]).addEventListener("input", calcolaRigaManuale, false);
  }
  calcolaRigaManuale();
}

function calcolaRigaManuale(){
  var prezzoLordo = n(byId("manualPrezzo").value);
  var s1 = n(byId("manualSconto1").value);
  var s2 = n(byId("manualSconto2").value);
  var m = n(byId("manualMargine").value);
  var trp = n(byId("manualTrasporto").value);
  var inst = n(byId("manualInstallazione").value);
  var q = clampMin(n(byId("manualQuantita").value), 1);
  var vend = n(byId("manualVenduto").value);

  var netto = roundTwo(prezzoLordo * (1 - s1/100) * (1 - s2/100));
  var mEff = (m > 0) ? m : n(byId("margineRivDefault").value);
  var prezzoRiv = calcPrezzoConMargine(netto, mEff);
  var totRiv = roundTwo((prezzoRiv + trp + inst) * q);
  var diff = roundTwo(vend - totRiv);

  byId("manualNetto").textContent = netto.toFixed(2) + "€";
  byId("manualTotRiv").textContent = totRiv.toFixed(2) + "€";
  byId("manualDiff").textContent = diff.toFixed(2) + "€";
}

function aggiungiArticoloManuale(){
  if (window.track && window.track.add_item_manual) window.track.add_item_manual();

  var nuovo = {
    codice: (byId("manualCodice").value || "").trim(),
    descrizione: (byId("manualDescrizione").value || "").trim(),
    prezzoLordo: n(byId("manualPrezzo").value),
    sconto: n(byId("manualSconto1").value),
    sconto2: n(byId("manualSconto2").value),
    margine: n(byId("manualMargine").value),
    costoTrasporto: n(byId("manualTrasporto").value),
    costoInstallazione: n(byId("manualInstallazione").value),
    quantita: clampMin(n(byId("manualQuantita").value), 1),
    venduto: n(byId("manualVenduto").value)
  };

  articoliAggiunti.push(nuovo);
  annullaArticoloManuale();
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
  aggiornaBoxNoleggio();
}

function annullaArticoloManuale(){
  var row = byId("manual-input-row");
  if (row && row.parentNode) row.parentNode.removeChild(row);
}

// ===============================
// Report TXT / WhatsApp
// ===============================
function generaReportTesto(includeMargine){
  var showServ = byId("toggleMostraServizi") && byId("toggleMostraServizi").checked && autoPopolaCosti;
  var report = includeMargine ? "Report Articoli (Rivenditore - con Margine)\n\n" : "Report Articoli (Netto - senza Margine)\n\n";
  var tot = 0;

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);

    var lordo = n(a.prezzoLordo);
    var s1 = n(a.sconto);
    var s2 = n(a.sconto2);
    var netto = calcNetto(a);

    var linea = 0;

    if (includeMargine){
      var prezzoRiv = calcPrezzoConMargine(netto, getMargineRiv(a));
      linea = (prezzoRiv + n(a.costoTrasporto) + n(a.costoInstallazione)) * q;
    } else {
      linea = (netto + n(a.costoTrasporto) + n(a.costoInstallazione)) * q;
    }

    linea = roundTwo(linea);
    tot += linea;

    report += (i+1) + ". " + (a.codice || "") + " — " + (a.descrizione || "") + "\n";
    report += "Lordo: " + lordo.toFixed(2) + "€ | S1: " + s1.toFixed(2) + "% | S2: " + s2.toFixed(2) + "%\n";
    report += "Netto: " + netto.toFixed(2) + "€ | Q.tà: " + q + "\n";
    if (includeMargine) report += "Margine%: " + getMargineRiv(a).toFixed(2) + "\n";
    if (showServ){
      report += "Trasporto: " + n(a.costoTrasporto).toFixed(2) + "€ | Installazione: " + n(a.costoInstallazione).toFixed(2) + "€\n";
    }
    report += "Totale Riga: " + linea.toFixed(2) + "€\n\n";
  }

  report += "TOTALE: " + roundTwo(tot).toFixed(2) + "€\n";
  return report;
}

function shareWhatsApp(text){
  var appUrl = "whatsapp://send?text=" + encodeURIComponent(text);
  var webUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(text);
  setTimeout(function(){ window.open(webUrl, "_blank"); }, 800);
  window.location = appUrl;
}

function openText(content){
  var w = window.open("", "_blank");
  if (!w) { alert("Popup bloccato: abilita l'apertura finestre o usa Safari."); return; }
  w.document.open();
  w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>TXT</title></head>" +
                   "<body style='font-family:monospace;white-space:pre-wrap;padding:12px;'>" +
                   esc(content) +
                   "</body></html>");
  w.document.close();
}

function inviaReportWhatsApp(){
  if (window.track && window.track.report_whatsapp) window.track.report_whatsapp({ variant: 'standard' });
  shareWhatsApp(generaReportTesto(true));
}

function generaTXTReport(){
  if (window.track && window.track.export_txt) window.track.export_txt({ variant: 'standard' });
  openText(generaReportTesto(true));
}

function inviaReportWhatsAppSenzaMargine(){
  if (window.track && window.track.report_whatsapp) window.track.report_whatsapp({ variant: 'no_margin' });
  shareWhatsApp(generaReportTesto(false));
}

function generaTXTReportSenzaMargine(){
  if (window.track && window.track.export_txt) window.track.export_txt({ variant: 'no_margin' });
  openText(generaReportTesto(false));
}

// ===============================
// Preventivi stampabili (Riv / Cliente Finale) + Box Noleggio + Anagrafica
// ===============================
function apriPreventivo(variant){
  if (window.track && window.track.open_preventivo) window.track.open_preventivo({ variant: variant });

  var mostraIVA = byId("preventivoMostraIVA") && byId("preventivoMostraIVA").checked;
  var mostraUnit = byId("preventivoPrezziUnitari") && byId("preventivoPrezziUnitari").checked;
  var ivaPerc = n(byId("ivaPerc").value);

  var titolo = (variant === 'cli') ? "Preventivo Cliente Finale" : "Preventivo Rivenditore";
  var margineCli = getMargineCli();
  var ana = getAnagraficaForVariant(variant);

  var rowsHtml = "";
  var tot = 0;

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);

    var lordo = n(a.prezzoLordo);
    var s1 = n(a.sconto);
    var s2 = n(a.sconto2);

    var netto = calcNetto(a);

    var serv = n(a.costoTrasporto) + n(a.costoInstallazione);

    var prezzoUnit = 0;
    if (variant === 'cli'){
      prezzoUnit = calcPrezzoConMargine(netto, margineCli);
    } else {
      prezzoUnit = calcPrezzoConMargine(netto, getMargineRiv(a));
    }

    var scontoTxt = "";
    if (variant === 'cli'){
      var sInv = calcScontoClientePerc(lordo, prezzoUnit, serv);
      scontoTxt = sInv.toFixed(2) + "%";
    } else {
      scontoTxt = s1.toFixed(2) + "% + " + s2.toFixed(2) + "%";
    }

    var riga = roundTwo((prezzoUnit + serv) * q);
    tot += riga;

    rowsHtml += "<tr>";
    rowsHtml += "<td>" + esc(a.codice) + "</td>";
    rowsHtml += "<td style='text-align:left'>" + esc(a.descrizione) + "</td>";
    rowsHtml += "<td>" + q + "</td>";
    rowsHtml += "<td>" + lordo.toFixed(2) + "€</td>";
    rowsHtml += "<td>" + esc(scontoTxt) + "</td>";
    rowsHtml += "<td>" + netto.toFixed(2) + "€</td>";
    if (mostraUnit) rowsHtml += "<td>" + prezzoUnit.toFixed(2) + "€</td>";
    rowsHtml += "<td>" + serv.toFixed(2) + "€</td>";
    rowsHtml += "<td><b>" + riga.toFixed(2) + "€</b></td>";
    rowsHtml += "</tr>";
  }

  tot = roundTwo(tot);
  var imp = tot;
  var iva = mostraIVA ? roundTwo(imp * (ivaPerc/100)) : 0;
  var totIva = mostraIVA ? roundTwo(imp + iva) : imp;

  var html = "";
  html += "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<title>" + esc(titolo) + "</title>";
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

  html += "<h1>" + esc(titolo) + "</h1>";
  html += "<div class='sub'>Generato da CSVXpressGold — " + new Date().toLocaleString() + "</div>";

  // Anagrafica (mostra solo se c'è qualcosa)
  var hasAny = (ana.azienda||ana.referente||ana.indirizzo||ana.email||ana.cell||ana.piva);
  if (hasAny){
    html += "<div class='box'>";
    html += "<div style='font-weight:700;margin-bottom:6px'>Anagrafica</div>";
    if (ana.azienda)   html += "<div><b>Azienda:</b> " + esc(ana.azienda) + "</div>";
    if (ana.referente) html += "<div><b>Referente:</b> " + esc(ana.referente) + "</div>";
    if (ana.indirizzo) html += "<div><b>Indirizzo:</b> " + esc(ana.indirizzo) + "</div>";
    if (ana.email)     html += "<div><b>Email:</b> " + esc(ana.email) + "</div>";
    if (ana.cell)      html += "<div><b>Cellulare:</b> " + esc(ana.cell) + "</div>";
    if (ana.piva)      html += "<div><b>P.IVA / C.F.:</b> " + esc(ana.piva) + "</div>";
    html += "</div>";
  }

  if (variant === 'cli'){
    html += "<div class='sub'><b>Margine Cliente Finale:</b> " + margineCli.toFixed(2) + "% — <b>Sconto mostrato:</b> inverso (" + esc(getScontoClienteMode()) + ")</div>";
  } else {
    html += "<div class='sub'><b>Margine Rivenditore:</b> per riga (o default " + n(byId('margineRivDefault').value).toFixed(2) + "%) — <b>Sconto mostrato:</b> S1 + S2</div>";
  }

  html += "<table><thead><tr>";
  html += "<th>Codice</th><th style='text-align:left'>Descrizione</th><th>Q.tà</th>";
  html += "<th>Lordo</th><th>Sconto</th><th>Netto</th>";
  if (mostraUnit) html += "<th>Prezzo Unit.</th>";
  html += "<th>Servizi</th><th>Totale Riga</th>";
  html += "</tr></thead><tbody>" + rowsHtml + "</tbody></table>";

  html += "<div class='tot'>";
  html += "<div><b>Imponibile:</b> " + imp.toFixed(2) + "€</div>";
  if (mostraIVA) html += "<div><b>IVA (" + ivaPerc.toFixed(2) + "%):</b> " + iva.toFixed(2) + "€</div>";
  html += "<div style='font-size:18px;margin-top:6px'><b>TOTALE:</b> " + totIva.toFixed(2) + "€</div>";
  html += "</div>";

  // Box noleggio (opzionale)
  var showNol = byId("noleggioMostraNelPreventivo") && byId("noleggioMostraNelPreventivo").checked;
  if (showNol){
    var durSel = byId("noleggioDurata") ? byId("noleggioDurata").value : 24;
    var outN = calcolaNoleggio(imp, durSel);
    var showDettN = byId("noleggioMostraDettagli") && byId("noleggioMostraDettagli").checked;

    html += "<div class='box'>";
    html += "<div style='font-weight:700;margin-bottom:6px'>Noleggio Operativo (simulazione)</div>";
    html += "<div>Durata: <b>" + esc(String(durSel)) + " mesi</b></div>";
    html += "<div>Rata mensile: <b>" + formatNumberIT(outN.rata) + " €</b></div>";
    html += "<div>Spese contratto: <b>" + formatNumberIT(outN.spese) + " €</b></div>";
    if (showDettN){
      html += "<div>Costo giornaliero: <b>" + formatNumberIT(outN.giorno) + " €</b> — Costo orario: <b>" + formatNumberIT(outN.ora) + " €</b></div>";
      html += "<div style='margin-top:6px;color:#444'>Spese incasso RID: 4,00 € al mese</div>";
    }
    html += "</div>";
  }

  html += "<button class='btn' onclick='window.print()'>Stampa / Salva PDF</button>";
  html += "</body></html>";

  var w = window.open("", "_blank");
  if (!w) { alert("Popup bloccato: abilita l'apertura finestre o usa Safari."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ===============================
// NOLEGGIO (tabella coefficienti + spese)
// ===============================
function formatNumberIT(value) {
  value = (typeof value === "number") ? value : n(value);
  try {
    return value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch(e) {
    return value.toFixed(2).replace('.', ',');
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
    5000:   { 12: 0.081123, 18: 0.058239, 24: 0.045554, 36: 0.032359, 48: 0.025445, 60: 0.021358 },
    15000:  { 12: 0.081433, 18: 0.058341, 24: 0.045535, 36: 0.032207, 48: 0.025213, 60: 0.021074 },
    25000:  { 12: 0.081280, 18: 0.058195, 24: 0.045392, 36: 0.032065, 48: 0.025068, 60: 0.020926 },
    50000:  { 12: 0.080770, 18: 0.057710, 24: 0.044915, 36: 0.031592, 48: 0.024588, 60: 0.020437 },
    100000: { 12: 0.080744, 18: 0.057686, 24: 0.044891, 36: 0.031568, 48: 0.024564, 60: 0.020413 }
  };

  var keys = [5000,15000,25000,50000,100000];
  var fascia = 100000;
  for (var i=0;i<keys.length;i++){
    if (importo <= keys[i]) { fascia = keys[i]; break; }
  }

  var result = {};
  var mesiList = [12,18,24,36,48,60];
  for (var j=0;j<mesiList.length;j++){
    var mesi = mesiList[j];
    result[mesi] = importo * coefficienti[fascia][mesi];
  }
  return result;
}

function calcolaNoleggio(importoImponibile, durataMesi){
  var importo = n(importoImponibile);
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

function getTotaleImponibileDaArticoli(variant){
  var tot = 0;
  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);
    var netto = calcNetto(a);

    var prezzoUnit = 0;
    if (variant === 'cli'){
      prezzoUnit = calcPrezzoConMargine(netto, getMargineCli());
    } else {
      prezzoUnit = calcPrezzoConMargine(netto, getMargineRiv(a));
    }

    var serv = n(a.costoTrasporto) + n(a.costoInstallazione);
    var riga = roundTwo((prezzoUnit + serv) * q);
    tot += riga;
  }
  return roundTwo(tot);
}

function aggiornaBoxNoleggio(){
  var dur = byId("noleggioDurata");
  if (!dur) return;

  var imponibile = getTotaleImponibileDaArticoli('cli'); // live: cliente finale
  var out = calcolaNoleggio(imponibile, dur.value);

  var elR = byId("noleggioRata");
  var elS = byId("noleggioSpese");
  var elDH = byId("noleggioDayHour");

  if (!imponibile || imponibile <= 0){
    if (elR) elR.textContent = "—";
    if (elS) elS.textContent = "—";
    if (elDH) elDH.textContent = "—";
    return;
  }

  if (elR) elR.textContent = formatNumberIT(out.rata) + " € / mese";
  if (elS) elS.textContent = formatNumberIT(out.spese) + " €";

  var showDett = byId("noleggioMostraDettagli") && byId("noleggioMostraDettagli").checked;
  if (elDH){
    if (showDett){
      elDH.textContent = formatNumberIT(out.giorno) + " €/giorno — " + formatNumberIT(out.ora) + " €/ora";
    } else {
      elDH.textContent = "—";
    }
  }
}

function scaricaNoleggioTXT(){
  if (window.track && window.track.noleggio_txt) window.track.noleggio_txt();

  var imponibile = getTotaleImponibileDaArticoli('cli');
  if (!imponibile || imponibile <= 0){
    alert("Aggiungi almeno un articolo prima di generare il TXT noleggio.");
    return;
  }

  var canoni = calcolaCanoniPerDurate(imponibile);
  var speseContratto = calcolaSpeseContratto(imponibile);

  var testo = "";
  testo += "PREVENTIVO DI NOLEGGIO OPERATIVO BCC\n";
  testo += "--------------------------------------\n\n";
  testo += "Importo (imponibile): " + formatNumberIT(imponibile) + " €\n\n";

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
    a.download = "preventivo_noleggio_" + Math.round(imponibile) + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e) {
    openText(testo);
  }
}
