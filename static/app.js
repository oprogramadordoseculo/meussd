"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const ICONES = {
  pasta: "📁", video: "🎬", imagem: "🖼️", audio: "🎵", texto: "📝",
  documento: "📄", pacote: "📦", arquivo: "📄",
};
const VISIVEIS = new Set(["imagem", "video", "audio", "texto"]);

const estado = {
  modo: "pasta",
  caminho: "",
  itens: [],
  sel: new Set(),
  visao: lerPref("visao", "grade"),
  ordem: lerPref("ordem", "nome"),
};

function lerPref(chave, padrao) {
  try { return localStorage.getItem("meussd." + chave) || padrao; } catch { return padrao; }
}
function salvarPref(chave, valor) {
  try { localStorage.setItem("meussd." + chave, valor); } catch {}
}

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined) e.append(f);
  return e;
}

function urlArquivo(prefixo, caminho) {
  return "/" + prefixo + "/" + caminho.split("/").map(encodeURIComponent).join("/");
}

function tamanho(b) {
  if (b === null || b === undefined) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (i ? b.toFixed(b < 10 ? 1 : 0) : b) + " " + u[i];
}

function data(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function aviso(msg, erro = false) {
  const a = el("div", { class: "aviso" + (erro ? " erro" : "") }, msg);
  $("#avisos").append(a);
  setTimeout(() => a.remove(), erro ? 6000 : 3000);
}

async function api(url, dados) {
  const op = dados === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados),
  };
  const r = await fetch(url, op);
  if (r.status === 401) { location.href = "/entrar"; throw new Error("Sessão expirada"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}

async function tentar(fn) {
  try { return await fn(); } catch (e) { aviso(e.message, true); }
}

// ── Diálogos ─────────────────────────────────────────────

function abrirDialogo(dlg) {
  return new Promise(res => {
    dlg.addEventListener("close", () => res(dlg.returnValue), { once: true });
    dlg.returnValue = "";
    dlg.showModal();
  });
}

async function pedirTexto(titulo, valor = "", selecionarAteExt = false) {
  $("#dlg-texto-titulo").textContent = titulo;
  const inp = $("#dlg-texto-valor");
  inp.value = valor;
  const p = abrirDialogo($("#dlg-texto"));
  inp.focus();
  const ponto = valor.lastIndexOf(".");
  if (selecionarAteExt && ponto > 0) inp.setSelectionRange(0, ponto); else inp.select();
  return (await p) === "ok" && inp.value.trim() ? inp.value.trim() : null;
}

async function confirmar(titulo, texto, rotulo = "Confirmar") {
  $("#dlg-confirmar-titulo").textContent = titulo;
  $("#dlg-confirmar-texto").textContent = texto;
  $("#dlg-confirmar-ok").textContent = rotulo;
  return (await abrirDialogo($("#dlg-confirmar"))) === "ok";
}

async function escolherPasta(titulo, inicial) {
  const dlg = $("#dlg-destino");
  $("#dlg-destino-titulo").textContent = titulo;
  let atual = inicial;
  async function mostrar(caminho) {
    const r = await tentar(() => api("/api/pastas?caminho=" + encodeURIComponent(caminho)));
    if (!r) return;
    atual = r.caminho;
    montarTrilha($("#destino-trilha"), atual, mostrar);
    const lista = $("#destino-pastas");
    lista.replaceChildren(...(r.pastas.length
      ? r.pastas.map(n => el("button", { type: "button", onclick: () => mostrar(juntar(atual, n)) }, "📁 " + n))
      : [el("div", { class: "dica", style: "padding:12px" }, "Sem subpastas")]));
  }
  await mostrar(inicial);
  return (await abrirDialogo(dlg)) === "ok" ? atual : null;
}

function juntar(a, b) { return a ? a + "/" + b : b; }
function pai(c) { return c.includes("/") ? c.slice(0, c.lastIndexOf("/")) : ""; }

// ── Navegação ────────────────────────────────────────────

function lerHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === "lixeira") return { modo: "lixeira", caminho: "" };
  return { modo: "pasta", caminho: h.replace(/^\/+|\/+$/g, "") };
}

