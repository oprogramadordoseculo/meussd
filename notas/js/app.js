import { criarArmazenamento } from "./armazenamento.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const DIAS_LIXEIRA = 30;
const largo = () => matchMedia("(min-width: 900px)").matches;

const estado = {
  arm: null,
  usuario: null,
  notas: new Map(),
  atual: null,
  sujo: false,
  filtro: "todas",
  caderno: "",
  tag: "",
  busca: "",
  ordem: pref("ordem", "atualizada"),
  modo: pref("modo", "editar"),
  meta: { pendente: false },
  pararAssinatura: null,
  limpouLixeira: false,
};

function pref(chave, padrao) {
  try { return localStorage.getItem("notas." + chave) ?? padrao; } catch { return padrao; }
}
function salvarPref(chave, valor) {
  try { localStorage.setItem("notas." + chave, valor); } catch {}
}

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) e.append(f);
  return e;
}

function aviso(msg, erro = false) {
  const a = el("div", { class: "aviso" + (erro ? " erro" : "") }, msg);
  $("#avisos").append(a);
  setTimeout(() => a.remove(), erro ? 6000 : 2600);
}

const normalizar = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function quando(ts) {
  if (!ts) return "";
  const d = new Date(ts), hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return "hoje " + hora;
  if (d.toDateString() === ontem.toDateString()) return "ontem " + hora;
  return d.toLocaleDateString("pt-BR", d.getFullYear() === hoje.getFullYear() ? { day: "2-digit", month: "short" } : undefined);
}

// ── Diálogos ─────────────────────────────────────────────

function abrirDialogo(dlg) {
  return new Promise(res => {
    dlg.addEventListener("close", () => res(dlg.returnValue), { once: true });
    dlg.returnValue = "";
    dlg.showModal();
  });
}

async function pedirTexto(titulo, { valor = "", dica = "", opcoes = [], tipo = "text", placeholder = "" } = {}) {
  $("#dlg-texto-titulo").textContent = titulo;
  $("#dlg-texto-dica").textContent = dica;
  const inp = $("#dlg-texto-valor");
  inp.type = tipo;
  inp.placeholder = placeholder;
  inp.value = valor;
  $("#dlg-texto-lista").replaceChildren(...opcoes.map(o => el("option", { value: o })));
  const p = abrirDialogo($("#dlg-texto"));
  inp.focus(); inp.select();
  return (await p) === "ok" ? inp.value.trim() : null;
}

async function confirmar(titulo, texto, rotulo = "Confirmar") {
  $("#dlg-confirmar-titulo").textContent = titulo;
  $("#dlg-confirmar-texto").textContent = texto;
  $("#dlg-confirmar-ok").textContent = rotulo;
  return (await abrirDialogo($("#dlg-confirmar"))) === "ok";
}

function abrirMenu(dlg, ancora) {
  const r = ancora.getBoundingClientRect();
  dlg.style.top = Math.min(r.bottom + 6, innerHeight - 340) + "px";
  dlg.style.left = Math.max(8, Math.min(r.right - 260, innerWidth - 268)) + "px";
  dlg.showModal();
}
$$(".menu-pop").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));

// ── Início, login ────────────────────────────────────────

async function iniciar() {
  aplicarTema();
  document.body.classList.toggle("serifa", pref("fonte", "serifa") === "serifa");
  try {
    estado.arm = await criarArmazenamento();
  } catch (e) {
    console.error(e);
    $("#carregando").hidden = true;
    document.body.append(el("p", { class: "erro-fatal" },
      "Não foi possível carregar o Firebase. Verifique a internet e a configuração em js/config.js."));
    return;
  }
  estado.arm.aoMudarUsuario(u => (u ? entrouUsuario(u) : mostrarLogin()));
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function mostrarLogin() {
  estado.pararAssinatura?.();
  estado.usuario = null;
  estado.notas.clear();
  estado.atual = null;
  $("#carregando").hidden = true;
  $("#app").hidden = true;
  $("#tela-login").hidden = false;
}

function entrouUsuario(u) {
  estado.usuario = u;
  $("#tela-login").hidden = true;
  $("#usuario-nome").textContent = u.nome || "";
  estado.pararAssinatura?.();
  estado.pararAssinatura = estado.arm.assinarNotas(u.uid, receberNotas, e => {
    console.error(e);
    aviso("Erro ao sincronizar: " + (e.code || e.message), true);
  });
}

function erroLogin(e) {
  const msgs = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/user-not-found": "Conta não encontrada. Toque em Criar conta.",
    "auth/email-already-in-use": "Esse e-mail já tem conta. Toque em Entrar.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/unauthorized-domain": "Este endereço não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).",
    "auth/popup-closed-by-user": "",
    "auth/network-request-failed": "Sem internet.",
  };
  $("#login-erro").textContent = e.code in msgs ? msgs[e.code] : (e.message || "Não foi possível entrar.");
}

