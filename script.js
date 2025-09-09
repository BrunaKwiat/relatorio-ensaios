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

/* ==== NOVO: mapeamento de temas para meta tags / ajustes === */
const THEME_KEY = "ui-theme";
const THEME_META = {
  claro: { colorScheme: "light", themeColor: "#0E3554" },
  escuro: { colorScheme: "dark", themeColor: "#121933" },
  marinho: { colorScheme: "dark", themeColor: "#10253f" },
  sepia: { colorScheme: "light", themeColor: "#9c6b3c" },
};

/* =========================
   Storage
   ========================= */
const STORAGE_KEY = "relatorios-ensaio-v5";

/* =========================
   Helpers DOM / Utils
   ========================= */
const FORNECEDOR_FIXO = "MARINI INDUSTRIA E COMERCIO DE PLÁSTICO";
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(36));
const el = (t, attrs = {}, html) => {
  const e = document.createElement(t);
  Object.entries(attrs || {}).forEach(([k, v]) => (k in e) ? (e[k] = v) : e.setAttribute(k, v));
  if (html != null) e.innerHTML = html;
  return e;
};
const splitList = s => (s || "").split(";").map(x => x.trim()).filter(Boolean);
const sanitizeFileName = s => (s || "ensaio").replace(/[^\p{L}\p{N}\-_.]+/gu, "-").replace(/-+/g, "-").replace(/(^-|-$)/g, "");

/* =========================
   Microanimações (WAAPI)
   ========================= */
const Anim = {
  fadeIn(elm, dur = 180, y = 6) { elm.animate([{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: "translateY(0)" }], { duration: dur, easing: "ease-out" }); },
  fadeOut(elm, dur = 150, y = 6) { return elm.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: `translateY(${y}px)` }], { duration: dur, easing: "ease-in", fill: "forwards" }).finished; },
  pulse(elm) { elm.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 280, easing: "ease-out" }); },
};

/* =========================
   Toast acessível
   ========================= */
function toast(msg, type = "info") {
  const live = $("#ariaLive");
  const pill = el("div", { className: "toast", role: "status" });
  pill.style.cssText = `
    position:fixed; right:16px; bottom:16px; z-index:99999;
    background:${type === "error" ? THEME.danger : (type === "success" ? THEME.success : "#0f172a")};
    color:#fff; padding:10px 12px; border-radius:12px; box-shadow:0 8px 20px rgba(0,0,0,.12);
    font:600 13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Ubuntu;`;
  pill.textContent = msg;
  document.body.appendChild(pill);
  Anim.fadeIn(pill, 180, 4);
  setTimeout(() => Anim.fadeOut(pill, 180, 4).then(() => pill.remove()), 2300);
  if (live) { live.textContent = ""; setTimeout(() => live.textContent = msg, 12); }
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

  // Tema (aplica persistido, liga o dialog)
  initThemeFromStorage();
  setupThemeDialog();

  // Datas (período de inspeção)
  hookPeriodoDates();

  // UI polishes: cor, logo maior, alinhamentos, tabela responsiva, sombra topbar
  injectUIStyles();
  alignAddResultadoBtn();
  tableResponsiveLabels();
  topbarShadow();

  // Carrega UI
  preencherForm(atual);
  desenharLista();

  // Toggle aside (se existir)
  $("#btnToggleAside")?.addEventListener("click", () => {
    document.body.classList.toggle("aside-collapsed");
    const btn = $("#btnToggleAside");
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    toast(document.body.classList.contains("aside-collapsed") ? "Lista oculta" : "Lista visível");
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

  // Imprimir (gera PDF e imprime o PDF)
  $("#btnImprimir")?.addEventListener("click", async () => {
    try {
      const blob = await gerarPDF({ returnBlob: true });
      if (!blob) throw new Error("Falha ao gerar PDF.");
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            window.open(url, "_blank");
          } finally {
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
          }
        }, 250);
      };
      document.body.appendChild(iframe);
      setTimeout(() => iframe.remove(), 15_000);
    } catch (err) {
      console.error(err);
      toast("Não foi possível imprimir o PDF.", "error");
    }
  });

  // Botão PDF: baixa o arquivo
  $("#btnPDF")?.addEventListener("click", () => gerarPDF({ save: true }));


  // Filtro lista
  $("#filtroLista")?.addEventListener("input", desenharLista);
});

/* =========================
   Modelo
   ========================= */
function novoRelatorio() {
  return {
    id: uid(),
    numeroRelatorio: "",
    ordemProducao: "",
    fornecedorFabricante: FORNECEDOR_FIXO,
    interessado: "",
    revisao: "",
    dataEmissao: "",
    responsavelTecnico: "",
    laboratorio: "",
    quantidade: "1", // ✅ add isto
    normasReferencia: "",
    periodo: { inicio: "", fim: "" },
    amostras: [novaAmostra()],
    objetivo: "",
    resultados: [],
    discussao: "",
    conclusao: { status: "Conforme", observacoes: "" },
    anexos: { certificados: [], planilhas: [], fotos: [] },
    anexosList: [],
    imagens: [],
    tabelasExtras: [],
    updatedAt: Date.now(),
  };
}

function novaAmostra() {
  return { descricao: "", tipo: "", dimensao: "", cor: "", processo: "", marca: "", amostra: "", lote: "" };
}
function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}
function persistAll() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(relatorios));
}

/* =========================
   Form <-> Estado
   ========================= */
function preencherForm(r) {
  const f = $("#formRelatorio"); if (!f) return;

  // Campos base
  f.numeroRelatorio && (f.numeroRelatorio.value = r.numeroRelatorio || "");
  f.ordemProducao && (f.ordemProducao.value = r.ordemProducao || "");
  f.fornecedorFabricante && (f.fornecedorFabricante.value = r.fornecedorFabricante || "");
  f.interessado && (f.interessado.value = r.interessado || "");
  f.revisao && (f.revisao.value = r.revisao || "");
  f.dataEmissao && (f.dataEmissao.value = r.dataEmissao || "");
  f.responsavelTecnico && (f.responsavelTecnico.value = r.responsavelTecnico || "");
  f.laboratorio && (f.laboratorio.value = r.laboratorio || "");
  f.quantidade && (f.quantidade.value = r.quantidade || "1");

  const normasSel = $("#normasReferencia"); if (normasSel) normasSel.value = r.normasReferencia || "";

  // NOVO: Período (datas)
  const di = $("#dataInicio"), df = $("#dataFim");
  if (di) di.value = (r.periodo?.inicio || "");
  if (df) df.value = (r.periodo?.fim || "");
  // aplica as restrições ao carregar
  enforcePeriodoRules();

  // Opcionais
  f.objetivo && (f.objetivo.value = r.objetivo || "");
  f.discussao && (f.discussao.value = r.discussao || "");
  const conclRadio = (f.querySelector(`input[name="statusConclusao"][value="${r.conclusao?.status || "Conforme"}"]`));
  conclRadio && (conclRadio.checked = true);
  f.conclusaoObs && (f.conclusaoObs.value = r.conclusao?.observacoes || "");

  // Anexos (texto)
  f.anexosCertificados && (f.anexosCertificados.value = (r.anexos?.certificados || []).join("; "));
  f.anexosPlanilhas && (f.anexosPlanilhas.value = (r.anexos?.planilhas || []).join("; "));
  f.anexosFotos && (f.anexosFotos.value = (r.anexos?.fotos || []).join("; "));

  // ID oculto (se tiver)
  f.id && (f.id.value = r.id);

  // Amostras
  const amDiv = $("#amostras");
  if (amDiv) {
    amDiv.innerHTML = "";
    (r.amostras || []).forEach((a, i) => {
      const card = amostraCard(a, i);
      amDiv.appendChild(card);
      Anim.fadeIn(card, 140, 6);
    });
  }

  // Resultados
  const tbodyRes = $("#tblResultados tbody");
  if (tbodyRes) {
    tbodyRes.innerHTML = "";
    (r.resultados || []).forEach(row => {
      const tr = resultadoRow(row);
      tbodyRes.appendChild(tr);
      Anim.fadeIn(tr, 120, 4);
    });
  }

  // Imagens
  const imgs = $("#imagens");
  if (imgs) {
    imgs.innerHTML = "";
    (r.imagens || []).forEach(img => {
      const card = imagemCard(img);
      imgs.appendChild(card);
      Anim.fadeIn(card, 120, 4);
    });
  }

  // Tabelas extras (opcional)
  const extras = $("#tabelasExtras");
  if (extras) {
    extras.innerHTML = "";
    (r.tabelasExtras || []).forEach(tbl => {
      const t = tabelaCard(tbl);
      extras.appendChild(t);
      Anim.fadeIn(t, 120, 4);
    });
  }

  // Anexos de arquivo (lista)
  renderAnexosList(r.anexosList || []);
}