function irPara(caminho) {
  location.hash = "#/" + caminho.split("/").map(encodeURIComponent).join("/");
}

window.addEventListener("hashchange", carregar);

async function carregar() {
  const { modo, caminho } = lerHash();
  estado.modo = modo;
  estado.sel.clear();
  $("#busca").value = "";
  if (modo === "lixeira") {
    const r = await tentar(() => api("/api/lixeira"));
    if (!r) return;
    estado.caminho = "";
    estado.itens = r.itens.map(i => ({ ...i, caminho: i.id }));
  } else {
    const r = await tentar(() => api("/api/listar?caminho=" + encodeURIComponent(caminho)));
    if (!r) { if (caminho) irPara(pai(caminho)); return; }
    estado.caminho = r.caminho;
    estado.itens = r.itens;
  }
  desenhar();
}

async function buscar(termo) {
  if (termo.length < 2) { if (estado.modo === "busca") carregar(); return; }
  const r = await tentar(() => api("/api/buscar?q=" + encodeURIComponent(termo)));
  if (!r) return;
  estado.modo = "busca";
  estado.sel.clear();
  estado.itens = r.itens;
  desenhar();
  if (r.limitado) aviso("Mostrando os primeiros 300 resultados");
}

function montarTrilha(alvo, caminho, aoClicar) {
  const partes = caminho ? caminho.split("/") : [];
  const nos = [];
  const raiz = el("a", { href: "#", onclick: e => { e.preventDefault(); aoClicar(""); } }, "🏠");
  nos.push(partes.length ? raiz : el("span", { class: "atual" }, "🏠 MeuSSD"));
  partes.forEach((p, i) => {
    nos.push(el("span", { class: "sep" }, "›"));
    const ate = partes.slice(0, i + 1).join("/");
    nos.push(i === partes.length - 1
      ? el("span", { class: "atual" }, p)
      : el("a", { href: "#", onclick: e => { e.preventDefault(); aoClicar(ate); } }, p));
  });
  alvo.replaceChildren(...nos);
}

// ── Desenho ──────────────────────────────────────────────