$("#entrar-google").onclick = () => estado.arm.entrarGoogle().catch(erroLogin);
$("#form-email").onsubmit = e => {
  e.preventDefault();
  estado.arm.entrarEmail($("#login-email").value, $("#login-senha").value).catch(erroLogin);
};
$("#btn-criar-conta").onclick = () => {
  if (!$("#form-email").reportValidity()) return;
  estado.arm.criarConta($("#login-email").value, $("#login-senha").value).catch(erroLogin);
};

// ── Recebendo notas ──────────────────────────────────────

function receberNotas(lista, meta) {
  estado.meta = meta;
  const anterior = estado.atual && estado.notas.get(estado.atual);
  estado.notas = new Map(lista.map(n => [n.id, completar(n)]));
  $("#carregando").hidden = true;
  $("#app").hidden = false;

  if (!estado.limpouLixeira) {
    estado.limpouLixeira = true;
    const limite = Date.now() - DIAS_LIXEIRA * 864e5;
    for (const n of estado.notas.values()) if (n.lixeira && n.apagadaEm < limite) apagarDeVez(n.id, false);
  }

  if (estado.atual) {
    const n = estado.notas.get(estado.atual);
    if (!n) {
      if (!estado.sujo) fecharNota();
    } else if (!estado.sujo && anterior && (n.conteudo !== $("#texto").value || n.titulo !== $("#titulo").value)) {
      preencherEditor(n, true);
    } else {
      atualizarCabecalhoNota(n);
    }
  }
  desenharLateral();
  atualizarStatus();
}

function completar(n) {
  return {
    titulo: "", conteudo: "", tags: [], caderno: "", fixada: false, arquivada: false,
    lixeira: false, apagadaEm: 0, criada: 0, atualizada: 0, origem: "", ...n,
  };
}

function atualizarStatus() {
  const s = $("#status-sync");
  if (estado.arm.tipo === "local") { s.textContent = "● Modo local"; s.className = "status-sync local"; return; }
  if (!navigator.onLine) { s.textContent = "● Offline — salvo no aparelho"; s.className = "status-sync offline"; return; }
  if (estado.meta.pendente) { s.textContent = "● Sincronizando…"; s.className = "status-sync pendente"; return; }
  s.textContent = "● Sincronizado"; s.className = "status-sync ok";
}
addEventListener("online", atualizarStatus);
addEventListener("offline", atualizarStatus);

// ── Lateral ──────────────────────────────────────────────

function notasVisiveis() {
  const termos = normalizar(estado.busca).split(/\s+/).filter(Boolean);
  const lista = [...estado.notas.values()].filter(n => {
    if (estado.filtro === "lixeira") { if (!n.lixeira) return false; }
    else if (n.lixeira) return false;
    else if (estado.filtro === "arquivadas") { if (!n.arquivada) return false; }
    else if (estado.filtro === "fixadas") { if (!n.fixada || n.arquivada) return false; }
    else if (n.arquivada && !termos.length) return false;
    if (estado.caderno && n.caderno !== estado.caderno) return false;
    if (estado.tag && !n.tags.includes(estado.tag)) return false;
    if (termos.length) {
      const alvo = normalizar(n.titulo + " " + n.conteudo + " " + n.caderno);
      if (!termos.every(t => alvo.includes(t))) return false;
    }
    return true;
  });
  const porTitulo = (a, b) => (a.titulo || "￿").localeCompare(b.titulo || "￿", "pt-BR", { numeric: true, sensitivity: "base" });
  const crit = {
    atualizada: (a, b) => b.atualizada - a.atualizada,
    criada: (a, b) => b.criada - a.criada,
    titulo: porTitulo,
  }[estado.ordem];
  return lista.sort((a, b) => (b.fixada - a.fixada) || crit(a, b));
}