function coletarForm() {
  const f = $("#formRelatorio");
  return {
    id: (f.id?.value) || uid(),
    numeroRelatorio: f.numeroRelatorio?.value.trim() || "",
    ordemProducao: f.ordemProducao?.value.trim() || "",
    fornecedorFabricante: f.fornecedorFabricante?.value.trim() || "",
    interessado: f.interessado?.value.trim() || "",
    revisao: f.revisao?.value.trim() || "",
    dataEmissao: f.dataEmissao?.value || "",
    responsavelTecnico: f.responsavelTecnico?.value.trim() || "",
    laboratorio: f.laboratorio?.value.trim() || "",
    quantidade: f.quantidade?.value || "",
    normasReferencia: $("#normasReferencia")?.value || "",

    // NOVO: período
    periodo: {
      inicio: $("#dataInicio")?.value || "",
      fim: $("#dataFim")?.value || ""
    },

    amostras: $$("[data-amostra]", $("#amostras")).map(card => ({
      descricao: $(".a-descricao", card)?.value.trim() || "",
      processo: $(".a-processo", card)?.value.trim() || "",
      marca: $(".a-marca", card)?.value.trim() || "",
      amostra: $(".a-amostra", card)?.value.trim() || "",
      lote: $(".a-lote", card)?.value.trim() || "",
    })),

    objetivo: f.objetivo?.value.trim() || "",
    resultados: $$("#tblResultados tbody tr").map(tr => ({
      ensaio: $(".r-ensaio", tr)?.value.trim() || "",
      resultado: $(".r-resultado", tr)?.value.trim() || "",
      requisito: $(".r-requisito", tr)?.value.trim() || "",
      conformidade: $(".r-conf", tr)?.value || "Conforme"
    })),
    discussao: f.discussao?.value.trim() || "",
    conclusao: {
      status: (f.querySelector('input[name="statusConclusao"]:checked')?.value || "Conforme"),
      observacoes: f.conclusaoObs?.value.trim() || ""
    },

    anexos: {
      certificados: f.anexosCertificados ? splitList(f.anexosCertificados.value) : [],
      planilhas: f.anexosPlanilhas ? splitList(f.anexosPlanilhas.value) : [],
      fotos: f.anexosFotos ? splitList(f.anexosFotos.value) : [],
    },

    imagens: $$("[data-img]").map(w => ({
      src: $(".img-url", w)?.value.trim() || "",
      alt: $(".img-alt", w)?.value.trim() || "",
      legenda: $(".img-cap", w)?.value.trim() || ""
    })).filter(i => i.src),

    tabelasExtras: $$("[data-tabela]").map(box => ({
      titulo: $(".tb-title", box)?.value.trim() || "",
      linhas: $$("tbody tr", box).map(tr => [
        (tr.cells[0]?.innerText || "").trim(),
        (tr.cells[1]?.innerText || "").trim()
      ])
    })),

    anexosList: _coletarAnexosList(),

    updatedAt: Date.now()
  };
}

function salvarAtual() {
  const form = $("#formRelatorio");
  if (form && !form.reportValidity()) return;

  // NOVO: valida período
  const okPeriodo = validatePeriodoInputs();
  if (!okPeriodo) return;

  const data = coletarForm();
  data.updatedAt = Date.now();
  const ix = relatorios.findIndex(r => r.id === data.id);
  if (ix >= 0) relatorios[ix] = data; else relatorios.unshift(data);
  persistAll();
  desenharLista();
  toast("Relatório salvo!", "success");
}

/* =========================
   Métodos -> Resultados
   ========================= */
function addMetodoComoResultado() {
  const ensaio = $("#ensaioRealizado")?.value || "";
  const requisito = $("#metodo")?.value || "";
  const resultadoSel = $("#resultado")?.value || "";
  const amostrasTxt = $("#amostrasSelect")?.value || "";

  if (!ensaio) { toast("Selecione o ‘Ensaio realizado’.", "error"); return; }
  if (!resultadoSel) { toast("Selecione o ‘Resultado’.", "error"); return; }

  const conformidade = (resultadoSel.toLowerCase() === "aprovado") ? "Conforme" : "Não conforme";
  const resultadoTxt = amostrasTxt ? `${resultadoSel.toUpperCase()} • Amostras: ${amostrasTxt}` : resultadoSel.toUpperCase();

  const tr = resultadoRow({ ensaio, resultado: resultadoTxt, requisito, conformidade });
  $("#tblResultados tbody").appendChild(tr);
  Anim.fadeIn(tr, 140, 6);
  toast("Método incluído em ‘Resultados’.", "success");
}
function limparCamposMetodo() {
  $("#ensaioRealizado") && ($("#ensaioRealizado").value = "");
  $("#amostrasSelect") && ($("#amostrasSelect").value = "");
  $("#metodo") && ($("#metodo").value = "");
  $("#resultado") && ($("#resultado").value = "");
}

/* =========================
   Amostras
   ========================= */
function amostraCard(a = {}, idx = 0) {
  const d = el("div", { className: "grid" }); d.dataset.amostra = idx;
  d.innerHTML = `<label>Descrição <input class="a-descricao" value="${a.descricao || ""}" required></label> 
  <label>Processo <input class="a-processo" value="${a.processo || ""}"></label>
  <label>Marca <input class="a-marca" value="${a.marca || ""}"></label>
  <label>Nº amostra <input class="a-amostra" value="${a.amostra || ""}"></label>
  <label>Lote<input class="a-lote" value="${a.lote || ""}"></label>  
  <div><button type="button" class="btn btn--secondary" data-remove>Remover</button></div>`;
  $("button[data-remove]", d).addEventListener("click", async () => {
    await Anim.fadeOut(d, 150, 6); d.remove(); toast("Amostra removida");
  });
  return d;
}
function addAmostra() {
  const card = amostraCard(novaAmostra());
  $("#amostras").appendChild(card);
  Anim.fadeIn(card, 160, 8);
}

/* =========================
   Resultados (tabela)
   ========================= */
function resultadoRow(r = {}) {
  const tr = el("tr");
  tr.innerHTML = `<td><input class="r-ensaio" value="${r.ensaio || ""}" placeholder="Ensaio"></td>
  <td><input class="r-resultado" value="${r.resultado || ""}" placeholder="Resultado"></td>
  <td><input class="r-requisito" value="${r.requisito || ""}" placeholder="Requisito normativo"></td>
  <td><select class="r-conf"><option ${r.conformidade === "Conforme" ? "selected" : ""}>Conforme</option><option ${r.conformidade === "Não conforme" ? "selected" : ""}>Não conforme</option></select></td>
  <td><button type="button" class="btn-mini danger del">Excluir</button></td>`;
  $(".del", tr).addEventListener("click", async () => {
    if (!confirm("Excluir esta linha de resultado?")) return;
    await Anim.fadeOut(tr, 130, 4); tr.remove();
  });
  return tr;
}
function addResultado() {
  const tr = resultadoRow({});
  $("#tblResultados tbody").appendChild(tr);
  Anim.fadeIn(tr, 140, 6);
}

/* =========================
   Imagens
   ========================= */
function imagemCard(obj = { src: "", alt: "", legenda: "" }) {
  const div = el("div", { className: "grid" }); div.dataset.img = "1";
  div.innerHTML = `
    <label>Imagem (URL ou selecione arquivo)
      <input class="img-url" type="url" value="${obj.src || ""}" placeholder="https://..." />
      <input type="file" class="img-file" accept="image/*"/>
    </label>
    <label>Legenda <input class="img-cap" value="${obj.legenda || ""}" placeholder="Ex.: Foto da amostra A"/></label>
    <label>Texto alternativo (acessibilidade) <input class="img-alt" value="${obj.alt || ""}" placeholder="Descrição breve"/></label>
    <div><button type="button" class="btn btn--secondary" data-remove>Remover</button></div>`;
  $("button[data-remove]", div).addEventListener("click", async () => {
    if (!confirm("Remover esta imagem?")) return;
    await Anim.fadeOut(div, 130, 4); div.remove();
  });
  $(".img-file", div).addEventListener("change", e => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { $(".img-url", div).value = reader.result; Anim.pulse($(".img-url", div)); toast("Imagem carregada", "success"); };
    reader.readAsDataURL(file);
  });
  return div;
}
function addImagem() {
  const card = imagemCard();
  $("#imagens").appendChild(card);
  Anim.fadeIn(card, 140, 6);
}

