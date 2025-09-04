/* ======================================================================
   Shiva Conexões — Relatórios (script limpo, sem login/usuários)
   ====================================================================== */

/* =========================
   Paleta p/ UI e PDF
   ========================= */
const THEME = {
  brand: "#E1262D",     // vermelho Shiva
  brandWeak: "#FFECEE",
  ink: "#0F1E3D",
  muted: "#5C6B84",
  border: "#E2E8F0",
  success: "#18A864",
  danger: "#E11D48",
};

/* =========================
   Storage
   ========================= */
const STORAGE_KEY = "relatorios-ensaio-v5";

/* =========================
   Helpers DOM / Utils
   ========================= */
const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+Math.random()).toString(36));
const el  = (t, attrs={}, html) => {
  const e = document.createElement(t);
  Object.entries(attrs||{}).forEach(([k,v]) => (k in e) ? (e[k]=v) : e.setAttribute(k,v));
  if (html != null) e.innerHTML = html;
  return e;
};
const splitList = s => (s||"").split(";").map(x=>x.trim()).filter(Boolean);
const sanitizeFileName = s => (s||"ensaio").replace(/[^\p{L}\p{N}\-_.]+/gu,"-").replace(/-+/g,"-").replace(/(^-|-$)/g,"");

/* =========================
   Microanimações (WAAPI)
   ========================= */
const Anim = {
  fadeIn(elm, dur=180, y=6){ elm.animate([{opacity:0, transform:`translateY(${y}px)`},{opacity:1, transform:"translateY(0)"}], {duration:dur, easing:"ease-out"}); },
  fadeOut(elm, dur=150, y=6){ return elm.animate([{opacity:1, transform:"translateY(0)"},{opacity:0, transform:`translateY(${y}px)`}], {duration:dur, easing:"ease-in", fill:"forwards"}).finished; },
  pulse(elm){ elm.animate([{transform:"scale(1)"},{transform:"scale(1.03)"},{transform:"scale(1)"}],{duration:280, easing:"ease-out"}); },
};

/* =========================
   Toast acessível
   ========================= */
function toast(msg, type="info"){
  const live = $("#ariaLive");
  const pill = el("div", {className:"toast", role:"status"});
  pill.style.cssText = `
    position:fixed; right:16px; bottom:16px; z-index:99999;
    background:${type==="error"?THEME.danger:(type==="success"?THEME.success:"#0f172a")};
    color:#fff; padding:10px 12px; border-radius:12px; box-shadow:0 8px 20px rgba(0,0,0,.12);
    font:600 13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Ubuntu;`;
  pill.textContent = msg;
  document.body.appendChild(pill);
  Anim.fadeIn(pill,180,4);
  setTimeout(()=> Anim.fadeOut(pill,180,4).then(()=>pill.remove()), 2300);
  if (live) { live.textContent = ""; setTimeout(()=> live.textContent = msg, 12); }
}

/* =========================
   Estado
   ========================= */
let relatorios = loadAll();
let atual = novoRelatorio();

/* =========================
   Init
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  // ano no rodapé
  const anoEl = $("#ano"); if (anoEl) anoEl.textContent = new Date().getFullYear();

  // UI polishes: cor, logo maior, alinhamentos, tabela responsiva, sombra topbar
  injectUIStyles();
  alignAddResultadoBtn();
  tableResponsiveLabels();
  topbarShadow();

  // Carrega UI
  preencherForm(atual);
  desenharLista();

  // Toggle aside
  $("#btnToggleAside")?.addEventListener("click", ()=>{
    document.body.classList.toggle("aside-collapsed");
    const btn = $("#btnToggleAside");
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    toast(document.body.classList.contains("aside-collapsed")?"Lista oculta":"Lista visível");
  });

  // Dinâmicos
  $("#btnAddAmostra")?.addEventListener("click", addAmostra);
  $("#btnAddResultado")?.addEventListener("click", addResultado);
  $("#btnAddImagem")?.addEventListener("click", addImagem);
  $("#btnNovoAnexo")?.addEventListener("click", addAnexo);

  // “Métodos e Materiais” -> atalho p/ Resultados
  $("#btnAddMetodo")?.addEventListener("click", addMetodoComoResultado);
  $("#btnLimparMetodo")?.addEventListener("click", limparCamposMetodo);

// Ações principais
$("#btnSalvar")?.addEventListener("click", salvarAtual);

// Imprimir: gera o PDF e manda imprimir o PDF (não o layout da página)
$("#btnImprimir")?.addEventListener("click", async () => {
  try {
    const blob = await gerarPDF({ returnBlob: true }); // << retorna Blob do PDF
    if (!blob) throw new Error("Falha ao gerar PDF.");

    const url = URL.createObjectURL(blob);

    // iframe invisível para chamar a impressão do PDF
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;

    iframe.onload = () => {
      // dá um pequeno tempo para o PDF renderizar dentro do iframe
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          // fallback: abre em nova aba
          window.open(url, "_blank");
        } finally {
          // libera o objeto URL depois de um tempo
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }
      }, 250);
    };

    document.body.appendChild(iframe);
    // remove o iframe depois de um tempo
    setTimeout(() => iframe.remove(), 15_000);
  } catch (err) {
    console.error(err);
    toast("Não foi possível imprimir o PDF.", "error");
  }
});

// Botão PDF: baixa o arquivo
$("#btnPDF")?.addEventListener("click", () => gerarPDF({ save: true }));


  // PDF (texto)
  $("#btnPDF")?.addEventListener("click", gerarPDF);

  // Filtro lista
  $("#filtroLista")?.addEventListener("input", desenharLista);
});

/* =========================
   Modelo
   ========================= */