function resumo(texto) {
  return texto
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
    .replace(/^\s*(#{1,6}\s|>\s?|[-*+]\s(\[[ xX]\]\s)?|\d+[.)]\s)/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function desenharLateral() {
  const todas = [...estado.notas.values()];
  const vivas = todas.filter(n => !n.lixeira);
  const cont = {
    todas: vivas.filter(n => !n.arquivada).length,
    fixadas: vivas.filter(n => n.fixada && !n.arquivada).length,
    arquivadas: vivas.filter(n => n.arquivada).length,
    lixeira: todas.length - vivas.length,
  };
  $$("#filtros button").forEach(b => {
    b.classList.toggle("ativo", b.dataset.filtro === estado.filtro);
    b.querySelector("span").textContent = cont[b.dataset.filtro] || "";
  });

  const cadernos = [...new Set(vivas.map(n => n.caderno).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (estado.caderno && !cadernos.includes(estado.caderno)) estado.caderno = "";
  const sel = $("#filtro-caderno");
  sel.replaceChildren(el("option", { value: "" }, "Todos os cadernos"), ...cadernos.map(c => el("option", { value: c }, "📒 " + c)));
  sel.value = estado.caderno;
  sel.hidden = !cadernos.length;
  $("#ordem").value = estado.ordem;

  const contagemTags = new Map();
  vivas.forEach(n => n.tags.forEach(t => contagemTags.set(t, (contagemTags.get(t) || 0) + 1)));
  if (estado.tag && !contagemTags.has(estado.tag)) estado.tag = "";
  const tags = [...contagemTags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $("#tags-filtro").replaceChildren(...tags.map(([t, n]) => el("button", {
    class: "chip" + (estado.tag === t ? " ativo" : ""),
    onclick: () => { estado.tag = estado.tag === t ? "" : t; desenharLateral(); },
  }, "#" + t, el("small", {}, " " + n))));

  const lista = notasVisiveis();
  const ul = $("#lista-notas");
  if (!lista.length) {
    const msg = estado.busca ? "Nada encontrado." :
      estado.filtro === "lixeira" ? "A lixeira está vazia." :
      estado.filtro === "arquivadas" ? "Nenhuma nota arquivada." :
      estado.filtro === "fixadas" ? "Nenhuma nota fixada." : "Nenhuma nota ainda.\nCrie a sua primeira!";
    ul.replaceChildren(el("li", { class: "lista-vazia" }, msg));
    return;
  }
  ul.replaceChildren(...lista.map(n => el("li", {
    class: "item-nota" + (n.id === estado.atual ? " ativa" : ""),
    onclick: () => abrirNota(n.id),
  },
    el("div", { class: "item-titulo" }, n.fixada ? el("span", { class: "pino" }, "📌") : null, n.titulo || "Sem título"),
    el("div", { class: "item-resumo" }, resumo(n.conteudo) || "…"),
    el("div", { class: "item-meta" },
      el("span", {}, quando(n.atualizada)),
      n.caderno ? el("span", { class: "item-caderno" }, "📒 " + n.caderno) : null,
      ...n.tags.slice(0, 3).map(t => el("span", { class: "item-tag" }, "#" + t))),
  )));
}

$$("#filtros button").forEach(b => b.onclick = () => { estado.filtro = b.dataset.filtro; desenharLateral(); });
$("#filtro-caderno").onchange = e => { estado.caderno = e.target.value; desenharLateral(); };
$("#ordem").onchange = e => { estado.ordem = e.target.value; salvarPref("ordem", estado.ordem); desenharLateral(); };
let atrasoBusca;
$("#busca").addEventListener("input", e => {
  clearTimeout(atrasoBusca);
  atrasoBusca = setTimeout(() => { estado.busca = e.target.value; desenharLateral(); }, 150);
});

// ── Criar, abrir, salvar ─────────────────────────────────

function novaNota(dados = {}, abrir = true) {
  const agora = Date.now();
  const id = estado.arm.novoId(estado.usuario.uid);
  const nota = completar({
    caderno: estado.caderno, criada: agora, atualizada: agora, ...dados,
  });
  nota.tags = extrairTags(nota.conteudo);
  delete nota.id;
  estado.notas.set(id, { id, ...nota });
  estado.arm.salvar(estado.usuario.uid, id, nota).catch(e => aviso("Erro ao salvar: " + e.message, true));
  if (abrir) {
    if (estado.filtro !== "todas") estado.filtro = "todas";
    abrirNota(id);
    if (!nota.titulo) $("#titulo").focus();
  }
  return id;
}

function notaVazia(n) { return n && !n.titulo.trim() && !n.conteudo.trim(); }

function abrirNota(id) {
  if (estado.atual && estado.atual !== id) {
    salvarAgora();
    const anterior = estado.notas.get(estado.atual);
    if (notaVazia(anterior)) apagarDeVez(anterior.id, false);
  }
  const n = estado.notas.get(id);
  if (!n) return;
  const jaAberta = estado.atual === id;
  estado.atual = id;
  preencherEditor(n);
  document.body.classList.add("editando");
  if (!largo() && !jaAberta) history.pushState({ nota: id }, "");
  desenharLateral();
}

function fecharNota() {
  salvarAgora();
  const n = estado.notas.get(estado.atual);
  if (notaVazia(n)) apagarDeVez(n.id, false);
  estado.atual = null;
  $("#nota").hidden = true;
  $("#vazio-editor").hidden = false;
  document.body.classList.remove("editando", "foco");
  desenharLateral();
}

addEventListener("popstate", () => { if (!largo() && estado.atual) fecharNota(); });
$("#btn-voltar").onclick = () => { if (history.state?.nota) history.back(); else fecharNota(); };

function preencherEditor(n, remoto = false) {
  const texto = $("#texto");
  const sel = [texto.selectionStart, texto.selectionEnd];
  $("#vazio-editor").hidden = true;
  $("#nota").hidden = false;
  $("#titulo").value = n.titulo;
  texto.value = n.conteudo;
  if (remoto && document.activeElement === texto) texto.setSelectionRange(...sel);
  if (!remoto) texto.scrollTop = 0;
  estado.sujo = false;
  aplicarModo();
  atualizarCabecalhoNota(n);
  renderizar();
  atualizarContagem();
}

function atualizarCabecalhoNota(n) {
  $("#btn-fixar").classList.toggle("ligado", n.fixada);
  $("#lixeira-aviso").hidden = !n.lixeira;
  $("#texto").readOnly = $("#titulo").readOnly = n.lixeira;
  $("#ferramentas").classList.toggle("desativado", n.lixeira);
  $("#caderno-rotulo").textContent = n.caderno ? "📒 " + n.caderno : "";
  const origem = $("#origem");
  origem.replaceChildren(n.origem ? el("a", { href: n.origem, target: "_blank", rel: "noopener" }, "🔗 fonte") : "");
  $("#salvo").textContent = estado.sujo ? "editando…" : quando(n.atualizada);
  $("[data-acao=arquivar]", $("#menu-nota")).textContent = n.arquivada ? "🗄 Desarquivar" : "🗄 Arquivar";
  desenharReferencias(n);
}

let timerSalvar;
function aoEditar() {
  estado.sujo = true;
  $("#salvo").textContent = "editando…";
  clearTimeout(timerSalvar);
  timerSalvar = setTimeout(salvarAgora, 700);
  agendarRender();
  atualizarContagem();
}
$("#texto").addEventListener("input", aoEditar);
$("#titulo").addEventListener("input", aoEditar);
$("#titulo").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); $("#texto").focus(); }
});

function salvarAgora() {
  clearTimeout(timerSalvar);
  if (!estado.sujo || !estado.atual) return;
  const n = estado.notas.get(estado.atual);
  if (!n) return;
  const conteudo = $("#texto").value;
  const titulo = $("#titulo").value.trim();
  const dados = { titulo, conteudo, tags: extrairTags(conteudo), atualizada: Date.now() };
  Object.assign(n, dados);
  estado.sujo = false;
  estado.arm.salvar(estado.usuario.uid, n.id, dados).catch(e => aviso("Erro ao salvar: " + e.message, true));
  $("#salvo").textContent = "salvo";
  desenharLateral();
}
document.addEventListener("visibilitychange", () => { if (document.hidden) salvarAgora(); });
addEventListener("pagehide", salvarAgora);

function alterarNota(id, dados, msg) {
  const n = estado.notas.get(id);
  if (!n) return;
  Object.assign(n, dados);
  estado.arm.salvar(estado.usuario.uid, id, dados).catch(e => aviso("Erro: " + e.message, true));
  if (msg) aviso(msg);
  if (id === estado.atual) atualizarCabecalhoNota(n);
  desenharLateral();
}

function apagarDeVez(id, avisar = true) {
  estado.notas.delete(id);
  estado.arm.apagar(estado.usuario.uid, id).catch(() => {});
  if (avisar) aviso("Nota excluída");
}

function extrairTags(texto) {
  const limpo = texto.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ").replace(/\]\([^)]*\)/g, "]");
  const tags = new Set();
  for (const m of limpo.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_][\p{L}\p{N}_\-/]*)/gu)) tags.add(m[1].toLowerCase());
  return [...tags];
}

