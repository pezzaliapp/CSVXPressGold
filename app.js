// Registra il Service Worker (PWA)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .then(function(reg){ console.log("Service Worker registrato", reg); })
    .catch(function(err){ console.error("Service Worker non registrato", err); });
}

// Stato
var listino = [];
var articoliAggiunti = [];
var autoPopolaCosti = true;

function roundTwo(num) { return Math.round(num * 100) / 100; }
function n(v){ v = parseFloat(String(v).replace(",", ".")); return isNaN(v) ? 0 : v; }
function clampMin(v, min){ return v < min ? min : v; }

document.addEventListener("DOMContentLoaded", function () {
  byId("csvFileInput").addEventListener("change", handleCSVUpload, false);
  byId("searchListino").addEventListener("input", aggiornaListinoSelect, false);

  byId("btnAddFromListino").addEventListener("click", aggiungiArticoloDaListino, false);
  byId("btnManual").addEventListener("click", mostraFormArticoloManuale, false);

  byId("toggleCosti").addEventListener("change", function(){
    autoPopolaCosti = byId("toggleCosti").checked;
    byId("toggleMostraServizi").disabled = !autoPopolaCosti;

    // risincronizza costi da listino se riattivo
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
  }, false);

  byId("btnWA").addEventListener("click", inviaReportWhatsApp, false);
  byId("btnTXT").addEventListener("click", generaTXTReport, false);

  byId("btnWASenzaMargine").addEventListener("click", inviaReportWhatsAppSenzaMargine, false);
  byId("btnTXTSenzaMargine").addEventListener("click", generaTXTReportSenzaMargine, false);

  byId("btnPrevRiv").addEventListener("click", function(){ apriPreventivo('riv'); }, false);
  byId("btnPrevCli").addEventListener("click", function(){ apriPreventivo('cli'); }, false);

  aggiornaTotaliGenerali();
});

// --- DOM helpers ---
function byId(id){ return document.getElementById(id); }
function createEl(tag){ return document.createElement(tag); }

// --- CSV upload ---
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
        byId("csvError").style.display = "block";
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

      byId("csvError").style.display = "none";
      aggiornaListinoSelect();
    },
    error: function(err) {
      var ms2 = Math.round(((window.performance && performance.now) ? performance.now() : Date.now()) - t0);
      console.error("Errore CSV:", err);
      byId("csvError").style.display = "block";
      if (window.track && window.track.csv_parse_error) window.track.csv_parse_error({ code: 'papaparse_error', ms: ms2 });
    }
  });
}

