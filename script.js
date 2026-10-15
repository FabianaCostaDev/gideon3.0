/* =========================================================
   PERSONAL OS — SCRIPT PRINCIPAL
   ========================================================= */

/* =========================================================
   CONFIGURAÇÃO
   Se você mudar VERSAO_BASE, o navegador apaga o que está
   salvo e recarrega a base inicial abaixo.
   ========================================================= */

const VERSAO_BASE = "2026-10-02-real";

const STORAGE_KEYS = {
    versao: "personalOS_versao",
    recorrentes: "personalOS_recorrentes",
    pendencias: "personalOS_pendencias",
    dataUnica: "personalOS_dataUnica",
    rotinaFeita: "personalOS_rotinaFeita"
};

// Chaves da versão antiga — são apagadas para não sobrar lixo.
const CHAVES_ANTIGAS = [
    "taskManager_recorrentes",
    "taskManager_pendencias",
    "taskManager_dataUnica"
];

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_UTEIS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];


/* =========================================================
   BASE INICIAL
   Conta nova começa vazia. Os dados de cada pessoa ficam na
   nuvem (Supabase), separados pelo login.
   ========================================================= */

const tarefasRecorrentesIniciais = [];
const pendenciasIniciais = [];
const tarefasDataUnicaIniciais = [];


/* =========================================================
   UTILITÁRIOS
   ========================================================= */

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");