// ── Prévia em Markdown ───────────────────────────────────

if (window.DOMPurify) {
  DOMPurify.addHook("afterSanitizeAttributes", no => {
    if (no.tagName === "A" && no.getAttribute("href") && !no.classList.contains("wikilink")) {
      no.setAttribute("target", "_blank");
      no.setAttribute("rel", "noopener noreferrer");
    }
  });
}

const escapar = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function preparar(md) {
  return md.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/).map((parte, i) => {
    if (i % 2) return parte;
    return parte
      .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_, alvo, rotulo) =>
        `<a href="#" class="wikilink" data-nota="${escapar(alvo.trim())}">${escapar((rotulo || alvo).trim())}</a>`)
      .replace(/(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_][\p{L}\p{N}_\-/]*)/gu, (_, antes, t) =>
        `${antes}<span class="tag" data-tag="${escapar(t.toLowerCase())}">#${escapar(t)}</span>`);
  }).join("");
}

function renderizar() {
  const previa = $("#previa");
  const md = $("#texto").value;
  if (!window.marked || !window.DOMPurify) {
    previa.replaceChildren(el("pre", { class: "sem-markdown" }, md));
    return;
  }
  previa.innerHTML = DOMPurify.sanitize(marked.parse(preparar(md), { gfm: true, breaks: true }));
  $$("input[type=checkbox]", previa).forEach((c, i) => {
    c.disabled = false;
    c.dataset.i = i;
    c.closest("li")?.classList.add("tarefa", ...(c.checked ? ["feita"] : []));
  });
  $$("a.wikilink", previa).forEach(a => {
    if (!acharPorTitulo(a.dataset.nota)) a.classList.add("faltando");
  });
  if (window.hljs) $$("pre code", previa).forEach(b => hljs.highlightElement(b));
}