/* =========================
   Tabelas Extras (se existir caixa no HTML)
   ========================= */
function tabelaCard(data = { titulo: "", linhas: [["", ""]] }) {
  const div = el("div", { className: "extra-table" }); div.dataset.tabela = "1";
  let html = `
    <div class="grid">
      <label>Título da tabela
        <input class="tb-title" value="${data.titulo || ""}" placeholder="Ex.: Medições dimensionais"/>
      </label>
    </div>
    <table class="tabela extra"><tbody>`;
  (data.linhas || [["", ""]]).forEach(row => {
    html += `<tr><td contenteditable="true">${row[0] || ""}</td><td contenteditable="true">${row[1] || ""}</td></tr>`;
  });
  html += `</tbody></table>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button type="button" class="btn btn--secondary add-row">+ Linha</button>
      <button type="button" class="btn btn--secondary" data-remove>Remover tabela</button>
    </div>`;
  div.innerHTML = html;
  $(".add-row", div).addEventListener("click", () => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td contenteditable="true"></td><td contenteditable="true"></td>`;
    $("tbody", div).appendChild(tr);
    Anim.fadeIn(tr, 120, 4);
  });
  $("button[data-remove]", div).addEventListener("click", async () => {
    if (!confirm("Remover esta tabela?")) return;
    await Anim.fadeOut(div, 130, 4); div.remove();
  });
  return div;
}
function addTabela() {
  const host = $("#tabelasExtras");
  if (!host) { toast("Área de ‘Tabelas adicionais’ não existe neste layout.", "error"); return; }
  const t = tabelaCard({});
  host.appendChild(t);
  Anim.fadeIn(t, 140, 6);
}

/* =========================
   Anexos (lista com arquivo)
   ========================= */
function addAnexo() {
  const desc = $("#descricao")?.value.trim();
  const file = $("#arquivo")?.files?.[0];
  if (!desc) { toast("Informe a descrição do anexo.", "error"); return; }
  if (!file) { toast("Selecione um arquivo.", "error"); return; }
  const r = new FileReader();
  r.onload = () => {
    const item = { descricao: desc, name: file.name, dataUrl: r.result };
    const data = coletarForm();
    data.anexosList = [...(data.anexosList || []), item];
    const ix = relatorios.findIndex(x => x.id === data.id);
    if (ix >= 0) relatorios[ix] = data; else relatorios.unshift(data);
    persistAll(); renderAnexosList(data.anexosList);
    $("#descricao").value = ""; $("#arquivo").value = "";
    toast("Anexo adicionado.", "success");
  };
  r.readAsDataURL(file);
}
function renderAnexosList(list) {
  const wrap = $("#anexos"); if (!wrap) return;
  wrap.querySelector(".anexos-list")?.remove();
  const ul = document.createElement("ul"); ul.className = "anexos-list";
  ul.style.cssText = "list-style:none;padding-left:0;margin-top:8px;display:grid;gap:6px;";
  (list || []).forEach((a, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:#fff;">
      <div style="min-width:0;">
        <strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(a.descricao)}</strong>
        <small style="color:var(--muted);">${escapeHtml(a.name || "arquivo")}</small>
      </div>
      <div style="display:flex;gap:6px;">
        <a download="${sanitizeFileName(a.name || 'anexo')}" href="${a.dataUrl}" class="btn-mini">Baixar</a>
        <button class="btn-mini danger" data-del="${i}">Excluir</button>
      </div>
    </div>`;
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  ul.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-del]"); if (!b) return;
    const idx = Number(b.dataset.del);
    const data = coletarForm();
    data.anexosList.splice(idx, 1);
    const ix = relatorios.findIndex(x => x.id === data.id);
    if (ix >= 0) relatorios[ix] = data; else relatorios.unshift(data);
    persistAll(); renderAnexosList(data.anexosList);
    toast("Anexo removido");
  });
}
function _coletarAnexosList() {
  const items = [];
  $$(".anexos-list li").forEach(li => {
    const t = li.querySelector("strong")?.textContent || "";
    const n = li.querySelector("small")?.textContent || "";
    const a = li.querySelector("a[download]");
    const href = a?.getAttribute("href") || "";
    items.push({ descricao: t, name: n, dataUrl: href });
  });
  return items;
}

/* =========================
   Lista lateral (salvos)
   ========================= */
function desenharLista() {
  const termo = ($("#filtroLista")?.value || "").toLowerCase();
  const ul = $("#listaRelatorios"); if (!ul) return;
  ul.innerHTML = "";
  relatorios
    .filter(r => [r.numeroRelatorio, r.responsavelTecnico, r.laboratorio].join(" ").toLowerCase().includes(termo))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(r => {
      const li = el("li");
      li.innerHTML = `<strong>${r.numeroRelatorio || "(sem nº)"} – ${r.responsavelTecnico || "?"}</strong>
        <span class="meta">${new Date(r.updatedAt).toLocaleString()} • ${r.laboratorio || ""}</span>
        <div class="row-actions" style="display:flex;gap:8px;margin-top:8px;">
          <button data-open class="btn-mini">Abrir</button>
          <button data-delete class="btn-mini danger">Apagar</button>
        </div>`;
      $("button[data-open]", li).addEventListener("click", () => {
        atual = r; preencherForm(atual); toast("Relatório carregado");
      });
      $("button[data-delete]", li).addEventListener("click", async () => {
        if (!confirm("Apagar este relatório?")) return;
        await Anim.fadeOut(li, 130, 4);
        relatorios = relatorios.filter(x => x.id !== r.id);
        persistAll(); desenharLista(); toast("Relatório apagado");
      });
      ul.appendChild(li);
      Anim.fadeIn(li, 120, 4);
    });
  if (!ul.children.length) { const li = el("li"); li.textContent = "Nenhum relatório salvo."; ul.appendChild(li); }
}

/* =========================
   NUMERAÇÃO DO RELATÓRIO  (versão 1 — mantida)
   ========================= */
function gerarNumeroRelatorio() {
  const ano = new Date().getFullYear();
  const key = `contador-${ano}`;
  let contador = parseInt(localStorage.getItem(key) || "0", 10);
  contador++;
  localStorage.setItem(key, contador);
  return `${String(contador).padStart(8, "0")}/${ano}`;
}

/* =========================
   PDF — utilitários de imagem
   ========================= */
function loadImageAsDataURL(url, preferPNG = false) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error("URL vazia"));
    if (/^data:image\//i.test(url)) return resolve(url);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");

        if (preferPNG) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          return resolve(canvas.toDataURL("image/png"));
        } else {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          return resolve(canvas.toDataURL("image/jpeg", 0.92));
        }
      } catch (err) { reject(err); }
    };
    img.onerror = reject;
    img.src = url;
  });
}
function getImageFormatFromDataURL(dataUrl) {
  if (typeof dataUrl !== "string") return "JPEG";
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  return "JPEG";
}
async function getLogoDataURL() {
  const logoEl = document.querySelector('.brand img');
  const src = logoEl?.src || 'shiva.png';
  try {
    return await loadImageAsDataURL(src, /* preferPNG */ true);
  } catch {
    return null;
  }
}

/* =========================
   PDF (texto) — jsPDF com molduras, período e assinaturas
   ========================= */