function esc(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function gerarId(prefixo) {
    return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function hojeISO(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function horaAtual() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "Terça", "terca", "Ter", "Sext" -> "ter" / "sex"
function chaveDia(texto) {
    return String(texto || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().trim().slice(0, 3);
}

function chaveTexto(texto) {
    return String(texto || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().trim();
}

// Converte qualquer grafia para o nome oficial do dia e ordena
function normalizarDias(lista) {
    const mapa = {};
    DIAS_SEMANA.forEach(d => { mapa[chaveDia(d)] = d; });

    const dias = lista.map(d => mapa[chaveDia(d)]).filter(Boolean);

    return [...new Set(dias)]
        .sort((a, b) => DIAS_SEMANA.indexOf(a) - DIAS_SEMANA.indexOf(b));
}

function resumirDias(dias) {
    const n = normalizarDias(dias || []);

    if (n.length === 5 && DIAS_UTEIS.every(d => n.includes(d))) return "Seg a Sex";
    if (n.length === 7) return "Todos os dias";

    return n.map(d => d.slice(0, 3)).join(", ");
}

function obterDiaDaSemana() {
    return DIAS_SEMANA[new Date().getDay()];
}

function rodaHoje(tarefa) {
    const hoje = chaveDia(obterDiaDaSemana());
    return (tarefa.dias || []).some(d => chaveDia(d) === hoje);
}

function formatarData(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
}

// Aceita "2026-10-05" ou "05/10/2026"
function paraISO(texto) {
    texto = String(texto || "").trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

    const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;

    return null;
}

// Aceita "9:30", "09:30", "9h30"
function normalizarHorario(texto) {
    const m = String(texto || "").trim().match(/^(\d{1,2})[:h](\d{2})$/i);
    if (!m) return null;

    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;

    return `${pad(h)}:${pad(mi)}`;
}

function diferencaDias(iso) {
    const hoje = new Date(hojeISO() + "T00:00:00");
    const data = new Date(iso + "T00:00:00");
    return Math.round((data - hoje) / 86400000);
}

function rotuloPrazo(iso) {
    const diff = diferencaDias(iso);

    if (diff < 0)   return { texto: `Atrasada desde ${formatarData(iso)}`, classe: "danger" };
    if (diff === 0) return { texto: "Hoje", classe: "warning" };
    if (diff === 1) return { texto: "Amanhã", classe: "accent" };

    return { texto: `${formatarData(iso)} (em ${diff} dias)`, classe: "neutral" };
}

/* ---------- Perfil (nome da pessoa e do gestor) ----------
   window.perfilAtual é preenchido pelo nuvem.js depois do login. */

function perfil() {
    return window.perfilAtual || {};
}

function nomeUsuario() {
    return String(perfil().nome || "").trim();
}

function nomeGestor() {
    return String(perfil().gestor || "").trim();
}

function minusculaInicial(texto) {
    return texto.charAt(0).toLowerCase() + texto.slice(1);
}

// "Pedidos do Rodrigo", "Pedidos da Ana" ou "Pedidos do gestor"
function rotuloPedidos() {
    const gestor = nomeGestor();
    return gestor ? `Pedidos ${perfil().artigo === "da" ? "da" : "do"} ${gestor}` : "Pedidos do gestor";
}

function rotuloPedido() {
    return rotuloPedidos().replace(/^Pedidos/, "Pedido");
}

// Pedidos do gestor: tipo "Gestor" (o antigo "Rodrigo" continua valendo)
function ehRodrigo(item) {
    const tipo = chaveTexto(item.tipo);
    return tipo === "gestor" || tipo === "rodrigo" || (!!nomeGestor() && tipo === chaveTexto(nomeGestor()));
}

function rotuloTipo(item) {
    return ehRodrigo(item) ? (nomeGestor() || "Gestor") : item.tipo;
}

// Atualiza os textos da tela que dependem do perfil
function aplicarTextosPerfil() {
    const textos = {
        pedidos: rotuloPedidos(),
        pedido: rotuloPedido(),
        gestor: nomeGestor() || "Gestor",
        "abrir-pedidos": `Abrir ${minusculaInicial(rotuloPedidos())} →`
    };

    document.querySelectorAll("[data-rotulo]").forEach(el => {
        if (textos[el.dataset.rotulo]) el.textContent = textos[el.dataset.rotulo];
    });

    // Iniciais do nome na marca da lateral
    const iniciais = nomeUsuario().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
    const marca = document.getElementById("brandIniciais");
    if (marca) marca.textContent = iniciais || "G";

    document.querySelectorAll("[data-rotulo-prompt]").forEach(el => {
        el.dataset.jarvisPrompt = `Quais são os ${minusculaInicial(rotuloPedidos())} em aberto?`;
    });
}

const vazio = texto => `<div class="empty-state">${texto}</div>`;


/* =========================================================
   STORAGE
   ========================================================= */

function ler(chave, padrao) {
    try {
        const valor = localStorage.getItem(chave);
        return valor ? JSON.parse(valor) : padrao;
    } catch (erro) {
        return padrao;
    }
}

function gravar(chave, valor) {
    try {
        localStorage.setItem(chave, JSON.stringify(valor));
    } catch (erro) {
        console.error("Não foi possível salvar no navegador:", erro);
    }

    // Avisa o módulo da nuvem (nuvem.js) para enviar ao Supabase
    if (typeof window.sincronizarChave === "function") {
        window.sincronizarChave(chave);
    }
}

const clonar = obj => JSON.parse(JSON.stringify(obj));

function semearBase() {
    gravar(STORAGE_KEYS.recorrentes, clonar(tarefasRecorrentesIniciais));
    gravar(STORAGE_KEYS.pendencias, clonar(pendenciasIniciais));
    gravar(STORAGE_KEYS.dataUnica, clonar(tarefasDataUnicaIniciais));
    gravar(STORAGE_KEYS.rotinaFeita, { data: hojeISO(), ids: [] });
    gravar(STORAGE_KEYS.versao, VERSAO_BASE);
}

function carregarDados() {
    CHAVES_ANTIGAS.forEach(chave => {
        try { localStorage.removeItem(chave); } catch (e) { /* ignora */ }
    });

    if (ler(STORAGE_KEYS.versao, null) !== VERSAO_BASE) {
        semearBase();
    }
}

function garantirIds(lista, prefixo) {
    let mudou = false;
    lista.forEach(item => {
        if (!item.id) {
            item.id = gerarId(prefixo);
            mudou = true;
        }
    });
    return mudou;
}

function getRecorrentes() {
    const lista = ler(STORAGE_KEYS.recorrentes, []);
    if (garantirIds(lista, "rec")) gravar(STORAGE_KEYS.recorrentes, lista);
    return lista;
}

function getPendencias() {
    const lista = ler(STORAGE_KEYS.pendencias, []);
    if (garantirIds(lista, "pen")) gravar(STORAGE_KEYS.pendencias, lista);
    return lista;
}

function getDataUnica() {
    const lista = ler(STORAGE_KEYS.dataUnica, []);
    if (garantirIds(lista, "dat")) gravar(STORAGE_KEYS.dataUnica, lista);
    return lista;
}

// Salvar também registra no histórico o que mudou (criou, concluiu, excluiu...)
const salvarRecorrentes = lista => {
    registrarMudancas("recorrente", ler(STORAGE_KEYS.recorrentes, []), lista);
    gravar(STORAGE_KEYS.recorrentes, lista);
};
const salvarPendencias = lista => {
    registrarMudancas("pendencia", ler(STORAGE_KEYS.pendencias, []), lista);
    gravar(STORAGE_KEYS.pendencias, lista);
};
const salvarDataUnica = lista => {
    registrarMudancas("compromisso", ler(STORAGE_KEYS.dataUnica, []), lista);
    gravar(STORAGE_KEYS.dataUnica, lista);
};


/* =========================================================
   HISTÓRICO
   Um documento por mês (personalOS_hist_AAAA-MM) com:
   - dias:    a rotina de cada dia e o que foi feito
   - eventos: quando cada demanda foi criada, concluída,
              reaberta, remarcada ou excluída
   É a base do dashboard e do planejamento do dia seguinte.
   ========================================================= */

const PREFIXO_HIST = "personalOS_hist_";

const mesDe = iso => iso.slice(0, 7);
const chaveHist = mes => PREFIXO_HIST + mes;

// Compara objetos ignorando a ordem das chaves
function jsonEstavel(valor) {
    if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(",")}]`;
    if (valor && typeof valor === "object") {
        return `{${Object.keys(valor).sort().map(k => `${JSON.stringify(k)}:${jsonEstavel(valor[k])}`).join(",")}}`;
    }
    return JSON.stringify(valor);
}

function getHist(mes) {
    const doc = ler(chaveHist(mes), null);
    return {
        dias: doc && typeof doc.dias === "object" && doc.dias ? doc.dias : {},
        eventos: doc && Array.isArray(doc.eventos) ? doc.eventos : []
    };
}

function salvarHist(mes, doc) {
    gravar(chaveHist(mes), doc);
}

// Só registra depois que a nuvem terminou de sincronizar (evita gravar por cima)
function historicoLiberado() {
    return typeof window.nuvemPronta !== "function" || window.nuvemPronta();
}

function registrarEventos(eventos) {
    if (!eventos.length || !historicoLiberado()) return;
    const mes = mesDe(hojeISO());
    const doc = getHist(mes);
    doc.eventos.push(...eventos);
    salvarHist(mes, doc);
}

function registrarMudancas(tipo, antes, depois) {
    const agora = new Date().toISOString();
    const anteriores = new Map((Array.isArray(antes) ? antes : []).map(item => [item.id, item]));
    const atuais = new Set();
    const eventos = [];

    const resumo = (item, acao, extra = {}) => ({
        em: agora,
        tipo,
        acao,
        id: item.id,
        titulo: item.descricao || item.atividade || "",
        categoria: tipo === "pendencia" ? (ehRodrigo(item) ? "gestor" : "geral") : tipo,
        ...extra
    });

    depois.forEach(item => {
        atuais.add(item.id);
        const velho = anteriores.get(item.id);

        if (!velho) {
            if (!item.criada_em) item.criada_em = agora;
            eventos.push(resumo(item, "criou"));
        }

        if (tipo !== "recorrente") {
            const concluidaAgora = !!item.concluida;
            if (concluidaAgora && !item.concluida_em) item.concluida_em = agora;
            if (!concluidaAgora && item.concluida_em) delete item.concluida_em;

            if (velho && concluidaAgora !== !!velho.concluida) {
                eventos.push(resumo(item, concluidaAgora ? "concluiu" : "reabriu"));
            }
        }

        if (tipo === "compromisso" && velho && velho.data !== item.data) {
            eventos.push(resumo(item, "remarcou", { de: velho.data, para: item.data }));
        }
    });

    anteriores.forEach((velho, id) => {
        if (!atuais.has(id)) eventos.push(resumo(velho, "excluiu"));
    });

    registrarEventos(eventos);
}

// Guarda a rotina do dia e o que já foi feito (só grava se mudou)
function registrarRotinaDoDia() {
    if (!historicoLiberado()) return;

    const hoje = hojeISO();
    const feitas = getRotinaFeita().ids;
    const rotina = obterTarefasDeHoje().map(t => ({
        id: t.id,
        atividade: t.atividade,
        empresa: t.empresa,
        horario: t.horario,
        feita: feitas.includes(t.id)
    }));

    const mes = mesDe(hoje);
    const doc = getHist(mes);
    const atual = doc.dias[hoje]?.rotina;

    if (!rotina.length && !atual) return;
    if (jsonEstavel(atual) === jsonEstavel(rotina)) return;

    doc.dias[hoje] = { ...(doc.dias[hoje] || {}), rotina };
    salvarHist(mes, doc);
}


/* ---------- Check da rotina (zera sozinho a cada dia) ---------- */

function getRotinaFeita() {
    const registro = ler(STORAGE_KEYS.rotinaFeita, null);

    if (!registro || registro.data !== hojeISO()) {
        return { data: hojeISO(), ids: [] };
    }
    return registro;
}

function alternarRotina(id) {
    const registro = getRotinaFeita();
    const posicao = registro.ids.indexOf(id);

    if (posicao >= 0) registro.ids.splice(posicao, 1);
    else registro.ids.push(id);

    gravar(STORAGE_KEYS.rotinaFeita, registro);
}

function alternarConcluida(getLista, salvarLista, id) {
    const lista = getLista();
    const item = lista.find(x => x.id === id);
    if (!item) return;

    item.concluida = !item.concluida;
    salvarLista(lista);
}


/* =========================================================
   CABEÇALHO: SAUDAÇÃO, DATA, RELÓGIO, CALENDÁRIO
   ========================================================= */

function atualizarSaudacao() {
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    const el = $("greeting");
    const nome = nomeUsuario();
    if (el) el.textContent = nome ? `${saudacao}, ${nome}!` : `${saudacao}!`;
}

function atualizarData() {
    const el = $("currentDate");
    if (!el) return;

    el.textContent = new Date().toLocaleDateString("pt-BR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric"
    });
}

function atualizarRelogio() {
    const d = new Date();
    const el = $("clock");
    if (el) el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function gerarCalendario() {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = agora.getMonth();
    const diaAtual = agora.getDate();

    const grid = $("calendarGrid");
    if (!grid) return;

    const nomeMes = agora.toLocaleDateString("pt-BR", { month: "long" });

    if ($("calendarMonth")) $("calendarMonth").textContent = `${nomeMes} ${ano}`.toUpperCase();
    if ($("calendarDay")) $("calendarDay").textContent = pad(diaAtual);

    const primeiroDia = new Date(ano, mes, 1).getDay();
    const quantidadeDias = new Date(ano, mes + 1, 0).getDate();

    let html = "";
    for (let i = 0; i < primeiroDia; i++) html += "<span></span>";
    for (let dia = 1; dia <= quantidadeDias; dia++) {
        html += `<span class="${dia === diaAtual ? "today" : ""}">${dia}</span>`;
    }
    grid.innerHTML = html;
}


/* =========================================================
   NAVEGAÇÃO
   ========================================================= */

const views = {
    day: "view-day",
    demands: "view-demands",
    rodrigo: "view-rodrigo",
    processes: "view-processes",
    input: "view-input",
    manage: "view-manage"
};

function switchView(nome) {
    if (!views[nome]) return;

    Object.entries(views).forEach(([chave, id]) => {
        const el = $(id);
        if (el) el.classList.toggle("active-view", chave === nome);
    });

    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item.dataset.view === nome);
    });

    renderizarTudo();
    if (nome === "processes") renderizarProcessos();
    window.scrollTo({ top: 0 });
}

function renderizarTudo() {
    try { registrarRotinaDoDia(); } catch (e) { console.warn("Histórico:", e); }
    aplicarTextosPerfil();
    renderizarPainelDoDia();
    renderizarTodasDemandas();
    renderizarRodrigo();
    renderizarGerenciamento();
    atualizarListaEmpresas();

    // Módulos extras (treino e estudo, e os próximos)
    (window.renderizadoresExtras || []).forEach(desenhar => {
        try { desenhar(); } catch (e) { console.error(e); }
    });
}


/* =========================================================
   PAINEL DO DIA
   ========================================================= */

function obterTarefasDeHoje() {
    return getRecorrentes()
        .filter(rodaHoje)
        .sort((a, b) =>
            a.horario.localeCompare(b.horario) || a.empresa.localeCompare(b.empresa)
        );
}

// Próxima = primeira não feita a partir de agora.
// Se todas as futuras já foram feitas, mostra a atrasada mais antiga.
function obterProximaTarefa(tarefas, feitas) {
    const agora = horaAtual();
    const abertas = tarefas.filter(t => !feitas.includes(t.id));

    return abertas.find(t => t.horario >= agora) || abertas[0] || null;
}

function renderizarPainelDoDia() {
    const tarefas = obterTarefasDeHoje();
    const feitas = getRotinaFeita().ids;
    const agora = horaAtual();
    const proxima = obterProximaTarefa(tarefas, feitas);

    renderizarHero(tarefas, feitas, proxima, agora);
    renderizarRotina(tarefas, feitas, proxima, agora);
    renderizarDatasProximas();
    renderizarPendenciasDia();
}

function renderizarHero(tarefas, feitas, proxima, agora) {
    const titulo = $("nextTaskTitle");
    const meta = $("nextTaskMeta");
    const hora = $("nextTaskTime");
    const botao = $("nextTaskDone");
    if (!titulo) return;

    const atrasadas = tarefas.filter(t =>
        !feitas.includes(t.id) && t.horario < agora && (!proxima || t.id !== proxima.id)
    ).length;

    if (proxima) {
        const estaAtrasada = proxima.horario < agora;

        titulo.textContent = proxima.atividade;
        meta.textContent =
            `${proxima.empresa} · ${estaAtrasada ? "atrasada desde" : "hoje às"} ${proxima.horario}` +
            (atrasadas ? ` · ${atrasadas} ${atrasadas === 1 ? "tarefa atrasada" : "tarefas atrasadas"} na rotina` : "");
        hora.textContent = proxima.horario;

        botao.hidden = false;
        botao.dataset.id = proxima.id;
        return;
    }

    const abertas = getPendencias().filter(p => !p.concluida).length;
    botao.hidden = true;
    hora.textContent = "—";

    if (!tarefas.length) {
        titulo.textContent = "Sem rotina recorrente hoje";
    } else {
        titulo.textContent = "Rotina de hoje concluída";
    }

    meta.textContent = abertas
        ? `Você tem ${abertas} ${abertas === 1 ? "pendência" : "pendências"} sem data para adiantar.`
        : "Nenhuma pendência em aberto.";
}

function renderizarRotina(tarefas, feitas, proxima, agora) {
    const lista = $("routineList");
    const contador = $("routineCount");
    if (!lista) return;

    const feitasHoje = tarefas.filter(t => feitas.includes(t.id)).length;
    if (contador) contador.textContent = `${feitasHoje} / ${tarefas.length}`;

    if (!tarefas.length) {
        lista.innerHTML = vazio(`Nenhuma tarefa recorrente para ${obterDiaDaSemana().toLowerCase()}.`);
        return;
    }

    lista.innerHTML = tarefas.map(t => {
        const feita = feitas.includes(t.id);
        let estado;

        if (feita) {
            estado = { linha: "done", texto: "Concluída", cor: "success" };
        } else if (proxima && t.id === proxima.id) {
            estado = t.horario < agora
                ? { linha: "current", texto: "Atrasada", cor: "danger" }
                : { linha: "current", texto: "Próxima", cor: "accent" };
        } else if (t.horario < agora) {
            estado = { linha: "late", texto: "Atrasada", cor: "warning" };
        } else {
            estado = { linha: "", texto: "Pendente", cor: "neutral" };
        }

        return `
            <div class="task-row ${estado.linha}">
                <button class="task-check" type="button"
                    data-action="toggle-rotina" data-id="${esc(t.id)}"
                    aria-label="${feita ? "Desmarcar" : "Marcar"} ${esc(t.atividade)}">
                    ${feita ? "✓" : ""}
                </button>
                <div>
                    <strong>${esc(t.atividade)}</strong>
                    <small>${esc(t.horario)} · ${esc(t.empresa)}</small>
                </div>
                <span class="status ${estado.cor}">${estado.texto}</span>
            </div>`;
    }).join("");
}

function renderizarDatasProximas() {
    const container = $("singleDateList");
    const contador = $("singleDateCount");
    if (!container) return;

    const abertas = getDataUnica()
        .filter(item => !item.concluida)
        .sort((a, b) => a.data.localeCompare(b.data));

    if (contador) contador.textContent = pad(abertas.length);

    if (!abertas.length) {
        container.innerHTML = vazio("Nenhum compromisso com data marcada.");
        return;
    }

    container.innerHTML = abertas.map(item => {
        const prazo = rotuloPrazo(item.data);
        return `
            <div class="compact-item">
                <div>
                    <strong>${esc(item.descricao)}</strong>
                    <small class="prazo-${prazo.classe}">${esc(prazo.texto)}</small>
                </div>
                <button class="mini-complete" type="button"
                    data-action="toggle-data" data-id="${esc(item.id)}"
                    title="Marcar como concluída">✓</button>
            </div>`;
    }).join("");
}

function renderizarPendenciasDia() {
    const container = $("pendingList");
    const contador = $("pendingCount");
    if (!container) return;

    const abertas = getPendencias()
        .filter(item => !item.concluida)
        .sort((a, b) => Number(ehRodrigo(b)) - Number(ehRodrigo(a)));

    if (contador) contador.textContent = pad(abertas.length);

    if (!abertas.length) {
        container.innerHTML = vazio("Nenhuma pendência em aberto.");
        return;
    }

    container.innerHTML = abertas.map(item => `
        <div class="compact-item">
            <div>
                <span class="tag ${ehRodrigo(item) ? "rodrigo" : ""}">${esc(rotuloTipo(item))}</span>
                <strong>${esc(item.descricao)}</strong>
            </div>
            <button class="mini-complete" type="button"
                data-action="toggle-pendencia" data-id="${esc(item.id)}"
                title="Marcar como concluída">✓</button>
        </div>`
    ).join("");
}


/* =========================================================
   TODAS AS DEMANDAS
   ========================================================= */

let filtroAtual = "all";

function montarLinhasDemandas() {
    const feitas = getRotinaFeita().ids;
    const linhas = [];

    getDataUnica()
        .sort((a, b) => a.data.localeCompare(b.data))
        .forEach(item => {
            const prazo = rotuloPrazo(item.data);
            linhas.push({
                tipo: "data",
                titulo: item.descricao,
                sub: "",
                tipoTexto: "Data única",
                prazo: prazo.texto,
                status: item.concluida
                    ? ["success", "Concluída"]
                    : prazo.classe === "danger" ? ["danger", "Atrasada"] : ["warning", "Em aberto"],
                feita: item.concluida,
                acao: { action: "toggle-data", id: item.id, texto: item.concluida ? "Reabrir" : "Concluir" }
            });
        });

    getPendencias().forEach(item => {
        const rodrigo = ehRodrigo(item);
        linhas.push({
            tipo: rodrigo ? "rodrigo" : "pendencia",
            titulo: item.descricao,
            sub: item.obs || "",
            tipoTexto: rodrigo ? rotuloPedido() : "Sem data",
            prazo: "O quanto antes",
            status: item.concluida ? ["success", "Concluída"] : ["warning", "Em aberto"],
            feita: item.concluida,
            acao: { action: "toggle-pendencia", id: item.id, texto: item.concluida ? "Reabrir" : "Concluir" }
        });
    });

    getRecorrentes()
        .sort((a, b) => a.horario.localeCompare(b.horario))
        .forEach(item => {
            const hoje = rodaHoje(item);
            const feita = feitas.includes(item.id);
            linhas.push({
                tipo: "recorrente",
                titulo: item.atividade,
                sub: item.empresa,
                tipoTexto: "Recorrente",
                prazo: `${resumirDias(item.dias)} · ${item.horario}`,
                status: !hoje ? ["neutral", "Não é hoje"] : feita ? ["success", "Feita hoje"] : ["accent", "Hoje"],
                feita: hoje && feita,
                acao: hoje
                    ? { action: "toggle-rotina", id: item.id, texto: feita ? "Desfazer" : "Concluir" }
                    : null
            });
        });

    return linhas;
}

function passaNoFiltro(linha) {
    if (filtroAtual === "all") return true;
    if (filtroAtual === "pendencia") return linha.tipo === "pendencia" || linha.tipo === "rodrigo";
    return linha.tipo === filtroAtual;
}

function renderizarTodasDemandas() {
    const container = $("demandsRows");
    if (!container) return;

    const linhas = montarLinhasDemandas().filter(passaNoFiltro);

    if (!linhas.length) {
        container.innerHTML = vazio("Nada nesta categoria.");
        return;
    }

    container.innerHTML = linhas.map(l => `
        <div class="demand-row ${l.feita ? "is-done" : ""}">
            <div>
                <strong>${esc(l.titulo)}</strong>
                ${l.sub ? `<small>${esc(l.sub)}</small>` : ""}
            </div>
            <span>${esc(l.tipoTexto)}</span>
            <span>${esc(l.prazo)}</span>
            <span><span class="status ${l.status[0]}">${l.status[1]}</span></span>
            <span>
                ${l.acao ? `<button class="complete-button" type="button"
                    data-action="${l.acao.action}" data-id="${esc(l.acao.id)}">${l.acao.texto}</button>` : ""}
            </span>
        </div>`
    ).join("");
}

function configurarFiltros() {
    document.querySelectorAll(".filter").forEach(botao => {
        botao.addEventListener("click", () => {
            filtroAtual = botao.dataset.filter || "all";
            document.querySelectorAll(".filter").forEach(f => f.classList.toggle("active", f === botao));
            renderizarTodasDemandas();
        });
    });
}


/* =========================================================
   PEDIDOS DO RODRIGO
   ========================================================= */

function renderizarRodrigo() {
    const grid = $("rodrigoGrid");
    const badge = $("rodrigoBadge");
    if (!grid) return;

    const pedidos = getPendencias().filter(ehRodrigo);
    const abertos = pedidos.filter(p => !p.concluida);
    const concluidos = pedidos.filter(p => p.concluida);

    if (badge) {
        badge.textContent = `${pad(abertos.length)} ${abertos.length === 1 ? "PENDENTE" : "PENDENTES"}`;
    }

    if (!pedidos.length) {
        grid.innerHTML = vazio(`Nenhum ${minusculaInicial(rotuloPedido())} cadastrado.`);
        return;
    }

    grid.innerHTML = [...abertos, ...concluidos].map((item, i) => `
        <article class="action-card rodrigo-card ${item.concluida ? "is-done" : ""}">
            <div class="action-top">
                <span class="priority-label">${item.concluida ? "CONCLUÍDO" : esc(rotuloPedido().toUpperCase())}</span>
                <span class="action-id">#${String(i + 1).padStart(3, "0")}</span>
            </div>
            <h3>${esc(item.descricao)}</h3>
            ${item.obs ? `<p>${esc(item.obs)}</p>` : ""}
            <div class="action-footer">
                <span>${item.concluida ? "Concluído" : "Sem data · fazer o quanto antes"}</span>
                <button class="complete-button" type="button"
                    data-action="toggle-pendencia" data-id="${esc(item.id)}">
                    ${item.concluida ? "Reabrir" : "Marcar como concluído"}
                </button>
            </div>
        </article>`
    ).join("");
}


/* =========================================================
   BANCO DE TAREFAS
   ========================================================= */

function botoesGerenciar(editar, excluir, id, extra = "") {
    return `
        <div class="manage-actions">
            ${extra}
            <button class="edit-button" type="button" data-action="${editar}" data-id="${esc(id)}">Editar</button>
            <button class="delete-button" type="button" data-action="${excluir}" data-id="${esc(id)}">Excluir</button>
        </div>`;
}

function renderizarGerenciamento() {
    renderizarGerenciamentoRecorrentes();
    renderizarGerenciamentoPendencias();
    renderizarGerenciamentoDatas();
}

function renderizarGerenciamentoRecorrentes() {
    const container = $("manageRecurringList");
    if (!container) return;

    const lista = getRecorrentes().sort((a, b) =>
        a.horario.localeCompare(b.horario) || a.empresa.localeCompare(b.empresa)
    );

    $("manageRecurringCount").textContent = pad(lista.length);

    if (!lista.length) {
        container.innerHTML = vazio("Nenhuma tarefa recorrente. Use “+ Adicionar recorrente”.");
        return;
    }

    container.innerHTML = lista.map(t => `
        <div class="manage-row rec">
            <div class="manage-main">
                <strong>${esc(t.atividade)}</strong>
                <span>${esc(t.empresa)}</span>
            </div>
            <div class="manage-days">${esc(resumirDias(t.dias))}</div>
            <div class="manage-time">${esc(t.horario)}</div>
            ${botoesGerenciar("edit-rec", "del-rec", t.id)}
        </div>`
    ).join("");
}

function renderizarGerenciamentoPendencias() {
    const container = $("managePendingList");
    if (!container) return;

    const lista = getPendencias();
    $("managePendingCount").textContent = pad(lista.filter(p => !p.concluida).length);

    if (!lista.length) {
        container.innerHTML = vazio("Nenhuma pendência. Use “+ Adicionar pendência”.");
        return;
    }

    container.innerHTML = lista.map(p => `
        <div class="manage-row ${p.concluida ? "is-done" : ""}">
            <div class="manage-main">
                <strong>${esc(p.descricao)}</strong>
                <span>${esc(rotuloTipo(p))} · ${p.concluida ? "Concluída" : "Em aberto"}</span>
            </div>
            ${botoesGerenciar("edit-pen", "del-pen", p.id,
                `<button class="edit-button" type="button" data-action="toggle-pendencia" data-id="${esc(p.id)}">
                    ${p.concluida ? "Reabrir" : "Concluir"}</button>`)}
        </div>`
    ).join("");
}

function renderizarGerenciamentoDatas() {
    const container = $("manageSingleList");
    if (!container) return;

    const lista = getDataUnica().sort((a, b) => a.data.localeCompare(b.data));
    $("manageSingleCount").textContent = pad(lista.filter(d => !d.concluida).length);

    if (!lista.length) {
        container.innerHTML = vazio("Nenhum compromisso. Use “+ Adicionar data única”.");
        return;
    }

    container.innerHTML = lista.map(d => `
        <div class="manage-row ${d.concluida ? "is-done" : ""}">
            <div class="manage-main">
                <strong>${esc(d.descricao)}</strong>
                <span>${formatarData(d.data)} · ${d.concluida ? "Concluída" : "Em aberto"}</span>
            </div>
            ${botoesGerenciar("edit-dat", "del-dat", d.id,
                `<button class="edit-button" type="button" data-action="toggle-data" data-id="${esc(d.id)}">
                    ${d.concluida ? "Reabrir" : "Concluir"}</button>`)}
        </div>`
    ).join("");
}


/* ---------- Editar / excluir ---------- */

function editarRecorrente(id) {
    const lista = getRecorrentes();
    const item = lista.find(t => t.id === id);
    if (!item) return;

    const empresa = prompt("Empresa:", item.empresa);
    if (empresa === null) return;

    const atividade = prompt("Atividade:", item.atividade);
    if (atividade === null) return;

    const horarioTexto = prompt("Horário (HH:MM):", item.horario);
    if (horarioTexto === null) return;

    const horario = normalizarHorario(horarioTexto);
    if (!horario) {
        alert("Horário inválido. Use o formato HH:MM, por exemplo 09:30.");
        return;
    }

    const diasTexto = prompt(
        "Dias da semana separados por vírgula:\nEx.: Segunda, Terça, Quarta",
        normalizarDias(item.dias).join(", ")
    );
    if (diasTexto === null) return;

    const dias = normalizarDias(diasTexto.split(/[,;]/));
    if (!dias.length) {
        alert("Informe pelo menos um dia válido (ex.: Segunda, Terça).");
        return;
    }

    item.empresa = empresa.trim() || "Geral";
    item.atividade = atividade.trim() || item.atividade;
    item.horario = horario;
    item.dias = dias;

    salvarRecorrentes(lista);
}

function excluirRecorrente(id) {
    const lista = getRecorrentes();
    const item = lista.find(t => t.id === id);
    if (!item) return;

    if (!confirm(`Excluir "${item.atividade}" (${item.empresa}, ${item.horario})?`)) return;

    salvarRecorrentes(lista.filter(t => t.id !== id));
}

function editarPendencia(id) {
    const lista = getPendencias();
    const item = lista.find(p => p.id === id);
    if (!item) return;

    const tipo = prompt(`Tipo (Geral ou ${nomeGestor() || "Gestor"}):`, rotuloTipo(item));
    if (tipo === null) return;

    const descricao = prompt("Descrição:", item.descricao);
    if (descricao === null) return;

    item.tipo = ehRodrigo({ tipo }) ? "Gestor" : (tipo.trim() || "Geral");
    item.descricao = descricao.trim() || item.descricao;

    salvarPendencias(lista);
}

function excluirPendencia(id) {
    const lista = getPendencias();
    const item = lista.find(p => p.id === id);
    if (!item) return;

    if (!confirm(`Excluir a pendência "${item.descricao}"?`)) return;

    salvarPendencias(lista.filter(p => p.id !== id));
}

function editarDataUnica(id) {
    const lista = getDataUnica();
    const item = lista.find(d => d.id === id);
    if (!item) return;

    const descricao = prompt("Descrição:", item.descricao);
    if (descricao === null) return;

    const dataTexto = prompt("Data (DD/MM/AAAA):", formatarData(item.data));
    if (dataTexto === null) return;

    const data = paraISO(dataTexto);
    if (!data) {
        alert("Data inválida. Use o formato DD/MM/AAAA, por exemplo 05/10/2026.");
        return;
    }

    item.descricao = descricao.trim() || item.descricao;
    item.data = data;

    salvarDataUnica(lista);
}

function excluirDataUnica(id) {
    const lista = getDataUnica();
    const item = lista.find(d => d.id === id);
    if (!item) return;

    if (!confirm(`Excluir "${item.descricao}"?`)) return;

    salvarDataUnica(lista.filter(d => d.id !== id));
}

function restaurarTarefasOriginais() {
    const ok = confirm(
        "Isso apaga todas as alterações feitas na base e volta para a lista inicial de tarefas. Continuar?"
    );
    if (!ok) return;

    semearBase();
    renderizarTudo();
}


/* =========================================================
   INPUT DE TAREFAS
   ========================================================= */

let tipoSelecionado = "recorrente";

const NOMES_TIPO = {
    recorrente: "tarefa recorrente",
    data: "compromisso com data",
    pendencia: "pendência",
    get rodrigo() { return minusculaInicial(rotuloPedido()); }
};

function selecionarTipo(tipo) {
    if (!NOMES_TIPO[tipo]) return;
    tipoSelecionado = tipo;

    document.querySelectorAll(".type-option").forEach(op => {
        op.classList.toggle("active", op.dataset.tipo === tipo);
    });

    document.querySelectorAll("[data-campos]").forEach(el => {
        el.hidden = !el.dataset.campos.split(" ").includes(tipo);
    });

    const botao = document.querySelector(".save-button");
    if (botao) botao.textContent = `Salvar ${NOMES_TIPO[tipo]}`;
}

function configurarTiposTarefa() {
    document.querySelectorAll(".type-option").forEach(op => {
        op.addEventListener("click", () => selecionarTipo(op.dataset.tipo));
    });
    selecionarTipo(tipoSelecionado);
}

function mostrarMensagem(texto, erro = false) {
    const el = $("formMessage");
    if (!el) return;

    el.textContent = texto;
    el.classList.toggle("error", erro);

    clearTimeout(mostrarMensagem.timer);
    mostrarMensagem.timer = setTimeout(() => { el.textContent = ""; }, 6000);
}

function atualizarListaEmpresas() {
    const datalist = $("empresasList");
    if (!datalist) return;

    const empresas = [...new Set(getRecorrentes().map(t => t.empresa))].sort();
    datalist.innerHTML = empresas.map(e => `<option value="${esc(e)}"></option>`).join("");
}

function configurarInputTarefas() {
    const form = $("taskForm");
    if (!form) return;

    form.addEventListener("submit", event => {
        event.preventDefault();

        const descricao = $("taskInput").value.trim();
        const obs = $("taskObs").value.trim();

        if (!descricao) {
            mostrarMensagem("Informe o título da tarefa.", true);
            return;
        }

        if (tipoSelecionado === "recorrente") {
            const horario = normalizarHorario($("taskHorario").value);
            const dias = [...form.querySelectorAll('input[name="dias"]:checked')].map(c => c.value);

            if (!horario) { mostrarMensagem("Informe o horário da tarefa.", true); return; }
            if (!dias.length) { mostrarMensagem("Marque pelo menos um dia da semana.", true); return; }

            const lista = getRecorrentes();
            lista.push({
                id: gerarId("rec"),
                empresa: $("taskEmpresa").value.trim() || "Geral",
                atividade: descricao,
                dias: normalizarDias(dias),
                horario,
                ...(obs ? { obs } : {})
            });
            salvarRecorrentes(lista);
            mostrarMensagem(`Tarefa recorrente salva. Ela aparece no Painel do Dia em: ${resumirDias(dias)}.`);

        } else if (tipoSelecionado === "data") {
            const data = $("taskData").value;
            if (!data) { mostrarMensagem("Informe a data de conclusão.", true); return; }

            const lista = getDataUnica();
            lista.push({ id: gerarId("dat"), descricao, data, concluida: false, ...(obs ? { obs } : {}) });
            salvarDataUnica(lista);
            mostrarMensagem(`Compromisso salvo para ${formatarData(data)}.`);

        } else {
            const rodrigo = tipoSelecionado === "rodrigo";
            const lista = getPendencias();
            lista.push({
                id: gerarId("pen"),
                tipo: rodrigo ? "Gestor" : "Geral",
                descricao,
                concluida: false,
                ...(obs ? { obs } : {})
            });
            salvarPendencias(lista);
            mostrarMensagem(rodrigo ? `${rotuloPedido()} salvo.` : "Pendência salva.");
        }

        form.reset();
        renderizarTudo();
    });
}


/* =========================================================
   VOZ
   ========================================================= */

function configurarVoz() {
    const botao = $("voiceButton");
    const label = $("voiceLabel");
    if (!botao) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        botao.closest(".voice-row").hidden = true;
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;

    const parar = () => {
        botao.classList.remove("listening");
        if (label) label.textContent = "Adicionar por voz";
    };

    botao.addEventListener("click", () => {
        try {
            recognition.start();
            botao.classList.add("listening");
            if (label) label.textContent = "Ouvindo...";
        } catch (e) {
            parar();
        }
    });

    recognition.onresult = event => {
        const texto = event.results[0][0].transcript;
        const input = $("taskInput");
        if (input) input.value = texto.charAt(0).toUpperCase() + texto.slice(1);
    };

    recognition.onend = parar;
    recognition.onerror = parar;
}


/* =========================================================
   CLIQUES (delegação de eventos)
   ========================================================= */

const acoes = {
    "toggle-rotina":    id => alternarRotina(id),
    "toggle-pendencia": id => alternarConcluida(getPendencias, salvarPendencias, id),
    "toggle-data":      id => alternarConcluida(getDataUnica, salvarDataUnica, id),
    "edit-rec":         editarRecorrente,
    "del-rec":          excluirRecorrente,
    "edit-pen":         editarPendencia,
    "del-pen":          excluirPendencia,
    "edit-dat":         editarDataUnica,
    "del-dat":          excluirDataUnica
};

function configurarCliques() {
    document.addEventListener("click", event => {
        const acao = event.target.closest("[data-action]");
        if (acao && acoes[acao.dataset.action]) {
            acoes[acao.dataset.action](acao.dataset.id, acao);
            renderizarTudo();
            return;
        }

        const abrir = event.target.closest("[data-open-view]");
        if (abrir) {
            switchView(abrir.dataset.openView);
            return;
        }

        const novo = event.target.closest("[data-novo]");
        if (novo) {
            switchView("input");
            selecionarTipo(novo.dataset.novo);
            $("taskInput")?.focus();
            return;
        }

        const nav = event.target.closest(".nav-item");
        if (nav && nav.dataset.view) {
            switchView(nav.dataset.view);
        }
    });

    $("resetTasksButton")?.addEventListener("click", restaurarTarefasOriginais);
}


/* =========================================================
   BASE DE PROCESSOS
   Fica numa chave própria do navegador: restaurar as
   tarefas ou mudar VERSAO_BASE não apaga seus processos.
   ========================================================= */

const processosIniciais = [];

const CHAVE_PROCESSOS = "personalOS_processos";

let processoSelecionado = null;   // id do processo aberto
let rascunhoProcesso = null;      // cópia em edição (null = modo leitura)

function getProcessos() {
    let lista = ler(CHAVE_PROCESSOS, null);

    if (!Array.isArray(lista)) {
        lista = clonar(processosIniciais);
        salvarProcessos(lista);
    }

    let mudou = garantirIds(lista, "proc");
    lista.forEach(p => {
        if (!Array.isArray(p.etapas)) { p.etapas = []; mudou = true; }
        if (garantirIds(p.etapas, "etp")) mudou = true;
    });
    if (mudou) salvarProcessos(lista);

    return lista;
}

function salvarProcessos(lista) {
    gravar(CHAVE_PROCESSOS, lista);
}

function novaEtapa() {
    return { id: gerarId("etp"), titulo: "", descricao: "", mapeada: false };
}

function focar(seletor) {
    setTimeout(() => document.querySelector(seletor)?.focus(), 0);
}

function renderizarProcessos() {
    const menu = $("processMenu");
    const conteudo = $("processContent");
    if (!menu || !conteudo) return;

    const lista = getProcessos();

    if (!lista.some(p => p.id === processoSelecionado)) {
        processoSelecionado = lista[0]?.id || null;
    }

    menu.innerHTML = `<span class="card-label">PROCESSOS</span>` + (
        lista.length
            ? lista.map(p => `
                <button class="process-link ${p.id === processoSelecionado ? "active" : ""}" type="button"
                    data-action="proc-select" data-id="${esc(p.id)}">
                    ${esc(p.nome)}
                    <small>${p.etapas.length} ${p.etapas.length === 1 ? "etapa" : "etapas"}</small>
                </button>`).join("")
            : vazio("Nenhum processo ainda.")
    );

    if (rascunhoProcesso) {
        conteudo.innerHTML = htmlEditorProcesso(rascunhoProcesso);
        return;
    }

    const indice = lista.findIndex(p => p.id === processoSelecionado);
    const processo = lista[indice];

    if (!processo) {
        conteudo.innerHTML = vazio("Crie seu primeiro processo em “+ Novo processo”.");
        return;
    }

    const total = processo.etapas.length;
    const mapeadas = processo.etapas.filter(e => e.mapeada).length;
    const pct = total ? Math.round((mapeadas / total) * 100) : 0;
    const cor = pct === 100 ? "success" : pct > 0 ? "accent" : "neutral";

    conteudo.innerHTML = `
        <div class="process-header">
            <div>
                <span class="card-label">PROCESSO ${pad(indice + 1)}</span>
                <h3>${esc(processo.nome)}</h3>
            </div>
            <span class="status ${cor}">${pct}% mapeado</span>
        </div>

        <div class="steps">
            ${total ? processo.etapas.map((e, i) => `
                <div class="step ${e.mapeada ? "completed" : ""}">
                    <button class="step-number" type="button"
                        data-action="proc-toggle-step" data-id="${esc(processo.id)}" data-index="${i}"
                        title="${e.mapeada ? "Desmarcar" : "Marcar"} como mapeada">${pad(i + 1)}</button>
                    <div>
                        <strong>${esc(e.titulo)}</strong>
                        ${e.descricao ? `<p>${esc(e.descricao)}</p>` : ""}
                    </div>
                </div>`).join("")
            : vazio("Nenhuma etapa ainda. Clique em “Editar / adicionar etapa” para montar o passo a passo.")}
        </div>

        <div class="process-actions">
            <button class="primary-button" type="button" data-action="proc-edit" data-id="${esc(processo.id)}">
                Editar / adicionar etapa
            </button>
            <button class="delete-button" type="button" data-action="proc-delete" data-id="${esc(processo.id)}">
                Excluir processo
            </button>
        </div>
        ${total ? `<p class="process-hint">Clique no número de uma etapa para marcar ou desmarcar como mapeada.</p>` : ""}
    `;
}

function htmlEditorProcesso(r) {
    return `
        <div class="process-header">
            <div>
                <span class="card-label">EDITANDO PROCESSO</span>
                <h3>${esc(r.nome) || "Novo processo"}</h3>
            </div>
        </div>

        <div class="process-editor">
            <label>
                Nome do processo
                <input type="text" data-proc-field="nome" value="${esc(r.nome)}" placeholder="Ex.: Credenciamento de parceiros">
            </label>

            <div class="step-editor-list">
                ${r.etapas.map((e, i) => `
                    <div class="step-editor">
                        <div class="step-editor-top">
                            <span class="step-editor-num">${pad(i + 1)}</span>
                            <label class="step-check">
                                <input type="checkbox" data-step-field="mapeada" data-index="${i}" ${e.mapeada ? "checked" : ""}>
                                Mapeada
                            </label>
                            <div class="step-editor-tools">
                                <button class="edit-button" type="button" data-action="proc-step-up" data-index="${i}"
                                    ${i === 0 ? "disabled" : ""} aria-label="Mover etapa para cima">↑</button>
                                <button class="edit-button" type="button" data-action="proc-step-down" data-index="${i}"
                                    ${i === r.etapas.length - 1 ? "disabled" : ""} aria-label="Mover etapa para baixo">↓</button>
                                <button class="delete-button" type="button" data-action="proc-step-del" data-index="${i}">Remover</button>
                            </div>
                        </div>
                        <input type="text" data-step-field="titulo" data-index="${i}"
                            value="${esc(e.titulo)}" placeholder="Nome da etapa (ex.: Validar documentação)">
                        <textarea rows="2" data-step-field="descricao" data-index="${i}"
                            placeholder="O que fazer nesta etapa">${esc(e.descricao)}</textarea>
                    </div>`).join("")}
            </div>

            <button class="secondary-button" type="button" data-action="proc-step-add">+ Adicionar etapa</button>
        </div>

        <div class="process-actions">
            <button class="primary-button" type="button" data-action="proc-save">Salvar processo</button>
            <button class="edit-button" type="button" data-action="proc-cancel">Cancelar</button>
        </div>
    `;
}

// Mantém o rascunho atualizado enquanto você digita
function configurarEditorProcessos() {
    document.addEventListener("input", event => {
        if (!rascunhoProcesso) return;
        const alvo = event.target;

        if (alvo.dataset.procField === "nome") {
            rascunhoProcesso.nome = alvo.value;
            return;
        }

        const campo = alvo.dataset.stepField;
        const etapa = rascunhoProcesso.etapas[Number(alvo.dataset.index)];
        if (!campo || !etapa) return;

        etapa[campo] = alvo.type === "checkbox" ? alvo.checked : alvo.value;
    });
}

function moverEtapa(indice, direcao) {
    const etapas = rascunhoProcesso.etapas;
    const destino = indice + direcao;
    if (destino < 0 || destino >= etapas.length) return;
    [etapas[indice], etapas[destino]] = [etapas[destino], etapas[indice]];
}

const acoesProcessos = {
    "proc-select": id => {
        if (rascunhoProcesso && id !== rascunhoProcesso.id &&
            !confirm("Descartar as alterações deste processo?")) return;
        rascunhoProcesso = null;
        processoSelecionado = id;
    },

    "proc-new": () => {
        if (rascunhoProcesso && !confirm("Descartar as alterações do processo em edição?")) return;

        const nome = prompt("Nome do novo processo:");
        if (!nome || !nome.trim()) return;

        const lista = getProcessos();
        const processo = { id: gerarId("proc"), nome: nome.trim(), etapas: [] };
        lista.push(processo);
        salvarProcessos(lista);

        processoSelecionado = processo.id;
        rascunhoProcesso = { ...clonar(processo), etapas: [novaEtapa()] };
        focar('[data-step-field="titulo"]');
    },

    "proc-edit": id => {
        const processo = getProcessos().find(p => p.id === id);
        if (!processo) return;

        rascunhoProcesso = clonar(processo);
        if (!rascunhoProcesso.etapas.length) rascunhoProcesso.etapas.push(novaEtapa());
        focar('[data-step-field="titulo"]');
    },

    "proc-step-add": () => {
        rascunhoProcesso.etapas.push(novaEtapa());
        focar('.step-editor:last-child [data-step-field="titulo"]');
    },

    "proc-step-up":   (id, el) => moverEtapa(Number(el.dataset.index), -1),
    "proc-step-down": (id, el) => moverEtapa(Number(el.dataset.index), +1),

    "proc-step-del": (id, el) => {
        const i = Number(el.dataset.index);
        const etapa = rascunhoProcesso.etapas[i];
        if (etapa && (etapa.titulo || etapa.descricao) && !confirm("Remover esta etapa?")) return;
        rascunhoProcesso.etapas.splice(i, 1);
    },

    "proc-save": () => {
        const r = rascunhoProcesso;
        if (!r.nome.trim()) {
            alert("Dê um nome ao processo antes de salvar.");
            focar('[data-proc-field="nome"]');
            return;
        }

        r.nome = r.nome.trim();
        r.etapas = r.etapas
            .map(e => ({ ...e, titulo: e.titulo.trim(), descricao: e.descricao.trim() }))
            .filter(e => e.titulo || e.descricao)
            .map((e, i) => ({ ...e, titulo: e.titulo || `Etapa ${i + 1}` }));

        const lista = getProcessos();
        const posicao = lista.findIndex(p => p.id === r.id);
        if (posicao >= 0) lista[posicao] = r;
        else lista.push(r);

        salvarProcessos(lista);
        processoSelecionado = r.id;
        rascunhoProcesso = null;
    },

    "proc-cancel": () => {
        rascunhoProcesso = null;
    },

    "proc-delete": id => {
        const lista = getProcessos();
        const processo = lista.find(p => p.id === id);
        if (!processo) return;
        if (!confirm(`Excluir o processo "${processo.nome}" e todas as etapas?`)) return;

        salvarProcessos(lista.filter(p => p.id !== id));
        processoSelecionado = null;
    },

    "proc-toggle-step": (id, el) => {
        const lista = getProcessos();
        const processo = lista.find(p => p.id === id);
        const etapa = processo?.etapas[Number(el.dataset.index)];
        if (!etapa) return;

        etapa.mapeada = !etapa.mapeada;
        salvarProcessos(lista);
    }
};

// Cada ação de processo redesenha só a tela de processos
Object.entries(acoesProcessos).forEach(([nome, fn]) => {
    acoes[nome] = (id, el) => {
        fn(id, el);
        renderizarProcessos();
    };
});


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    carregarDados();

    atualizarSaudacao();
    atualizarData();
    atualizarRelogio();
    gerarCalendario();

    configurarCliques();
    configurarFiltros();
    configurarTiposTarefa();
    configurarInputTarefas();
    configurarVoz();
    configurarEditorProcessos();

    window.addEventListener("perfil-atualizado", () => {
        atualizarSaudacao();
        renderizarTudo();
    });

    switchView("day");

    setInterval(atualizarRelogio, 1000);

    let ultimoDia = hojeISO();
    setInterval(() => {
        atualizarSaudacao();
        atualizarData();

        if (hojeISO() !== ultimoDia) {
            ultimoDia = hojeISO();
            gerarCalendario();
        }

        renderizarTudo();
    }, 60000);
});