function ordenados() {
  const its = [...estado.itens];
  const pastaPrimeiro = (a, b) => (a.tipo === "pasta" ? 0 : 1) - (b.tipo === "pasta" ? 0 : 1);
  const porNome = (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" });
  const crit = {
    nome: porNome,
    data: (a, b) => (b.modificado || b.apagado) - (a.modificado || a.apagado),
    tamanho: (a, b) => (b.tamanho || 0) - (a.tamanho || 0),
    tipo: (a, b) => a.tipo.localeCompare(b.tipo) || porNome(a, b),
  }[estado.ordem];
  return its.sort((a, b) => pastaPrimeiro(a, b) || crit(a, b));
}

function desenhar() {
  const main = $("#conteudo");
  main.className = estado.visao + (estado.sel.size ? " selecionando" : "");
  $("#btn-visao").textContent = estado.visao === "grade" ? "☰" : "▦";
  $("#ordem").value = estado.ordem;

  const trilha = $("#trilha");
  if (estado.modo === "lixeira") trilha.replaceChildren(el("span", { class: "atual" }, "🗑️ Lixeira"),
    el("button", { class: "btn perigo", style: "margin-left:8px", onclick: esvaziarLixeira }, "Esvaziar"));
  else if (estado.modo === "busca") trilha.replaceChildren(el("span", { class: "atual" }, `🔎 ${estado.itens.length} resultado(s)`));
  else montarTrilha(trilha, estado.caminho, irPara);

  const naPasta = estado.modo === "pasta";
  $("#btn-voltar").disabled = naPasta && !estado.caminho;
  for (const id of ["#btn-nova-pasta", "#btn-enviar", "#btn-link"]) $(id).hidden = !naPasta;

  const lista = ordenados();
  estado.visiveis = lista;
  if (!lista.length) {
    main.replaceChildren(el("div", { class: "vazio" },
      estado.modo === "lixeira" ? "A lixeira está vazia" :
      estado.modo === "busca" ? "Nada encontrado" : "📂 Pasta vazia — arraste arquivos aqui ou toque em Enviar"));
  } else {
    main.replaceChildren(...lista.map(desenharItem));
  }
  atualizarSelecao();
}

function desenharItem(it) {
  const capa = el("div", { class: "capa" }, ICONES[it.tipo] || "📄");
  if ((it.tipo === "imagem" || it.tipo === "video") && estado.modo !== "lixeira") {
    const img = el("img", { loading: "lazy", alt: "", src: urlArquivo("mini", it.caminho) });
    img.onload = () => { capa.firstChild.nodeType === 3 && capa.firstChild.remove(); };
    img.onerror = () => img.remove();
    capa.append(img);
    if (it.tipo === "video") capa.append(el("span", { class: "play" }, "▶"));
  }
  const meta = estado.modo === "lixeira"
    ? [el("div", { class: "meta" }, "de /" + pai(it.original)), el("div", { class: "meta data" }, data(it.apagado))]
    : [el("div", { class: "meta" }, it.tipo === "pasta" ? "Pasta" : tamanho(it.tamanho)),
       el("div", { class: "meta data" }, data(it.modificado))];
  const rotulo = el("div", { class: "rotulo" },
    el("div", { style: "min-width:0;flex:1" },
      el("div", { class: "nome", title: it.nome }, it.nome),
      estado.modo === "busca" ? el("div", { class: "caminho-busca" }, "/" + pai(it.caminho)) : null),
    ...meta);
  const marca = el("span", { class: "marca" });
  const item = el("div", { class: "item" + (estado.sel.has(it.caminho) ? " sel" : ""), dataset: { c: it.caminho } },
    marca, capa, rotulo);

  let timer, longo = false;
  item.addEventListener("pointerdown", () => {
    longo = false;
    timer = setTimeout(() => { longo = true; alternar(it, item); navigator.vibrate?.(30); }, 500);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => item.addEventListener(ev, () => clearTimeout(timer)));
  item.addEventListener("contextmenu", e => e.preventDefault());
  item.addEventListener("click", e => {
    if (longo) return;
    if (e.target === marca || estado.sel.size || e.ctrlKey || e.metaKey || estado.modo === "lixeira") alternar(it, item);
    else abrir(it);
  });
  return item;
}

function alternar(it, nodo) {
  estado.sel.has(it.caminho) ? estado.sel.delete(it.caminho) : estado.sel.add(it.caminho);
  nodo.classList.toggle("sel", estado.sel.has(it.caminho));
  $("#conteudo").classList.toggle("selecionando", estado.sel.size > 0);
  atualizarSelecao();
}

function atualizarSelecao() {
  const n = estado.sel.size;
  $("#barra-selecao").hidden = n === 0;
  $("#sel-contagem").textContent = n === 1 ? "1 selecionado" : `${n} selecionados`;
  const lixo = estado.modo === "lixeira";
  const so = (acao, mostrar) => { $(`[data-acao="${acao}"]`).hidden = !mostrar; };
  so("renomear", !lixo && n === 1);
  so("mover", !lixo);
  so("copiar", !lixo);
  so("baixar", !lixo && selecionados().some(i => i.tipo !== "pasta"));
  so("restaurar", lixo);
}

function selecionados() {
  return estado.itens.filter(i => estado.sel.has(i.caminho));
}

function abrir(it) {
  if (it.tipo === "pasta") return irPara(it.caminho);
  if (VISIVEIS.has(it.tipo) || it.nome.toLowerCase().endsWith(".pdf")) return abrirVisor(it);
  window.open(urlArquivo("raw", it.caminho), "_blank");
}

// ── Visor de mídia ───────────────────────────────────────

let visorIdx = -1;

function midiaVisivel() {
  return (estado.visiveis || []).filter(i => VISIVEIS.has(i.tipo) || i.nome.toLowerCase().endsWith(".pdf"));
}

async function abrirVisor(it) {
  const lista = midiaVisivel();
  visorIdx = lista.findIndex(i => i.caminho === it.caminho);
  $("#visor").hidden = false;
  document.body.style.overflow = "hidden";
  await mostrarNoVisor(it);
}

async function mostrarNoVisor(it) {
  const palco = $("#visor-palco");
  const src = urlArquivo("raw", it.caminho);
  $("#visor-nome").textContent = it.nome;
  $("#visor-baixar").href = urlArquivo("baixar", it.caminho);
  let conteudo;
  if (it.tipo === "imagem") conteudo = el("img", { src, alt: it.nome });
  else if (it.tipo === "video") conteudo = el("video", { src, controls: "", autoplay: "", playsinline: "", preload: "metadata" });
  else if (it.tipo === "audio") conteudo = el("audio", { src, controls: "", autoplay: "" });
  else if (it.tipo === "texto") {
    conteudo = el("pre", {}, "Carregando…");
    fetch(src, { headers: { Range: "bytes=0-524287" } }).then(r => r.text()).then(t => { conteudo.textContent = t; });
  } else conteudo = el("iframe", { src });
  palco.replaceChildren(conteudo);
  const lista = midiaVisivel();
  $("#visor-ant").hidden = visorIdx <= 0;
  $("#visor-prox").hidden = visorIdx >= lista.length - 1;
}

function navegarVisor(passo) {
  const lista = midiaVisivel();
  const novo = visorIdx + passo;
  if (novo < 0 || novo >= lista.length) return;
  visorIdx = novo;
  mostrarNoVisor(lista[novo]);
}

function fecharVisor() {
  $("#visor").hidden = true;
  $("#visor-palco").replaceChildren();
  document.body.style.overflow = "";
}

$("#visor-fechar").onclick = fecharVisor;
$("#visor-ant").onclick = () => navegarVisor(-1);
$("#visor-prox").onclick = () => navegarVisor(1);
document.addEventListener("keydown", e => {
  if ($("#visor").hidden) return;
  if (e.key === "Escape") fecharVisor();
  if (e.key === "ArrowLeft") navegarVisor(-1);
  if (e.key === "ArrowRight") navegarVisor(1);
});
(() => {
  let x0 = null;
  const palco = $("#visor-palco");
  palco.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  palco.addEventListener("touchend", e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 60 && !(e.target.tagName === "VIDEO" && Math.abs(dx) < 120)) navegarVisor(dx < 0 ? 1 : -1);
    x0 = null;
  });
})();