async function gerarPDF(opts = {}) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    toast("jsPDF não está carregado. Confira a tag no <head>.", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const r = coletarForm();

  // valida período antes de gerar
  if (!validatePeriodoInputs()) return;

  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // ---- helpers locais --------------------------------------------
  const formatDateBR = (input) => {
    if (!input) return "";
    const s = String(input).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d)) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    return s;
  };

  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN_X = 40, MARGIN_TOP = 50, MARGIN_BOTTOM = 40;
  let y = MARGIN_TOP;

  const LOGO_DURL = await getLogoDataURL();
  const LOGO_FMT = LOGO_DURL ? getImageFormatFromDataURL(LOGO_DURL) : null;
  let logoDims = { w: 110, h: 32 };
  if (LOGO_DURL) {
    const imgTmp = new Image(); imgTmp.src = LOGO_DURL;
    await new Promise(res => (imgTmp.complete ? res() : (imgTmp.onload = res)));
    const ratio = imgTmp.naturalHeight / Math.max(1, imgTmp.naturalWidth);
    logoDims.h = Math.round(logoDims.w * ratio);
  }

  const addHeader = () => {
    let headerBottomY;
    if (LOGO_DURL) {
      doc.addImage(LOGO_DURL, LOGO_FMT, MARGIN_X, y - 20, logoDims.w, logoDims.h);
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(THEME.ink);
      const titleX = MARGIN_X + logoDims.w + 12;
      const titleY = Math.max(y + 8, y - 20 + logoDims.h * 0.6);
      doc.text("Relatório de Inspeção", titleX, titleY);
      headerBottomY = Math.max(y - 20 + logoDims.h, titleY + 4);
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(THEME.ink);
      doc.text("Relatório de Inspeção", MARGIN_X, y);
      headerBottomY = y + 10;
    }
    doc.setDrawColor(190);
    doc.line(MARGIN_X, headerBottomY + 6, PAGE_W - MARGIN_X, headerBottomY + 6);
    y = headerBottomY + 24;
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(THEME.ink);
  };

  const addFooter = () => {
    const pageNum = doc.internal.getNumberOfPages();
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Relatório ${r.numeroRelatorio || "-"} • pág. ${pageNum}`, PAGE_W - MARGIN_X, PAGE_H - 20, { align: "right" });
    if (LOGO_DURL) {
      doc.addImage(
        LOGO_DURL, LOGO_FMT,
        MARGIN_X, PAGE_H - 32,
        60, Math.max(18, Math.round(60 * (logoDims.h / Math.max(1, logoDims.w))))
      );
    }
  };

  addHeader();

  // ---- helpers de layout -----------------------------------------
  const COR_BORDA = 170;
  const FIELD_PAD_X = 8, FIELD_PAD_Y = 8;
  const LINE_H = 14;
  let currentSection = null; // { legend, topY, continued }
  let sectionIndex = 0;

  const ensureSpace = (h = 18) => {
    const before = doc.internal.getNumberOfPages();
    if (y + h <= PAGE_H - MARGIN_BOTTOM) return false;
    if (currentSection) drawBoxAndLegend(currentSection, PAGE_H - MARGIN_BOTTOM, true);
    addFooter();
    doc.addPage();
    y = MARGIN_TOP;
    addHeader();
    if (currentSection) {
      currentSection.topY = y;
      currentSection.continued = true;
      y += 16;
    }
    const after = doc.internal.getNumberOfPages();
    return after !== before;
  };

  const drawBoxAndLegend = (sec, bottomY, isBreak = false) => {
    const x = MARGIN_X - 10;
    const w = PAGE_W - 2 * MARGIN_X + 20;
    const h = Math.max(18, bottomY - sec.topY) + 10;
    doc.setDrawColor(COR_BORDA);
    doc.roundedRect(x, sec.topY - 10, w, h + 10, 6, 6);

    let label = `${sec.legend}${sec.continued || isBreak ? " (continuação)" : ""}`;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(THEME.brand);
    const tw = doc.getTextWidth(label);
    const padX = 6;
    const labelX = x + 14;
    const labelY = sec.topY - 10 + 10;

    doc.setFillColor(255, 255, 255);
    doc.rect(labelX - padX, labelY - 11, tw + padX * 2, 16, "F");
    doc.text(label, labelX, labelY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(THEME.ink);
  };

  const beginSection = (legendBase) => {
    sectionIndex += 1;
    ensureSpace(28);
    currentSection = { legend: `${sectionIndex}. ${legendBase}`, topY: y, continued: false };
    y += 16;
  };
  const endSection = () => {
    if (!currentSection) return;
    drawBoxAndLegend(currentSection, y, false);
    currentSection = null;
    y += 8;
  };

  const drawField = (label, value, x, w) => {
    value = (value || "-").toString();
    doc.setFontSize(10); doc.setTextColor(THEME.muted);
    doc.text(label, x, y);
    y += 10;
    const maxW = w - FIELD_PAD_X * 2;
    doc.setFontSize(11); doc.setTextColor(THEME.ink);
    const lines = doc.splitTextToSize(value, maxW);
    const boxH = Math.max(22, FIELD_PAD_Y * 2 + lines.length * LINE_H);
    ensureSpace(boxH);
    doc.setDrawColor(COR_BORDA);
    doc.roundedRect(x, y - 9, w, boxH, 5, 5);
    const textY = y - 9 + FIELD_PAD_Y + 12;
    lines.forEach((ln, i) => doc.text(ln, x + FIELD_PAD_X, textY + i * LINE_H));
    y += boxH + 6;
  };

  const drawTextArea = (label, text, minHeight, x, w) => {
    text = (text || "").toString().trim() || " ";
    doc.setFontSize(10); doc.setTextColor(THEME.muted);
    doc.text(label, x, y);
    y += 10;
    const maxW = w - FIELD_PAD_X * 2;
    doc.setFontSize(11); doc.setTextColor(THEME.ink);
    const lines = doc.splitTextToSize(text, maxW);
    const boxH = Math.max(minHeight, FIELD_PAD_Y * 2 + Math.max(1, lines.length) * LINE_H);
    ensureSpace(boxH);
    doc.setDrawColor(COR_BORDA);
    doc.roundedRect(x, y - 9, w, boxH, 6, 6);
    const textY = y - 9 + FIELD_PAD_Y + 12;
    lines.forEach((ln, i) => doc.text(ln, x + FIELD_PAD_X, textY + i * LINE_H));
    y += boxH + 6;
  };

  const twoColFields = (pairs) => {
    const fullW = PAGE_W - 2 * MARGIN_X;
    const gutter = 16;
    const colW = (fullW - gutter) / 2;
    let i = 0;
    while (i < pairs.length) {
      const [l1, v1] = pairs[i] || ["", ""];
      const [l2, v2] = pairs[i + 1] || ["", ""];
      ensureSpace(60);
      const yStart = y;
      const x1 = MARGIN_X, x2 = MARGIN_X + colW + gutter;

      let yTemp = y;
      y = yTemp; drawField(l1, v1, x1, colW);
      const yAfter1 = y;

      y = yTemp; drawField(l2, v2, x2, colW);
      const yAfter2 = y;

      y = Math.max(yAfter1, yAfter2);
      i += 2;
    }
  };

  const drawResultadosTable = (rows) => {
    const fullW = PAGE_W - 2 * MARGIN_X;
    const cols = [
      { key: "ensaio", title: "Ensaio", w: fullW * 0.24 },
      { key: "resultado", title: "Resultado obtido", w: fullW * 0.36 },
      { key: "requisito", title: "Requisito normativo", w: fullW * 0.24 },
      { key: "conformidade", title: "Conformidade", w: fullW * 0.16 },
    ];
    const colX = []; let x = MARGIN_X;
    cols.forEach(c => { colX.push(x); x += c.w; });

    const printHeader = () => {
      ensureSpace(18);
      doc.setFont("helvetica", "bold"); doc.setTextColor(THEME.ink);
      cols.forEach((c, i) => doc.text(c.title, colX[i], y));
      y += 10; doc.setFont("helvetica", "normal");
    };

    printHeader();
    rows.forEach(row => {
      const heights = cols.map((c) => {
        const val = (row[c.key] || "-").toString();
        const lines = doc.splitTextToSize(val, c.w - FIELD_PAD_X * 2);
        return Math.max(24, FIELD_PAD_Y * 2 + lines.length * LINE_H);
      });
      let rowH = Math.max(...heights);
      const changed = ensureSpace(rowH + 6);
      if (changed) printHeader();

      cols.forEach((c, i) => {
        doc.setDrawColor(COR_BORDA);
        doc.roundedRect(colX[i], y - 9, c.w, rowH, 5, 5);
        const val = (row[c.key] || "-").toString();
        const lines = doc.splitTextToSize(val, c.w - FIELD_PAD_X * 2);
        lines.forEach((ln, k) => doc.text(ln, colX[i] + FIELD_PAD_X, y - 9 + FIELD_PAD_Y + 12 + k * LINE_H));
      });

      y += rowH + 6;
    });
  };

  const pickVal = (selectors) => {
    for (const sel of selectors) {
      const el = sel.startsWith("#") || sel.startsWith("[")
        ? document.querySelector(sel)
        : document.getElementById(sel);
      const v = el?.value?.trim();
      if (v) return v;
    }
    return "";
  };

  const drawSignBlock = (x, w, title, name) => {
    const lineGap = 36;
    const nameGap = 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(THEME.ink);
    doc.text(title, x, y);
    const lineY = y + lineGap;
    doc.setDrawColor(120);
    doc.line(x, lineY, x + w, lineY);
    if (name) {
      doc.setFontSize(11); doc.setTextColor(80);
      doc.text(String(name), x, lineY + nameGap);
    }
  };

  const drawAssinaturasFinal = () => {
    const areaH = 100;
    const fullW = PAGE_W - 2 * MARGIN_X;
    const gutter = 28;
    const colW = (fullW - gutter) / 2;

    if (y > PAGE_H - MARGIN_BOTTOM - areaH) {
      addFooter();
      doc.addPage();
      y = MARGIN_TOP;
      addHeader();
    }

    y = Math.max(y, PAGE_H - MARGIN_BOTTOM - areaH);

    const nomeTestes = pickVal(["#respTestes", "[name='respTestes']", "responsavelTestes", "responsavelPelosTestes"]) || "";
    const nomeVerif = pickVal(["#respVerificacao", "[name='respVerificacao']", "responsavelVerificacao", "responsavelPelaVerificacao"]) || "";

    drawSignBlock(MARGIN_X, colW, "Responsável pelos testes:", nomeTestes);
    drawSignBlock(MARGIN_X + colW + gutter, colW, "Responsável pela verificação:", nomeVerif);

    y += areaH;
  };
  // ---- fim helpers -----------------------------------------------

  // -----------------------------
  // 1) Identificação do Relatório
  // -----------------------------
  beginSection("Identificação do Relatório");
  const periodoTxt = (r.periodo?.inicio || r.periodo?.fim)
    ? `${formatDateBR(r.periodo?.inicio)} até ${formatDateBR(r.periodo?.fim)}`
    : "-";
  twoColFields([
    ["Número do Relatório", r.numeroRelatorio],
    ["Empenho", r.ordemProducao],
    ["Fornecedor/Fabricante", r.fornecedorFabricante],
    ["Quantidade", r.quantidade || ""],
    ["Interessado", r.interessado],
    ["Período de inspeção", periodoTxt],
    ["Laboratório", r.laboratorio],
    ["Normas de referência", r.normasReferencia || "-"],
    ["Revisão", r.revisao],
    ["Data de emissão", formatDateBR(r.dataEmissao)],
  ]);

  endSection();

  // -----------------------------
  // 2) Identificação da(s) Amostra(s)
  // -----------------------------
  beginSection("Identificação da(s) Amostra(s)");
  if ((r.amostras || []).length) {
    r.amostras.forEach((a, i) => {
      doc.setFont("helvetica", "bold"); doc.setTextColor(THEME.ink);
      ensureSpace(16); doc.text(`Amostra ${i + 1}`, MARGIN_X, y); y += 8; doc.setFont("helvetica", "normal");
      twoColFields([
        ["Descrição", a.descricao],
        ["Processo", a.processo],
        ["Marca", a.marca],
        ["Nº amostra", a.amostra],
        ["Lote", a.lote],
      ]);
      y += 4;
    });
  } else {
    drawTextArea("Amostras", " ", 40, MARGIN_X, PAGE_W - 2 * MARGIN_X);
  }
  endSection();

  // -----------------------------
  // 3) Métodos e Materiais Empregados
  // -----------------------------
  const ensaioTxt = document.querySelector("#ensaioRealizado option:checked")?.textContent?.trim() || "";
  const amostrasTxt = document.querySelector("#amostrasSelect option:checked")?.textContent?.trim() || "";
  const metodoTxt = document.querySelector("#metodo option:checked")?.textContent?.trim() || "";
  const resultadoMM = document.querySelector("#resultado option:checked")?.textContent?.trim() || "";
  beginSection("Métodos e Materiais Empregados");
  twoColFields([
    ["Ensaio realizado", ensaioTxt],
    ["Amostras", amostrasTxt],
    ["Método", metodoTxt],
    ["Resultado", resultadoMM]
  ]);
  endSection();

  // -----------------------------
  // 4) Resultados dos Ensaios
  // -----------------------------
  beginSection("Resultados dos Ensaios");
  const rows = r.resultados || [];
  if (!rows.length) {
    drawTextArea("Resultados", "Sem resultados informados.", 40, MARGIN_X, PAGE_W - 2 * MARGIN_X);
  } else {
    drawResultadosTable(rows);
  }

// 4.2 Imagens
ensureSpace(24);
doc.setFont("helvetica", "bold"); doc.setTextColor(THEME.ink);
doc.text("Imagens", MARGIN_X, y); y += 12; doc.setFont("helvetica", "normal");

if ((r.imagens || []).length) {
  const fullW = PAGE_W - 2 * MARGIN_X;
  const gap = 14;
  const thumbW = (fullW - gap) / 2;       // 2 colunas
  const thumbMaxH = 160;

  let col = 0;        // 0 = esquerda, 1 = direita
  let rowMaxH = 0;    // maior altura da linha atual

  for (let i = 0; i < r.imagens.length; i++) {
    const it = r.imagens[i];
    const url = (typeof it === "string") ? it : it.src;
    const legenda = (typeof it === "object" ? it.legenda : "") || `Figura ${i + 1}`;

    try {
      const dataUrl = await loadImageAsDataURL(url);
      const img = new Image(); img.src = dataUrl;
      await new Promise(res => img.complete ? res() : img.onload = res);

      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      const h = Math.min(thumbW * ratio, thumbMaxH);

      // Garante espaço para a linha (pela maior imagem)
      if (col === 0) ensureSpace(h + 26);
      else ensureSpace(Math.max(rowMaxH, h) + 26);

      const x = MARGIN_X + col * (thumbW + gap);
      doc.addImage(dataUrl, getImageFormatFromDataURL(dataUrl), x, y, thumbW, h);
      doc.setFontSize(9); doc.setTextColor(100);
      doc.text(legenda, x, y + h + 10);
      doc.setFontSize(11); doc.setTextColor(THEME.ink);

      rowMaxH = Math.max(rowMaxH, h);

      if (col === 1) {            // fechou a linha
        y += rowMaxH + 26;
        col = 0;
        rowMaxH = 0;
      } else {
        col = 1;
      }
    } catch {
      ensureSpace(16);
      doc.setFontSize(10); doc.setTextColor(150);
      doc.text(`(Não foi possível carregar a imagem ${i + 1})`, MARGIN_X, y);
      doc.setFontSize(11); doc.setTextColor(THEME.ink);
      y += 14;
    }
  }

  // Se terminou com uma imagem “solta”, empurra a altura dessa última linha
  if (col === 1) y += rowMaxH + 26;
} else {
  drawTextArea(" ", "Nenhuma imagem anexada.", 40, MARGIN_X, PAGE_W - 2 * MARGIN_X);
}

  // 4.3 Anexos (categorias + arquivos)
  ensureSpace(24);
  doc.setFont("helvetica", "bold"); doc.setTextColor(THEME.ink);
  doc.text("Anexos", MARGIN_X, y); y += 12; doc.setFont("helvetica", "normal");

  twoColFields([
    ["Certificados", (r.anexos?.certificados || []).join("; ") || "-"],
    ["Planilhas/Gráficos", (r.anexos?.planilhas || []).join("; ") || "-"],
    ["Fotos das amostras", (r.anexos?.fotos || []).join("; ") || "-"],
    ["Arquivos anexados",
      (r.anexosList || []).length
        ? r.anexosList.map(a => `• ${a.descricao} (${a.name || "arquivo"})`).join("  ")
        : "-"
    ]
  ]);
  endSection();

  // -----------------------------
  // 5) Discussão dos Resultados
  // -----------------------------
  beginSection("Discussão dos Resultados");
  drawTextArea("", (r.discussao || "").trim() || "NÃO REALIZADO", 100, MARGIN_X, PAGE_W - 2 * MARGIN_X);
  endSection();

  // -----------------------------
  // 6) Conclusão
  // -----------------------------
  beginSection("Conclusão");
  twoColFields([
    ["Status", r.conclusao?.status || "-"],
    ["", ""]
  ]);
  drawTextArea("Observações", r.conclusao?.observacoes || "", 90, MARGIN_X, PAGE_W - 2 * MARGIN_X);
  endSection();

  // -----------------------------
  // 7) Assinaturas no rodapé da última página
  // -----------------------------
  drawAssinaturasFinal();

  addFooter();

  const filename = `relatorio-${sanitizeFileName(r.numeroRelatorio) || "ensaio"}.pdf`;
  if (opts.returnBlob) return doc.output("blob");
  if (opts.save !== false) doc.save(filename);
  return null;
}

/* =========================
   Datas — formato dd/MM/yyyy
   ========================= */
function formatDateBR(input) {
  if (!input) return "";
  const s = String(input).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d)) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return s;
}

/* =========================
   Miscelânea
   ========================= */
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}

/* =========================
   UI polish helpers
   ========================= */
function injectUIStyles() {
  const style = document.createElement("style");
  style.textContent = `
    

  
    .brand img { width: var(--logo-size, 84px); height: var(--logo-size, 100px); object-fit: contain; }

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
          /* evita que imagens fiquem “por baixo” de elementos da tabela */
    #imagens { display:grid; gap:12px; margin-top:12px; position:relative; z-index:0; clear:both; }
    #imagens [data-img] { background:#fff; border:1px solid var(--border, #E2E8F0); border-radius:10px; padding:10px; }
    .tabela-wrap { position:relative; z-index:0; }

  `
  ;
  document.head.appendChild(style);
  
}
function alignAddResultadoBtn() {
  const wrap = $(".tabela-wrap");
  const btn = $("#btnAddResultado");
  if (wrap && btn && wrap.nextElementSibling !== btn) { wrap.after(btn); }
  if (btn) {
    btn.style.margin = ".6rem 0 1rem 0";
    btn.style.display = "inline-flex";
    btn.style.verticalAlign = "middle";
    btn.style.alignItems = "center";
    btn.style.gap = ".4rem";
  }
}
function tableResponsiveLabels() {
  const tbl = $("#tblResultados"); if (!tbl) return;
  const headers = $$("thead th", tbl).map(th => th.textContent.trim());
  const apply = () => $$("tbody tr", tbl).forEach(tr => $$("td", tr).forEach((td, i) => td.setAttribute("data-label", headers[i] || "")));
  apply(); new MutationObserver(apply).observe(tbl.tBodies[0], { childList: true, subtree: true });
}
function topbarShadow() {
  const topbar = $(".topbar");
  const onScroll = () => topbar?.classList.toggle("is-scrolled", window.scrollY > 4);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
}

/* =========================
   NUMERAÇÃO DO RELATÓRIO  (versão 2 — também mantida)
   ========================= */
function gerarNumeroRelatorio_v2() {
  const anoAtual = new Date().getFullYear();
  const key = "controleRelatorios";
  const dados = JSON.parse(localStorage.getItem(key)) || { ano: anoAtual, contador: 0 };

  if (dados.ano !== anoAtual) {
    dados.ano = anoAtual;
    dados.contador = 1;
  } else {
    dados.contador += 1;
  }

  localStorage.setItem(key, JSON.stringify(dados));

  const numero = dados.contador.toString().padStart(8, '0');
  return `${numero}/${anoAtual}`;
}
// Mantém seu listener que preenche o número ao carregar
document.addEventListener("DOMContentLoaded", () => {
  const numeroInput = document.getElementById("numeroRelatorio");
  if (numeroInput && !numeroInput.value) {
    // usa v2 para evitar conflito, mas mantém a semântica
    numeroInput.value = gerarNumeroRelatorio_v2();
  }
});

/* =========================
   salvarAtual (versão do fim do seu código) — mantida e melhorada
   ========================= */
function salvarAtual() {
  const form = document.getElementById("formRelatorio");
  if (form && !form.reportValidity()) return;

  // Gera número se não tiver
  if (!form.numeroRelatorio.value) {
    form.numeroRelatorio.value = gerarNumeroRelatorio_v2();
  }

  // Valida período antes de salvar
  if (!validatePeriodoInputs()) return;

  // Coleta e salva relatório
  const data = coletarForm();
  data.updatedAt = Date.now();
  const ix = relatorios.findIndex(r => r.id === data.id);
  if (ix >= 0) relatorios[ix] = data; else relatorios.unshift(data);
  persistAll();
  desenharLista();
  toast("Relatório salvo!", "success");

  // Reseta formulário para novo relatório
  setTimeout(() => {
    atual = novoRelatorio();
    preencherForm(atual);
    form.numeroRelatorio.value = gerarNumeroRelatorio_v2();
  }, 200);
}

/* ======================================================================
   ======  NOVO BLOCO: Temas (dialog + persistência + meta tags)  =======
   ====================================================================== */
function currentTheme() {
  const html = document.documentElement;
  return html.dataset.theme || localStorage.getItem(THEME_KEY) || "claro";
}
function applyTheme(theme) {
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);

  // meta color-scheme
  let metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (!metaScheme) {
    metaScheme = document.createElement("meta");
    metaScheme.setAttribute("name", "color-scheme");
    document.head.appendChild(metaScheme);
  }
  metaScheme.setAttribute("content", THEME_META[theme]?.colorScheme || "light");

  // meta theme-color (Chrome/Android)
  let metaTheme = document.querySelector('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement("meta");
    metaTheme.setAttribute("name", "theme-color");
    document.head.appendChild(metaTheme);
  }
  metaTheme.setAttribute("content", THEME_META[theme]?.themeColor || "#0E3554");

  localStorage.setItem(THEME_KEY, theme);
}
function initThemeFromStorage() {
  const html = document.documentElement;
  const fromDataAttr = html.getAttribute("data-theme");
  const stored = localStorage.getItem(THEME_KEY);
  const theme = stored || fromDataAttr || "claro";
  applyTheme(theme);
  // Sincroniza rádio no dialog (se já existir no HTML)
  const radio = document.querySelector(`input[name="tema"][value="${theme}"]`);
  if (radio) radio.checked = true;
}
function setupThemeDialog() {
  const btnOpen = $("#btnTemas");
  const dlg = $("#dlgTemas");
  const btnClose = $("#btnTemaFechar");
  const btnCancel = $("#btnTemaCancelar");
  const btnApply = $("#btnTemaAplicar");

  if (!btnOpen || !dlg) return;

  // abrir
  btnOpen.addEventListener("click", () => {
    try { dlg.showModal(); } catch { dlg.setAttribute("open", "open"); }
    // marca o rádio do tema atual
    const theme = currentTheme();
    const radio = dlg.querySelector(`input[name="tema"][value="${theme}"]`);
    if (radio) radio.checked = true;
  });

  // fechar (X e cancelar)
  const closeDialog = () => {
    if (dlg.open) dlg.close();
    else dlg.removeAttribute("open");
  };
  btnClose?.addEventListener("click", closeDialog);
  btnCancel?.addEventListener("click", closeDialog);

  // aplicar tema
  btnApply?.addEventListener("click", () => {
    const selected = dlg.querySelector('input[name="tema"]:checked')?.value || "claro";
    applyTheme(selected);
    toast("Tema aplicado: " + selected, "success");
    closeDialog();
  });

  // clicar fora (backdrop)
  dlg.addEventListener("click", (ev) => {
    const rect = dlg.getBoundingClientRect();
    const inDialog = (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom);
    if (!inDialog) closeDialog();
  });

  // Esc para fechar (por segurança, muitos browsers já fazem)
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeDialog(); });
}

/* ======================================================================
   ======  NOVO BLOCO: Datas do período (validação + UX)           =======
   ====================================================================== */
function hookPeriodoDates() {
  const di = $("#dataInicio");
  const df = $("#dataFim");
  if (!di || !df) return;

  // Evita “bind” duplicado
  if (di.dataset.boundDates || df.dataset.boundDates) return;
  di.dataset.boundDates = df.dataset.boundDates = "1";

  const syncMinMax = () => {
    if (di.value) df.min = di.value; else df.removeAttribute("min");
    if (df.value) di.max = df.value; else di.removeAttribute("max");
  };

  di.addEventListener("change", () => {
    syncMinMax();
    if (df.value && di.value && df.value < di.value) {
      df.value = di.value;
      typeof toast === "function" && toast("Ajustei a data final para não ficar antes do início.", "info");
    }
  });

  df.addEventListener("change", () => {
    syncMinMax();
    if (df.value && di.value && df.value < di.value) {
      di.value = df.value;
      typeof toast === "function" && toast("Ajustei a data inicial para não ficar após o fim.", "info");
    }
  });

  syncMinMax();
  enforcePeriodoRules();
}

function enforcePeriodoRules() {
  const di = $("#dataInicio");
  const df = $("#dataFim");
  if (!di || !df) return;
  if (di.value && df.value && df.value < di.value) {
    df.value = di.value;
  }
}
function validatePeriodoInputs() {
  const di = $("#dataInicio");
  const df = $("#dataFim");
  if (!di || !df) return true; // não há campo no layout
  if (!di.value || !df.value) {
    toast("Informe o período de inspeção (início e fim).", "error");
    return false;
  }
  if (df.value < di.value) {
    toast("A data final não pode ser anterior à inicial.", "error");
    return false;
  }
  return true;
}

/* ---------- Período: ganchos e regras (se ainda não existirem) ---------- */
window.enforcePeriodoRules = window.enforcePeriodoRules || function enforcePeriodoRules() {
  const di = document.querySelector("#dataInicio");
  const df = document.querySelector("#dataFim");
  if (!di || !df) return;
  if (di.value && df.value && df.value < di.value) {
    df.value = di.value;
  }
};

window.hookPeriodoDates = window.hookPeriodoDates || function hookPeriodoDates() {
  const di = document.querySelector("#dataInicio");
  const df = document.querySelector("#dataFim");
  if (!di || !df) return;

  const syncMinMax = () => {
    if (di.value) df.min = di.value; else df.removeAttribute("min");
    if (df.value) di.max = df.value; else di.removeAttribute("max");
  };

  di.addEventListener("change", () => {
    syncMinMax();
    if (df.value && di.value && df.value < di.value) {
      df.value = di.value;
      typeof toast === "function" && toast("Ajustei a data final para não ficar antes do início.", "info");
    }
  });
  df.addEventListener("change", () => {
    syncMinMax();
    if (df.value && di.value && df.value < di.value) {
      di.value = df.value;
      typeof toast === "function" && toast("Ajustei a data inicial para não ficar após o fim.", "info");
    }
  });

  // aplica limites iniciais
  syncMinMax();
  window.enforcePeriodoRules();
};


/* ---------------------- Temas: constantes seguras ----------------------- */
window.THEME_KEY = window.THEME_KEY || "ui-theme";
window.THEME_META = window.THEME_META || {
  claro: { colorScheme: "light", themeColor: "#0E3554" },
  escuro: { colorScheme: "dark", themeColor: "#121933" },
  marinho: { colorScheme: "dark", themeColor: "#10253f" },
  sepia: { colorScheme: "light", themeColor: "#9c6b3c" },
};

/* ---------------------- Temas: helpers idempotentes --------------------- */
window.currentTheme = window.currentTheme || function currentTheme() {
  const html = document.documentElement;
  return html.dataset.theme || localStorage.getItem(window.THEME_KEY) || "claro";
};

window.applyTheme = window.applyTheme || function applyTheme(theme) {
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);

  // color-scheme
  let metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (!metaScheme) {
    metaScheme = document.createElement("meta");
    metaScheme.setAttribute("name", "color-scheme");
    document.head.appendChild(metaScheme);
  }
  metaScheme.setAttribute("content", (window.THEME_META[theme]?.colorScheme) || "light");

  // theme-color
  let metaTheme = document.querySelector('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement("meta");
    metaTheme.setAttribute("name", "theme-color");
    document.head.appendChild(metaTheme);
  }
  metaTheme.setAttribute("content", (window.THEME_META[theme]?.themeColor) || "#0E3554");

  localStorage.setItem(window.THEME_KEY, theme);
};

window.initThemeFromStorage = window.initThemeFromStorage || function initThemeFromStorage() {
  const fromAttr = document.documentElement.getAttribute("data-theme");
  const saved = localStorage.getItem(window.THEME_KEY);
  const theme = saved || fromAttr || "claro";
  window.applyTheme(theme);

  // marca rádio correspondente (se o diálogo existir)
  const radio = document.querySelector(`input[name="tema"][value="${theme}"]`);
  if (radio) radio.checked = true;
};

window.setupThemeDialog = window.setupThemeDialog || function setupThemeDialog() {
  const btnOpen = document.querySelector("#btnTemas");
  const dlg = document.querySelector("#dlgTemas");
  const btnClose = document.querySelector("#btnTemaFechar");
  const btnCancel = document.querySelector("#btnTemaCancelar");
  const btnApply = document.querySelector("#btnTemaAplicar");

  if (!btnOpen || !dlg) return;

  if (!btnOpen.dataset.bound) {
    btnOpen.dataset.bound = "1";
    btnOpen.addEventListener("click", () => {
      try { dlg.showModal(); } catch { dlg.setAttribute("open", "open"); }
      const th = window.currentTheme();
      const radio = dlg.querySelector(`input[name="tema"][value="${th}"]`);
      if (radio) radio.checked = true;
    });
  }

  const closeDialog = () => {
    if (dlg.open) dlg.close(); else dlg.removeAttribute("open");
  };

  if (btnClose && !btnClose.dataset.bound) {
    btnClose.dataset.bound = "1";
    btnClose.addEventListener("click", closeDialog);
  }
  if (btnCancel && !btnCancel.dataset.bound) {
    btnCancel.dataset.bound = "1";
    btnCancel.addEventListener("click", closeDialog);
  }
  if (btnApply && !btnApply.dataset.bound) {
    btnApply.dataset.bound = "1";
    btnApply.addEventListener("click", () => {
      const selected = dlg.querySelector('input[name="tema"]:checked')?.value || "claro";
      window.applyTheme(selected);
      typeof toast === "function" && toast("Tema aplicado: " + selected, "success");
      closeDialog();
    });
  }

  if (!dlg.dataset.boundBackdrop) {
    dlg.dataset.boundBackdrop = "1";
    dlg.addEventListener("click", (ev) => {
      const rect = dlg.getBoundingClientRect();
      const inside = ev.clientX >= rect.left && ev.clientX <= rect.right &&
        ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (!inside) closeDialog();
    });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeDialog(); });
  }
};


/* ---------------------- Inicialização discreta ------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Tema
  window.initThemeFromStorage?.();
  window.setupThemeDialog?.();

  // Datas do período
  window.hookPeriodoDates?.();
  window.enforcePeriodoRules?.();
});

/* =========================================================
   CONTINUAÇÃO — Utilidades finais de Tema e Datas
   Cole este trecho logo ABAIXO do seu DOMContentLoaded atual
   ========================================================= */

/* ---------- (1) Patcher: dispara evento quando o tema muda ---------- */
(() => {
  if (window.applyTheme && !window.__themePatched) {
    const _orig = window.applyTheme;
    window.applyTheme = function patchedApplyTheme(theme) {
      _orig(theme);
      try {
        document.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme } }));
      } catch { }
    };
    window.__themePatched = true;
  }
})();

/* ---------- (2) Fallback: cria UI de temas se faltar no HTML ---------- */
function __buildThemeDialogIfMissing() {
  if (document.querySelector("#dlgTemas")) return;

  const tpl = document.createElement("template");
  tpl.innerHTML = `
    <dialog id="dlgTemas" aria-labelledby="dlgTemasTitle" aria-modal="true" style="border:0;padding:0;border-radius:14px;max-width:420px;width:92vw;">
      <form id="formTemas" method="dialog" style="background:var(--surface,#fff);border:1px solid var(--border,#E2E8F0);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.18);">
        <header class="dlg-head" style="padding:14px 16px;border-bottom:1px solid var(--border,#E2E8F0);display:flex;align-items:center;justify-content:space-between;">
          <h2 id="dlgTemasTitle" style="margin:0;font:700 1.1rem/1.2 var(--ff-title,Poppins,system-ui)">Escolher tema</h2>
          <button type="button" id="btnTemaFechar" aria-label="Fechar" style="background:transparent;border:0;font-size:20px;line-height:1;cursor:pointer">×</button>
        </header>
        <fieldset style="padding:14px 16px;display:grid;gap:10px;border:0;margin:0">
          <legend class="sr-only">Opções de tema</legend>
          ${["claro", "escuro", "marinho", "sepia"].map((t, i) => `
            <label class="tema-opcao" style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input type="radio" name="tema" value="${t}" ${i === 0 ? "checked" : ""}/>
              <span style="font-weight:600;text-transform:capitalize">${t}</span>
            </label>
          `).join("")}
        </fieldset>
        <footer class="dlg-actions" style="padding:12px 16px;border-top:1px solid var(--border,#E2E8F0);display:flex;gap:8px;justify-content:flex-end">
          <button type="button" id="btnTemaAplicar" class="btn btn--primary">Aplicar</button>
          <button type="button" id="btnTemaCancelar" class="btn btn--secondary">Cancelar</button>
        </footer>
      </form>
    </dialog>
  `.trim();
  document.body.appendChild(tpl.content);

  // Se não houver botão na topbar, cria um.
  if (!document.querySelector("#btnTemas")) {
    const group = document.createElement("div");
    group.className = "btn-group";
    group.innerHTML = `<button id="btnTemas" class="btn btn--secondary" type="button" title="Escolher tema">Temas</button>`;
    document.querySelector(".actions")?.appendChild(group);
  }

  // Reativa a lógica do diálogo
  window.setupThemeDialog?.();
  window.initThemeFromStorage?.();
}

/* ---------- (3) Comando rápido: seletor inline (opcional e útil) ------ */
function __mountQuickThemeSwitcher() {
  if (document.querySelector("#quickTheme")) return;
  const actions = document.querySelector(".actions");
  if (!actions) return;

  const wrap = document.createElement("div");
  wrap.className = "btn-group";
  wrap.innerHTML = `
    <label class="sr-only" for="quickTheme">Tema</label>
    <select id="quickTheme" title="Trocar tema rapidamente" style="padding:9px 12px;border-radius:10px;border:1px solid var(--border,#E2E8F0);background:#fff;font-weight:600">
      <option value="claro">Claro</option>
      <option value="escuro">Escuro</option>
      <option value="marinho">Marinho</option>
      <option value="sepia">Sépia</option>
    </select>
  `;
  actions.appendChild(wrap);

  const sel = wrap.querySelector("#quickTheme");
  sel.value = (window.currentTheme?.() || "claro");
  sel.addEventListener("change", (e) => {
    const val = e.target.value;
    window.applyTheme?.(val);
    if (typeof toast === "function") toast("Tema aplicado: " + val, "success");
    // Sincroniza rádio no dialog, se aberto
    const radio = document.querySelector(`#dlgTemas input[name="tema"][value="${val}"]`);
    if (radio) radio.checked = true;
  });

  // Atualiza o select quando o tema muda por outro caminho
  document.addEventListener("theme:changed", (ev) => {
    const t = ev.detail?.theme;
    if (t && sel.value !== t) sel.value = t;
  });
}