function novoRelatorio(){
  return {
    id: uid(),
    numeroRelatorio: "",
    revisao: "",
    dataEmissao: "",
    responsavelTecnico: "",
    laboratorio: "",
    normasReferencia: "",
    amostras: [novaAmostra()],
    objetivo: "",                // (pode não existir no HTML)
    resultados: [],              // [{ensaio,resultado,requisito,conformidade}]
    discussao: "",               // idem
    conclusao: { status:"Conforme", observacoes:"" }, // idem
    anexos: { certificados:[], planilhas:[], fotos:[] }, // campos de texto
    anexosList: [],              // anexos de arquivo (Base64)
    imagens: [],                 // [{src, alt, legenda}]
    tabelasExtras: [],           // [{titulo, linhas:[[c1,c2],...]}]
    updatedAt: Date.now(),
  };
}
function novaAmostra(){
  return { descricao:"", tipo:"", dimensao:"", cor:"", processo:"", marca:"", lote:"", quantidade:"" };
}
function loadAll(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY))||[] }catch{ return [] }
}
function persistAll(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(relatorios));
}

/* =========================
   Form <-> Estado
   ========================= */
function preencherForm(r){
  const f=$("#formRelatorio"); if(!f) return;

  // Campos base
  f.numeroRelatorio && (f.numeroRelatorio.value=r.numeroRelatorio||"");
  f.revisao && (f.revisao.value=r.revisao||"");
  f.dataEmissao && (f.dataEmissao.value=r.dataEmissao||"");
  f.responsavelTecnico && (f.responsavelTecnico.value=r.responsavelTecnico||"");
  f.laboratorio && (f.laboratorio.value=r.laboratorio||"");
  const normasSel = $("#normasReferencia"); if (normasSel) normasSel.value = r.normasReferencia || "";

  // Campos opcionais
  f.objetivo && (f.objetivo.value=r.objetivo||"");
  f.discussao && (f.discussao.value=r.discussao||"");
  const conclRadio = (f.querySelector(`input[name="statusConclusao"][value="${r.conclusao?.status||"Conforme"}"]`));
  conclRadio && (conclRadio.checked=true);
  f.conclusaoObs && (f.conclusaoObs.value=r.conclusao?.observacoes||"");

  // Anexos (texto)
  f.anexosCertificados && (f.anexosCertificados.value=(r.anexos?.certificados||[]).join("; "));
  f.anexosPlanilhas && (f.anexosPlanilhas.value=(r.anexos?.planilhas||[]).join("; "));
  f.anexosFotos && (f.anexosFotos.value=(r.anexos?.fotos||[]).join("; "));

  // ID oculto (se tiver)
  f.id && (f.id.value=r.id);

  // Amostras
  const amDiv = $("#amostras");
  if(amDiv){
    amDiv.innerHTML="";
    (r.amostras||[]).forEach((a,i)=>{
      const card = amostraCard(a,i);
      amDiv.appendChild(card);
      Anim.fadeIn(card,140,6);
    });
  }

  // Resultados
  const tbodyRes = $("#tblResultados tbody");
  if(tbodyRes){
    tbodyRes.innerHTML="";
    (r.resultados||[]).forEach(row=>{
      const tr = resultadoRow(row);
      tbodyRes.appendChild(tr);
      Anim.fadeIn(tr,120,4);
    });
  }

  // Imagens
  const imgs = $("#imagens");
  if(imgs){
    imgs.innerHTML="";
    (r.imagens||[]).forEach(img=>{
      const card = imagemCard(img);
      imgs.appendChild(card);
      Anim.fadeIn(card,120,4);
    });
  }

  // Tabelas extras (opcional)
  const extras = $("#tabelasExtras");
  if(extras){
    extras.innerHTML="";
    (r.tabelasExtras||[]).forEach(tbl=>{
      const t = tabelaCard(tbl);
      extras.appendChild(t);
      Anim.fadeIn(t,120,4);
    });
  }

  // Anexos de arquivo (lista)
  renderAnexosList(r.anexosList||[]);
}