let rafRender = 0;
function agendarRender() {
  if (estado.modo === "editar") return;
  cancelAnimationFrame(rafRender);
  rafRender = requestAnimationFrame(renderizar);
}

$("#previa").addEventListener("click", e => {
  const alvo = e.target;
  if (alvo.matches("input[type=checkbox]")) {
    if (estado.notas.get(estado.atual)?.lixeira) { e.preventDefault(); return; }
    alternarTarefa(+alvo.dataset.i);
  } else if (alvo.closest("a.wikilink")) {
    e.preventDefault();
    irParaNota(alvo.closest("a.wikilink").dataset.nota);
  } else if (alvo.matches(".tag")) {
    estado.tag = alvo.dataset.tag;
    estado.filtro = "todas";
    desenharLateral();
    if (!largo()) $("#btn-voltar").click();
  }
});

function alternarTarefa(indice) {
  const texto = $("#texto");
  let n = -1;
  texto.value = texto.value.split("\n").map(linha => linha.replace(
    /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/, (m, pre, marca) => (++n === indice ? `${pre}[${marca === " " ? "x" : " "}]` : m),
  )).join("\n");
  aoEditar();
  renderizar();
}

function acharPorTitulo(titulo) {
  const alvo = normalizar(titulo.trim());
  return [...estado.notas.values()].find(n => !n.lixeira && normalizar(n.titulo.trim()) === alvo);
}

function irParaNota(titulo) {
  const n = acharPorTitulo(titulo);
  if (n) abrirNota(n.id);
  else novaNota({ titulo: titulo.trim(), conteudo: "" });
}

function desenharReferencias(n) {
  const box = $("#referencias");
  if (!n.titulo) { box.replaceChildren(); return; }
  const chave = normalizar(n.titulo);
  const re = /\[\[([^\]|\n]+)/g;
  const refs = [...estado.notas.values()].filter(o => o.id !== n.id && !o.lixeira &&
    [...o.conteudo.matchAll(re)].some(m => normalizar(m[1].trim()) === chave));
  box.replaceChildren(...(refs.length ? [el("span", {}, "Citada em: "),
    ...refs.map(r => el("a", { href: "#", onclick: e => { e.preventDefault(); abrirNota(r.id); } }, r.titulo || "Sem título"))] : []));
}

function atualizarContagem() {
  const t = $("#texto").value;
  const palavras = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  const tarefas = (t.match(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/gm) || []).length;
  const feitas = (t.match(/^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/gm) || []).length;
  const min = Math.max(1, Math.round(palavras / 200));
  $("#contagem").textContent = `${palavras.toLocaleString("pt-BR")} palavras · ${t.length.toLocaleString("pt-BR")} caracteres · ${min} min de leitura`
    + (tarefas ? ` · ☑ ${feitas}/${tarefas}` : "");
}

// ── Modos e foco ─────────────────────────────────────────

function aplicarModo() {
  let modo = estado.modo;
  if (modo === "dividir" && !largo()) modo = "editar";
  $("#corpo").dataset.modo = modo;
  $$("#modos button").forEach(b => b.classList.toggle("ativo", b.dataset.modo === modo));
  $("#ferramentas").hidden = modo === "ler";
  if (modo !== "editar") renderizar();
}
$$("#modos button").forEach(b => b.onclick = () => {
  estado.modo = b.dataset.modo;
  salvarPref("modo", estado.modo);
  aplicarModo();
  if (estado.modo !== "ler") $("#texto").focus();
});
addEventListener("resize", () => { if (estado.atual) aplicarModo(); });

function alternarFoco() {
  if (!estado.atual) return;
  document.body.classList.toggle("foco");
  if (document.body.classList.contains("foco")) aviso("Modo foco — Esc para sair");
}
$("#btn-foco").onclick = alternarFoco;
$("#btn-fixar").onclick = () => {
  const n = estado.notas.get(estado.atual);
  alterarNota(n.id, { fixada: !n.fixada }, n.fixada ? "Desafixada" : "Fixada no topo");
};

// ── Edição de texto ──────────────────────────────────────

const texto = $("#texto");

function inserir(conteudo, ini = texto.selectionStart, fim = texto.selectionEnd, selIni, selFim) {
  texto.focus();
  texto.setSelectionRange(ini, fim);
  if (!document.execCommand("insertText", false, conteudo)) {
    texto.setRangeText(conteudo, ini, fim, "end");
    aoEditar();
  }
  if (selIni !== undefined) texto.setSelectionRange(ini + selIni, ini + (selFim ?? selIni));
}

function envolver(antes, depois, exemplo) {
  const [a, b] = [texto.selectionStart, texto.selectionEnd];
  const sel = texto.value.slice(a, b) || exemplo;
  inserir(antes + sel + depois, a, b, antes.length, antes.length + sel.length);
}

function linhasSelecionadas() {
  const v = texto.value;
  const ini = v.lastIndexOf("\n", texto.selectionStart - 1) + 1;
  let fim = v.indexOf("\n", texto.selectionEnd);
  if (fim === -1) fim = v.length;
  return [ini, fim, v.slice(ini, fim).split("\n")];
}

function prefixar(gerar, padrao) {
  const [ini, fim, linhas] = linhasSelecionadas();
  const todasTem = linhas.every(l => padrao.test(l));
  const novas = linhas.map((l, i) => (todasTem ? l.replace(padrao, "") : gerar(i) + l.replace(padrao, "")));
  const r = novas.join("\n");
  inserir(r, ini, fim, r.length);
}

const formatos = {
  h1: () => prefixar(() => "# ", /^#{1,6}\s/),
  h2: () => prefixar(() => "## ", /^#{1,6}\s/),
  negrito: () => envolver("**", "**", "negrito"),
  italico: () => envolver("*", "*", "itálico"),
  riscado: () => envolver("~~", "~~", "riscado"),
  lista: () => prefixar(() => "- ", /^\s*[-*+]\s(?!\[)/),
  numerada: () => prefixar(i => `${i + 1}. `, /^\s*\d+[.)]\s/),
  tarefa: () => prefixar(() => "- [ ] ", /^\s*[-*+]\s\[[ xX]\]\s/),
  citacao: () => prefixar(() => "> ", /^>\s?/),
  codigo: () => {
    const [a, b] = [texto.selectionStart, texto.selectionEnd];
    const sel = texto.value.slice(a, b);
    if (sel.includes("\n") || !sel) {
      const antes = (a && texto.value[a - 1] !== "\n" ? "\n" : "") + "```\n";
      inserir(antes + (sel || "código") + "\n```\n", a, b, antes.length, antes.length + (sel || "código").length);
    } else envolver("`", "`", "código");
  },
  link: () => {
    const [a, b] = [texto.selectionStart, texto.selectionEnd];
    const sel = texto.value.slice(a, b) || "texto";
    inserir(`[${sel}](https://)`, a, b, sel.length + 3, sel.length + 11);
  },
  wiki: () => envolver("[[", "]]", "Outra nota"),
  linha: () => inserir("\n\n---\n\n"),
  data: () => inserir(new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })),
  fonte: () => {
    const serifa = !document.body.classList.contains("serifa");
    document.body.classList.toggle("serifa", serifa);
    salvarPref("fonte", serifa ? "serifa" : "normal");
  },
};

$("#ferramentas").addEventListener("mousedown", e => { if (e.target.closest("button")) e.preventDefault(); });
$("#ferramentas").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b || $("#ferramentas").classList.contains("desativado")) return;
  formatos[b.dataset.fmt]?.();
});