/* ---------- (4) Atalhos de teclado úteis ------------------------------ */
(function __keyboardShortcuts() {
  if (window.__themeKeysBound) return;
  window.__themeKeysBound = true;

  document.addEventListener("keydown", (e) => {
    // Ctrl+Shift+T => abrir diálogo de temas
    const key = e.key?.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "t") {
      e.preventDefault();
      __buildThemeDialogIfMissing();
      document.querySelector("#btnTemas")?.click();
    }

    // Alt+1..4 para temas rápidos
    if (e.altKey && ["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      const map = { "1": "claro", "2": "escuro", "3": "marinho", "4": "sepia" };
      const t = map[e.key];
      window.applyTheme?.(t);
      if (typeof toast === "function") toast("Tema aplicado: " + t, "success");
    }
  });
})();

/* ---------- (5) Datas: default amigável se estiver vazio --------------- */
(function __defaultDates() {
  const di = document.querySelector("#dataInicio");
  const df = document.querySelector("#dataFim");
  const de = document.querySelector("#dataEmissao");

  const todayISO = new Date().toISOString().slice(0, 10);

  if (de && !de.value) de.value = todayISO;

  // Se ambos vazios, preenche com hoje
  if (di && df && !di.value && !df.value) {
    di.value = todayISO;
    df.value = todayISO;
    window.enforcePeriodoRules?.();
  }
})();