function coletarForm(){
  const f=$("#formRelatorio");
  return {
    id:(f.id?.value)||uid(),
    numeroRelatorio:f.numeroRelatorio?.value.trim()||"",
    revisao:f.revisao?.value.trim()||"",
    dataEmissao:f.dataEmissao?.value||"",
    responsavelTecnico:f.responsavelTecnico?.value.trim()||"",
    laboratorio:f.laboratorio?.value.trim()||"",
    normasReferencia: $("#normasReferencia")?.value || "",

    amostras: $$("[data-amostra]",$("#amostras")).map(card=>({
      descricao:$(".a-descricao",card)?.value.trim()||"",
      tipo:$(".a-tipo",card)?.value.trim()||"",
      dimensao:$(".a-dimensao",card)?.value.trim()||"",
      cor:$(".a-cor",card)?.value.trim()||"",
      processo:$(".a-processo",card)?.value.trim()||"",
      marca:$(".a-marca",card)?.value.trim()||"",
      lote:$(".a-lote",card)?.value.trim()||"",
      quantidade:$(".a-quantidade",card)?.value.trim()||""
    })),

    objetivo:f.objetivo?.value.trim()||"",
    resultados:$$("#tblResultados tbody tr").map(tr=>({
      ensaio:$(".r-ensaio",tr)?.value.trim()||"",
      resultado:$(".r-resultado",tr)?.value.trim()||"",
      requisito:$(".r-requisito",tr)?.value.trim()||"",
      conformidade:$(".r-conf",tr)?.value||"Conforme"
    })),
    discussao:f.discussao?.value.trim()||"",
    conclusao:{
      status:(f.querySelector('input[name="statusConclusao"]:checked')?.value||"Conforme"),
      observacoes:f.conclusaoObs?.value.trim()||""
    },

    anexos:{
      certificados: f.anexosCertificados ? splitList(f.anexosCertificados.value) : [],
      planilhas:    f.anexosPlanilhas ? splitList(f.anexosPlanilhas.value) : [],
      fotos:        f.anexosFotos ? splitList(f.anexosFotos.value) : [],
    },

    imagens: $$("[data-img]").map(w=>({
      src:$(".img-url",w)?.value.trim()||"",
      alt:$(".img-alt",w)?.value.trim()||"",
      legenda:$(".img-cap",w)?.value.trim()||""
    })).filter(i=>i.src),

    tabelasExtras: $$("[data-tabela]").map(box=>({
      titulo:$(".tb-title",box)?.value.trim()||"",
      linhas: $$("tbody tr",box).map(tr=>[
        (tr.cells[0]?.innerText||"").trim(),
        (tr.cells[1]?.innerText||"").trim()
      ])
    })),

    anexosList: _coletarAnexosList(),

    updatedAt:Date.now()
  };
}

function salvarAtual(){
  const form = $("#formRelatorio");
  if(form && !form.reportValidity()) return;
  const data = coletarForm();
  data.updatedAt = Date.now();
  const ix = relatorios.findIndex(r=>r.id===data.id);
  if(ix>=0) relatorios[ix]=data; else relatorios.unshift(data);
  persistAll();
  desenharLista();
  toast("Relatório salvo!", "success");
}

/* =========================
   Métodos -> Resultados
   ========================= */
function addMetodoComoResultado(){
  const ensaio = $("#ensaioRealizado")?.value || "";
  const requisito = $("#metodo")?.value || "";
  const resultadoSel = $("#resultado")?.value || "";
  const amostrasTxt = $("#amostrasSelect")?.value || "";

  if(!ensaio){ toast("Selecione o ‘Ensaio realizado’.","error"); return; }
  if(!resultadoSel){ toast("Selecione o ‘Resultado’.","error"); return; }

  const conformidade = (resultadoSel.toLowerCase()==="aprovado") ? "Conforme" : "Não conforme";
  const resultadoTxt = amostrasTxt ? `${resultadoSel.toUpperCase()} • Amostras: ${amostrasTxt}` : resultadoSel.toUpperCase();

  const tr = resultadoRow({ ensaio, resultado: resultadoTxt, requisito, conformidade });
  $("#tblResultados tbody").appendChild(tr);
  Anim.fadeIn(tr,140,6);
  toast("Método incluído em ‘Resultados’.","success");
}
function limparCamposMetodo(){
  $("#ensaioRealizado") && ($("#ensaioRealizado").value = "");
  $("#amostrasSelect") && ($("#amostrasSelect").value = "");
  $("#metodo") && ($("#metodo").value = "");
  $("#resultado") && ($("#resultado").value = "");
}

