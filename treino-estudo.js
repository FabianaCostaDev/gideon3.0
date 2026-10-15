/* =========================================================
   TREINO E ESTUDO
   Carregue depois do script.js e antes do nuvem.js.

   TREINO
   - Plano semanal: tipo, dias, horário e duração.
   - Registro: "treinei" (tipo, duração, observação).
   - Faixa dos últimos 14 dias: treinou, faltou ou extra.

   ESTUDO (abas)
   - Visão geral: semana x meta, sequência de dias, cronômetro,
     plano semanal de estudo, faixa de 14 dias e histórico.
   - Matérias: meta, horas, tópicos e próximas datas.
   - Provas: data, horário, o que cai, peso e nota.
   - Trabalhos: entrega, etapas e colunas A fazer / Em andamento / Entregue.
   - Anotações: caderno com busca, filtro por matéria e fixar no topo.

   Tudo fica em duas chaves (personalOS_treinos e
   personalOS_estudos), sincronizadas pelo nuvem.js.
   ========================================================= */

const CHAVE_TREINOS = "personalOS_treinos";
const CHAVE_ESTUDOS = "personalOS_estudos";

const TIPOS_TREINO = ["Musculação", "Corrida", "Caminhada", "Funcional", "Bike", "Natação", "Pilates", "Yoga", "Alongamento"];
const TIPOS_DATA_ESTUDO = ["Prova", "Entrega de trabalho", "Apresentação", "Outro"];