/* ---------- (6) Inicialização de segurança (idempotente) --------------- */
document.addEventListener("DOMContentLoaded", () => {
  __buildThemeDialogIfMissing();
  __mountQuickThemeSwitcher();

  // Garante radios/combos sincronizados ao trocar tema por qualquer via
  document.addEventListener("theme:changed", (ev) => {
    const t = ev.detail?.theme;
    const radio = document.querySelector(`#dlgTemas input[name="tema"][value="${t}"]`);
    if (radio && !radio.checked) radio.checked = true;
  });
});



(() => {
  if (window.__themePatched) return; // já despachamos via applyTheme
  const html = document.documentElement;
  let last = html.getAttribute("data-theme") || "claro";

  const mo = new MutationObserver(() => {
    const cur = html.getAttribute("data-theme") || "claro";
    if (cur !== last) {
      last = cur;
      try {
        document.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme: cur } }));
      } catch {}
    }
  });

  mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
})();


/* 2) Dispara `periodo:changed` quando datas mudam,
      útil se quiser reagir em outros módulos. */
(() => {
  const di = document.querySelector("#dataInicio");
  const df = document.querySelector("#dataFim");
  if (!di || !df) return;

  const fire = () => {
    try {
      document.dispatchEvent(new CustomEvent("periodo:changed", {
        detail: { inicio: di.value || "", fim: df.value || "" }
      }));
    } catch { }
  };

  di.addEventListener("change", fire);
  df.addEventListener("change", fire);
})();