/* =========================
   Amostras
   ========================= */
function amostraCard(a={},idx=0){
  const d=el("div",{className:"grid"}); d.dataset.amostra=idx;
  d.innerHTML=`<label>Descrição <input class="a-descricao" value="${a.descricao||""}" required></label>
  <label>Tipo <input class="a-tipo" value="${a.tipo||""}"></label>
  <label>Dimensão nominal <input class="a-dimensao" value="${a.dimensao||""}"></label>
  <label>Cor <input class="a-cor" value="${a.cor||""}"></label>
  <label>Processo <input class="a-processo" value="${a.processo||""}"></label>
  <label>Marca <input class="a-marca" value="${a.marca||""}"></label>
  <label>Lote/Nº amostra <input class="a-lote" value="${a.lote||""}"></label>
  <label>Qtd. <input class="a-quantidade" value="${a.quantidade||""}" type="number" min="0"></label>
  <div><button type="button" class="btn btn--secondary" data-remove>Remover</button></div>`;
  $("button[data-remove]",d).addEventListener("click", async ()=>{
    await Anim.fadeOut(d,150,6); d.remove(); toast("Amostra removida");
  });
  return d;
}
function addAmostra(){
  const card = amostraCard(novaAmostra());
  $("#amostras").appendChild(card);
  Anim.fadeIn(card,160,8);
}

/* =========================
   Resultados (tabela)
   ========================= */
function resultadoRow(r={}){
  const tr=el("tr");
  tr.innerHTML=`<td><input class="r-ensaio" value="${r.ensaio||""}" placeholder="Ensaio"></td>
  <td><input class="r-resultado" value="${r.resultado||""}" placeholder="Resultado"></td>
  <td><input class="r-requisito" value="${r.requisito||""}" placeholder="Requisito normativo"></td>
  <td><select class="r-conf"><option ${r.conformidade==="Conforme"?"selected":""}>Conforme</option><option ${r.conformidade==="Não conforme"?"selected":""}>Não conforme</option></select></td>
  <td><button type="button" class="btn-mini danger del">Excluir</button></td>`;
  $(".del",tr).addEventListener("click", async ()=>{
    if(!confirm("Excluir esta linha de resultado?")) return;
    await Anim.fadeOut(tr,130,4); tr.remove();
  });
  return tr;
}
function addResultado(){
  const tr = resultadoRow({});
  $("#tblResultados tbody").appendChild(tr);
  Anim.fadeIn(tr,140,6);
}

/* =========================
   Imagens
   ========================= */
function imagemCard(obj={src:"",alt:"",legenda:""}){
  const div=el("div",{className:"grid"}); div.dataset.img="1";
  div.innerHTML=`
    <label>Imagem (URL ou selecione arquivo)
      <input class="img-url" type="url" value="${obj.src||""}" placeholder="https://..." />
      <input type="file" class="img-file" accept="image/*"/>
    </label>
    <label>Legenda <input class="img-cap" value="${obj.legenda||""}" placeholder="Ex.: Foto da amostra A"/></label>
    <label>Texto alternativo (acessibilidade) <input class="img-alt" value="${obj.alt||""}" placeholder="Descrição breve"/></label>
    <div><button type="button" class="btn btn--secondary" data-remove>Remover</button></div>`;
  $("button[data-remove]",div).addEventListener("click", async ()=>{
    if(!confirm("Remover esta imagem?")) return;
    await Anim.fadeOut(div,130,4); div.remove();
  });
  $(".img-file",div).addEventListener("change", e=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{ $(".img-url",div).value=reader.result; Anim.pulse($(".img-url",div)); toast("Imagem carregada","success"); };
    reader.readAsDataURL(file);
  });
  return div;
}
function addImagem(){
  const card = imagemCard();
  $("#imagens").appendChild(card);
  Anim.fadeIn(card,140,6);
}

/* =========================
   Tabelas Extras (se existir caixa no HTML)
   ========================= */