// ── Ações ────────────────────────────────────────────────

$("#btn-voltar").onclick = () => {
  if (estado.modo !== "pasta") return irPara(estado.caminho);
  if (estado.caminho) irPara(pai(estado.caminho));
};

$("#btn-nova-pasta").onclick = async () => {
  const nome = await pedirTexto("📁 Nome da nova pasta");
  if (!nome) return;
  if (await tentar(() => api("/api/criar-pasta", { caminho: estado.caminho, nome }))) {
    aviso("Pasta criada");
    carregar();
  }
};

$("#btn-visao").onclick = () => {
  estado.visao = estado.visao === "grade" ? "lista" : "grade";
  salvarPref("visao", estado.visao);
  desenhar();
};

$("#ordem").onchange = e => {
  estado.ordem = e.target.value;
  salvarPref("ordem", estado.ordem);
  desenhar();
};

let atrasoBusca;
$("#busca").addEventListener("input", e => {
  clearTimeout(atrasoBusca);
  atrasoBusca = setTimeout(() => buscar(e.target.value.trim()), 350);
});

const acoesSelecao = {
  async renomear() {
    const [it] = selecionados();
    const nome = await pedirTexto("✏️ Renomear", it.nome, it.tipo !== "pasta");
    if (!nome || nome === it.nome) return;
    if (await tentar(() => api("/api/renomear", { caminho: it.caminho, nome }))) carregar();
  },
  async mover() { await moverOuCopiar(false); },
  async copiar() { await moverOuCopiar(true); },
  baixar() {
    selecionados().filter(i => i.tipo !== "pasta").forEach((it, n) => {
      setTimeout(() => {
        const a = el("a", { href: urlArquivo("baixar", it.caminho), download: it.nome });
        document.body.append(a); a.click(); a.remove();
      }, n * 400);
    });
  },
  async apagar() {
    const n = estado.sel.size;
    const lixo = estado.modo === "lixeira";
    const ok = await confirmar(
      lixo ? "Excluir para sempre?" : "Mover para a lixeira?",
      lixo ? `${n} item(ns) serão apagados definitivamente.` : `${n} item(ns) irão para a lixeira. Você pode restaurar depois.`,
      lixo ? "Excluir" : "Apagar");
    if (!ok) return;
    const r = lixo
      ? await tentar(() => api("/api/lixeira/excluir", { ids: [...estado.sel] }))
      : await tentar(() => api("/api/apagar", { caminhos: [...estado.sel] }));
    if (r) { aviso(lixo ? "Excluído" : "Movido para a lixeira"); recarregarAtual(); }
  },
  async restaurar() {
    if (await tentar(() => api("/api/lixeira/restaurar", { ids: [...estado.sel] }))) {
      aviso("Restaurado"); carregar();
    }
  },
  todos() {
    const todos = estado.itens.every(i => estado.sel.has(i.caminho));
    estado.sel = new Set(todos ? [] : estado.itens.map(i => i.caminho));
    desenhar();
  },
  cancelar() { estado.sel.clear(); desenhar(); },
};