texto.addEventListener("keydown", e => {
  if (e.isComposing) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && !e.shiftKey && ["b", "i", "k"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    formatos[{ b: "negrito", i: "italico", k: "link" }[e.key.toLowerCase()]]();
    return;
  }
  if (e.key === "Tab" && !ctrl) {
    e.preventDefault();
    if (e.shiftKey) {
      const [ini, fim, linhas] = linhasSelecionadas();
      const r = linhas.map(l => l.replace(/^ {1,2}/, "")).join("\n");
      inserir(r, ini, fim, r.length);
    } else inserir("  ");
    return;
  }
  if (e.key === "Enter" && !e.shiftKey && !ctrl && texto.selectionStart === texto.selectionEnd) {
    const v = texto.value, pos = texto.selectionStart;
    const ini = v.lastIndexOf("\n", pos - 1) + 1;
    const linha = v.slice(ini, pos);
    const m = linha.match(/^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) |> )(.*)$/);
    if (!m) return;
    e.preventDefault();
    if (!m[5].trim()) {
      texto.setRangeText(m[1], ini, pos, "end");
      aoEditar();
      return;
    }
    let prox = m[2];
    if (m[3]) prox = `${+m[3] + 1}${m[4]} `;
    else if (/\[[ xX]\]/.test(prox)) prox = prox[0] + " [ ] ";
    inserir("\n" + m[1] + prox);
  }
});

// ── Menus de nota e conta ────────────────────────────────

$("#btn-mais").onclick = e => abrirMenu($("#menu-nota"), e.currentTarget);
$("#btn-conta").onclick = e => {
  const u = estado.usuario;
  $("#conta-info").replaceChildren(
    el("b", {}, u.nome || "Você"),
    el("small", {}, estado.arm.tipo === "local"
      ? "Modo local: as notas ficam só neste navegador. Configure o Firebase para sincronizar."
      : (u.email || "") + " · sincronizado na nuvem"));
  $("[data-acao=sair]", $("#menu-conta")).hidden = estado.arm.tipo === "local";
  abrirMenu($("#menu-conta"), e.currentTarget);
};