// --- Listino ---
function aggiornaListinoSelect() {
  var select = byId("listinoSelect");
  var searchTerm = (byId("searchListino").value || "").toLowerCase();
  select.innerHTML = "";

  for (var i=0;i<listino.length;i++){
    var item = listino[i];
    var hit = (item.codice || "").toLowerCase().indexOf(searchTerm) > -1 ||
              (item.descrizione || "").toLowerCase().indexOf(searchTerm) > -1;

    if (hit){
      var option = createEl("option");
      option.value = item.codice;
      option.textContent = item.codice + " - " + item.descrizione + " - €" + item.prezzoLordo;
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
  if (!select.value) return;

  var articolo = trovaInListino(select.value);
  if (!articolo) { alert("Errore: articolo non trovato nel listino."); return; }

  // clone semplice ES5
  var nuovo = {};
  for (var k in articolo) if (articolo.hasOwnProperty(k)) nuovo[k] = articolo[k];

  if (!autoPopolaCosti){
    nuovo.costoTrasporto = 0;
    nuovo.costoInstallazione = 0;
  }

  articoliAggiunti.push(nuovo);
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
}

// --- Calcoli riga ---
function calcNetto(a){
  var s1 = n(a.sconto);
  var s2 = n(a.sconto2);
  var lordo = n(a.prezzoLordo);
  return roundTwo(lordo * (1 - s1/100) * (1 - s2/100));
}

function calcPrezzoConMargine(netto, marginePerc){
  marginePerc = n(marginePerc);
  if (marginePerc <= 0) return roundTwo(netto);
  if (marginePerc >= 99.99) marginePerc = 99.99; // evita infinito
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

// --- Tabella ---
function aggiornaTabellaArticoli() {
  var tbody = document.querySelector("#articoli-table tbody");
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

function tdInp(index, field, value, minVal){
  var v = (typeof value === "number") ? value : n(value);
  var minAttr = (minVal != null) ? (" min='" + String(minVal) + "'") : "";
  return "<td><input type='number' value='" + v + "' data-index='" + index + "' data-field='" + field + "'" + minAttr + " oninput='aggiornaCampo(event)'></td>";
}

function esc(s){
  s = (s == null) ? "" : String(s);
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function aggiornaCampo(event) {
  var input = event.target;
  var index = parseInt(input.getAttribute("data-index"),10);
  var field = input.getAttribute("data-field");

  var val = n(input.value);

  if ((field==="sconto" || field==="sconto2" || field==="margine") && val < 0) val = 0;
  if (field==="quantita" && val < 1) val = 1;

  articoliAggiunti[index][field] = val;
  aggiornaTabellaArticoli();     // semplice e robusto (evita mismatch celle)
  aggiornaTotaliGenerali();
}

function rimuoviArticolo(index) {
  if (window.track && window.track.remove_item) window.track.remove_item();
  articoliAggiunti.splice(index, 1);
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
}

// --- Totali (Rivenditore come riferimento operativo) ---
function aggiornaTotaliGenerali() {
  var totNetto = 0;
  var totRiv = 0;
  var totVend = 0;
  var totDiff = 0;

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);

    var netto = calcNetto(a);
    var mRiv = getMargineRiv(a);
    var prezzoRiv = calcPrezzoConMargine(netto, mRiv);

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
  var html = "";
  html += "<strong>Totale Netto (dopo sconti):</strong> " + totNetto.toFixed(2) + "€<br>";
  html += "<strong>Totale Preventivo Rivenditore (con margine + servizi):</strong> " + totRiv.toFixed(2) + "€<br>";
  html += "<strong>Totale Venduto (se compilato):</strong> " + totVend.toFixed(2) + "€<br>";
  html += "<strong>Totale Differenza:</strong> " + totDiff.toFixed(2) + "€";
  holder.innerHTML = html;
}

// --- Manual row ---
function mostraFormArticoloManuale() {
  var tbody = document.querySelector("#articoli-table tbody");
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
}

function annullaArticoloManuale(){
  var row = byId("manual-input-row");
  if (row && row.parentNode) row.parentNode.removeChild(row);
}

// --- Report TXT / WhatsApp ---
function generaReportTesto(includeMargine){
  var showServ = byId("toggleMostraServizi") && byId("toggleMostraServizi").checked && autoPopolaCosti;

  var report = includeMargine ? "Report Articoli (Rivenditore - con Margine)\n\n" : "Report Articoli (Netto - senza Margine)\n\n";
  var tot = 0;

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);

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

    report += (i+1) + ". " + a.codice + " — " + a.descrizione + "\n";
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
  // app scheme + fallback (più affidabile su iOS)
  var appUrl = "whatsapp://send?text=" + encodeURIComponent(text);
  var webUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(text);

  var t = setTimeout(function(){ window.open(webUrl, "_blank"); }, 800);
  window.location = appUrl;
}

function openText(content){
  // download non affidabile su iOS: apri una pagina con <pre> stampabile/copiatibile
  var w = window.open("", "_blank");
  if (!w) { alert("Popup bloccato: abilita l'apertura finestre o usa Safari."); return; }
  w.document.open();
  w.document.write("<!doctype html><html><head><meta charset='utf-8'><title>Report</title></head><body style='font-family:monospace;white-space:pre-wrap;padding:12px;'>" +
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

// --- Preventivi stampabili (Riv / Cliente Finale) ---
function apriPreventivo(variant){
  if (window.track && window.track.open_preventivo) window.track.open_preventivo({ variant: variant });

  var mostraIVA = byId("preventivoMostraIVA") && byId("preventivoMostraIVA").checked;
  var mostraUnit = byId("preventivoPrezziUnitari") && byId("preventivoPrezziUnitari").checked;
  var ivaPerc = n(byId("ivaPerc").value);

  var titolo = (variant === 'cli') ? "Preventivo Cliente Finale" : "Preventivo Rivenditore";
  var margineCli = getMargineCli();

  var rowsHtml = "";
  var tot = 0;

  for (var i=0;i<articoliAggiunti.length;i++){
    var a = articoliAggiunti[i];
    var q = clampMin(n(a.quantita), 1);

    var netto = calcNetto(a);

    var prezzoUnit = 0;
    if (variant === 'cli'){
      prezzoUnit = calcPrezzoConMargine(netto, margineCli);
    } else {
      prezzoUnit = calcPrezzoConMargine(netto, getMargineRiv(a));
    }

    var serv = n(a.costoTrasporto) + n(a.costoInstallazione);
    var riga = roundTwo((prezzoUnit + serv) * q);
    tot += riga;

    rowsHtml += "<tr>";
    rowsHtml += "<td>" + esc(a.codice) + "</td>";
    rowsHtml += "<td style='text-align:left'>" + esc(a.descrizione) + "</td>";
    rowsHtml += "<td>" + q + "</td>";
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
  html += ".sub{color:#444;margin-bottom:12px}";
  html += "table{width:100%;border-collapse:collapse;margin-top:10px}";
  html += "th,td{border:1px solid #ddd;padding:8px;text-align:center;font-size:12px}";
  html += "th{background:#f3f5f7}";
  html += ".tot{margin-top:12px;font-size:14px;line-height:1.6}";
  html += ".btn{margin-top:14px;display:inline-block;padding:10px 12px;border:1px solid #ccc;background:#f8f8f8;cursor:pointer}";
  html += "@media print{.btn{display:none}}";
  html += "</style></head><body>";

  html += "<h1>" + esc(titolo) + "</h1>";
  html += "<div class='sub'>Generato da CSVXpressGold — " + new Date().toLocaleString() + "</div>";

  if (variant === 'cli'){
    html += "<div class='sub'><b>Margine Cliente Finale:</b> " + margineCli.toFixed(2) + "%</div>";
  } else {
    html += "<div class='sub'><b>Margine Rivenditore:</b> per riga (o default " + n(byId('margineRivDefault').value).toFixed(2) + "%)</div>";
  }

  html += "<table><thead><tr>";
  html += "<th>Codice</th><th style='text-align:left'>Descrizione</th><th>Q.tà</th><th>Netto</th>";
  if (mostraUnit) html += "<th>Prezzo Unit.</th>";
  html += "<th>Servizi</th><th>Totale Riga</th>";
  html += "</tr></thead><tbody>" + rowsHtml + "</tbody></table>";

  html += "<div class='tot'>";
  html += "<div><b>Imponibile:</b> " + imp.toFixed(2) + "€</div>";
  if (mostraIVA) html += "<div><b>IVA (" + ivaPerc.toFixed(2) + "%):</b> " + iva.toFixed(2) + "€</div>";
  html += "<div style='font-size:18px;margin-top:6px'><b>TOTALE:</b> " + totIva.toFixed(2) + "€</div>";
  html += "</div>";

  html += "<button class='btn' onclick='window.print()'>Stampa / Salva PDF</button>";
  html += "</body></html>";

  var w = window.open("", "_blank");
  if (!w) { alert("Popup bloccato: abilita l'apertura finestre o usa Safari."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