(() => {

/* =========================================================
   DADOS
   ========================================================= */

const lista = valor => Array.isArray(valor) ? valor : [];

function getTreinos() {
    const dados = ler(CHAVE_TREINOS, null) || {};
    return { plano: lista(dados.plano), sessoes: lista(dados.sessoes) };
}

function salvarTreinos(dados) {
    gravar(CHAVE_TREINOS, dados);
}

function getEstudos() {
    const dados = ler(CHAVE_ESTUDOS, null) || {};
    const materias = lista(dados.materias).map(m => ({ ...m, topicos: lista(m.topicos) }));
    let provas = lista(dados.provas);
    let trabalhos = lista(dados.trabalhos);
    let notas = lista(dados.notas);

    // Versão antiga: provas e entregas na mesma lista, anotações dentro da matéria
    if (!dados.versao) {
        trabalhos = trabalhos.concat(provas
            .filter(p => p.tipo && p.tipo !== "Prova")
            .map(p => ({
                id: p.id, titulo: p.titulo, materiaId: p.materiaId || "", entrega: p.data || "",
                descricao: p.tipo === "Entrega de trabalho" ? "" : p.tipo, status: p.concluida ? "entregue" : "a_fazer",
                nota: "", etapas: []
            })));
        provas = provas
            .filter(p => !p.tipo || p.tipo === "Prova")
            .map(p => ({ ...p, status: p.status || (p.concluida ? "feita" : "agendada"), nota: p.nota || "" }));
        lista(dados.materias).forEach(m => lista(m.anotacoes).forEach(a => notas.push({
            id: a.id, titulo: "", texto: a.texto, materiaId: m.id, fixada: false, criada_em: a.em, editada_em: a.em
        })));
    }
    materias.forEach(m => delete m.anotacoes);

    return {
        versao: 2,
        materias,
        plano: lista(dados.plano),
        sessoes: lista(dados.sessoes),
        provas,
        trabalhos: trabalhos.map(t => ({ ...t, etapas: lista(t.etapas), status: t.status || "a_fazer" })),
        notas,
        cronometro: dados.cronometro && dados.cronometro.inicio ? dados.cronometro : null
    };
}

function salvarEstudos(dados) {
    gravar(CHAVE_ESTUDOS, dados);
}

window.getTreinos = getTreinos;
window.getEstudos = getEstudos;


/* =========================================================
   DATAS E FORMATOS
   ========================================================= */

function somarDias(data, dias) {
    const nova = new Date(data);
    nova.setDate(nova.getDate() + dias);
    return nova;
}

// Semana de segunda a domingo
function inicioSemana(data = new Date()) {
    const dia = new Date(data);
    dia.setHours(0, 0, 0, 0);
    dia.setDate(dia.getDate() - ((dia.getDay() + 6) % 7));
    return dia;
}

function naSemanaAtual(iso) {
    const inicio = hojeISO(inicioSemana());
    const fim = hojeISO(somarDias(inicioSemana(), 6));
    return iso >= inicio && iso <= fim;
}

function noMesAtual(iso) {
    return String(iso || "").slice(0, 7) === hojeISO().slice(0, 7);
}

function rodaNoDia(item, data) {
    const dia = chaveDia(DIAS_SEMANA[data.getDay()]);
    return lista(item.dias).some(d => chaveDia(d) === dia);
}

function formatarMinutos(min) {
    const total = Math.max(0, Math.round(Number(min) || 0));
    if (total < 60) return `${total} min`;
    const horas = Math.floor(total / 60);
    const resto = total % 60;
    return resto ? `${horas}h${pad(resto)}` : `${horas}h`;
}

function dataCurta(iso) {
    if (!iso) return "";
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
}

function contagem(iso) {
    const diff = diferencaDias(iso);
    if (diff < 0) return { texto: `passou (${dataCurta(iso)})`, classe: "neutral" };
    if (diff === 0) return { texto: "é hoje", classe: "danger" };
    if (diff === 1) return { texto: "amanhã", classe: "warning" };
    if (diff <= 7) return { texto: `em ${diff} dias`, classe: "warning" };
    return { texto: `em ${diff} dias`, classe: "accent" };
}

const novoId = prefixo => gerarId(prefixo);


/* =========================================================
   FORMULÁRIO EM JANELA (reaproveitado por tudo)
   ========================================================= */

const DIAS_CHIPS = [
    ["Segunda", "Seg"], ["Terça", "Ter"], ["Quarta", "Qua"], ["Quinta", "Qui"],
    ["Sexta", "Sex"], ["Sábado", "Sáb"], ["Domingo", "Dom"]
];

function htmlCampo(campo) {
    const nome = esc(campo.nome);
    const valor = campo.valor ?? "";
    const opcional = campo.obrigatorio ? "" : ` <span class="opcional">(opcional)</span>`;
    const rotulo = `<span>${esc(campo.rotulo)}${opcional}</span>`;

    if (campo.tipo === "dias") {
        const marcados = lista(campo.valor);
        return `
            <fieldset class="days-picker">
                <legend>${esc(campo.rotulo)}</legend>
                <div class="days-options">
                    ${DIAS_CHIPS.map(([dia, curto]) => `
                        <label class="day-chip">
                            <input type="checkbox" name="${nome}" value="${dia}" ${marcados.includes(dia) ? "checked" : ""}>
                            <span>${curto}</span>
                        </label>`).join("")}
                </div>
            </fieldset>`;
    }

    if (campo.tipo === "select") {
        return `
            <label>${rotulo}
                <select name="${nome}">
                    ${campo.opcoes.map(op => `<option value="${esc(op.valor)}" ${String(op.valor) === String(valor) ? "selected" : ""}>${esc(op.texto)}</option>`).join("")}
                </select>
            </label>`;
    }

    if (campo.tipo === "textarea") {
        return `
            <label>${rotulo}
                <textarea name="${nome}" rows="${campo.linhas || 3}" placeholder="${esc(campo.placeholder || "")}">${esc(valor)}</textarea>
            </label>`;
    }

    const listaId = campo.sugestoes ? `sug-${nome}` : "";
    return `
        <label>${rotulo}
            <input type="${campo.tipo || "text"}" name="${nome}" value="${esc(valor)}"
                ${campo.placeholder ? `placeholder="${esc(campo.placeholder)}"` : ""}
                ${campo.min !== undefined ? `min="${campo.min}"` : ""}
                ${campo.passo ? `step="${campo.passo}"` : ""}
                ${listaId ? `list="${listaId}"` : ""} autocomplete="off">
            ${listaId ? `<datalist id="${listaId}">${campo.sugestoes.map(s => `<option value="${esc(s)}"></option>`).join("")}</datalist>` : ""}
        </label>`;
}

function fecharFormulario() {
    const modal = document.getElementById("teModal");
    if (modal) modal.hidden = true;
}

function abrirFormulario({ titulo, texto = "", campos, botao = "Salvar", aoSalvar }) {
    let modal = document.getElementById("teModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "teModal";
        modal.className = "login-screen modal-screen";
        modal.hidden = true;
        document.body.appendChild(modal);
        modal.addEventListener("mousedown", evento => {
            if (evento.target === modal) fecharFormulario();
        });
        document.addEventListener("keydown", evento => {
            if (evento.key === "Escape" && !modal.hidden) fecharFormulario();
        });
    }

    modal.innerHTML = `
        <form class="login-card te-form" novalidate>
            <h1>${esc(titulo)}</h1>
            ${texto ? `<p>${esc(texto)}</p>` : ""}
            ${campos.map(htmlCampo).join("")}
            <div class="modal-acoes">
                <button class="save-button" type="submit">${esc(botao)}</button>
                <button class="secondary-button" type="button" data-te-cancelar>Cancelar</button>
            </div>
            <div class="form-message error" role="alert"></div>
        </form>`;
    modal.hidden = false;

    const form = modal.querySelector("form");
    form.querySelector("[data-te-cancelar]").addEventListener("click", fecharFormulario);
    setTimeout(() => form.querySelector("input:not([type=checkbox]), select, textarea")?.focus(), 0);

    form.addEventListener("submit", evento => {
        evento.preventDefault();
        const valores = {};

        for (const campo of campos) {
            if (campo.tipo === "dias") {
                valores[campo.nome] = [...form.querySelectorAll(`input[name="${campo.nome}"]:checked`)].map(c => c.value);
            } else {
                const bruto = form.elements[campo.nome]?.value ?? "";
                valores[campo.nome] = campo.tipo === "number" ? (bruto === "" ? null : Number(bruto)) : String(bruto).trim();
            }

            const vazio = campo.tipo === "dias" ? !valores[campo.nome].length : (valores[campo.nome] === "" || valores[campo.nome] === null);
            if (campo.obrigatorio && vazio) {
                form.querySelector(".form-message").textContent = `Preencha: ${campo.rotulo}.`;
                return;
            }
        }

        const erro = aoSalvar(valores);
        if (typeof erro === "string") {
            form.querySelector(".form-message").textContent = erro;
            return;
        }

        fecharFormulario();
        renderizarTudo();
    });
}


/* =========================================================
   TREINO: ações
   ========================================================= */

function camposPlano(item = {}) {
    return [
        { nome: "tipo", rotulo: "Tipo de treino", obrigatorio: true, valor: item.tipo || "", sugestoes: TIPOS_TREINO, placeholder: "Ex.: Musculação" },
        { nome: "dias", rotulo: "Dias da semana", tipo: "dias", obrigatorio: true, valor: item.dias || [] },
        { nome: "horario", rotulo: "Horário", tipo: "time", valor: item.horario || "" },
        { nome: "duracao", rotulo: "Duração prevista (min)", tipo: "number", min: 5, passo: 5, valor: item.duracao || 60 }
    ];
}

function novoPlanoTreino() {
    abrirFormulario({
        titulo: "Treino no plano",
        texto: "Ele aparece no Painel do Dia nos dias marcados.",
        campos: camposPlano(),
        aoSalvar: v => {
            const dados = getTreinos();
            dados.plano.push({ id: novoId("trp"), tipo: v.tipo, dias: normalizarDias(v.dias), horario: normalizarHorario(v.horario) || "", duracao: v.duracao || 0 });
            salvarTreinos(dados);
        }
    });
}

function editarPlanoTreino(id) {
    const item = getTreinos().plano.find(p => p.id === id);
    if (!item) return;
    abrirFormulario({
        titulo: "Editar treino do plano",
        campos: camposPlano(item),
        aoSalvar: v => {
            const dados = getTreinos();
            const alvo = dados.plano.find(p => p.id === id);
            if (!alvo) return "Esse treino não existe mais.";
            Object.assign(alvo, { tipo: v.tipo, dias: normalizarDias(v.dias), horario: normalizarHorario(v.horario) || "", duracao: v.duracao || 0 });
            salvarTreinos(dados);
        }
    });
}

function excluirPlanoTreino(id) {
    const dados = getTreinos();
    const item = dados.plano.find(p => p.id === id);
    if (!item || !confirm(`Tirar "${item.tipo}" do plano? O histórico de treinos feitos continua.`)) return;
    dados.plano = dados.plano.filter(p => p.id !== id);
    salvarTreinos(dados);
}

// "Treinei" — pode vir de um item do plano ou ser avulso
function registrarTreino(planoId = null, sessaoId = null) {
    const dados = getTreinos();
    const plano = planoId ? dados.plano.find(p => p.id === planoId) : null;
    const sessao = sessaoId ? dados.sessoes.find(s => s.id === sessaoId) : null;

    abrirFormulario({
        titulo: sessao ? "Editar treino feito" : "Registrar treino",
        botao: sessao ? "Salvar" : "Treinei ✓",
        campos: [
            { nome: "tipo", rotulo: "Tipo", obrigatorio: true, valor: sessao?.tipo || plano?.tipo || "", sugestoes: TIPOS_TREINO },
            { nome: "data", rotulo: "Data", tipo: "date", obrigatorio: true, valor: sessao?.data || hojeISO() },
            { nome: "duracao", rotulo: "Duração (min)", tipo: "number", min: 1, passo: 5, valor: sessao?.duracao ?? plano?.duracao ?? 60 },
            { nome: "obs", rotulo: "Observação", tipo: "textarea", linhas: 2, valor: sessao?.obs || "", placeholder: "Ex.: treino de perna, carga maior no agachamento" }
        ],
        aoSalvar: v => {
            const atual = getTreinos();
            if (sessao) {
                const alvo = atual.sessoes.find(s => s.id === sessao.id);
                if (alvo) Object.assign(alvo, { tipo: v.tipo, data: v.data, duracao: v.duracao || 0, obs: v.obs });
            } else {
                atual.sessoes.push({
                    id: novoId("trs"), data: v.data, planoId: plano?.id || null,
                    tipo: v.tipo, duracao: v.duracao || 0, obs: v.obs, em: new Date().toISOString()
                });
            }
            salvarTreinos(atual);
        }
    });
}

function desfazerTreinoHoje(planoId) {
    const dados = getTreinos();
    dados.sessoes = dados.sessoes.filter(s => !(s.planoId === planoId && s.data === hojeISO()));
    salvarTreinos(dados);
}

function excluirSessaoTreino(id) {
    const dados = getTreinos();
    if (!confirm("Apagar este treino do histórico?")) return;
    dados.sessoes = dados.sessoes.filter(s => s.id !== id);
    salvarTreinos(dados);
}


/* =========================================================
   ESTUDO: dados auxiliares
   ========================================================= */

const STATUS_TRABALHO = {
    a_fazer: "A fazer",
    andamento: "Em andamento",
    entregue: "Entregue"
};
const ORDEM_STATUS = ["a_fazer", "andamento", "entregue"];

// Estado da tela de estudo (aba aberta, filtros)
let abaEstudo = "geral";
let filtroNotasMateria = "";
let buscaNotas = "";

const nomeMateria = id => getEstudos().materias.find(m => m.id === id)?.nome || "";

function opcoesMaterias(incluirNenhuma = false) {
    const opcoes = getEstudos().materias.map(m => ({ valor: m.id, texto: m.nome }));
    return incluirNenhuma ? [{ valor: "", texto: "Nenhuma / geral" }, ...opcoes] : opcoes;
}

function exigirMateria() {
    if (getEstudos().materias.length) return true;
    alert("Cadastre uma matéria primeiro (botão + Matéria).");
    return false;
}

function progressoTrabalho(t) {
    const etapas = lista(t.etapas);
    if (!etapas.length) return t.status === "entregue" ? 1 : 0;
    return etapas.filter(e => e.feita).length / etapas.length;
}

function formatarCronometro(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}


/* =========================================================
   ESTUDO: matérias, tópicos e sessões
   ========================================================= */

function camposMateria(m = {}) {
    return [
        { nome: "nome", rotulo: "Nome da matéria ou tema", obrigatorio: true, valor: m.nome || "", placeholder: "Ex.: Python, Estatística, Inglês" },
        { nome: "meta", rotulo: "Meta por semana (horas)", tipo: "number", min: 0, passo: 0.5, valor: m.metaSemanalMin ? m.metaSemanalMin / 60 : 3 },
        { nome: "professor", rotulo: "Professor, curso ou plataforma", valor: m.professor || "", placeholder: "Ex.: Prof. Ana · Alura · Faculdade" }
    ];
}

function novaMateria() {
    abrirFormulario({
        titulo: "Nova matéria",
        campos: camposMateria(),
        aoSalvar: v => {
            const dados = getEstudos();
            dados.materias.push({
                id: novoId("mat"), nome: v.nome, metaSemanalMin: Math.round((v.meta || 0) * 60),
                professor: v.professor, topicos: [], criada_em: new Date().toISOString()
            });
            salvarEstudos(dados);
        }
    });
}

function editarMateria(id) {
    const materia = getEstudos().materias.find(m => m.id === id);
    if (!materia) return;
    abrirFormulario({
        titulo: "Editar matéria",
        campos: camposMateria(materia),
        aoSalvar: v => {
            const dados = getEstudos();
            const alvo = dados.materias.find(m => m.id === id);
            if (!alvo) return "Essa matéria não existe mais.";
            Object.assign(alvo, { nome: v.nome, metaSemanalMin: Math.round((v.meta || 0) * 60), professor: v.professor });
            salvarEstudos(dados);
        }
    });
}

function excluirMateria(id) {
    const dados = getEstudos();
    const materia = dados.materias.find(m => m.id === id);
    if (!materia || !confirm(`Excluir "${materia.nome}" e seus tópicos? Horas, provas, trabalhos e anotações continuam, sem matéria.`)) return;
    dados.materias = dados.materias.filter(m => m.id !== id);
    dados.plano = dados.plano.filter(p => p.materiaId !== id);
    if (dados.cronometro?.materiaId === id) dados.cronometro = null;
    salvarEstudos(dados);
}

function registrarEstudo(materiaId = "", sessaoId = null, opcoes = {}) {
    if (!exigirMateria()) return;
    const sessao = sessaoId ? getEstudos().sessoes.find(s => s.id === sessaoId) : null;

    abrirFormulario({
        titulo: sessao ? "Editar estudo" : opcoes.doCronometro ? "Salvar tempo do cronômetro" : "Registrar estudo",
        botao: sessao ? "Salvar" : "Estudei ✓",
        campos: [
            { nome: "materiaId", rotulo: "Matéria", tipo: "select", obrigatorio: true, opcoes: opcoesMaterias(), valor: sessao?.materiaId || materiaId },
            { nome: "data", rotulo: "Data", tipo: "date", obrigatorio: true, valor: sessao?.data || hojeISO() },
            { nome: "duracao", rotulo: "Tempo estudado (min)", tipo: "number", min: 1, passo: 5, obrigatorio: true, valor: sessao?.duracao ?? opcoes.duracao ?? 50 },
            { nome: "obs", rotulo: "O que estudou", tipo: "textarea", linhas: 2, valor: sessao?.obs || "", placeholder: "Ex.: exercícios do capítulo 3" }
        ],
        aoSalvar: v => {
            const dados = getEstudos();
            if (sessao) {
                const alvo = dados.sessoes.find(s => s.id === sessao.id);
                if (alvo) Object.assign(alvo, { materiaId: v.materiaId, data: v.data, duracao: v.duracao, obs: v.obs });
            } else {
                dados.sessoes.push({
                    id: novoId("ess"), materiaId: v.materiaId, data: v.data, duracao: v.duracao, obs: v.obs,
                    origem: opcoes.doCronometro ? "cronometro" : "manual", em: new Date().toISOString()
                });
                if (opcoes.doCronometro) dados.cronometro = null;
            }
            salvarEstudos(dados);
        }
    });
}

function excluirSessaoEstudo(id) {
    const dados = getEstudos();
    if (!confirm("Apagar este estudo do histórico?")) return;
    dados.sessoes = dados.sessoes.filter(s => s.id !== id);
    salvarEstudos(dados);
}

function novoTopico(materiaId) {
    abrirFormulario({
        titulo: "Novos tópicos",
        texto: "Um conteúdo por linha. Você marca conforme concluir.",
        campos: [{ nome: "titulos", rotulo: "Tópicos", tipo: "textarea", linhas: 5, obrigatorio: true, placeholder: "Regressão linear\nValidação cruzada\nÁrvores de decisão" }],
        aoSalvar: v => {
            const dados = getEstudos();
            const materia = dados.materias.find(m => m.id === materiaId);
            if (!materia) return "Matéria não encontrada.";
            v.titulos.split("\n").map(t => t.trim()).filter(Boolean).forEach(titulo => {
                materia.topicos.push({ id: novoId("top"), titulo, concluido: false, criado_em: new Date().toISOString() });
            });
            salvarEstudos(dados);
        }
    });
}

function alternarTopico(chave) {
    const [materiaId, topicoId] = chave.split("|");
    const dados = getEstudos();
    const topico = dados.materias.find(m => m.id === materiaId)?.topicos.find(t => t.id === topicoId);
    if (!topico) return;
    topico.concluido = !topico.concluido;
    if (topico.concluido) topico.concluido_em = new Date().toISOString();
    else delete topico.concluido_em;
    salvarEstudos(dados);
}

function excluirTopico(chave) {
    const [materiaId, topicoId] = chave.split("|");
    const dados = getEstudos();
    const materia = dados.materias.find(m => m.id === materiaId);
    if (!materia) return;
    materia.topicos = materia.topicos.filter(t => t.id !== topicoId);
    salvarEstudos(dados);
}


/* =========================================================
   ESTUDO: plano semanal e cronômetro
   ========================================================= */

function camposPlanoEstudo(item = {}) {
    return [
        { nome: "materiaId", rotulo: "Matéria", tipo: "select", obrigatorio: true, opcoes: opcoesMaterias(), valor: item.materiaId || "" },
        { nome: "dias", rotulo: "Dias da semana", tipo: "dias", obrigatorio: true, valor: item.dias || [] },
        { nome: "horario", rotulo: "Horário", tipo: "time", valor: item.horario || "" },
        { nome: "duracao", rotulo: "Duração (min)", tipo: "number", min: 10, passo: 5, valor: item.duracao || 50 }
    ];
}

function novoPlanoEstudo() {
    if (!exigirMateria()) return;
    abrirFormulario({
        titulo: "Estudo no plano semanal",
        texto: "Ele aparece no Painel do Dia e entra no planejamento.",
        campos: camposPlanoEstudo(),
        aoSalvar: v => {
            const dados = getEstudos();
            dados.plano.push({ id: novoId("epl"), materiaId: v.materiaId, dias: normalizarDias(v.dias), horario: normalizarHorario(v.horario) || "", duracao: v.duracao || 0 });
            salvarEstudos(dados);
        }
    });
}

function editarPlanoEstudo(id) {
    const item = getEstudos().plano.find(p => p.id === id);
    if (!item) return;
    abrirFormulario({
        titulo: "Editar estudo do plano",
        campos: camposPlanoEstudo(item),
        aoSalvar: v => {
            const dados = getEstudos();
            const alvo = dados.plano.find(p => p.id === id);
            if (!alvo) return "Esse item não existe mais.";
            Object.assign(alvo, { materiaId: v.materiaId, dias: normalizarDias(v.dias), horario: normalizarHorario(v.horario) || "", duracao: v.duracao || 0 });
            salvarEstudos(dados);
        }
    });
}

function excluirPlanoEstudo(id) {
    const dados = getEstudos();
    const item = dados.plano.find(p => p.id === id);
    if (!item || !confirm(`Tirar ${nomeMateria(item.materiaId) || "este estudo"} do plano?`)) return;
    dados.plano = dados.plano.filter(p => p.id !== id);
    salvarEstudos(dados);
}

function iniciarCronometro(materiaId = "") {
    if (!exigirMateria()) return;
    const comecar = id => {
        const dados = getEstudos();
        dados.cronometro = { materiaId: id, inicio: new Date().toISOString() };
        salvarEstudos(dados);
    };

    if (materiaId) {
        comecar(materiaId);
        return;
    }

    abrirFormulario({
        titulo: "Iniciar cronômetro",
        botao: "▶ Começar",
        campos: [{ nome: "materiaId", rotulo: "Matéria", tipo: "select", obrigatorio: true, opcoes: opcoesMaterias() }],
        aoSalvar: v => comecar(v.materiaId)
    });
}

function pararCronometro() {
    const c = getEstudos().cronometro;
    if (!c) return;
    const minutos = Math.max(1, Math.round((Date.now() - new Date(c.inicio).getTime()) / 60000));
    registrarEstudo(c.materiaId, null, { duracao: minutos, doCronometro: true });
}

function cancelarCronometro() {
    if (!confirm("Descartar o tempo do cronômetro?")) return;
    const dados = getEstudos();
    dados.cronometro = null;
    salvarEstudos(dados);
}

// Atualiza os relógios na tela a cada segundo
setInterval(() => {
    document.querySelectorAll("[data-cronometro-inicio]").forEach(el => {
        el.textContent = formatarCronometro(Date.now() - new Date(el.dataset.cronometroInicio).getTime());
    });
}, 1000);


/* =========================================================
   ESTUDO: provas
   ========================================================= */

function camposProva(p = {}) {
    return [
        { nome: "titulo", rotulo: "Prova", obrigatorio: true, valor: p.titulo || "", placeholder: "Ex.: P1 de Estatística" },
        { nome: "materiaId", rotulo: "Matéria", tipo: "select", opcoes: opcoesMaterias(true), valor: p.materiaId || "" },
        { nome: "data", rotulo: "Data", tipo: "date", obrigatorio: true, valor: p.data || "" },
        { nome: "horario", rotulo: "Horário", tipo: "time", valor: p.horario || "" },
        { nome: "conteudo", rotulo: "O que cai", tipo: "textarea", linhas: 3, valor: p.conteudo || "", placeholder: "Capítulos, listas, tópicos..." },
        { nome: "peso", rotulo: "Peso ou valor", valor: p.peso || "", placeholder: "Ex.: 40% · vale 10" }
    ];
}

function salvarProva(id, v) {
    const dados = getEstudos();
    const campos = { titulo: v.titulo, materiaId: v.materiaId, data: v.data, horario: normalizarHorario(v.horario) || "", conteudo: v.conteudo, peso: v.peso };
    if (id) {
        const alvo = dados.provas.find(p => p.id === id);
        if (alvo) Object.assign(alvo, campos);
    } else {
        dados.provas.push({ id: novoId("prv"), ...campos, status: "agendada", nota: "", criada_em: new Date().toISOString() });
    }
    salvarEstudos(dados);
}

function novaProva() {
    abrirFormulario({ titulo: "Nova prova", campos: camposProva(), aoSalvar: v => salvarProva(null, v) });
}

function editarProva(id) {
    const prova = getEstudos().provas.find(p => p.id === id);
    if (!prova) return;
    abrirFormulario({ titulo: "Editar prova", campos: camposProva(prova), aoSalvar: v => salvarProva(id, v) });
}

function alternarProva(id) {
    const prova = getEstudos().provas.find(p => p.id === id);
    if (!prova) return;

    if (prova.status === "feita") {
        const dados = getEstudos();
        const alvo = dados.provas.find(p => p.id === id);
        alvo.status = "agendada";
        salvarEstudos(dados);
        return;
    }

    abrirFormulario({
        titulo: "Prova feita ✓",
        texto: "Se já souber a nota, anote aqui (dá para preencher depois em Editar nota).",
        botao: "Marcar como feita",
        campos: [{ nome: "nota", rotulo: "Nota", valor: prova.nota || "", placeholder: "Ex.: 8,5" }],
        aoSalvar: v => {
            const dados = getEstudos();
            const alvo = dados.provas.find(p => p.id === id);
            if (alvo) Object.assign(alvo, { status: "feita", nota: v.nota, feita_em: new Date().toISOString() });
            salvarEstudos(dados);
        }
    });
}

function editarNotaProva(id) {
    const prova = getEstudos().provas.find(p => p.id === id);
    if (!prova) return;
    abrirFormulario({
        titulo: "Nota da prova",
        campos: [{ nome: "nota", rotulo: "Nota", valor: prova.nota || "" }],
        aoSalvar: v => {
            const dados = getEstudos();
            const alvo = dados.provas.find(p => p.id === id);
            if (alvo) alvo.nota = v.nota;
            salvarEstudos(dados);
        }
    });
}

function excluirProva(id) {
    const dados = getEstudos();
    const prova = dados.provas.find(p => p.id === id);
    if (!prova || !confirm(`Excluir "${prova.titulo}"?`)) return;
    dados.provas = dados.provas.filter(p => p.id !== id);
    salvarEstudos(dados);
}


/* =========================================================
   ESTUDO: trabalhos (com etapas e status)
   ========================================================= */

function camposTrabalho(t = {}) {
    const campos = [
        { nome: "titulo", rotulo: "Trabalho", obrigatorio: true, valor: t.titulo || "", placeholder: "Ex.: Projeto final de ML" },
        { nome: "materiaId", rotulo: "Matéria", tipo: "select", opcoes: opcoesMaterias(true), valor: t.materiaId || "" },
        { nome: "entrega", rotulo: "Data de entrega", tipo: "date", valor: t.entrega || "" },
        { nome: "descricao", rotulo: "Descrição", tipo: "textarea", linhas: 3, valor: t.descricao || "", placeholder: "O que precisa ser entregue, formato, grupo..." }
    ];
    if (!t.id) {
        campos.push({ nome: "etapas", rotulo: "Etapas (uma por linha)", tipo: "textarea", linhas: 4, placeholder: "Pesquisa\nRascunho\nRevisão\nEnviar" });
    }
    return campos;
}

function novoTrabalho() {
    abrirFormulario({
        titulo: "Novo trabalho",
        campos: camposTrabalho(),
        aoSalvar: v => {
            const dados = getEstudos();
            dados.trabalhos.push({
                id: novoId("trb"), titulo: v.titulo, materiaId: v.materiaId, entrega: v.entrega, descricao: v.descricao,
                status: "a_fazer", nota: "",
                etapas: String(v.etapas || "").split("\n").map(e => e.trim()).filter(Boolean)
                    .map(titulo => ({ id: novoId("etp"), titulo, feita: false })),
                criado_em: new Date().toISOString()
            });
            salvarEstudos(dados);
        }
    });
}

function editarTrabalho(id) {
    const trabalho = getEstudos().trabalhos.find(t => t.id === id);
    if (!trabalho) return;
    abrirFormulario({
        titulo: "Editar trabalho",
        campos: [...camposTrabalho(trabalho), { nome: "nota", rotulo: "Nota", valor: trabalho.nota || "" }],
        aoSalvar: v => {
            const dados = getEstudos();
            const alvo = dados.trabalhos.find(t => t.id === id);
            if (alvo) Object.assign(alvo, { titulo: v.titulo, materiaId: v.materiaId, entrega: v.entrega, descricao: v.descricao, nota: v.nota });
            salvarEstudos(dados);
        }
    });
}

function moverTrabalho(chave) {
    const [id, status] = chave.split("|");
    if (!STATUS_TRABALHO[status]) return;
    const dados = getEstudos();
    const alvo = dados.trabalhos.find(t => t.id === id);
    if (!alvo) return;
    alvo.status = status;
    if (status === "entregue") alvo.entregue_em = new Date().toISOString();
    salvarEstudos(dados);
}

function excluirTrabalho(id) {
    const dados = getEstudos();
    const trabalho = dados.trabalhos.find(t => t.id === id);
    if (!trabalho || !confirm(`Excluir "${trabalho.titulo}"?`)) return;
    dados.trabalhos = dados.trabalhos.filter(t => t.id !== id);
    salvarEstudos(dados);
}

function novaEtapa(trabalhoId) {
    abrirFormulario({
        titulo: "Novas etapas",
        texto: "Uma por linha.",
        campos: [{ nome: "titulos", rotulo: "Etapas", tipo: "textarea", linhas: 4, obrigatorio: true }],
        aoSalvar: v => {
            const dados = getEstudos();
            const trabalho = dados.trabalhos.find(t => t.id === trabalhoId);
            if (!trabalho) return "Trabalho não encontrado.";
            trabalho.etapas = lista(trabalho.etapas);
            v.titulos.split("\n").map(e => e.trim()).filter(Boolean).forEach(titulo => {
                trabalho.etapas.push({ id: novoId("etp"), titulo, feita: false });
            });
            salvarEstudos(dados);
        }
    });
}

function alternarEtapa(chave) {
    const [trabalhoId, etapaId] = chave.split("|");
    const dados = getEstudos();
    const trabalho = dados.trabalhos.find(t => t.id === trabalhoId);
    const etapa = lista(trabalho?.etapas).find(e => e.id === etapaId);
    if (!etapa) return;
    etapa.feita = !etapa.feita;
    // Primeira etapa feita: o trabalho passa para "em andamento"
    if (etapa.feita && trabalho.status === "a_fazer") trabalho.status = "andamento";
    salvarEstudos(dados);
}

function excluirEtapa(chave) {
    const [trabalhoId, etapaId] = chave.split("|");
    const dados = getEstudos();
    const trabalho = dados.trabalhos.find(t => t.id === trabalhoId);
    if (!trabalho) return;
    trabalho.etapas = lista(trabalho.etapas).filter(e => e.id !== etapaId);
    salvarEstudos(dados);
}


/* =========================================================
   ESTUDO: anotações (caderno)
   ========================================================= */

function camposNota(n = {}, materiaId = "") {
    return [
        { nome: "titulo", rotulo: "Título", valor: n.titulo || "", placeholder: "Ex.: Fórmulas da P1" },
        { nome: "materiaId", rotulo: "Matéria", tipo: "select", opcoes: opcoesMaterias(true), valor: n.materiaId ?? materiaId },
        { nome: "texto", rotulo: "Anotação", tipo: "textarea", linhas: 8, obrigatorio: true, valor: n.texto || "" }
    ];
}

function novaNota(materiaId = "") {
    abrirFormulario({
        titulo: "Nova anotação",
        campos: camposNota({}, materiaId || filtroNotasMateria),
        aoSalvar: v => {
            const dados = getEstudos();
            const agora = new Date().toISOString();
            dados.notas.unshift({ id: novoId("not"), titulo: v.titulo, texto: v.texto, materiaId: v.materiaId, fixada: false, criada_em: agora, editada_em: agora });
            salvarEstudos(dados);
        }
    });
}

function editarNota(id) {
    const nota = getEstudos().notas.find(n => n.id === id);
    if (!nota) return;
    abrirFormulario({
        titulo: "Editar anotação",
        campos: camposNota(nota),
        aoSalvar: v => {
            const dados = getEstudos();
            const alvo = dados.notas.find(n => n.id === id);
            if (alvo) Object.assign(alvo, { titulo: v.titulo, texto: v.texto, materiaId: v.materiaId, editada_em: new Date().toISOString() });
            salvarEstudos(dados);
        }
    });
}

function fixarNota(id) {
    const dados = getEstudos();
    const nota = dados.notas.find(n => n.id === id);
    if (!nota) return;
    nota.fixada = !nota.fixada;
    salvarEstudos(dados);
}

function excluirNota(id) {
    const dados = getEstudos();
    if (!confirm("Apagar esta anotação?")) return;
    dados.notas = dados.notas.filter(n => n.id !== id);
    salvarEstudos(dados);
}


/* =========================================================
   CÁLCULOS (usados nas telas, no painel e pelo Gideon)
   ========================================================= */

function resumoTreino() {
    const { plano, sessoes } = getTreinos();
    const hoje = hojeISO();

    const planoHoje = plano
        .filter(p => rodaNoDia(p, new Date()))
        .sort((a, b) => (a.horario || "99").localeCompare(b.horario || "99"))
        .map(p => ({ ...p, feito: sessoes.some(s => s.planoId === p.id && s.data === hoje) }));

    const semana = sessoes.filter(s => naSemanaAtual(s.data));
    let planejadosSemana = 0;
    for (let i = 0; i < 7; i++) {
        const dia = somarDias(inicioSemana(), i);
        planejadosSemana += plano.filter(p => rodaNoDia(p, dia)).length;
    }

    return {
        planoHoje,
        feitosSemana: semana.length,
        planejadosSemana,
        minutosSemana: semana.reduce((t, s) => t + (Number(s.duracao) || 0), 0),
        ultimo: [...sessoes].sort((a, b) => b.data.localeCompare(a.data))[0] || null
    };
}

function resumoEstudo() {
    const e = getEstudos();
    const hoje = hojeISO();

    const porMateria = e.materias.map(m => {
        const sessoes = e.sessoes.filter(s => s.materiaId === m.id);
        const minutosSemana = sessoes.filter(s => naSemanaAtual(s.data)).reduce((t, s) => t + (Number(s.duracao) || 0), 0);
        const feitos = m.topicos.filter(t => t.concluido).length;
        return {
            ...m,
            minutosSemana,
            minutosTotal: sessoes.reduce((t, s) => t + (Number(s.duracao) || 0), 0),
            ultimoEstudo: sessoes.map(s => s.data).sort().pop() || null,
            progresso: m.metaSemanalMin ? Math.min(1, minutosSemana / m.metaSemanalMin) : 0,
            topicosAbertos: m.topicos.length - feitos,
            topicosFeitos: feitos
        };
    });

    const provasAbertas = e.provas
        .filter(p => p.status !== "feita" && p.data >= hoje)
        .sort((a, b) => (a.data + (a.horario || "")).localeCompare(b.data + (b.horario || "")));

    const trabalhosAbertos = e.trabalhos
        .filter(t => t.status !== "entregue")
        .sort((a, b) => (a.entrega || "9999").localeCompare(b.entrega || "9999"));

    // Lista única de datas (usada no painel, no planejamento e pelo Gideon)
    const proximas = [
        ...provasAbertas.map(p => ({ id: p.id, titulo: p.titulo, tipo: "Prova", materiaId: p.materiaId, data: p.data, horario: p.horario || "" })),
        ...trabalhosAbertos.filter(t => t.entrega && t.entrega >= hoje)
            .map(t => ({ id: t.id, titulo: t.titulo, tipo: "Trabalho", materiaId: t.materiaId, data: t.entrega, progresso: progressoTrabalho(t) }))
    ].sort((a, b) => a.data.localeCompare(b.data));

    const planoHoje = e.plano
        .filter(p => rodaNoDia(p, new Date()))
        .sort((a, b) => (a.horario || "99").localeCompare(b.horario || "99"))
        .map(p => ({ ...p, feito: e.sessoes.some(s => s.materiaId === p.materiaId && s.data === hoje) }));

    // Sequência de dias seguidos estudando (se hoje ainda não estudou, conta até ontem)
    const dias = new Set(e.sessoes.map(s => s.data));
    let sequencia = 0;
    let cursor = new Date();
    if (!dias.has(hoje)) cursor = somarDias(cursor, -1);
    while (dias.has(hojeISO(cursor))) {
        sequencia++;
        cursor = somarDias(cursor, -1);
    }

    return {
        porMateria,
        minutosSemana: porMateria.reduce((t, m) => t + m.minutosSemana, 0),
        metaSemana: e.materias.reduce((t, m) => t + (m.metaSemanalMin || 0), 0),
        minutosHoje: e.sessoes.filter(s => s.data === hoje).reduce((t, s) => t + (Number(s.duracao) || 0), 0),
        proximas,
        provasAbertas,
        trabalhosAbertos,
        planoHoje,
        sequencia,
        cronometro: e.cronometro,
        topicosMes: e.materias.reduce((t, m) => t + m.topicos.filter(tp => tp.concluido && noMesAtual(tp.concluido_em)).length, 0)
    };
}

window.resumoTreino = resumoTreino;
window.resumoEstudo = resumoEstudo;


/* =========================================================
   TELA: TREINO
   ========================================================= */

function faixa14Dias() {
    const { plano, sessoes } = getTreinos();
    const hoje = hojeISO();
    let html = "";

    for (let i = 13; i >= 0; i--) {
        const dia = somarDias(new Date(), -i);
        const iso = hojeISO(dia);
        const planejado = plano.some(p => rodaNoDia(p, dia));
        const feitos = sessoes.filter(s => s.data === iso);
        let estado = "livre";
        let dica = "Sem treino planejado";

        if (feitos.length) {
            estado = planejado ? "feito" : "extra";
            dica = `${feitos.map(f => `${f.tipo} ${formatarMinutos(f.duracao)}`).join(", ")}${planejado ? "" : " (extra)"}`;
        } else if (planejado && iso < hoje) {
            estado = "faltou";
            dica = "Planejado e não registrado";
        } else if (planejado) {
            estado = "pendente";
            dica = "Planejado para hoje";
        }

        html += `
            <div class="dia-treino ${estado}" title="${esc(`${DIAS_SEMANA[dia.getDay()]}, ${dataCurta(iso)} · ${dica}`)}">
                <span>${pad(dia.getDate())}</span>
                <i></i>
            </div>`;
    }
    return html;
}

function renderizarTreino() {
    const alvo = document.getElementById("treinoConteudo");
    if (!alvo) return;

    const { plano, sessoes } = getTreinos();
    const r = resumoTreino();
    const recentes = [...sessoes].sort((a, b) => (b.data + (b.em || "")).localeCompare(a.data + (a.em || ""))).slice(0, 12);

    alvo.innerHTML = `
        <div class="te-stats">
            <article class="card te-stat">
                <span class="card-label">ESTA SEMANA</span>
                <strong>${r.feitosSemana}<small> de ${r.planejadosSemana} planejados</small></strong>
            </article>
            <article class="card te-stat">
                <span class="card-label">TEMPO NA SEMANA</span>
                <strong>${formatarMinutos(r.minutosSemana)}</strong>
            </article>
            <article class="card te-stat">
                <span class="card-label">ÚLTIMO TREINO</span>
                <strong>${r.ultimo ? `${esc(r.ultimo.tipo)}<small> · ${dataCurta(r.ultimo.data)}</small>` : "<small>nenhum ainda</small>"}</strong>
            </article>
        </div>

        <article class="card te-bloco">
            <div class="card-header">
                <div><span class="card-label">ÚLTIMOS 14 DIAS</span><h3>Treinou ou não</h3></div>
                <div class="te-legenda"><span class="feito">treinou</span><span class="faltou">faltou</span><span class="extra">extra</span></div>
            </div>
            <div class="faixa-treino">${faixa14Dias()}</div>
        </article>

        <div class="te-colunas">
            <article class="card te-bloco">
                <div class="card-header">
                    <div><span class="card-label">HOJE</span><h3>Treinos de hoje</h3></div>
                    <button class="secondary-button" type="button" data-action="te-treino-avulso">+ Treino avulso</button>
                </div>
                <div class="compact-list">
                    ${r.planoHoje.length ? r.planoHoje.map(p => `
                        <div class="compact-item ${p.feito ? "is-done" : ""}">
                            <div>
                                <strong>${esc(p.tipo)}</strong>
                                <small>${p.horario ? `${esc(p.horario)} · ` : ""}${formatarMinutos(p.duracao)}</small>
                            </div>
                            ${p.feito
                                ? `<button class="complete-button" type="button" data-action="te-treino-desfazer" data-id="${esc(p.id)}">Desfazer</button>`
                                : `<button class="complete-button" type="button" data-action="te-treino-feito" data-id="${esc(p.id)}">✓ Treinei</button>`}
                        </div>`).join("") : vazio("Nenhum treino planejado para hoje.")}
                </div>
            </article>

            <article class="card te-bloco">
                <div class="card-header">
                    <div><span class="card-label">PLANO SEMANAL</span><h3>Seus treinos</h3></div>
                    <button class="primary-button" type="button" data-action="te-plano-novo">+ No plano</button>
                </div>
                <div class="manage-list">
                    ${plano.length ? [...plano].sort((a, b) => (a.horario || "99").localeCompare(b.horario || "99")).map(p => `
                        <div class="manage-row">
                            <div class="manage-main">
                                <strong>${esc(p.tipo)}</strong>
                                <span>${esc(resumirDias(p.dias))}${p.horario ? ` · ${esc(p.horario)}` : ""} · ${formatarMinutos(p.duracao)}</span>
                            </div>
                            <div class="manage-actions">
                                <button class="edit-button" type="button" data-action="te-plano-editar" data-id="${esc(p.id)}">Editar</button>
                                <button class="delete-button" type="button" data-action="te-plano-excluir" data-id="${esc(p.id)}">Excluir</button>
                            </div>
                        </div>`).join("") : vazio("Monte seu plano: tipo, dias e horário de cada treino.")}
                </div>
            </article>
        </div>

        <article class="card te-bloco">
            <div class="card-header">
                <div><span class="card-label">HISTÓRICO</span><h3>Treinos feitos</h3></div>
            </div>
            <div class="manage-list">
                ${recentes.length ? recentes.map(s => `
                    <div class="manage-row">
                        <div class="manage-main">
                            <strong>${esc(s.tipo)} · ${formatarMinutos(s.duracao)}</strong>
                            <span>${dataCurta(s.data)}${s.obs ? ` · ${esc(s.obs)}` : ""}</span>
                        </div>
                        <div class="manage-actions">
                            <button class="edit-button" type="button" data-action="te-sessao-editar" data-id="${esc(s.id)}">Editar</button>
                            <button class="delete-button" type="button" data-action="te-sessao-excluir" data-id="${esc(s.id)}">Excluir</button>
                        </div>
                    </div>`).join("") : vazio("Quando você registrar treinos, eles aparecem aqui.")}
            </div>
        </article>`;
}


/* =========================================================
   TELA: ESTUDO (com abas)
   ========================================================= */

const ABAS_ESTUDO = [
    ["geral", "Visão geral"],
    ["materias", "Matérias"],
    ["provas", "Provas"],
    ["trabalhos", "Trabalhos"],
    ["notas", "Anotações"]
];

function faixaEstudo14Dias() {
    const { plano, sessoes } = getEstudos();
    const hoje = hojeISO();
    let html = "";

    for (let i = 13; i >= 0; i--) {
        const dia = somarDias(new Date(), -i);
        const iso = hojeISO(dia);
        const planejado = plano.some(p => rodaNoDia(p, dia));
        const minutos = sessoes.filter(s => s.data === iso).reduce((t, s) => t + (Number(s.duracao) || 0), 0);
        let estado = "livre";
        let dica = "Nada planejado";

        if (minutos) {
            estado = planejado ? "feito" : "extra";
            dica = `${formatarMinutos(minutos)} de estudo${planejado ? "" : " (extra)"}`;
        } else if (planejado && iso < hoje) {
            estado = "faltou";
            dica = "Planejado e não registrado";
        } else if (planejado) {
            estado = "pendente";
            dica = "Planejado para hoje";
        }

        html += `
            <div class="dia-treino ${estado}" title="${esc(`${DIAS_SEMANA[dia.getDay()]}, ${dataCurta(iso)} · ${dica}`)}">
                <span>${pad(dia.getDate())}</span>
                <i></i>
            </div>`;
    }
    return html;
}

function htmlCronometro(r) {
    const c = r.cronometro;
    if (c) {
        return `
            <div class="crono ativo">
                <span class="card-label">ESTUDANDO AGORA</span>
                <strong class="crono-materia">${esc(nomeMateria(c.materiaId) || "Matéria")}</strong>
                <div class="crono-tempo" data-cronometro-inicio="${esc(c.inicio)}">${formatarCronometro(Date.now() - new Date(c.inicio).getTime())}</div>
                <div class="crono-acoes">
                    <button class="save-button" type="button" data-action="te-crono-parar">■ Parar e salvar</button>
                    <button class="secondary-button" type="button" data-action="te-crono-cancelar">Descartar</button>
                </div>
            </div>`;
    }
    return `
        <div class="crono">
            <span class="card-label">CRONÔMETRO</span>
            <p class="te-dica">Inicie quando começar a estudar. Ao parar, o tempo vira um registro automaticamente.</p>
            <button class="save-button" type="button" data-action="te-crono-iniciar">▶ Começar a estudar</button>
        </div>`;
}

function htmlAbaGeral(r) {
    const e = getEstudos();
    const proximaProva = r.provasAbertas[0];
    const proximoTrabalho = r.trabalhosAbertos.find(t => t.entrega) || r.trabalhosAbertos[0];
    const progressoTotal = r.metaSemana ? Math.min(1, r.minutosSemana / r.metaSemana) : 0;
    const recentes = [...e.sessoes].sort((a, b) => (b.data + (b.em || "")).localeCompare(a.data + (a.em || ""))).slice(0, 8);

    return `
        <div class="te-stats te-stats-4">
            <article class="card te-stat">
                <span class="card-label">ESTA SEMANA</span>
                <strong>${formatarMinutos(r.minutosSemana)}${r.metaSemana ? `<small> de ${formatarMinutos(r.metaSemana)}</small>` : ""}</strong>
                ${r.metaSemana ? `<div class="barra"><i style="width:${Math.round(progressoTotal * 100)}%"></i></div>` : ""}
            </article>
            <article class="card te-stat">
                <span class="card-label">SEQUÊNCIA</span>
                <strong>${r.sequencia}<small> ${r.sequencia === 1 ? "dia seguido" : "dias seguidos"}</small></strong>
            </article>
            <article class="card te-stat">
                <span class="card-label">PRÓXIMA PROVA</span>
                <strong class="te-stat-texto">${proximaProva ? `${esc(proximaProva.titulo)}<small> · ${contagem(proximaProva.data).texto}</small>` : "<small>nenhuma marcada</small>"}</strong>
            </article>
            <article class="card te-stat">
                <span class="card-label">PRÓXIMO TRABALHO</span>
                <strong class="te-stat-texto">${proximoTrabalho ? `${esc(proximoTrabalho.titulo)}<small>${proximoTrabalho.entrega ? ` · ${contagem(proximoTrabalho.entrega).texto}` : ""}</small>` : "<small>nenhum em aberto</small>"}</strong>
                ${proximoTrabalho ? `<div class="barra"><i style="width:${Math.round(progressoTrabalho(proximoTrabalho) * 100)}%"></i></div>` : ""}
            </article>
        </div>

        <div class="te-colunas">
            <article class="card te-bloco">
                ${htmlCronometro(r)}
                <div class="te-sub">
                    <div class="te-sub-topo"><span class="card-label">PLANEJADO PARA HOJE</span></div>
                    ${r.planoHoje.length ? r.planoHoje.map(p => `
                        <div class="compact-item ${p.feito ? "is-done" : ""}">
                            <div>
                                <strong>${esc(nomeMateria(p.materiaId) || "Matéria")}</strong>
                                <small>${p.horario ? `${esc(p.horario)} · ` : ""}${formatarMinutos(p.duracao)}</small>
                            </div>
                            <div class="manage-actions">
                                ${p.feito ? `<span class="status success">Feito</span>` : `
                                    <button class="edit-button" type="button" data-action="te-crono-iniciar" data-id="${esc(p.materiaId)}">▶</button>
                                    <button class="complete-button" type="button" data-action="te-estudo-registrar" data-id="${esc(p.materiaId)}">✓ Estudei</button>`}
                            </div>
                        </div>`).join("") : `<p class="te-dica">Nada no plano para hoje. Monte seu plano semanal abaixo.</p>`}
                </div>
            </article>

            <article class="card te-bloco">
                <div class="card-header">
                    <div><span class="card-label">SEMANA POR MATÉRIA</span><h3>Meta x estudado</h3></div>
                </div>
                <div class="barras-materias">
                    ${r.porMateria.length ? r.porMateria.map(m => `
                        <div class="barra-materia">
                            <div class="meta-texto">
                                <span>${esc(m.nome)}</span>
                                <span>${formatarMinutos(m.minutosSemana)}${m.metaSemanalMin ? ` / ${formatarMinutos(m.metaSemanalMin)}` : ""}</span>
                            </div>
                            <div class="barra"><i style="width:${Math.round((m.metaSemanalMin ? m.progresso : (m.minutosSemana ? 1 : 0)) * 100)}%"></i></div>
                        </div>`).join("") : vazio("Cadastre suas matérias com a meta de horas por semana.")}
                </div>
            </article>
        </div>

        <article class="card te-bloco">
            <div class="card-header">
                <div><span class="card-label">ÚLTIMOS 14 DIAS</span><h3>Estudou ou não</h3></div>
                <div class="te-legenda"><span class="feito">estudou</span><span class="faltou">faltou</span><span class="extra">extra</span></div>
            </div>
            <div class="faixa-treino">${faixaEstudo14Dias()}</div>
        </article>

        <div class="te-colunas">
            <article class="card te-bloco">
                <div class="card-header">
                    <div><span class="card-label">PLANO SEMANAL</span><h3>Horários de estudo</h3></div>
                    <button class="primary-button" type="button" data-action="te-eplano-novo">+ No plano</button>
                </div>
                <div class="manage-list">
                    ${e.plano.length ? [...e.plano].sort((a, b) => (a.horario || "99").localeCompare(b.horario || "99")).map(p => `
                        <div class="manage-row">
                            <div class="manage-main">
                                <strong>${esc(nomeMateria(p.materiaId) || "Matéria removida")}</strong>
                                <span>${esc(resumirDias(p.dias))}${p.horario ? ` · ${esc(p.horario)}` : ""} · ${formatarMinutos(p.duracao)}</span>
                            </div>
                            <div class="manage-actions">
                                <button class="edit-button" type="button" data-action="te-eplano-editar" data-id="${esc(p.id)}">Editar</button>
                                <button class="delete-button" type="button" data-action="te-eplano-excluir" data-id="${esc(p.id)}">Excluir</button>
                            </div>
                        </div>`).join("") : vazio("Defina dias e horários fixos de estudo, como no treino.")}
                </div>
            </article>

            <article class="card te-bloco">
                <div class="card-header">
                    <div><span class="card-label">HISTÓRICO</span><h3>Estudos recentes</h3></div>
                </div>
                <div class="manage-list">
                    ${recentes.length ? recentes.map(s => `
                        <div class="manage-row">
                            <div class="manage-main">
                                <strong>${esc(nomeMateria(s.materiaId) || "Sem matéria")} · ${formatarMinutos(s.duracao)}${s.origem === "cronometro" ? " ⏱" : ""}</strong>
                                <span>${dataCurta(s.data)}${s.obs ? ` · ${esc(s.obs)}` : ""}</span>
                            </div>
                            <div class="manage-actions">
                                <button class="edit-button" type="button" data-action="te-estudo-editar" data-id="${esc(s.id)}">Editar</button>
                                <button class="delete-button" type="button" data-action="te-estudo-excluir" data-id="${esc(s.id)}">×</button>
                            </div>
                        </div>`).join("") : vazio("Quando você registrar estudos, eles aparecem aqui.")}
                </div>
            </article>
        </div>`;
}

function htmlAbaMaterias(r) {
    const e = getEstudos();
    if (!r.porMateria.length) {
        return `<article class="card te-bloco">${vazio("Comece cadastrando uma matéria ou tema com a meta de horas por semana.")}</article>`;
    }

    return `<div class="materias-grid">${r.porMateria.map(m => {
        const abertos = m.topicos.filter(t => !t.concluido);
        const feitos = m.topicos.filter(t => t.concluido);
        const pctTopicos = m.topicos.length ? Math.round((feitos.length / m.topicos.length) * 100) : 0;
        const datas = r.proximas.filter(p => p.materiaId === m.id).slice(0, 3);
        const notas = e.notas.filter(n => n.materiaId === m.id).length;

        return `
        <article class="card te-bloco materia-card">
            <div class="card-header">
                <div>
                    <span class="card-label">MATÉRIA${m.professor ? ` · ${esc(m.professor.toUpperCase())}` : ""}</span>
                    <h3>${esc(m.nome)}</h3>
                </div>
                <div class="manage-actions">
                    <button class="edit-button" type="button" data-action="te-crono-iniciar" data-id="${esc(m.id)}" title="Iniciar cronômetro">▶</button>
                    <button class="complete-button" type="button" data-action="te-estudo-registrar" data-id="${esc(m.id)}">✓ Estudei</button>
                </div>
            </div>

            <div class="materia-numeros">
                <div><strong>${formatarMinutos(m.minutosSemana)}</strong><small>na semana${m.metaSemanalMin ? ` de ${formatarMinutos(m.metaSemanalMin)}` : ""}</small></div>
                <div><strong>${formatarMinutos(m.minutosTotal)}</strong><small>no total</small></div>
                <div><strong>${m.ultimoEstudo ? dataCurta(m.ultimoEstudo) : "—"}</strong><small>último estudo</small></div>
            </div>
            ${m.metaSemanalMin ? `<div class="barra"><i style="width:${Math.round(m.progresso * 100)}%"></i></div>` : ""}

            <div class="te-sub">
                <div class="te-sub-topo">
                    <span class="card-label">TÓPICOS · ${feitos.length}/${m.topicos.length}${m.topicos.length ? ` · ${pctTopicos}%` : ""}</span>
                    <button class="text-button" type="button" data-action="te-topico-novo" data-id="${esc(m.id)}">+ tópicos</button>
                </div>
                ${m.topicos.length ? [...abertos, ...feitos].map(t => `
                    <div class="topico ${t.concluido ? "is-done" : ""}">
                        <button class="task-check" type="button" data-action="te-topico-alternar" data-id="${esc(m.id)}|${esc(t.id)}"
                            aria-label="${t.concluido ? "Desmarcar" : "Concluir"} ${esc(t.titulo)}">${t.concluido ? "✓" : ""}</button>
                        <span>${esc(t.titulo)}</span>
                        <button class="te-x" type="button" data-action="te-topico-excluir" data-id="${esc(m.id)}|${esc(t.id)}" aria-label="Excluir tópico">×</button>
                    </div>`).join("") : `<p class="te-dica">Liste os conteúdos desta matéria e marque conforme concluir.</p>`}
            </div>

            ${datas.length ? `
                <div class="te-sub">
                    <div class="te-sub-topo"><span class="card-label">PRÓXIMAS DATAS</span></div>
                    ${datas.map(d => `<p class="materia-data"><span class="tag ${d.tipo === "Prova" ? "rodrigo" : ""}">${d.tipo}</span> ${esc(d.titulo)} · ${contagem(d.data).texto}</p>`).join("")}
                </div>` : ""}

            <div class="materia-rodape">
                <button class="text-button" type="button" data-action="te-materia-notas" data-id="${esc(m.id)}">Anotações (${notas}) →</button>
                <span>
                    <button class="edit-button" type="button" data-action="te-materia-editar" data-id="${esc(m.id)}">Editar</button>
                    <button class="delete-button" type="button" data-action="te-materia-excluir" data-id="${esc(m.id)}">Excluir</button>
                </span>
            </div>
        </article>`;
    }).join("")}</div>`;
}

function htmlAbaProvas() {
    const e = getEstudos();
    const hoje = hojeISO();
    const proximas = e.provas.filter(p => p.status !== "feita").sort((a, b) => a.data.localeCompare(b.data));
    const feitas = e.provas.filter(p => p.status === "feita").sort((a, b) => b.data.localeCompare(a.data));

    const cartao = p => {
        const c = contagem(p.data);
        const atrasada = p.status !== "feita" && p.data < hoje;
        return `
        <article class="card te-bloco prova-card ${p.status === "feita" ? "is-done" : ""}">
            <div class="card-header">
                <div>
                    <span class="card-label">${p.materiaId ? esc(nomeMateria(p.materiaId).toUpperCase()) : "PROVA"}</span>
                    <h3>${esc(p.titulo)}</h3>
                </div>
                ${p.status === "feita"
                    ? `<span class="status success">${p.nota ? `Nota ${esc(p.nota)}` : "Feita"}</span>`
                    : `<span class="status ${atrasada ? "danger" : c.classe}">${atrasada ? "data passou" : c.texto}</span>`}
            </div>
            <p class="prova-quando">${formatarData(p.data)}${p.horario ? ` · ${esc(p.horario)}` : ""}${p.peso ? ` · ${esc(p.peso)}` : ""}</p>
            ${p.conteudo ? `<div class="prova-conteudo"><span class="card-label">O QUE CAI</span><p>${esc(p.conteudo)}</p></div>` : ""}
            <div class="materia-rodape">
                <button class="complete-button" type="button" data-action="te-prova-feita" data-id="${esc(p.id)}">${p.status === "feita" ? "Reabrir" : "✓ Fiz a prova"}</button>
                <span>
                    ${p.status === "feita" ? `<button class="edit-button" type="button" data-action="te-prova-nota" data-id="${esc(p.id)}">Nota</button>` : ""}
                    <button class="edit-button" type="button" data-action="te-prova-editar" data-id="${esc(p.id)}">Editar</button>
                    <button class="delete-button" type="button" data-action="te-prova-excluir" data-id="${esc(p.id)}">Excluir</button>
                </span>
            </div>
        </article>`;
    };

    return `
        <div class="te-aba-topo">
            <p class="te-dica">Provas com data, horário, conteúdo e peso. Depois de fazer, guarde a nota.</p>
            <button class="primary-button" type="button" data-action="te-prova-nova">+ Prova</button>
        </div>
        <h4 class="te-secao">Próximas</h4>
        <div class="cards-grid">${proximas.length ? proximas.map(cartao).join("") : `<article class="card te-bloco">${vazio("Nenhuma prova marcada.")}</article>`}</div>
        ${feitas.length ? `<h4 class="te-secao">Feitas</h4><div class="cards-grid">${feitas.map(cartao).join("")}</div>` : ""}`;
}

function htmlAbaTrabalhos() {
    const e = getEstudos();

    const cartao = t => {
        const etapas = lista(t.etapas);
        const pct = Math.round(progressoTrabalho(t) * 100);
        const indice = ORDEM_STATUS.indexOf(t.status);
        const c = t.entrega ? contagem(t.entrega) : null;
        const atrasado = t.entrega && t.status !== "entregue" && t.entrega < hojeISO();

        return `
        <article class="card trab-card ${t.status === "entregue" ? "is-done" : ""}">
            <span class="card-label">${t.materiaId ? esc(nomeMateria(t.materiaId).toUpperCase()) : "TRABALHO"}</span>
            <h3>${esc(t.titulo)}</h3>
            ${t.entrega ? `<p class="prova-quando">Entrega ${formatarData(t.entrega)} · <span class="status ${t.status === "entregue" ? "success" : atrasado ? "danger" : c.classe}">${t.status === "entregue" ? "entregue" : atrasado ? "atrasado" : c.texto}</span></p>` : ""}
            ${t.descricao ? `<p class="trab-descricao">${esc(t.descricao)}</p>` : ""}
            ${etapas.length ? `
                <div class="meta-texto"><span>${etapas.filter(x => x.feita).length}/${etapas.length} etapas</span><b>${pct}%</b></div>
                <div class="barra"><i style="width:${pct}%"></i></div>
                <div class="etapas">
                    ${etapas.map(x => `
                        <div class="topico ${x.feita ? "is-done" : ""}">
                            <button class="task-check" type="button" data-action="te-etapa-alternar" data-id="${esc(t.id)}|${esc(x.id)}">${x.feita ? "✓" : ""}</button>
                            <span>${esc(x.titulo)}</span>
                            <button class="te-x" type="button" data-action="te-etapa-excluir" data-id="${esc(t.id)}|${esc(x.id)}" aria-label="Excluir etapa">×</button>
                        </div>`).join("")}
                </div>` : ""}
            <button class="text-button" type="button" data-action="te-etapa-nova" data-id="${esc(t.id)}">+ etapas</button>
            ${t.nota ? `<p class="prova-quando">Nota: ${esc(t.nota)}</p>` : ""}
            <div class="materia-rodape">
                <span>
                    ${indice > 0 ? `<button class="edit-button" type="button" data-action="te-trab-status" data-id="${esc(t.id)}|${ORDEM_STATUS[indice - 1]}" title="Voltar">←</button>` : ""}
                    ${indice < ORDEM_STATUS.length - 1 ? `<button class="complete-button" type="button" data-action="te-trab-status" data-id="${esc(t.id)}|${ORDEM_STATUS[indice + 1]}">${indice === 0 ? "Começar →" : "Entregue ✓"}</button>` : ""}
                </span>
                <span>
                    <button class="edit-button" type="button" data-action="te-trab-editar" data-id="${esc(t.id)}">Editar</button>
                    <button class="delete-button" type="button" data-action="te-trab-excluir" data-id="${esc(t.id)}">×</button>
                </span>
            </div>
        </article>`;
    };

    const ordenar = lista => [...lista].sort((a, b) => (a.entrega || "9999").localeCompare(b.entrega || "9999"));

    return `
        <div class="te-aba-topo">
            <p class="te-dica">Trabalhos com data de entrega e etapas. Mova entre as colunas conforme avança.</p>
            <button class="primary-button" type="button" data-action="te-trab-novo">+ Trabalho</button>
        </div>
        <div class="kanban">
            ${ORDEM_STATUS.map(status => {
                const itens = ordenar(e.trabalhos.filter(t => (t.status || "a_fazer") === status));
                return `
                <div class="kanban-coluna">
                    <div class="kanban-topo"><span>${STATUS_TRABALHO[status]}</span><span class="count-badge">${itens.length}</span></div>
                    ${itens.length ? itens.map(cartao).join("") : `<p class="te-dica kanban-vazio">Nada aqui.</p>`}
                </div>`;
            }).join("")}
        </div>`;
}

function htmlAbaNotas() {
    const e = getEstudos();
    const termo = chaveTexto(buscaNotas);
    const notas = e.notas
        .filter(n => !filtroNotasMateria || n.materiaId === filtroNotasMateria)
        .filter(n => !termo || chaveTexto(`${n.titulo} ${n.texto}`).includes(termo))
        .sort((a, b) => Number(!!b.fixada) - Number(!!a.fixada) || String(b.editada_em || "").localeCompare(String(a.editada_em || "")));

    return `
        <div class="notas-toolbar">
            <input type="search" id="notaBusca" placeholder="Buscar nas anotações…" value="${esc(buscaNotas)}" autocomplete="off">
            <button class="primary-button" type="button" data-action="te-nota-nova" data-id="${esc(filtroNotasMateria)}">+ Anotação</button>
        </div>
        <div class="plano-chips notas-filtros">
            <button class="plano-chip ${!filtroNotasMateria ? "active" : ""}" type="button" data-action="te-notas-filtro" data-id="">Todas (${e.notas.length})</button>
            ${e.materias.map(m => `
                <button class="plano-chip ${filtroNotasMateria === m.id ? "active" : ""}" type="button" data-action="te-notas-filtro" data-id="${esc(m.id)}">
                    ${esc(m.nome)} (${e.notas.filter(n => n.materiaId === m.id).length})
                </button>`).join("")}
        </div>
        <div class="notas-grid">
            ${notas.length ? notas.map(n => `
                <article class="card nota-card ${n.fixada ? "fixada" : ""}">
                    <div class="nota-topo">
                        <span class="tag">${n.materiaId ? esc(nomeMateria(n.materiaId) || "Sem matéria") : "Geral"}</span>
                        <button class="te-x nota-pin ${n.fixada ? "ativo" : ""}" type="button" data-action="te-nota-fixar" data-id="${esc(n.id)}" title="${n.fixada ? "Desafixar" : "Fixar no topo"}">📌</button>
                    </div>
                    ${n.titulo ? `<h3>${esc(n.titulo)}</h3>` : ""}
                    <p class="nota-texto">${esc(n.texto)}</p>
                    <div class="materia-rodape">
                        <small>${n.editada_em ? new Date(n.editada_em).toLocaleDateString("pt-BR") : ""}</small>
                        <span>
                            <button class="edit-button" type="button" data-action="te-nota-editar" data-id="${esc(n.id)}">Editar</button>
                            <button class="delete-button" type="button" data-action="te-nota-excluir" data-id="${esc(n.id)}">×</button>
                        </span>
                    </div>
                </article>`).join("") : `<article class="card te-bloco">${vazio(buscaNotas || filtroNotasMateria ? "Nenhuma anotação encontrada." : "Seu caderno está vazio. Guarde fórmulas, resumos, dúvidas e recados para você.")}</article>`}
        </div>`;
}

function renderizarEstudo() {
    const alvo = document.getElementById("estudoConteudo");
    if (!alvo) return;

    // Mantém o foco (ex.: digitando na busca) quando a tela redesenha
    const ativo = document.activeElement;
    const foco = ativo && alvo.contains(ativo) && ativo.id
        ? { id: ativo.id, inicio: ativo.selectionStart, fim: ativo.selectionEnd }
        : null;

    const r = resumoEstudo();
    const conteudo = {
        geral: () => htmlAbaGeral(r),
        materias: () => htmlAbaMaterias(r),
        provas: htmlAbaProvas,
        trabalhos: htmlAbaTrabalhos,
        notas: htmlAbaNotas
    }[abaEstudo] || (() => htmlAbaGeral(r));

    const contadores = {
        materias: r.porMateria.length,
        provas: r.provasAbertas.length,
        trabalhos: r.trabalhosAbertos.length,
        notas: getEstudos().notas.length
    };

    alvo.innerHTML = `
        <div class="plano-chips te-abas" role="tablist">
            ${ABAS_ESTUDO.map(([id, nome]) => `
                <button class="plano-chip ${abaEstudo === id ? "active" : ""}" type="button" role="tab"
                    aria-selected="${abaEstudo === id}" data-action="te-aba" data-id="${id}">
                    ${nome}${contadores[id] ? ` <span class="te-aba-n">${contadores[id]}</span>` : ""}
                </button>`).join("")}
        </div>
        ${conteudo()}`;

    if (foco) {
        const el = document.getElementById(foco.id);
        if (el) {
            el.focus();
            try { el.setSelectionRange(foco.inicio, foco.fim); } catch (e) { /* campo sem seleção */ }
        }
    }
}

// Busca nas anotações: redesenha enquanto digita
document.addEventListener("input", evento => {
    if (evento.target.id !== "notaBusca") return;
    buscaNotas = evento.target.value;
    renderizarEstudo();
});


/* =========================================================
   CARTÃO NO PAINEL DO DIA
   ========================================================= */

function renderizarCartaoPainel() {
    const alvo = document.getElementById("teHojeLista");
    if (!alvo) return;

    const t = resumoTreino();
    const e = resumoEstudo();
    const datasPerto = e.proximas.filter(p => diferencaDias(p.data) <= 14).slice(0, 3);

    const totalHoje = t.planoHoje.length + e.planoHoje.length;
    const feitosHoje = t.planoHoje.filter(p => p.feito).length + e.planoHoje.filter(p => p.feito).length;
    const contador = document.getElementById("teHojeCount");
    if (contador) contador.textContent = `${feitosHoje} / ${totalHoje}`;

    const progresso = e.metaSemana ? Math.min(1, e.minutosSemana / e.metaSemana) : 0;
    const crono = e.cronometro;

    alvo.innerHTML = `
        ${crono ? `
            <div class="compact-item crono-mini">
                <div>
                    <span class="tag">Estudando agora</span>
                    <strong>${esc(nomeMateria(crono.materiaId) || "Matéria")}</strong>
                    <small class="crono-tempo-mini" data-cronometro-inicio="${esc(crono.inicio)}">${formatarCronometro(Date.now() - new Date(crono.inicio).getTime())}</small>
                </div>
                <button class="mini-complete" type="button" data-action="te-crono-parar" title="Parar e salvar">■</button>
            </div>` : ""}

        ${t.planoHoje.map(p => `
            <div class="compact-item ${p.feito ? "is-done" : ""}">
                <div>
                    <span class="tag">Treino</span>
                    <strong>${esc(p.tipo)}</strong>
                    <small>${p.horario ? `${esc(p.horario)} · ` : ""}${formatarMinutos(p.duracao)}</small>
                </div>
                ${p.feito
                    ? `<span class="status success">Feito</span>`
                    : `<button class="mini-complete" type="button" data-action="te-treino-feito" data-id="${esc(p.id)}" title="Treinei">✓</button>`}
            </div>`).join("")}

        ${e.planoHoje.map(p => `
            <div class="compact-item ${p.feito ? "is-done" : ""}">
                <div>
                    <span class="tag">Estudo</span>
                    <strong>${esc(nomeMateria(p.materiaId) || "Matéria")}</strong>
                    <small>${p.horario ? `${esc(p.horario)} · ` : ""}${formatarMinutos(p.duracao)}</small>
                </div>
                ${p.feito
                    ? `<span class="status success">Feito</span>`
                    : `<button class="mini-complete" type="button" data-action="te-crono-iniciar" data-id="${esc(p.materiaId)}" title="Começar agora">▶</button>`}
            </div>`).join("")}

        ${e.metaSemana || e.minutosSemana ? `
            <div class="compact-item">
                <div class="te-cresce">
                    <span class="tag">Estudo · semana</span>
                    <strong>${formatarMinutos(e.minutosSemana)}${e.metaSemana ? ` de ${formatarMinutos(e.metaSemana)}` : ""}</strong>
                    ${e.metaSemana ? `<div class="barra"><i style="width:${Math.round(progresso * 100)}%"></i></div>` : ""}
                </div>
                <button class="mini-complete" type="button" data-action="te-estudo-registrar" title="Registrar estudo">+</button>
            </div>` : ""}

        ${datasPerto.map(p => {
            const c = contagem(p.data);
            return `
            <div class="compact-item">
                <div>
                    <span class="tag ${p.tipo === "Prova" ? "rodrigo" : ""}">${p.tipo}</span>
                    <strong>${esc(p.titulo)}</strong>
                    <small class="prazo-${c.classe}">${formatarData(p.data)} · ${c.texto}</small>
                </div>
            </div>`;
        }).join("")}

        ${!totalHoje && !crono && !e.metaSemana && !e.minutosSemana && !datasPerto.length
            ? vazio("Monte seu plano de treino e estudo para acompanhar aqui.") : ""}`;
}


/* =========================================================
   LIGAÇÕES COM O RESTO DO SITE
   ========================================================= */

// Ações dos botões (o script.js chama e depois redesenha tudo)
Object.assign(acoes, {
    "te-plano-novo": () => novoPlanoTreino(),
    "te-plano-editar": id => editarPlanoTreino(id),
    "te-plano-excluir": id => excluirPlanoTreino(id),
    "te-treino-feito": id => registrarTreino(id),
    "te-treino-avulso": () => registrarTreino(),
    "te-treino-desfazer": id => desfazerTreinoHoje(id),
    "te-sessao-editar": id => registrarTreino(null, id),
    "te-sessao-excluir": id => excluirSessaoTreino(id),

    "te-aba": id => { abaEstudo = id; },
    "te-materia-nova": () => novaMateria(),
    "te-materia-editar": id => editarMateria(id),
    "te-materia-excluir": id => excluirMateria(id),
    "te-materia-notas": id => { filtroNotasMateria = id; abaEstudo = "notas"; },
    "te-estudo-registrar": id => registrarEstudo(id || ""),
    "te-estudo-editar": id => registrarEstudo("", id),
    "te-estudo-excluir": id => excluirSessaoEstudo(id),
    "te-topico-novo": id => novoTopico(id),
    "te-topico-alternar": id => alternarTopico(id),
    "te-topico-excluir": id => excluirTopico(id),

    "te-eplano-novo": () => novoPlanoEstudo(),
    "te-eplano-editar": id => editarPlanoEstudo(id),
    "te-eplano-excluir": id => excluirPlanoEstudo(id),
    "te-crono-iniciar": id => iniciarCronometro(id || ""),
    "te-crono-parar": () => pararCronometro(),
    "te-crono-cancelar": () => cancelarCronometro(),

    "te-prova-nova": () => novaProva(),
    "te-prova-editar": id => editarProva(id),
    "te-prova-feita": id => alternarProva(id),
    "te-prova-nota": id => editarNotaProva(id),
    "te-prova-excluir": id => excluirProva(id),

    "te-trab-novo": () => novoTrabalho(),
    "te-trab-editar": id => editarTrabalho(id),
    "te-trab-status": chave => moverTrabalho(chave),
    "te-trab-excluir": id => excluirTrabalho(id),
    "te-etapa-nova": id => novaEtapa(id),
    "te-etapa-alternar": chave => alternarEtapa(chave),
    "te-etapa-excluir": chave => excluirEtapa(chave),

    "te-nota-nova": id => novaNota(id || ""),
    "te-nota-editar": id => editarNota(id),
    "te-nota-fixar": id => fixarNota(id),
    "te-nota-excluir": id => excluirNota(id),
    "te-notas-filtro": id => { filtroNotasMateria = id || ""; }
});

// Telas novas no menu
views.treino = "view-treino";
views.estudo = "view-estudo";

// Redesenha junto com o resto do site
window.renderizadoresExtras = window.renderizadoresExtras || [];
window.renderizadoresExtras.push(renderizarTreino, renderizarEstudo, renderizarCartaoPainel);

// Usado pelo Gideon para agir sem abrir janelas
window.treinoEstudo = {
    registrarTreinoDireto({ tipo, duracao, data, obs, planoId }) {
        const dados = getTreinos();
        dados.sessoes.push({ id: novoId("trs"), data: data || hojeISO(), planoId: planoId || null, tipo, duracao: Number(duracao) || 0, obs: obs || "", em: new Date().toISOString() });
        salvarTreinos(dados);
    },
    registrarEstudoDireto({ materiaId, duracao, data, obs }) {
        const dados = getEstudos();
        if (!dados.materias.some(m => m.id === materiaId)) return false;
        dados.sessoes.push({ id: novoId("ess"), materiaId, data: data || hojeISO(), duracao: Number(duracao) || 0, obs: obs || "", origem: "voz", em: new Date().toISOString() });
        salvarEstudos(dados);
        return true;
    },
    concluirTopicoDireto(materiaId, topicoId) {
        const dados = getEstudos();
        const topico = dados.materias.find(m => m.id === materiaId)?.topicos.find(t => t.id === topicoId);
        if (!topico) return false;
        topico.concluido = true;
        topico.concluido_em = new Date().toISOString();
        salvarEstudos(dados);
        return true;
    },
    adicionarAnotacaoDireto(materiaId, texto, titulo = "") {
        const dados = getEstudos();
        if (materiaId && !dados.materias.some(m => m.id === materiaId)) return false;
        const agora = new Date().toISOString();
        dados.notas.unshift({ id: novoId("not"), titulo, texto, materiaId: materiaId || "", fixada: false, criada_em: agora, editada_em: agora });
        salvarEstudos(dados);
        return true;
    },
    adicionarProvaDireto({ titulo, materiaId, data, horario, conteudo }) {
        const dados = getEstudos();
        dados.provas.push({ id: novoId("prv"), titulo, materiaId: materiaId || "", data, horario: normalizarHorario(horario) || "", conteudo: conteudo || "", peso: "", status: "agendada", nota: "", criada_em: new Date().toISOString() });
        salvarEstudos(dados);
    },
    adicionarTrabalhoDireto({ titulo, materiaId, entrega, descricao }) {
        const dados = getEstudos();
        dados.trabalhos.push({ id: novoId("trb"), titulo, materiaId: materiaId || "", entrega: entrega || "", descricao: descricao || "", status: "a_fazer", nota: "", etapas: [], criado_em: new Date().toISOString() });
        salvarEstudos(dados);
    },
    atualizarTrabalhoDireto(id, status) {
        if (!STATUS_TRABALHO[status]) return false;
        const dados = getEstudos();
        const alvo = dados.trabalhos.find(t => t.id === id);
        if (!alvo) return false;
        alvo.status = status;
        if (status === "entregue") alvo.entregue_em = new Date().toISOString();
        salvarEstudos(dados);
        return true;
    },
    iniciarCronometroDireto(materiaId) {
        const dados = getEstudos();
        if (!dados.materias.some(m => m.id === materiaId)) return false;
        dados.cronometro = { materiaId, inicio: new Date().toISOString() };
        salvarEstudos(dados);
        return true;
    },
    pararCronometroDireto() {
        const dados = getEstudos();
        const c = dados.cronometro;
        if (!c) return null;
        const minutos = Math.max(1, Math.round((Date.now() - new Date(c.inicio).getTime()) / 60000));
        dados.sessoes.push({ id: novoId("ess"), materiaId: c.materiaId, data: hojeISO(), duracao: minutos, obs: "", origem: "cronometro", em: new Date().toISOString() });
        dados.cronometro = null;
        salvarEstudos(dados);
        return { minutos, materia: nomeMateria(c.materiaId) };
    }
};

})();