function baixarArquivo(nome, conteudo, tipo = "text/markdown") {
  const url = URL.createObjectURL(conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo + ";charset=utf-8" }));
  const a = el("a", { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const nomeArquivo = n => (n.titulo || "Sem título").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
const comoMarkdown = n => (n.titulo ? `# ${n.titulo}\n\n` : "") + n.conteudo;

const acoesNota = {
  async caderno(n) {
    const cadernos = [...new Set([...estado.notas.values()].map(x => x.caderno).filter(Boolean))];
    const nome = await pedirTexto("📒 Caderno", {
      valor: n.caderno, opcoes: cadernos, placeholder: "Ex.: Livro, Estudos, Trabalho",
      dica: "Escolha um existente ou digite um novo. Deixe vazio para tirar do caderno.",
    });
    if (nome !== null) alterarNota(n.id, { caderno: nome }, nome ? `Movida para ${nome}` : "Removida do caderno");
  },
  duplicar(n) {
    salvarAgora();
    novaNota({ titulo: (n.titulo || "Sem título") + " (cópia)", conteudo: n.conteudo, caderno: n.caderno });
    aviso("Nota duplicada");
  },
  async copiar(n) {
    await navigator.clipboard.writeText(comoMarkdown(n)).then(() => aviso("Texto copiado"), () => aviso("Não consegui copiar", true));
  },
  exportar(n) { baixarArquivo(nomeArquivo(n) + ".md", comoMarkdown(n)); },
  async compartilhar(n) {
    if (navigator.share) navigator.share({ title: n.titulo, text: comoMarkdown(n) }).catch(() => {});
    else acoesNota.copiar(n);
  },
  arquivar(n) {
    alterarNota(n.id, { arquivada: !n.arquivada }, n.arquivada ? "Nota desarquivada" : "Nota arquivada");
  },
  lixeira(n) {
    alterarNota(n.id, { lixeira: true, apagadaEm: Date.now(), fixada: false }, `Movida para a lixeira (fica ${DIAS_LIXEIRA} dias)`);
    if (estado.filtro !== "lixeira") fecharNotaComHistorico();
  },
};

function fecharNotaComHistorico() {
  if (!largo() && history.state?.nota) history.back(); else fecharNota();
}

$("#menu-nota").addEventListener("click", async e => {
  const b = e.target.closest("button[data-acao]");
  if (!b) return;
  $("#menu-nota").close();
  salvarAgora();
  const n = estado.notas.get(estado.atual);
  if (n) await acoesNota[b.dataset.acao](n);
});

$("#btn-restaurar").onclick = () => alterarNota(estado.atual, { lixeira: false, apagadaEm: 0 }, "Nota restaurada");
$("#btn-excluir-sempre").onclick = async () => {
  if (!await confirmar("Excluir para sempre?", "Esta nota não poderá ser recuperada.", "Excluir")) return;
  const id = estado.atual;
  fecharNotaComHistorico();
  apagarDeVez(id);
};

const acoesConta = {
  importar() { $("#arquivo-importar").click(); },
  async colar() {
    $("#colar-texto").value = "";
    const p = abrirDialogo($("#dlg-colar"));
    $("#colar-texto").focus();
    if ((await p) !== "ok") return;
    const blocos = $("#colar-texto").value.split(/^\s*---\s*$/m).map(b => b.trim()).filter(Boolean);
    blocos.forEach(b => {
      const [primeira, ...resto] = b.split("\n");
      novaNota({ titulo: primeira.replace(/^#+\s*/, "").trim().slice(0, 120), conteudo: resto.join("\n").trim() }, false);
    });
    if (blocos.length) { aviso(`${blocos.length} nota(s) criada(s)`); estado.filtro = "todas"; desenharLateral(); }
  },
  async "exportar-tudo"() {
    const notas = [...estado.notas.values()].filter(n => !n.lixeira);
    if (!notas.length) return aviso("Não há notas para baixar");
    try {
      await carregarScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
      const zip = new JSZip();
      const usados = new Set();
      for (const n of notas) {
        const pasta = n.arquivada ? "Arquivo/" : n.caderno ? nomeArquivo({ titulo: n.caderno }) + "/" : "";
        let nome = pasta + nomeArquivo(n), k = 1;
        while (usados.has(nome)) nome = pasta + nomeArquivo(n) + ` (${++k})`;
        usados.add(nome);
        zip.file(nome + ".md", comoMarkdown(n), { date: new Date(n.atualizada || Date.now()) });
      }
      zip.file("notas-backup.json", JSON.stringify(notas, null, 2));
      const data = new Date().toISOString().slice(0, 10);
      baixarArquivo(`minhas-notas-${data}.zip`, await zip.generateAsync({ type: "blob" }));
    } catch {
      aviso("Sem internet para gerar o .zip. Baixando backup em JSON.", true);
      baixarArquivo("minhas-notas.json", JSON.stringify(notas, null, 2), "application/json");
    }
  },
  async esvaziar() {
    const lixo = [...estado.notas.values()].filter(n => n.lixeira);
    if (!lixo.length) return aviso("A lixeira já está vazia");
    if (!await confirmar("Esvaziar a lixeira?", `${lixo.length} nota(s) serão apagadas para sempre.`, "Esvaziar")) return;
    if (lixo.some(n => n.id === estado.atual)) fecharNota();
    lixo.forEach(n => apagarDeVez(n.id, false));
    desenharLateral();
    aviso("Lixeira esvaziada");
  },
  async sair() {
    salvarAgora();
    await estado.arm.sair();
  },
};

$("#menu-conta").addEventListener("click", e => {
  const b = e.target.closest("button[data-acao]");
  if (!b) return;
  $("#menu-conta").close();
  acoesConta[b.dataset.acao]();
});

function carregarScript(src) {
  return new Promise((ok, falha) => {
    if ([...document.scripts].some(s => s.src === src)) return ok();
    document.head.append(el("script", { src, onload: ok, onerror: falha }));
  });
}

$("#arquivo-importar").onchange = async e => {
  const arquivos = [...e.target.files];
  e.target.value = "";
  for (const f of arquivos) {
    let conteudo = (await f.text()).replace(/\r\n/g, "\n");
    let titulo = f.name.replace(/\.(txt|md|markdown)$/i, "");
    const m = conteudo.match(/^#\s+(.+)\n+/);
    if (m) { titulo = m[1].trim(); conteudo = conteudo.slice(m[0].length); }
    novaNota({ titulo, conteudo, criada: f.lastModified || Date.now(), atualizada: f.lastModified || Date.now() }, false);
  }
  if (arquivos.length) { aviso(`${arquivos.length} nota(s) importada(s)`); estado.filtro = "todas"; desenharLateral(); }
};

// ── Nota a partir de link ────────────────────────────────

$("#btn-link").onclick = async () => {
  let sugestao = "";
  try {
    const c = (await navigator.clipboard?.readText?.())?.trim();
    if (c && /^https?:\/\/\S+$/.test(c)) sugestao = c;
  } catch {}
  const url = await pedirTexto("🔗 Criar nota de uma página", {
    valor: sugestao, tipo: "url", placeholder: "https://…",
    dica: "Cole o endereço de um artigo, notícia ou post. O texto da página vira uma nota, com o link da fonte.",
  });
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) return aviso("O link precisa começar com http:// ou https://", true);
  aviso("Lendo a página…");
  try {
    const r = await fetch("https://r.jina.ai/" + url, { headers: { Accept: "text/plain", "X-Return-Format": "markdown" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const bruto = await r.text();
    const titulo = (bruto.match(/^Title:\s*(.+)$/m)?.[1] || new URL(url).hostname).trim();
    const corpo = (bruto.split(/^Markdown Content:\s*$/m)[1] ?? bruto).trim();
    if (!corpo) throw new Error("vazio");
    novaNota({ titulo, conteudo: `> Fonte: <${url}>\n\n${corpo}`, origem: url });
    aviso("Nota criada a partir da página");
  } catch (e) {
    console.error(e);
    aviso("Não consegui ler essa página. Ela pode exigir login ou bloquear leitura automática.", true);
  }
};

// ── Tema ─────────────────────────────────────────────────

function aplicarTema() {
  const tema = pref("tema", "auto");
  const raiz = document.documentElement;
  if (tema === "auto") raiz.removeAttribute("data-tema"); else raiz.dataset.tema = tema;
  const escuro = tema === "escuro" || (tema === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $("#hl-tema").href = `https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/styles/${escuro ? "github-dark" : "github"}.min.css`;
  $("#btn-tema").title = { auto: "Tema: automático", claro: "Tema: claro", escuro: "Tema: escuro" }[tema];
}
$("#btn-tema").onclick = () => {
  const ordem = ["auto", "claro", "escuro"];
  const prox = ordem[(ordem.indexOf(pref("tema", "auto")) + 1) % 3];
  salvarPref("tema", prox);
  aplicarTema();
  aviso($("#btn-tema").title);
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", aplicarTema);

// ── Atalhos e botões gerais ──────────────────────────────

$("#btn-nova").onclick = () => novaNota();
$("#btn-nova-vazio").onclick = () => novaNota();

document.addEventListener("keydown", e => {
  if (document.querySelector("dialog[open]") || !estado.usuario) return;
  const digitando = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === "/" && !digitando) { e.preventDefault(); $("#busca").focus(); }
  else if (e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); novaNota(); }
  else if (ctrl && e.key.toLowerCase() === "s") { e.preventDefault(); salvarAgora(); }
  else if (ctrl && e.key.toLowerCase() === "e" && estado.atual) {
    e.preventDefault();
    estado.modo = $("#corpo").dataset.modo === "ler" ? "editar" : "ler";
    salvarPref("modo", estado.modo);
    aplicarModo();
    if (estado.modo === "editar") texto.focus();
  } else if (e.key === "F11" && estado.atual) { e.preventDefault(); alternarFoco(); }
  else if (e.key === "Escape" && document.body.classList.contains("foco")) document.body.classList.remove("foco");
});

iniciar();