$$("#barra-selecao [data-acao]").forEach(b => { b.onclick = () => acoesSelecao[b.dataset.acao](); });

async function moverOuCopiar(copiar) {
  const destino = await escolherPasta(copiar ? "📄 Copiar para…" : "📦 Mover para…", estado.caminho);
  if (destino === null) return;
  const r = await tentar(() => api("/api/mover", { caminhos: [...estado.sel], destino, copiar }));
  if (r) { aviso(`${r.feitos} item(ns) ${copiar ? "copiado(s)" : "movido(s)"}`); recarregarAtual(); }
}

function recarregarAtual() {
  if (estado.modo === "busca") buscar($("#busca").value.trim()); else carregar();
  atualizarDisco();
}

async function esvaziarLixeira() {
  if (!estado.itens.length) return;
  if (!await confirmar("Esvaziar a lixeira?", "Todos os itens serão apagados para sempre.", "Esvaziar")) return;
  if (await tentar(() => api("/api/lixeira/excluir", { tudo: true }))) { aviso("Lixeira esvaziada"); carregar(); atualizarDisco(); }
}

document.addEventListener("keydown", e => {
  if (!$("#visor").hidden || document.querySelector("dialog[open]") || e.target.tagName === "INPUT") return;
  if (e.key === "Escape" && estado.sel.size) acoesSelecao.cancelar();
  if (e.key === "Delete" && estado.sel.size) acoesSelecao.apagar();
  if (e.key === "F2" && estado.sel.size === 1) acoesSelecao.renomear();
  if (e.key === "Backspace") $("#btn-voltar").click();
});

// ── Envio de arquivos ────────────────────────────────────

const tarefasEnvio = [];
let enviando = false;

$("#btn-enviar").onclick = () => $("#arquivo-input").click();
$("#arquivo-input").onchange = e => { enfileirar([...e.target.files], estado.caminho); e.target.value = ""; };