function tabelaCard(data={titulo:"",linhas:[["",""]]}){
  const div=el("div",{className:"extra-table"}); div.dataset.tabela="1";
  let html=`
    <div class="grid">
      <label>Título da tabela
        <input class="tb-title" value="${data.titulo||""}" placeholder="Ex.: Medições dimensionais"/>
      </label>
    </div>
    <table class="tabela extra"><tbody>`;
  (data.linhas||[["",""]]).forEach(row=>{
    html+=`<tr><td contenteditable="true">${row[0]||""}</td><td contenteditable="true">${row[1]||""}</td></tr>`;
  });
  html+=`</tbody></table>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button type="button" class="btn btn--secondary add-row">+ Linha</button>
      <button type="button" class="btn btn--secondary" data-remove>Remover tabela</button>
    </div>`;
  div.innerHTML=html;
  $(".add-row",div).addEventListener("click",()=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td contenteditable="true"></td><td contenteditable="true"></td>`;
    $("tbody",div).appendChild(tr);
    Anim.fadeIn(tr,120,4);
  });
  $("button[data-remove]",div).addEventListener("click", async ()=>{
    if(!confirm("Remover esta tabela?")) return;
    await Anim.fadeOut(div,130,4); div.remove();
  });
  return div;
}
function addTabela(){
  const host = $("#tabelasExtras");
  if(!host){ toast("Área de ‘Tabelas adicionais’ não existe neste layout.","error"); return; }
  const t = tabelaCard({});
  host.appendChild(t);
  Anim.fadeIn(t,140,6);
}

/* =========================
   Anexos (lista com arquivo)
   ========================= */
function addAnexo(){
  const desc = $("#descricao")?.value.trim();
  const file = $("#arquivo")?.files?.[0];
  if(!desc) { toast("Informe a descrição do anexo.","error"); return; }
  if(!file) { toast("Selecione um arquivo.","error"); return; }
  const r = new FileReader();
  r.onload = ()=> {
    const item = { descricao: desc, name: file.name, dataUrl: r.result };
    const data = coletarForm();
    data.anexosList = [...(data.anexosList||[]), item];
    const ix = relatorios.findIndex(x=>x.id===data.id);
    if(ix>=0) relatorios[ix] = data; else relatorios.unshift(data);
    persistAll(); renderAnexosList(data.anexosList);
    $("#descricao").value = ""; $("#arquivo").value = "";
    toast("Anexo adicionado.","success");
  };
  r.readAsDataURL(file);
}
function renderAnexosList(list){
  const wrap = $("#anexos"); if(!wrap) return;
  wrap.querySelector(".anexos-list")?.remove();
  const ul = document.createElement("ul"); ul.className="anexos-list";
  ul.style.cssText = "list-style:none;padding-left:0;margin-top:8px;display:grid;gap:6px;";
  (list||[]).forEach((a,i) => {
    const li = document.createElement("li");
    li.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:#fff;">
      <div style="min-width:0;">
        <strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(a.descricao)}</strong>
        <small style="color:var(--muted);">${escapeHtml(a.name||"arquivo")}</small>
      </div>
      <div style="display:flex;gap:6px;">
        <a download="${sanitizeFileName(a.name||'anexo')}" href="${a.dataUrl}" class="btn-mini">Baixar</a>
        <button class="btn-mini danger" data-del="${i}">Excluir</button>
      </div>
    </div>`;
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  ul.addEventListener("click",(e)=>{
    const b = e.target.closest("button[data-del]"); if(!b) return;
    const idx = Number(b.dataset.del);
    const data = coletarForm();
    data.anexosList.splice(idx,1);
    const ix = relatorios.findIndex(x=>x.id===data.id);
    if(ix>=0) relatorios[ix] = data; else relatorios.unshift(data);
    persistAll(); renderAnexosList(data.anexosList);
    toast("Anexo removido");
  });
}
function _coletarAnexosList(){
  const items = [];
  $$(".anexos-list li").forEach(li=>{
    const t = li.querySelector("strong")?.textContent || "";
    const n = li.querySelector("small")?.textContent || "";
    const a = li.querySelector("a[download]");
    const href = a?.getAttribute("href") || "";
    items.push({ descricao:t, name:n, dataUrl:href });
  });
  return items;
}

/* =========================
   Lista lateral (salvos)
   ========================= */
function desenharLista(){
  const termo=($("#filtroLista")?.value||"").toLowerCase();
  const ul=$("#listaRelatorios"); if(!ul) return;
  ul.innerHTML="";
  relatorios
    .filter(r=>[r.numeroRelatorio,r.responsavelTecnico,r.laboratorio].join(" ").toLowerCase().includes(termo))
    .sort((a,b)=>b.updatedAt-a.updatedAt)
    .forEach(r=>{
      const li=el("li");
      li.innerHTML=`<strong>${r.numeroRelatorio||"(sem nº)"} – ${r.responsavelTecnico||"?"}</strong>
        <span class="meta">${new Date(r.updatedAt).toLocaleString()} • ${r.laboratorio||""}</span>
        <div class="row-actions" style="display:flex;gap:8px;margin-top:8px;">
          <button data-open class="btn-mini">Abrir</button>
          <button data-delete class="btn-mini danger">Apagar</button>
        </div>`;
      $("button[data-open]",li).addEventListener("click",()=>{
        atual=r; preencherForm(atual); toast("Relatório carregado");
      });
      $("button[data-delete]",li).addEventListener("click", async ()=>{
        if(!confirm("Apagar este relatório?")) return;
        await Anim.fadeOut(li,130,4);
        relatorios=relatorios.filter(x=>x.id!==r.id);
        persistAll(); desenharLista(); toast("Relatório apagado");
      });
      ul.appendChild(li);
      Anim.fadeIn(li,120,4);
    });
  if(!ul.children.length){ const li=el("li"); li.textContent="Nenhum relatório salvo."; ul.appendChild(li); }
}

/* =========================
   PDF (texto) — jsPDF
   ========================= */
function loadImageAsDataURL(url){
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error("URL vazia"));
    if (/^data:image\//i.test(url)) return resolve(url);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try{
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      }catch(err){ reject(err); }
    };
    img.onerror = reject;
    img.src = url;
  });
}
function getImageFormatFromDataURL(dataUrl){
  if (typeof dataUrl !== "string") return "JPEG";
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  return "JPEG";
}
async function getLogoDataURL() {
  const logoEl = document.querySelector('.brand img');
  const src = logoEl?.src || 'Shiva.png'; // fallback
  try { return await loadImageAsDataURL(src); } catch { return null; }
}

