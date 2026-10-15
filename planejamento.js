/* =========================================================
   PLANEJAMENTO DO DIA
   Carregue depois do treino-estudo.js e antes do nuvem.js.

   1. O CÓDIGO levanta os fatos (sem IA, de graça, sem erro de conta):
      - o que ficou para trás no dia anterior (rotina não feita,
        pendências, compromissos atrasados, treino, estudo)
      - o dia planejado: rotina, compromissos, treino, metas de
        estudo que faltam na semana, provas e horários livres
   2. A IA (a mesma configurada no Gideon) recebe esses fatos e
      monta o plano: prioridades, agenda e onde encaixar pendências.

   Os planos ficam salvos (personalOS_planos) e sincronizam.
   ========================================================= */

const CHAVE_PLANOS = "personalOS_planos";

(() => {

/* =========================================================
   DATAS
   ========================================================= */

const $p = id => document.getElementById(id);

function somarDiasP(data, dias) {
    const nova = new Date(data);
    nova.setDate(nova.getDate() + dias);
    return nova;
}

function inicioDaSemana(data) {
    const dia = new Date(data);
    dia.setHours(0, 0, 0, 0);
    dia.setDate(dia.getDate() - ((dia.getDay() + 6) % 7));
    return dia;
}

function rodaEm(item, data) {
    const dia = chaveDia(DIAS_SEMANA[data.getDay()]);
    return (item.dias || []).some(d => chaveDia(d) === dia);
}

function nomeDoDia(data) {
    return data.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

const paraMin = hhmm => {
    const [h, m] = String(hhmm || "").split(":").map(Number);
    return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};
const paraHora = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;


/* =========================================================
   FATOS (calculados pelo código)
   ========================================================= */

// Horários livres entre os compromissos fixos do dia
function janelasLivres(fixos) {
    const ocupados = fixos
        .filter(f => f.inicio !== null)
        .map(f => ({ inicio: f.inicio, fim: f.inicio + (f.duracao || 20) }))
        .sort((a, b) => a.inicio - b.inicio);

    const janelas = [];
    let cursor = ocupados.length ? Math.min(ocupados[0].inicio, 8 * 60) : 8 * 60;
    const limite = 22 * 60;

    ocupados.forEach(o => {
        if (o.inicio - cursor >= 40) janelas.push({ de: paraHora(cursor), ate: paraHora(o.inicio), minutos: o.inicio - cursor });
        cursor = Math.max(cursor, o.fim);
    });
    if (limite - cursor >= 40) janelas.push({ de: paraHora(cursor), ate: paraHora(limite), minutos: limite - cursor });

    return janelas;
}

function montarFatos(alvo = "amanha") {
    const hoje = new Date();
    const dataAlvo = alvo === "hoje" ? hoje : somarDiasP(hoje, 1);
    const isoAlvo = hojeISO(dataAlvo);
    const dataRef = somarDiasP(dataAlvo, -1);
    const isoRef = hojeISO(dataRef);

    /* ---------- Dia anterior (o que ficou) ---------- */
    let rotinaRef = null;
    if (isoRef === hojeISO()) {
        const feitas = getRotinaFeita().ids;
        rotinaRef = obterTarefasDeHoje().map(t => ({ atividade: t.atividade, empresa: t.empresa, horario: t.horario, feita: feitas.includes(t.id) }));
    } else {
        rotinaRef = getHist(mesDe(isoRef)).dias[isoRef]?.rotina || null;
    }

    const pendencias = getPendencias()
        .filter(p => !p.concluida)
        .sort((a, b) => Number(ehRodrigo(b)) - Number(ehRodrigo(a)))
        .map(p => ({
            titulo: p.descricao,
            de: rotuloTipo(p),
            aberta_desde: p.criada_em ? formatarData(p.criada_em.slice(0, 10)) : null
        }));

    const compromissos = getDataUnica().filter(d => !d.concluida);
    const atrasados = compromissos.filter(d => d.data < isoAlvo).map(d => ({ titulo: d.descricao, era_para: formatarData(d.data) }));
    const doDia = compromissos.filter(d => d.data === isoAlvo).map(d => ({ titulo: d.descricao }));
    const proximos = compromissos
        .filter(d => d.data > isoAlvo && diferencaDias(d.data) <= 8)
        .map(d => ({ titulo: d.descricao, data: formatarData(d.data) }));

    /* ---------- Treino ---------- */
    const treinos = window.getTreinos ? window.getTreinos() : { plano: [], sessoes: [] };
    const treinoRefPlanejado = treinos.plano.filter(p => rodaEm(p, dataRef)).map(p => p.tipo);
    const treinoRefFeito = treinos.sessoes.filter(s => s.data === isoRef).map(s => `${s.tipo} (${s.duracao} min)`);
    const treinoAlvo = treinos.plano
        .filter(p => rodaEm(p, dataAlvo))
        .map(p => ({ tipo: p.tipo, horario: p.horario || null, duracao_min: p.duracao || 0 }));

    /* ---------- Estudo ---------- */
    const estudos = window.getEstudos ? window.getEstudos() : { materias: [], sessoes: [], provas: [] };
    const mesmaSemana = inicioDaSemana(dataAlvo).getTime() === inicioDaSemana(hoje).getTime();
    const inicioSemanaAlvo = hojeISO(inicioDaSemana(dataAlvo));
    const diasRestantes = 7 - ((dataAlvo.getDay() + 6) % 7);   // contando o dia alvo

    const materias = estudos.materias.map(m => {
        const feito = mesmaSemana
            ? estudos.sessoes.filter(s => s.materiaId === m.id && s.data >= inicioSemanaAlvo && s.data < isoAlvo)
                .reduce((t, s) => t + (Number(s.duracao) || 0), 0)
            : 0;
        const meta = m.metaSemanalMin || 0;
        return {
            materia: m.nome,
            meta_semana_min: meta,
            ja_estudado_na_semana_min: feito,
            falta_na_semana_min: Math.max(0, meta - feito),
            topicos_abertos: m.topicos.filter(t => !t.concluido).slice(0, 5).map(t => t.titulo)
        };
    });

    const estudoRef = estudos.sessoes.filter(s => s.data === isoRef).reduce((t, s) => t + (Number(s.duracao) || 0), 0);

    const diasAte = iso => Math.round((new Date(iso + "T12:00") - new Date(isoAlvo + "T12:00")) / 86400000);
    const nomeMat = id => estudos.materias.find(m => m.id === id)?.nome || null;

    const provas = (estudos.provas || [])
        .filter(p => p.status !== "feita" && !p.concluida && p.data >= isoAlvo && diasAte(p.data) <= 21)
        .sort((a, b) => a.data.localeCompare(b.data))
        .map(p => ({
            titulo: p.titulo,
            tipo: "Prova",
            materia: nomeMat(p.materiaId),
            data: formatarData(p.data),
            horario: p.horario || null,
            o_que_cai: p.conteudo || null,
            dias_a_partir_do_dia_planejado: diasAte(p.data)
        }));

    const trabalhos = (estudos.trabalhos || [])
        .filter(t => t.status !== "entregue")
        .sort((a, b) => (a.entrega || "9999").localeCompare(b.entrega || "9999"))
        .map(t => ({
            titulo: t.titulo,
            tipo: "Trabalho",
            materia: nomeMat(t.materiaId),
            entrega: t.entrega ? formatarData(t.entrega) : null,
            dias_ate_a_entrega: t.entrega ? diasAte(t.entrega) : null,
            status: t.status === "andamento" ? "em andamento" : "a fazer",
            etapas_abertas: (t.etapas || []).filter(x => !x.feita).map(x => x.titulo)
        }));

    const estudoAlvo = (estudos.plano || [])
        .filter(p => rodaEm(p, dataAlvo))
        .sort((a, b) => (a.horario || "99").localeCompare(b.horario || "99"))
        .map(p => ({ materia: nomeMat(p.materiaId), horario: p.horario || null, duracao_min: p.duracao || 0 }));

    /* ---------- Agenda do dia planejado ---------- */
    const rotinaAlvo = getRecorrentes()
        .filter(t => rodaEm(t, dataAlvo))
        .sort((a, b) => a.horario.localeCompare(b.horario))
        .map(t => ({ horario: t.horario, atividade: t.atividade, empresa: t.empresa }));

    const fixos = [
        ...rotinaAlvo.map(t => ({ inicio: paraMin(t.horario), duracao: 20 })),
        ...treinoAlvo.map(t => ({ inicio: paraMin(t.horario), duracao: t.duracao_min })),
        ...estudoAlvo.map(e => ({ inicio: paraMin(e.horario), duracao: e.duracao_min }))
    ];

    return {
        dia_planejado: { data: formatarData(isoAlvo), iso: isoAlvo, dia_da_semana: DIAS_SEMANA[dataAlvo.getDay()], rotulo: nomeDoDia(dataAlvo) },
        dia_anterior: {
            data: formatarData(isoRef),
            rotulo: nomeDoDia(dataRef),
            rotina: rotinaRef
                ? { total: rotinaRef.length, feitas: rotinaRef.filter(t => t.feita).length, nao_feitas: rotinaRef.filter(t => !t.feita).map(t => `${t.horario} ${t.atividade} (${t.empresa})`) }
                : null,
            treino_planejado: treinoRefPlanejado,
            treino_feito: treinoRefFeito,
            estudo_min: estudoRef
        },
        pendencias_sem_data_em_aberto: pendencias,
        compromissos_atrasados: atrasados,
        compromissos_do_dia: doDia,
        compromissos_proximos_dias: proximos,
        rotina_fixa_do_dia: rotinaAlvo,
        treino_planejado_no_dia: treinoAlvo,
        estudo: { dias_restantes_na_semana_contando_o_dia: diasRestantes, materias, estudo_planejado_no_dia: estudoAlvo },
        provas_e_datas_proximas: provas,
        trabalhos_em_aberto: trabalhos,
        horarios_livres_aproximados: janelasLivres(fixos)
    };
}


/* =========================================================
   CHAMADA À IA (usa a mesma configuração do Gideon)
   ========================================================= */

function montarInstrucoes(modo, foco, temPedido = false) {
    const nome = nomeUsuario();
    const nomes = { trabalho: "trabalho e tarefas gerais", treino: "treino", estudo: "estudo" };
    const areas = foco.length === 3 ? "todas (plano geral: trabalho, treino e estudo)" : `somente ${foco.map(f => nomes[f]).join(" e ")}`;

    return `Você é o Gideon, assistente de planejamento pessoal${nome ? ` de ${nome}` : ""}. Fale em português do Brasil, de forma direta e motivadora, sem exageros.

Sua tarefa: montar o plano do DIA PLANEJADO a partir dos FATOS em JSON enviados pela pessoa.
Áreas do plano: ${areas}. Não inclua na agenda atividades de áreas fora do plano.
${modo === "estrategico"
        ? "Modo ESTRATÉGICO: foque nas prioridades e numa agenda enxuta do dia planejado. Mencione o dia anterior só quando algo dele precisar entrar no plano."
        : "Modo COMPLETO: comece fechando o dia anterior (o que ficou e por que importa) e depois monte o plano do dia planejado, encaixando o que ficou para trás."}
${temPedido ? `
PEDIDOS ESPECIAIS: a pessoa escreveu pedidos especiais. Eles têm PRIORIDADE MÁXIMA sobre qualquer outra regra:
- Se ela disser que algo não pode passar do dia planejado, isso entra na agenda com horário e vira a prioridade número 1.
- Se ela pedir um horário específico, use esse horário.
- Se ela autorizar tirar ou mover algo (inclusive da rotina fixa), faça e registre em "mudancas".
- Se para encaixar o pedido for preciso mover algo que ela NÃO autorizou, prefira um horário livre; se não houver, mova o item menos importante e explique em "mudancas".
- Coisas que ela diz que não conseguiu fazer ou não vai conseguir terminar entram no plano mesmo que não estejam nos FATOS.
` : ""}
Regras:
- Use os FATOS e os pedidos especiais. Fora isso, nunca invente tarefas, horários, provas ou compromissos.
- A rotina fixa do dia tem horário marcado: só mude se um pedido especial exigir, e registre em "mudancas".
- Encaixe pendências, compromissos atrasados e estudo nos horários livres aproximados.
- Respeite o treino planejado (horário e duração). Se o treino do dia anterior não foi feito, sugira como compensar sem exagero.
- Para estudo, respeite o estudo planejado no dia e use o que falta da meta semanal dividido pelos dias restantes; dê prioridade a matérias com prova próxima (use "o que cai" para sugerir o que revisar).
- Trabalhos de estudo em aberto: sugira avançar as etapas abertas, priorizando a entrega mais próxima.
- Pedidos do gestor e compromissos atrasados costumam ser prioridade alta.
- No máximo 3 prioridades. Agenda em ordem de horário.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, neste formato:
{
  "resumo": "2 a 3 frases para ouvir em voz alta",
  "fechamento_dia_anterior": "1 a 2 frases (vazio no modo estratégico se não houver nada relevante)",
  "mudancas": ["o que foi movido, retirado ou encaixado para atender os pedidos especiais (vazio se não houver)"],
  "prioridades": [{ "titulo": "...", "motivo": "..." }],
  "agenda": [{ "horario": "HH:MM", "atividade": "...", "tipo": "trabalho|treino|estudo|pendencia|pausa|outro", "observacao": "..." }],
  "encaixes": [{ "item": "pendência ou atraso", "quando": "horário ou momento sugerido" }],
  "alertas": ["provas próximas, prazos, riscos"],
  "dica": "uma frase curta"
}`;
}

function extrairJSON(texto) {
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (inicio < 0 || fim <= inicio) return null;
    try {
        return JSON.parse(texto.slice(inicio, fim + 1));
    } catch (e) {
        return null;
    }
}

async function chamarIA(instrucoes, pedido) {
    const g = window.gideon;
    if (!g) throw new Error("O Gideon (jarvis-v4.js) não carregou.");

    const config = g.getConfig();
    const provedor = config.provedor;
    if (g.precisaDeChave(config)) {
        throw new Error("Para gerar o plano, configure a IA no Gideon: clique no orbe, depois na engrenagem ⚙, e escolha \"Gemini (incluso)\" ou cole sua chave.");
    }

    g.registrarUso("perguntas");

    if (provedor === "openai") {
        const dados = await g.postJSON(
            "https://api.openai.com/v1/responses",
            { Authorization: `Bearer ${config.chaves.openai}` },
            { model: config.modelos.openai, instructions: instrucoes, input: pedido, text: { format: { type: "json_object" } } }
        );
        return (dados.output || [])
            .filter(item => item.type === "message")
            .flatMap(item => item.content || [])
            .filter(parte => parte.type === "output_text")
            .map(parte => parte.text)
            .join("");
    }

    if (provedor === "anthropic") {
        const dados = await g.postJSON(
            "https://api.anthropic.com/v1/messages",
            {
                "x-api-key": config.chaves.anthropic,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            { model: config.modelos.anthropic, max_tokens: 2000, system: instrucoes, messages: [{ role: "user", content: pedido }] }
        );
        return (dados.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    }

    const dados = await g.gerarConteudoGemini(config, {
        systemInstruction: { parts: [{ text: instrucoes }] },
        contents: [{ role: "user", parts: [{ text: pedido }] }],
        generationConfig: { responseMimeType: "application/json" }
    });
    return (dados.candidates?.[0]?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("");
}


/* =========================================================
   PLANOS SALVOS (uma lista: cada pedido vira um plano)
   ========================================================= */

const TODAS_AREAS = ["trabalho", "treino", "estudo"];
const NOMES_AREAS = { trabalho: "Trabalho", treino: "Treino", estudo: "Estudo" };

let planoSelecionado = null;   // id do plano aberto na tela

function getPlanos() {
    const bruto = ler(CHAVE_PLANOS, null);
    if (bruto && Array.isArray(bruto.lista)) return bruto.lista;

    // Formato antigo: um plano por data
    if (bruto && typeof bruto === "object") {
        return Object.entries(bruto)
            .filter(([, r]) => r && typeof r === "object" && r.gerado_em)
            .map(([iso, r]) => ({
                id: `pln-${iso}`, dia_iso: iso, areas: r.foco || TODAS_AREAS, pedido: "",
                origem: "tela", visto: true, ...r
            }));
    }
    return [];
}

function salvarPlanos(lista) {
    const ordenada = [...lista]
        .sort((a, b) => String(b.gerado_em).localeCompare(String(a.gerado_em)))
        .slice(0, 40);
    gravar(CHAVE_PLANOS, { versao: 2, lista: ordenada });
}

function rotuloAreas(areas) {
    const lista = areas && areas.length ? areas : TODAS_AREAS;
    return lista.length === TODAS_AREAS.length ? "Geral" : lista.map(a => NOMES_AREAS[a] || a).join(" + ");
}

const isoDoAlvo = alvo => hojeISO(alvo === "hoje" ? new Date() : somarDiasP(new Date(), 1));

function planoMaisRecente(iso) {
    return getPlanos()
        .filter(p => p.dia_iso === iso)
        .sort((a, b) => String(b.gerado_em).localeCompare(String(a.gerado_em)))[0] || null;
}

// Gera um plano (usado pela tela e pela voz)
async function gerarPlanoCore({ alvo = "amanha", modo = "completo", areas = TODAS_AREAS, pedido = "", origem = "tela" }) {
    let foco = (areas || []).filter(a => TODAS_AREAS.includes(a));
    if (!foco.length) foco = [...TODAS_AREAS];

    const fatos = montarFatos(alvo);

    // Tira o que não está no plano para não confundir a IA
    if (!foco.includes("treino")) {
        delete fatos.treino_planejado_no_dia;
        delete fatos.dia_anterior.treino_planejado;
        delete fatos.dia_anterior.treino_feito;
    }
    if (!foco.includes("estudo")) {
        delete fatos.estudo;
        delete fatos.provas_e_datas_proximas;
        delete fatos.trabalhos_em_aberto;
        delete fatos.dia_anterior.estudo_min;
    }
    if (!foco.includes("trabalho")) {
        delete fatos.rotina_fixa_do_dia;
        delete fatos.pendencias_sem_data_em_aberto;
        delete fatos.compromissos_atrasados;
        delete fatos.compromissos_do_dia;
        delete fatos.compromissos_proximos_dias;
        delete fatos.dia_anterior.rotina;
    }

    const mensagem = `FATOS:\n${JSON.stringify(fatos)}${pedido ? `\n\nPEDIDOS ESPECIAIS DA PESSOA (prioridade máxima): ${pedido}` : ""}`;
    const texto = await chamarIA(montarInstrucoes(modo, foco, !!pedido), mensagem);
    const plano = extrairJSON(texto);

    const registro = {
        id: gerarId("pln"),
        dia_iso: fatos.dia_planejado.iso,
        rotulo: fatos.dia_planejado.rotulo,
        alvo,
        modo,
        areas: foco,
        pedido,
        origem,
        visto: origem !== "voz",
        gerado_em: new Date().toISOString(),
        plano,
        texto: plano ? "" : texto
    };

    salvarPlanos([registro, ...getPlanos()]);
    planoSelecionado = registro.id;
    return registro;
}


/* =========================================================
   TELA
   ========================================================= */

function lerControles() {
    const alvo = document.querySelector('[data-plano-alvo].active')?.dataset.planoAlvo || "amanha";
    const modo = document.querySelector('[data-plano-modo].active')?.dataset.planoModo || "completo";
    const foco = [...document.querySelectorAll('input[name="planoFoco"]:checked')].map(c => c.value);
    const pedido = $p("planoObs")?.value.trim() || "";
    return { alvo, modo, foco, pedido };
}

function htmlLista(itens, vazioTexto) {
    return itens.length
        ? `<ul class="plano-lista">${itens.map(i => `<li>${i}</li>`).join("")}</ul>`
        : `<p class="te-dica">${vazioTexto}</p>`;
}

function renderizarFatos() {
    const alvoEl = $p("planoFatos");
    if (!alvoEl) return;

    const { alvo } = lerControles();
    const f = montarFatos(alvo);
    const ref = f.dia_anterior;
    const rotinaRef = ref.rotina;

    const titulo = $p("planoTituloDia");
    if (titulo) titulo.textContent = f.dia_planejado.rotulo;

    const faltaEstudo = f.estudo.materias.filter(m => m.falta_na_semana_min > 0);

    alvoEl.innerHTML = `
        <article class="card te-bloco">
            <span class="card-label">O QUE FICOU · ${esc(ref.rotulo.toUpperCase())}</span>
            <div class="plano-numeros">
                <div><strong>${rotinaRef ? `${rotinaRef.feitas}/${rotinaRef.total}` : "—"}</strong><small>rotina feita</small></div>
                <div><strong>${f.pendencias_sem_data_em_aberto.length}</strong><small>pendências abertas</small></div>
                <div><strong>${f.compromissos_atrasados.length}</strong><small>atrasados</small></div>
            </div>
            ${rotinaRef && rotinaRef.nao_feitas.length ? `
                <h4>Rotina não feita</h4>
                ${htmlLista(rotinaRef.nao_feitas.slice(0, 8).map(esc), "")}` : ""}
            ${!rotinaRef ? `<p class="te-dica">Sem registro da rotina desse dia (o histórico começa a partir de quando o site passou a gravá-lo).</p>` : ""}
            <h4>Treino e estudo</h4>
            ${htmlLista([
                ref.treino_planejado.length
                    ? (ref.treino_feito.length ? `Treino feito: ${esc(ref.treino_feito.join(", "))}` : `Treino planejado não registrado: ${esc(ref.treino_planejado.join(", "))}`)
                    : (ref.treino_feito.length ? `Treino extra: ${esc(ref.treino_feito.join(", "))}` : "Sem treino planejado"),
                `Estudo: ${ref.estudo_min ? `${ref.estudo_min} min` : "nada registrado"}`
            ], "")}
        </article>

        <article class="card te-bloco">
            <span class="card-label">O DIA PLANEJADO · ${esc(f.dia_planejado.rotulo.toUpperCase())}</span>
            <div class="plano-numeros">
                <div><strong>${f.rotina_fixa_do_dia.length}</strong><small>tarefas fixas</small></div>
                <div><strong>${f.treino_planejado_no_dia.length}</strong><small>treino</small></div>
                <div><strong>${f.provas_e_datas_proximas.length}</strong><small>provas próximas</small></div>
            </div>
            ${f.rotina_fixa_do_dia.length ? `<p class="te-dica">Rotina das ${esc(f.rotina_fixa_do_dia[0].horario)} às ${esc(f.rotina_fixa_do_dia[f.rotina_fixa_do_dia.length - 1].horario)}.</p>` : ""}
            ${f.compromissos_do_dia.length ? `<h4>Compromissos</h4>${htmlLista(f.compromissos_do_dia.map(c => esc(c.titulo)), "")}` : ""}
            ${f.treino_planejado_no_dia.length ? `<h4>Treino</h4>${htmlLista(f.treino_planejado_no_dia.map(t => `${esc(t.tipo)}${t.horario ? ` às ${esc(t.horario)}` : ""} · ${t.duracao_min} min`), "")}` : ""}
            ${f.estudo.estudo_planejado_no_dia.length ? `<h4>Estudo no plano</h4>${htmlLista(f.estudo.estudo_planejado_no_dia.map(e => `${esc(e.materia || "Matéria")}${e.horario ? ` às ${esc(e.horario)}` : ""} · ${e.duracao_min} min`), "")}` : ""}
            ${faltaEstudo.length ? `<h4>Falta de estudo na semana</h4>${htmlLista(faltaEstudo.map(m => `${esc(m.materia)}: ${m.falta_na_semana_min} min`), "")}` : ""}
            ${f.provas_e_datas_proximas.length ? `<h4>Provas</h4>${htmlLista(f.provas_e_datas_proximas.map(p => `${esc(p.titulo)} · ${esc(p.data)} (${p.dias_a_partir_do_dia_planejado === 0 ? "no dia" : `em ${p.dias_a_partir_do_dia_planejado} dias`})`), "")}` : ""}
            ${f.trabalhos_em_aberto.length ? `<h4>Trabalhos em aberto</h4>${htmlLista(f.trabalhos_em_aberto.slice(0, 5).map(t => `${esc(t.titulo)}${t.entrega ? ` · entrega ${esc(t.entrega)}` : ""} (${esc(t.status)})`), "")}` : ""}
            <h4>Horários livres (aproximados)</h4>
            ${htmlLista(f.horarios_livres_aproximados.map(j => `${j.de} – ${j.ate}`), "Dia cheio: sem janelas livres de 40 minutos ou mais.")}
        </article>`;
}

const ROTULO_TIPO = { trabalho: "Trabalho", treino: "Treino", estudo: "Estudo", pendencia: "Pendência", pausa: "Pausa", outro: "Outro" };

function htmlPlano(registro) {
    const p = registro.plano;
    const quando = new Date(registro.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const cabecalho = `
        <div class="card-header">
            <div>
                <span class="card-label">${esc(rotuloAreas(registro.areas).toUpperCase())} · ${registro.modo === "estrategico" ? "ESTRATÉGICO" : "COMPLETO"} · GERADO ${esc(quando)}${registro.origem === "voz" ? " · 🎙 PELA VOZ" : ""}</span>
                <h3>Plano para ${esc(registro.rotulo)}</h3>
            </div>
            ${p ? `
            <div class="manage-actions">
                <button class="complete-button" type="button" id="planoOuvir">▶ Ouvir</button>
                <button class="edit-button" type="button" id="planoCopiar">Copiar</button>
            </div>` : ""}
        </div>
        ${registro.pedido ? `<div class="plano-pedido"><span class="card-label">SEU PEDIDO</span><p>${esc(registro.pedido)}</p></div>` : ""}`;

    if (!p) {
        return `<article class="card te-bloco">${cabecalho}<p class="plano-texto">${esc(registro.texto || "")}</p></article>`;
    }

    return `
        <article class="card te-bloco plano-card">
            ${cabecalho}
            ${p.resumo ? `<p class="plano-resumo">${esc(p.resumo)}</p>` : ""}
            ${p.fechamento_dia_anterior ? `<p class="plano-fechamento">${esc(p.fechamento_dia_anterior)}</p>` : ""}

            ${(p.mudancas || []).filter(Boolean).length ? `
                <h4>O que mudou para atender seu pedido</h4>
                <div class="plano-mudancas">${p.mudancas.filter(Boolean).map(m => `<p>${esc(m)}</p>`).join("")}</div>` : ""}

            ${(p.prioridades || []).length ? `
                <h4>Prioridades</h4>
                <ol class="plano-prioridades">
                    ${p.prioridades.map(x => `<li><strong>${esc(x.titulo)}</strong>${x.motivo ? `<span>${esc(x.motivo)}</span>` : ""}</li>`).join("")}
                </ol>` : ""}

            ${(p.agenda || []).length ? `
                <h4>Agenda</h4>
                <div class="plano-agenda">
                    ${p.agenda.map(a => `
                        <div class="plano-item tipo-${esc(String(a.tipo || "outro").toLowerCase())}">
                            <time>${esc(a.horario || "")}</time>
                            <div>
                                <strong>${esc(a.atividade || "")}</strong>
                                ${a.observacao ? `<small>${esc(a.observacao)}</small>` : ""}
                            </div>
                            <span class="tag">${esc(ROTULO_TIPO[String(a.tipo || "").toLowerCase()] || a.tipo || "")}</span>
                        </div>`).join("")}
                </div>` : ""}

            ${(p.encaixes || []).length ? `
                <h4>Onde encaixar o que ficou</h4>
                ${htmlLista(p.encaixes.map(e => `<strong>${esc(e.item)}</strong> → ${esc(e.quando)}`), "")}` : ""}

            ${(p.alertas || []).length ? `
                <h4>Atenção</h4>
                <div class="plano-alertas">${p.alertas.map(a => `<p>${esc(a)}</p>`).join("")}</div>` : ""}

            ${p.dica ? `<p class="plano-dica">${esc(p.dica)}</p>` : ""}
        </article>`;
}

function textoParaCopiar(registro) {
    const p = registro.plano || {};
    return [
        `Plano para ${registro.rotulo} (${rotuloAreas(registro.areas)})`,
        registro.pedido ? `Pedido: ${registro.pedido}` : "",
        p.fechamento_dia_anterior || "",
        p.resumo || "",
        ...((p.mudancas || []).filter(Boolean).length ? ["", "O que mudou:", ...p.mudancas.filter(Boolean).map(m => `- ${m}`)] : []),
        "",
        "Prioridades:",
        ...(p.prioridades || []).map((x, i) => `${i + 1}. ${x.titulo}${x.motivo ? ` — ${x.motivo}` : ""}`),
        "",
        "Agenda:",
        ...(p.agenda || []).map(a => `${a.horario} ${a.atividade}${a.observacao ? ` (${a.observacao})` : ""}`),
        ...((p.encaixes || []).length ? ["", "Encaixes:", ...p.encaixes.map(e => `- ${e.item}: ${e.quando}`)] : []),
        ...((p.alertas || []).length ? ["", "Atenção:", ...p.alertas.map(a => `- ${a}`)] : [])
    ].filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

function htmlListaPlanos(planos, selecionadoId) {
    if (!planos.length) return "";
    return `
        <article class="card te-bloco">
            <div class="card-header">
                <div><span class="card-label">HISTÓRICO</span><h3>Planos pedidos</h3></div>
                <span class="count-badge">${planos.length}</span>
            </div>
            <div class="planos-lista">
                ${planos.map(r => `
                    <div class="plano-linha ${r.id === selecionadoId ? "ativo" : ""}">
                        <button class="plano-linha-abrir" type="button" data-action="plano-ver" data-id="${esc(r.id)}">
                            <strong>${esc(r.rotulo)} · ${esc(rotuloAreas(r.areas))}${r.origem === "voz" ? " 🎙" : ""}${!r.visto ? ' <span class="plano-novo">novo</span>' : ""}</strong>
                            <small>${r.pedido ? esc(r.pedido.length > 90 ? r.pedido.slice(0, 90) + "…" : r.pedido) : "Sem pedido especial"} · ${new Date(r.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
                        </button>
                        <button class="te-x" type="button" data-action="plano-excluir" data-id="${esc(r.id)}" aria-label="Excluir plano">×</button>
                    </div>`).join("")}
            </div>
        </article>`;
}

// Aviso de plano novo (pedido por voz) no menu
function atualizarAvisoMenu() {
    const novos = getPlanos().filter(p => !p.visto).length;
    const item = document.querySelector('.nav-item[data-view="planejamento"]');
    if (!item) return;
    item.classList.toggle("tem-novo", novos > 0);
    item.dataset.novos = novos ? String(novos) : "";
}

function renderizarPlanos() {
    const alvoEl = $p("planoResultado");
    if (!alvoEl) return;

    const { alvo } = lerControles();
    const planos = getPlanos();
    let registro = planos.find(p => p.id === planoSelecionado) || planoMaisRecente(isoDoAlvo(alvo));

    // Abriu a aba e o plano está na tela: deixa de ser "novo"
    const abaAberta = $p("view-planejamento")?.classList.contains("active-view");
    if (abaAberta && registro && !registro.visto) {
        const lista = getPlanos().map(p => p.id === registro.id ? { ...p, visto: true } : p);
        salvarPlanos(lista);
        registro = { ...registro, visto: true };
    }

    alvoEl.innerHTML = `
        ${registro ? htmlPlano(registro) : `
            <article class="card te-bloco plano-vazio">
                <span class="card-label">PLANO DO GIDEON</span>
                <h3>Nenhum plano para este dia ainda</h3>
                <p class="te-dica">Escolha o que planejar, escreva seus pedidos especiais e clique em “Gerar plano”. Ou peça por voz: “Gideon, planeja meu dia de amanhã; preciso terminar o relatório até as 11h”.</p>
            </article>`}
        ${htmlListaPlanos(getPlanos(), registro?.id)}`;

    atualizarAvisoMenu();

    if (!registro?.plano) return;

    $p("planoOuvir")?.addEventListener("click", () => {
        const p = registro.plano;
        const fala = [p.fechamento_dia_anterior, p.resumo,
            (p.mudancas || []).filter(Boolean).length ? `Mudanças: ${p.mudancas.filter(Boolean).join("; ")}.` : "",
            (p.prioridades || []).length ? `Prioridades: ${p.prioridades.map(x => x.titulo).join("; ")}.` : ""
        ].filter(Boolean).join(" ");
        window.gideon?.falar(fala);
    });

    $p("planoCopiar")?.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(textoParaCopiar(registro));
            $p("planoCopiar").textContent = "Copiado ✓";
        } catch (e) {
            alert("Não consegui copiar automaticamente.");
        }
    });
}

function renderizarPlanejamento() {
    atualizarAvisoMenu();
    if (!$p("view-planejamento")) return;
    renderizarFatos();
    renderizarPlanos();
}

async function gerarPlano() {
    const botao = $p("planoGerar");
    const erro = $p("planoErro");
    const { alvo, modo, foco, pedido } = lerControles();

    botao.disabled = true;
    botao.textContent = "Gideon está pensando…";
    erro.textContent = "";

    try {
        await gerarPlanoCore({ alvo, modo, areas: foco, pedido, origem: "tela" });
        $p("planoObs").value = "";
        renderizarPlanos();
        $p("planoResultado")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
        erro.textContent = e.message;
    }

    botao.disabled = false;
    botao.textContent = "Gerar plano";
}

function configurarControles() {
    document.querySelectorAll("[data-plano-alvo], [data-plano-modo]").forEach(botao => {
        botao.addEventListener("click", () => {
            const ehAlvo = botao.dataset.planoAlvo !== undefined;
            const grupo = ehAlvo ? "[data-plano-alvo]" : "[data-plano-modo]";
            document.querySelectorAll(grupo).forEach(b => b.classList.toggle("active", b === botao));
            if (ehAlvo) planoSelecionado = null;
            renderizarPlanejamento();
        });
    });

    document.querySelectorAll('input[name="planoFoco"]').forEach(c => c.addEventListener("change", renderizarFatos));
    $p("planoGerar")?.addEventListener("click", gerarPlano);
}


/* =========================================================
   LIGAÇÕES
   ========================================================= */

views.planejamento = "view-planejamento";

Object.assign(acoes, {
    "plano-ver": id => { planoSelecionado = id; },
    "plano-excluir": id => {
        if (!confirm("Excluir este plano?")) return;
        salvarPlanos(getPlanos().filter(p => p.id !== id));
        if (planoSelecionado === id) planoSelecionado = null;
    }
});

window.renderizadoresExtras = window.renderizadoresExtras || [];
window.renderizadoresExtras.push(renderizarPlanejamento);

// Usado pelo Gideon
window.planejamento = {
    fatos: montarFatos,
    planoSalvo(alvo = "amanha") {
        return planoMaisRecente(isoDoAlvo(alvo));
    },
    // Pedido por voz: gera e deixa marcado como "novo" na aba Planejamento
    async gerar({ alvo = "amanha", areas = TODAS_AREAS, pedido = "", modo = "completo" } = {}) {
        const registro = await gerarPlanoCore({ alvo, areas, pedido, modo, origem: "voz" });
        renderizarPlanejamento();
        return registro;
    }
};

document.addEventListener("DOMContentLoaded", configurarControles);

})();