let contadorArraste = 0;
document.addEventListener("dragenter", e => {
  if (estado.modo !== "pasta" || !e.dataTransfer.types.includes("Files")) return;
  contadorArraste++; $("#soltar").hidden = false;
});
document.addEventListener("dragleave", () => { if (--contadorArraste <= 0) { contadorArraste = 0; $("#soltar").hidden = true; } });
document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", e => {
  e.preventDefault();
  contadorArraste = 0; $("#soltar").hidden = true;
  if (estado.modo === "pasta" && e.dataTransfer.files.length) enfileirar([...e.dataTransfer.files], estado.caminho);
});

function enfileirar(arquivos, destino) {
  for (const f of arquivos) tarefasEnvio.unshift({ arquivo: f, destino, progresso: 0, estado: "aguardando" });
  mostrarTarefas();
  processarFila();
}

async function processarFila() {
  if (enviando) return;
  const t = tarefasEnvio.slice().reverse().find(x => x.estado === "aguardando");
  if (!t) return;
  enviando = true;
  t.estado = "enviando";
  await new Promise(res => {
    const fd = new FormData();
    fd.append("caminho", t.destino);
    fd.append("arquivos", t.arquivo, t.arquivo.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/enviar");
    xhr.upload.onprogress = e => { if (e.lengthComputable) { t.progresso = e.loaded / e.total * 100; desenharTarefas(); } };
    xhr.onload = () => {
      if (xhr.status === 401) location.href = "/entrar";
      t.estado = xhr.status === 200 ? "concluido" : "erro";
      if (t.estado === "erro") { try { t.mensagem = JSON.parse(xhr.responseText).erro; } catch { t.mensagem = "Falha no envio"; } }
      res();
    };
    xhr.onerror = () => { t.estado = "erro"; t.mensagem = "Conexão perdida"; res(); };
    xhr.send(fd);
  });
  enviando = false;
  desenharTarefas();
  if (estado.modo === "pasta" && estado.caminho === t.destino) carregar();
  if (!tarefasEnvio.some(x => x.estado === "aguardando")) { atualizarDisco(); aviso("Envio concluído"); }
  processarFila();
}

// ── Download por link ────────────────────────────────────

$("#btn-link").onclick = async () => {
  const destino = estado.caminho || "Videos";
  $("#link-destino").textContent = "/" + destino;
  const inp = $("#link-url");
  inp.value = "";
  try {
    const clip = await navigator.clipboard?.readText?.();
    if (clip && /^https?:\/\//.test(clip.trim())) inp.value = clip.trim();
  } catch {}
  const p = abrirDialogo($("#dlg-link"));
  inp.focus();
  if ((await p) !== "ok" || !inp.value.trim()) return;
  const r = await tentar(() => api("/api/baixar-link", { url: inp.value.trim(), destino }));
  if (r) { aviso("Download iniciado"); mostrarTarefas(); acompanharDownloads(); }
};

let downloads = [];
let pollDownloads = null;

async function acompanharDownloads() {
  clearTimeout(pollDownloads);
  const r = await api("/api/tarefas").catch(() => null);
  if (!r) return;
  const antes = new Map(downloads.map(d => [d.id, d.estado]));
  downloads = r.tarefas;
  for (const d of downloads) {
    if (antes.get(d.id) === "baixando" && d.estado === "concluido") {
      aviso("✅ Vídeo salvo em /" + d.destino);
      if (estado.modo === "pasta" && estado.caminho === d.destino) carregar();
      atualizarDisco();
    }
    if (antes.get(d.id) === "baixando" && d.estado === "erro") aviso("Falha no download: " + (d.mensagem || ""), true);
  }
  desenharTarefas();
  if (downloads.some(d => d.estado === "baixando")) pollDownloads = setTimeout(acompanharDownloads, 1500);
}

// ── Painel de transferências ─────────────────────────────

function mostrarTarefas() { $("#painel-tarefas").hidden = false; desenharTarefas(); }
$("#fechar-tarefas").onclick = () => {
  $("#painel-tarefas").hidden = true;
  for (let i = tarefasEnvio.length - 1; i >= 0; i--) if (["concluido", "erro"].includes(tarefasEnvio[i].estado)) tarefasEnvio.splice(i, 1);
  api("/api/tarefas/limpar", {}).then(() => { downloads = downloads.filter(d => d.estado === "baixando"); }).catch(() => {});
};

function desenharTarefas() {
  const linhas = [];
  for (const d of downloads) {
    const nome = d.arquivo ? d.arquivo.split("/").pop() : d.url;
    const info = d.estado === "baixando" ? `Baixando… ${d.progresso.toFixed(0)}%`
      : d.estado === "concluido" ? "✅ Salvo em /" + d.destino : "❌ " + (d.mensagem || "Erro");
    linhas.push(linhaTarefa("🔗 " + nome, info, d.progresso, d.estado));
  }
  for (const t of tarefasEnvio) {
    const info = t.estado === "aguardando" ? "Na fila" : t.estado === "enviando" ? `Enviando… ${t.progresso.toFixed(0)}% de ${tamanho(t.arquivo.size)}`
      : t.estado === "concluido" ? "✅ Enviado" : "❌ " + (t.mensagem || "Erro");
    linhas.push(linhaTarefa("⬆️ " + t.arquivo.name, info, t.estado === "concluido" ? 100 : t.progresso, t.estado));
  }
  $("#lista-tarefas").replaceChildren(...(linhas.length ? linhas : [el("div", { class: "tarefa dica" }, "Nenhuma transferência")]));
}

function linhaTarefa(nome, info, prog, est) {
  const barra = el("div");
  barra.style.width = (prog || 0) + "%";
  return el("div", { class: "tarefa " + est },
    el("div", { class: "t-nome", title: nome }, nome),
    el("div", { class: "t-info" }, info),
    est === "erro" ? null : el("div", { class: "progresso" }, barra));
}

// ── Menu, disco, vigia ───────────────────────────────────

$("#btn-menu").onclick = () => { $("#menu").showModal(); atualizarStatus(); };
$("#menu").addEventListener("click", e => { if (e.target.id === "menu") $("#menu").close(); });
$$("#menu [data-ir]").forEach(b => { b.onclick = () => { $("#menu").close(); location.hash = b.dataset.ir; }; });
$("#btn-ver-tarefas").onclick = () => { $("#menu").close(); mostrarTarefas(); acompanharDownloads(); };
$("#vigia-ativo").onchange = e => tentar(() => api("/api/vigia", { ativo: e.target.checked })).then(atualizarStatus);

async function atualizarStatus() {
  const s = await api("/api/status").catch(() => null);
  if (!s) return;
  $("#vigia-ativo").checked = s.vigia;
  const ult = s.ultimos.slice(0, 3).map(u => `• ${u.nome} → ${u.pasta}`).join("\n");
  $("#vigia-info").textContent = (s.vigia_ok ? `Observando ${s.vigia_pasta}` : `⚠️ Pasta ${s.vigia_pasta} não encontrada`)
    + (ult ? "\nÚltimos:\n" + ult : "") + (s.ytdlp ? "" : "\n⚠️ yt-dlp não instalado (download por link)");
  $("#vigia-info").style.whiteSpace = "pre-line";
}

async function atualizarDisco() {
  const d = await api("/api/disco").catch(() => null);
  if (!d) return;
  const pct = Math.round(d.usado / d.total * 100);
  $("#disco-uso").style.width = pct + "%";
  $("#disco-uso").style.background = pct > 90 ? "var(--perigo)" : pct > 75 ? "#f5b942" : "var(--destaque)";
  $("#disco-texto").textContent = `${tamanho(d.livre)} livres de ${tamanho(d.total)}`;
}

if (!location.hash) location.replace("#/");
carregar();
atualizarDisco();
acompanharDownloads();