/* 3) Permite trocar tema via querystring: ?theme=escuro|claro|marinho|sepia
      (só aplica se o valor for válido) */
(() => {
  try {
    const params = new URLSearchParams(location.search);
    const t = (params.get("theme") || "").toLowerCase();
    if (t && ["claro", "escuro", "marinho", "sepia"].includes(t)) {
      window.applyTheme?.(t);
    }
  } catch { }
})();

/* 4) API pública mínima para depurar/automatizar tema */
window.UIThemes = window.UIThemes || {
  /** tema atual (getter) */
  get current() { return (window.currentTheme?.() || "claro"); },
  /** define tema programaticamente */
  set(theme) {
    if (!["claro", "escuro", "marinho", "sepia"].includes(theme)) return false;
    window.applyTheme?.(theme);
    return true;
  },
  /** abre o diálogo de temas se existir */
  open() {
    const btn = document.querySelector("#btnTemas");
    if (btn) { btn.click(); return true; }
    return false;
  }
};

/* 5) Pequena confirmação no console (silenciosa em produção) */
(() => {
  try {
    if (!window.__ui_boot_banner) {
      window.__ui_boot_banner = true;
      // eslint-disable-next-line no-console
      console.info("[Relatórios] Tema & Datas helpers carregados. Tema:", window.currentTheme?.());
    }
  } catch { }
})();

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('normasReferencia');
  if (!sel) return;

  const grid = sel.closest('.grid');
  if (!grid) return;

  // Se o select estiver DENTRO de um <label>, “desaninha” e organiza no grid 4/8
  const hostLabel = sel.closest('label');
  if (hostLabel && hostLabel.parentElement === grid) {
    // tenta obter só o texto do label (ignora o conteúdo do select)
    const labelText =
      Array.from(hostLabel.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Normas de referência';

    const newLabel = document.createElement('label');
    newLabel.setAttribute('for', 'normasReferencia');
    newLabel.textContent = labelText;

    grid.insertBefore(newLabel, hostLabel);      // label ocupa 4 colunas (pela sua CSS)
    grid.insertBefore(sel, hostLabel.nextSibling); // select vira irmão e ocupa 8 colunas
    hostLabel.remove();
  }

  // Garante as colunas (sem afetar outros campos)
  sel.style.gridColumn = 'span 8';
  const lbl = grid.querySelector('label[for="normasReferencia"]');
  if (lbl) lbl.style.gridColumn = 'span 4';
});