async function gerarPDF(){
  if (!window.jspdf || !window.jspdf.jsPDF){
    toast("jsPDF não está carregado. Confira a tag no <head>.", "error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const r = coletarForm();
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN_X = 40, MARGIN_TOP = 50, MARGIN_BOTTOM = 40;
  let y = MARGIN_TOP;

  const LOGO_DURL = await getLogoDataURL();
  const LOGO_FMT  = LOGO_DURL ? getImageFormatFromDataURL(LOGO_DURL) : null;
  let logoDims = { w: 110, h: 32 };
  if (LOGO_DURL) {
    const img = new Image(); img.src = LOGO_DURL;
    await new Promise(res => (img.complete ? res() : (img.onload = res)));
    const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
    logoDims.h = Math.round(logoDims.w * ratio);
  }

  const addHeader = () => {
    let headerBottomY;
    if (LOGO_DURL) {
      doc.addImage(LOGO_DURL, LOGO_FMT, MARGIN_X, y - 20, logoDims.w, logoDims.h);
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(THEME.ink);
      const titleX = MARGIN_X + logoDims.w + 12; const titleY = Math.max(y + 8, y - 20 + logoDims.h * 0.6);
      doc.text("Relatório de Ensaio – PVC-U", titleX, titleY);
      headerBottomY = Math.max(y - 20 + logoDims.h, titleY + 4);
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(THEME.ink);
      doc.text("Relatório de Ensaio – PVC-U", MARGIN_X, y);
      headerBottomY = y + 10;
    }
    doc.setDrawColor(190); doc.line(MARGIN_X, headerBottomY + 6, PAGE_W - MARGIN_X, headerBottomY + 6);
    y = headerBottomY + 24; doc.setFont("helvetica", "normal");
  };
  const addFooter = () => {
    const pageNum = doc.internal.getNumberOfPages();
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Relatório ${r.numeroRelatorio || "-"} • pág. ${pageNum}`, PAGE_W - MARGIN_X, PAGE_H - 20, { align: "right" });
    if (LOGO_DURL) { doc.addImage(LOGO_DURL, LOGO_FMT, MARGIN_X, PAGE_H - 32, 60, Math.max(18, Math.round(60 * (logoDims.h / Math.max(1, logoDims.w))))); }
  };
  const ensureSpace = (h=18)=>{ if (y + h > PAGE_H - MARGIN_BOTTOM) { addFooter(); doc.addPage(); y = MARGIN_TOP; addHeader(); } };
  const title = (t) => { ensureSpace(24); doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(THEME.brand); doc.text(t, MARGIN_X, y); y += 14; doc.setFont("helvetica","normal"); doc.setFontSize(11); doc.setTextColor(THEME.ink); };
  const paragraph = (txt, width=PAGE_W - 2*MARGIN_X, lineH=14) => { const lines = doc.splitTextToSize(txt || "-", width); lines.forEach(()=>ensureSpace(lineH)); doc.text(lines, MARGIN_X, y); y += lines.length * lineH + 6; };
  const kv = (k,v) => paragraph(`${k}: ${v||"-"}`);

  // Conteúdo
  addHeader();

  title("1. Identificação do Relatório");
  kv("Número", r.numeroRelatorio);
  kv("Revisão", r.revisao);
  kv("Data de emissão", r.dataEmissao);
  kv("Responsável Técnico", r.responsavelTecnico);
  kv("Laboratório", r.laboratorio);
  kv("Normas de referência", r.normasReferencia || "-");

  title("2. Identificação da(s) Amostra(s)");
  (r.amostras||[]).forEach((a,i)=>{
    paragraph(`Amostra ${i+1}: ${[
      a.descricao && `Descrição: ${a.descricao}`,
      a.tipo && `Tipo: ${a.tipo}`,
      a.dimensao && `Dimensão nominal: ${a.dimensao}`,
      a.cor && `Cor: ${a.cor}`,
      a.processo && `Processo: ${a.processo}`,
      a.marca && `Marca: ${a.marca}`,
      a.lote && `Lote/Nº: ${a.lote}`,
      a.quantidade && `Qtd.: ${a.quantidade}`
    ].filter(Boolean).join(" | ")}`);
  });

  if ($("#formRelatorio").objetivo){ // imprime essa seção só se existir no HTML
    title("3. Objetivo do Ensaio");
    paragraph(r.objetivo);
    title("4. Métodos e Materiais Empregados");
    paragraph("Cadastro interno utilizado como atalho para ‘Resultados’.");
    title("5. Resultados dos Ensaios");
  } else {
    title("3. Resultados dos Ensaios");
  }

  const rows = r.resultados || [];
  if (!rows.length) paragraph("Sem resultados informados.");
  else rows.forEach(res => {
    ensureSpace(42);
    doc.setFont("helvetica","bold"); doc.text(`• ${res.ensaio || "-"}`, MARGIN_X, y); y += 14;
    doc.setFont("helvetica","normal");
    paragraph(`Resultado: ${res.resultado || "-"}`);
    paragraph(`Requisito normativo: ${res.requisito || "-"}`);
    doc.setTextColor(res.conformidade === "Conforme" ? THEME.success : THEME.danger);
    paragraph(`Conformidade: ${res.conformidade || "-"}`);
    doc.setTextColor(THEME.ink);
    y += 2;
  });

  if ($("#formRelatorio").discussao){
    title("6. Discussão dos Resultados"); paragraph(r.discussao);
    title("7. Conclusão"); paragraph(`Status: ${r.conclusao?.status || "-"}`); paragraph(r.conclusao?.observacoes || "");
    title("8. Anexos (categorias)");
  } else {
    title("4. Anexos (categorias)");
  }
  paragraph(`Certificados: ${(r.anexos?.certificados||[]).join("; ") || "-"}`);
  paragraph(`Planilhas/Gráficos: ${(r.anexos?.planilhas||[]).join("; ") || "-"}`);
  paragraph(`Fotos das amostras: ${(r.anexos?.fotos||[]).join("; ") || "-"}`);

  if ((r.anexosList||[]).length){
    title("Anexos (arquivos)");
    (r.anexosList||[]).forEach(a => paragraph(`• ${a.descricao} (${a.name||"arquivo"})`));
  }

  title("Imagens");
  if ((r.imagens||[]).length){
    const thumbW = 220, thumbMaxH = 160, gap = 14;
    let col = 0;
    for (let i=0;i<r.imagens.length;i++){
      const it = r.imagens[i];
      const url = (typeof it === "string") ? it : it.src;
      const legenda = (typeof it === "object" ? it.legenda : "") || `Figura ${i+1}`;
      try{
        const dataUrl = await loadImageAsDataURL(url);
        const img = new Image(); img.src = dataUrl;
        await new Promise(res => { if (img.complete) res(); else img.onload = res; });
        const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
        const h = Math.min(thumbW * ratio, thumbMaxH);
        const w = thumbW;
        ensureSpace(h + 18);
        const x = MARGIN_X + col * (w + gap);
        doc.addImage(dataUrl, getImageFormatFromDataURL(dataUrl), x, y, w, h);
        doc.setFontSize(9); doc.setTextColor(100);
        doc.text(legenda, x, y + h + 10);
        doc.setTextColor(THEME.ink);
        if (col === 1){ y += h + 26; col = 0; } else { col = 1; }
      }catch{
        ensureSpace(14);
        doc.setFontSize(10); doc.setTextColor(150);
        doc.text(`(Não foi possível carregar a imagem ${i+1})`, MARGIN_X, y);
        y += 16; doc.setTextColor(THEME.ink);
      }
    }
    if (col === 1) y += 8;
  } else {
    paragraph("Nenhuma imagem anexada.");
  }

  // Tabelas extras (opcional)
  if ((r.tabelasExtras||[]).length){
    title("Tabelas adicionais");
    const colW = (PAGE_W - 2*MARGIN_X - 20) / 2;
    const lineH = 14;
    (r.tabelasExtras||[]).forEach((tbl, idxTbl) => {
      ensureSpace(18);
      doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(THEME.ink);
      const titulo = tbl?.titulo ? `Tabela ${idxTbl+1} — ${tbl.titulo}` : `Tabela ${idxTbl+1}`;
      doc.text(titulo, MARGIN_X, y); y += 12;
      doc.setFont("helvetica","normal"); doc.setFontSize(10);

      const linhas = tbl?.linhas || tbl || [];
      if (!linhas.length){ paragraph("(sem dados)"); return; }

      ensureSpace(lineH);
      doc.setFont("helvetica","bold");
      doc.text("Coluna 1", MARGIN_X, y);
      doc.text("Coluna 2", MARGIN_X + colW + 20, y);
      doc.setFont("helvetica","normal");
      y += 10;

      linhas.forEach((row) => {
        const c1 = (row?.[0] ?? "").toString();
        const c2 = (row?.[1] ?? "").toString();
        const c1Lines = doc.splitTextToSize(c1, colW);
        const c2Lines = doc.splitTextToSize(c2, colW);
        const h = Math.max(c1Lines.length, c2Lines.length) * lineH;

        ensureSpace(h + 4);
        c1Lines.forEach((ln, i) => doc.text(ln, MARGIN_X, y + i*lineH));
        c2Lines.forEach((ln, i) => doc.text(ln, MARGIN_X + colW + 20, y + i*lineH));
        y += h + 4;
      });

      y += 6;
    });
  }

  addFooter();
  doc.save(`relatorio-${sanitizeFileName(r.numeroRelatorio)||"ensaio"}.pdf`);
}

/* =========================
   Miscelânea
   ========================= */
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
  ));
}

/* =========================
   UI polish helpers
   ========================= */
function injectUIStyles(){
  const style = document.createElement("style");
  style.textContent = `
    .brand img { width: 68px; height: 68px; object-fit: contain; } /* logo maior */
    .btn--primary, .btn.btn--primary {
      background:${THEME.brand} !important; border-color:${THEME.brand} !important; color:#fff !important;
    }
    .btn--primary:hover { filter: brightness(0.96); }
    /* botões de ação em vermelho Shiva */
    #btnPDF, #btnAddResultado, #btnAddImagem, #btnAddAmostra {
      border-color:${THEME.brand} !important; color:${THEME.brand} !important;
    }
    #btnPDF:hover, #btnAddResultado:hover, #btnAddImagem:hover, #btnAddAmostra:hover {
      background:${THEME.brandWeak} !important;
    }
  `;
  document.head.appendChild(style);
}
function alignAddResultadoBtn(){
  const wrap = $(".tabela-wrap");
  const btn = $("#btnAddResultado");
  if (wrap && btn && wrap.nextElementSibling !== btn) { wrap.after(btn); }
  if (btn){
    btn.style.margin = ".6rem 0 1rem 0";
    btn.style.display = "inline-flex";
    btn.style.verticalAlign = "middle";
    btn.style.alignItems = "center";
    btn.style.gap = ".4rem";
  }
}
function tableResponsiveLabels(){
  const tbl = $("#tblResultados"); if (!tbl) return;
  const headers = $$("thead th", tbl).map(th => th.textContent.trim());
  const apply = () => $$("tbody tr", tbl).forEach(tr => $$("td", tr).forEach((td, i) => td.setAttribute("data-label", headers[i] || "")));
  apply(); new MutationObserver(apply).observe(tbl.tBodies[0], { childList: true, subtree: true });
}
function topbarShadow(){
  const topbar = $(".topbar");
  const onScroll = () => topbar?.classList.toggle("is-scrolled", window.scrollY > 4);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
}
