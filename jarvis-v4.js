/* =========================================================
   JARVIS — ASSISTENTE DE VOZ DO PERSONAL OS
   Carregue este arquivo DEPOIS do script.js:
   ele usa as funções de lá (getRecorrentes, switchView...).
   ========================================================= */

(() => {

/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */

const VERSAO_JARVIS = "v5";
const NOME_ASSISTENTE = "Gideon";

// Nome de quem está usando (vem do perfil da conta)
const nomePessoa = () => String(window.perfilAtual?.nome || "").trim();
const comNome = (antes, depois = "") => nomePessoa() ? `${antes}${nomePessoa()}${depois}` : "";
window.JARVIS_VERSAO = VERSAO_JARVIS;
// =========================================================
// CHAVE FIXA DO GEMINI (usada por todos os usuários)
// Cole sua chave entre as aspas. Com ela preenchida, a opção
// "Gemini (incluso, sem chave)" fala direto com o Gemini.
// Deixe vazio ("") para usar o servidor do Supabase (gideon-ia).
// =========================================================
const CHAVE_GEMINI_FIXA = "AQ.Ab8RN6LFihUyXK2vL7cyRv6-28YXEhJw3h7GHSDi4NzE5w1FBQ";

const CHAVE_CONFIG = "personalOS_jarvis";
const CHAVE_AVISOS = "personalOS_jarvisAvisos";
const CHAVE_USO = "personalOS_jarvisUso";

const PROVEDORES = {
    servidor:  { nome: "Gemini (incluso, sem chave)", modeloPadrao: "gemini-3.1-flash-lite" },
    gemini:    { nome: "Gemini (Google)",    modeloPadrao: "gemini-3.1-flash-lite" },
    openai:    { nome: "ChatGPT (OpenAI)",   modeloPadrao: "gpt-5.4-mini" },
    anthropic: { nome: "Claude (Anthropic)", modeloPadrao: "claude-haiku-4-5-20251001" }
};

const CONFIG_PADRAO = {
    provedor: "servidor",
    chaves: { servidor: "", gemini: "", openai: "", anthropic: "" },
    modelos: {
        servidor: PROVEDORES.servidor.modeloPadrao,
        gemini: PROVEDORES.gemini.modeloPadrao,
        openai: PROVEDORES.openai.modeloPadrao,
        anthropic: PROVEDORES.anthropic.modeloPadrao
    },
    voz: "",
    velocidade: 1.05,
    continuo: true,
    avisos: true
};

const PADRAO_NOME_MODELO = {
    servidor: /^gemini/i,
    gemini: /^gemini/i,
    openai: /^(gpt|o\d|chatgpt)/i,
    anthropic: /^claude/i
};

const precisaDeChave = config => config.provedor !== "servidor" && !config.chaves[config.provedor];

function getConfig() {
    const salvo = ler(CHAVE_CONFIG, {}) || {};
    const config = {
        ...CONFIG_PADRAO,
        ...salvo,
        chaves: { ...CONFIG_PADRAO.chaves, ...(salvo.chaves || {}) },
        modelos: { ...CONFIG_PADRAO.modelos, ...(salvo.modelos || {}) }
    };

    if (!PROVEDORES[config.provedor]) config.provedor = "servidor";

    Object.keys(PROVEDORES).forEach(id => {
        if (!PADRAO_NOME_MODELO[id].test(config.modelos[id] || "")) {
            config.modelos[id] = PROVEDORES[id].modeloPadrao;
        }
    });

    return config;
}

function salvarConfig(config) {
    gravar(CHAVE_CONFIG, config);
}


/* =========================================================
   ESTADO
   ========================================================= */

let estado = "parado";          // parado | ouvindo | pensando | falando
let historico = [];             // [{ role: "user" | "assistant", texto }]
let reconhecimento = null;
let ocupado = false;
let falaInterrompida = false;
let vozes = [];

const el = id => document.getElementById(id);

function setEstado(novo) {
    estado = novo;
    document.body.dataset.jarvis = novo;

    const textos = {
        parado: "Pronto",
        ouvindo: "Ouvindo…",
        pensando: "Pensando…",
        falando: "Falando…"
    };
    const status = el("jarvisStatus");
    if (status) status.textContent = textos[novo] || "";

    const mic = el("jarvisMic");
    if (mic) mic.setAttribute("aria-label", novo === "ouvindo" ? "Parar de ouvir" : "Falar com o Jarvis");
}

function painelAberto() {
    const painel = el("jarvisPanel");
    return painel && !painel.hidden;
}


/* =========================================================
   O QUE O JARVIS "ENXERGA" DO SEU SITE
   ========================================================= */

function montarContexto() {
    const hora = horaAtual();
    const feitas = getRotinaFeita().ids;
    const tarefasHoje = obterTarefasDeHoje();
    const proxima = obterProximaTarefa(tarefasHoje, feitas);

    return {
        agora: {
            dia_da_semana: obterDiaDaSemana(),
            data: formatarData(hojeISO()),
            data_iso: hojeISO(),
            hora
        },
        proxima_tarefa: proxima
            ? { id: proxima.id, horario: proxima.horario, atividade: proxima.atividade, empresa: proxima.empresa }
            : null,
        rotina_de_hoje: tarefasHoje.map(t => ({
            id: t.id,
            horario: t.horario,
            atividade: t.atividade,
            empresa: t.empresa,
            status: feitas.includes(t.id) ? "concluída" : t.horario < hora ? "atrasada" : "pendente"
        })),
        todas_as_recorrentes: getRecorrentes().map(t => ({
            id: t.id, atividade: t.atividade, empresa: t.empresa, horario: t.horario, dias: t.dias.join(", ")
        })),
        compromissos_com_data: getDataUnica().map(d => ({
            id: d.id, descricao: d.descricao, data: formatarData(d.data), concluida: !!d.concluida,
            ...(d.obs ? { observacao: d.obs } : {})
        })),
        pendencias_sem_data: getPendencias().map(p => ({
            id: p.id, tipo: rotuloTipo(p), descricao: p.descricao, concluida: !!p.concluida,
            ...(p.obs ? { observacao: p.obs } : {})
        })),
        processos: getProcessos().map(p => ({
            id: p.id,
            nome: p.nome,
            etapas: p.etapas.map((e, i) =>
                `${i + 1}. ${e.titulo}${e.descricao ? " — " + e.descricao : ""}${e.mapeada ? "" : " (ainda não mapeada)"}`
            )
        })),
        ...contextoTreinoEstudo(),
        ...contextoPlanejamento()
    };
}

// Resumo do dia seguinte (fatos do planejamento.js + plano salvo, se houver)
function contextoPlanejamento() {
    if (!window.planejamento) return {};
    const f = window.planejamento.fatos("amanha");
    const salvo = window.planejamento.planoSalvo("amanha");

    return {
        amanha: {
            dia: f.dia_planejado.rotulo,
            rotina_fixa: f.rotina_fixa_do_dia.length
                ? `${f.rotina_fixa_do_dia.length} tarefas, das ${f.rotina_fixa_do_dia[0].horario} às ${f.rotina_fixa_do_dia[f.rotina_fixa_do_dia.length - 1].horario}`
                : "sem rotina fixa",
            compromissos: f.compromissos_do_dia.map(c => c.titulo),
            treino: f.treino_planejado_no_dia,
            estudo_que_falta_na_semana: (f.estudo?.materias || []).filter(m => m.falta_na_semana_min > 0)
                .map(m => `${m.materia}: ${m.falta_na_semana_min} min`),
            provas_proximas: f.provas_e_datas_proximas.slice(0, 4),
            trabalhos_em_aberto: (f.trabalhos_em_aberto || []).slice(0, 4),
            estudo_planejado: f.estudo?.estudo_planejado_no_dia || [],
            horarios_livres: f.horarios_livres_aproximados.map(j => `${j.de}-${j.ate}`),
            ficou_de_hoje: {
                rotina_nao_feita: f.dia_anterior.rotina?.nao_feitas || [],
                compromissos_atrasados: f.compromissos_atrasados.map(c => c.titulo),
                pendencias_abertas: f.pendencias_sem_data_em_aberto.length
            },
            plano_gerado: salvo?.plano
                ? { resumo: salvo.plano.resumo, prioridades: (salvo.plano.prioridades || []).map(p => p.titulo) }
                : null
        }
    };
}

function contextoTreinoEstudo() {
    if (!window.resumoTreino || !window.resumoEstudo) return {};

    const t = window.resumoTreino();
    const { plano, sessoes } = window.getTreinos();
    const e = window.resumoEstudo();
    const { materias } = window.getEstudos();

    return {
        treino: {
            plano_de_hoje: t.planoHoje.map(p => ({ id: p.id, tipo: p.tipo, horario: p.horario || null, duracao_min: p.duracao, feito_hoje: p.feito })),
            plano_semanal: plano.map(p => ({ id: p.id, tipo: p.tipo, dias: (p.dias || []).join(", "), horario: p.horario || null, duracao_min: p.duracao })),
            semana_atual: { treinos_feitos: t.feitosSemana, treinos_planejados: t.planejadosSemana, minutos: t.minutosSemana },
            ultimos_treinos: [...sessoes].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6)
                .map(s => ({ data: formatarData(s.data), tipo: s.tipo, duracao_min: s.duracao }))
        },
        estudo: (() => {
            const { notas = [] } = window.getEstudos();
            const nomeDe = id => materias.find(m => m.id === id)?.nome || null;
            return {
                semana_atual: { minutos_estudados: e.minutosSemana, meta_minutos: e.metaSemana, estudado_hoje_min: e.minutosHoje },
                sequencia_de_dias_estudando: e.sequencia,
                cronometro_ligado: e.cronometro ? { materia: nomeDe(e.cronometro.materiaId), desde: e.cronometro.inicio } : null,
                plano_de_hoje: e.planoHoje.map(p => ({ materia_id: p.materiaId, materia: nomeDe(p.materiaId), horario: p.horario || null, duracao_min: p.duracao, feito: p.feito })),
                materias: e.porMateria.map(m => ({
                    id: m.id,
                    nome: m.nome,
                    meta_semanal_min: m.metaSemanalMin || 0,
                    estudado_na_semana_min: m.minutosSemana,
                    topicos_abertos: m.topicos.filter(tp => !tp.concluido).map(tp => ({ id: tp.id, titulo: tp.titulo })),
                    topicos_concluidos: m.topicosFeitos
                })),
                provas: e.provasAbertas.slice(0, 8).map(p => ({
                    id: p.id, titulo: p.titulo, materia: nomeDe(p.materiaId), data: formatarData(p.data),
                    horario: p.horario || null, dias_restantes: diferencaDias(p.data), o_que_cai: p.conteudo || null
                })),
                trabalhos: e.trabalhosAbertos.slice(0, 8).map(t => ({
                    id: t.id, titulo: t.titulo, materia: nomeDe(t.materiaId), entrega: t.entrega ? formatarData(t.entrega) : null,
                    dias_restantes: t.entrega ? diferencaDias(t.entrega) : null,
                    status: { a_fazer: "a fazer", andamento: "em andamento" }[t.status] || t.status,
                    etapas_abertas: (t.etapas || []).filter(x => !x.feita).map(x => x.titulo)
                })),
                anotacoes_recentes: notas.slice(0, 6).map(n => ({ titulo: n.titulo || null, materia: nomeDe(n.materiaId), texto: String(n.texto).slice(0, 240) }))
            };
        })()
    };
}

function montarSistema() {
    const nome = nomePessoa();
    const pedidos = minusculaInicial(rotuloPedidos());
    const tratamento = nome
        ? `Chame a pessoa de ${nome}.`
        : "Você ainda não sabe o nome da pessoa; trate-a com cordialidade, sem inventar um nome.";

    return `Você é o ${NOME_ASSISTENTE}, o assistente pessoal de voz${nome ? ` de ${nome}` : ""} dentro do sistema de tarefas pessoal dessa pessoa.

Personalidade: inspirado em assistentes como o Jarvis do Homem de Ferro. Educado, calmo, eficiente e com um toque leve de humor seco. ${tratamento}

Regras:
- Você só trata do que existe no sistema: rotina do dia, tarefas recorrentes, compromissos com data, pendências sem data, ${pedidos}, processos mapeados, treino (plano semanal e treinos feitos) e estudo (matérias, metas semanais, plano de estudo, cronômetro, tópicos, caderno de anotações, provas e trabalhos). Se a pessoa pedir algo fora disso, diga com elegância que seu escopo é o sistema dela e sugira algo que você pode fazer.
- Use apenas os DADOS ATUAIS abaixo. Nunca invente tarefa, horário, data, empresa ou etapa.
- Para mudar qualquer coisa, chame uma ferramenta. Só diga que fez algo depois de a ferramenta responder com "ok". Se ela responder com "erro", explique o problema.
- Se o pedido for ambíguo (por exemplo, existem várias tarefas com o mesmo nome), escolha a mais próxima do horário atual quando for óbvio; se não for, pergunte qual.
- Você não pode excluir nada. Se a pessoa pedir exclusão, diga que isso é feito na tela Banco de Tarefas e ofereça abrir a tela.
- Datas relativas ("amanhã", "sexta que vem") devem ser calculadas a partir de agora.data_iso e enviadas às ferramentas no formato AAAA-MM-DD.
- Suas respostas serão FALADAS em voz alta: português do Brasil, frases curtas e naturais, sem markdown, sem asteriscos, sem listas com símbolos, sem emojis. Escreva horários como "9h10" e datas como "5 de outubro".
- Seja breve: no máximo três frases, a não ser que a pessoa peça algo longo, como o resumo do dia ou a leitura de um processo inteiro.
- Quando falar de estudo, compare o tempo da semana com a meta e lembre provas e entregas de trabalho próximas. Provas e trabalhos são coisas separadas. Quando falar de treino, diga se o treino de hoje já foi feito.
- Pergunta simples sobre amanhã ("como fica meu dia amanhã?"): responda com o bloco "amanha" (o que ficou de hoje, rotina, compromissos, treino, estudo que falta, provas). Se já existir plano_gerado, siga ele.
- Pedido para PLANEJAR ("planeja meu dia de amanhã", "monta um plano só de treino", "não vou terminar X hoje, encaixa amanhã às 15h"): chame gerar_planejamento. Escolha as áreas pelo que a pessoa disse (geral/tudo = as três) e coloque em "pedido" TODOS os pedidos especiais com as palavras dela. Depois responda em uma ou duas frases com o principal do plano e diga que ele está na aba Planejamento. Se ela quiser ver, use abrir_tela com "planejamento".
- No resumo do dia, diga: a próxima tarefa, quantas estão atrasadas, compromissos de hoje e dos próximos dias, pendências e ${pedidos} em aberto.

DADOS ATUAIS:
${JSON.stringify(montarContexto())}`;
}


/* =========================================================
   AÇÕES PERMITIDAS (a IA só consegue agir por aqui)
   ========================================================= */

const DIAS_ENUM = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const FERRAMENTAS = [
    {
        nome: "concluir_tarefa_rotina",
        descricao: "Marca (ou desmarca) como feita hoje uma tarefa da rotina de hoje.",
        parametros: {
            type: "object",
            properties: {
                id: { type: "string", description: "id da tarefa em rotina_de_hoje" },
                concluida: { type: "boolean", description: "true marca como feita; false desmarca" }
            },
            required: ["id", "concluida"]
        }
    },
    {
        nome: "definir_status_pendencia",
        descricao: "Conclui ou reabre uma pendência sem data (inclui os pedidos do gestor).",
        parametros: {
            type: "object",
            properties: {
                id: { type: "string", description: "id em pendencias_sem_data" },
                concluida: { type: "boolean" }
            },
            required: ["id", "concluida"]
        }
    },
    {
        nome: "definir_status_compromisso",
        descricao: "Conclui ou reabre um compromisso com data.",
        parametros: {
            type: "object",
            properties: {
                id: { type: "string", description: "id em compromissos_com_data" },
                concluida: { type: "boolean" }
            },
            required: ["id", "concluida"]
        }
    },
    {
        nome: "adicionar_pendencia",
        get descricao() {
            return `Cria uma pendência sem data. Use pedido_do_gestor=true quando for um ${minusculaInicial(rotuloPedido())}.`;
        },
        parametros: {
            type: "object",
            properties: {
                descricao: { type: "string" },
                pedido_do_gestor: { type: "boolean" },
                observacao: { type: "string" }
            },
            required: ["descricao", "pedido_do_gestor"]
        }
    },
    {
        nome: "adicionar_compromisso",
        descricao: "Cria um compromisso com data única.",
        parametros: {
            type: "object",
            properties: {
                descricao: { type: "string" },
                data: { type: "string", description: "AAAA-MM-DD" },
                observacao: { type: "string" }
            },
            required: ["descricao", "data"]
        }
    },
    {
        nome: "reagendar_compromisso",
        descricao: "Muda a data de um compromisso existente.",
        parametros: {
            type: "object",
            properties: {
                id: { type: "string" },
                nova_data: { type: "string", description: "AAAA-MM-DD" }
            },
            required: ["id", "nova_data"]
        }
    },
    {
        nome: "adicionar_tarefa_recorrente",
        descricao: "Cria uma tarefa recorrente na rotina semanal.",
        parametros: {
            type: "object",
            properties: {
                atividade: { type: "string" },
                empresa: { type: "string", description: "Use Geral se ela não disser" },
                horario: { type: "string", description: "HH:MM" },
                dias: { type: "array", items: { type: "string", enum: DIAS_ENUM } }
            },
            required: ["atividade", "empresa", "horario", "dias"]
        }
    },
    {
        nome: "marcar_etapa_processo",
        descricao: "Marca ou desmarca uma etapa de um processo como mapeada.",
        parametros: {
            type: "object",
            properties: {
                processo_id: { type: "string" },
                numero_etapa: { type: "integer", description: "Número da etapa, começando em 1" },
                mapeada: { type: "boolean" }
            },
            required: ["processo_id", "numero_etapa", "mapeada"]
        }
    },
    {
        nome: "abrir_tela",
        descricao: "Mostra uma tela do sistema. A tela 'rodrigo' é a de pedidos do gestor.",
        parametros: {
            type: "object",
            properties: {
                tela: { type: "string", enum: ["painel", "demandas", "rodrigo", "treino", "estudo", "planejamento", "processos", "cadastro", "banco"] }
            },
            required: ["tela"]
        }
    },
    {
        nome: "registrar_treino",
        descricao: "Registra um treino feito. Se for o treino do plano de hoje, envie plano_id.",
        parametros: {
            type: "object",
            properties: {
                tipo: { type: "string", description: "Ex.: Musculação, Corrida" },
                duracao_min: { type: "integer" },
                data: { type: "string", description: "AAAA-MM-DD; padrão hoje" },
                plano_id: { type: "string", description: "id em treino.plano_de_hoje, se for o treino planejado" },
                observacao: { type: "string" }
            },
            required: ["tipo", "duracao_min"]
        }
    },
    {
        nome: "registrar_estudo",
        descricao: "Registra tempo de estudo em uma matéria.",
        parametros: {
            type: "object",
            properties: {
                materia_id: { type: "string", description: "id em estudo.materias" },
                duracao_min: { type: "integer" },
                data: { type: "string", description: "AAAA-MM-DD; padrão hoje" },
                observacao: { type: "string", description: "O que foi estudado" }
            },
            required: ["materia_id", "duracao_min"]
        }
    },
    {
        nome: "concluir_topico",
        descricao: "Marca um tópico de estudo como concluído.",
        parametros: {
            type: "object",
            properties: {
                materia_id: { type: "string" },
                topico_id: { type: "string" }
            },
            required: ["materia_id", "topico_id"]
        }
    },
    {
        nome: "adicionar_anotacao_estudo",
        descricao: "Guarda uma anotação no caderno de estudo (com ou sem matéria).",
        parametros: {
            type: "object",
            properties: {
                texto: { type: "string" },
                titulo: { type: "string" },
                materia_id: { type: "string", description: "id em estudo.materias; vazio para anotação geral" }
            },
            required: ["texto"]
        }
    },
    {
        nome: "adicionar_prova",
        descricao: "Cadastra uma prova com data (e, se disser, horário e o que cai).",
        parametros: {
            type: "object",
            properties: {
                titulo: { type: "string" },
                materia_id: { type: "string" },
                data: { type: "string", description: "AAAA-MM-DD" },
                horario: { type: "string", description: "HH:MM" },
                conteudo: { type: "string", description: "O que cai na prova" }
            },
            required: ["titulo", "data"]
        }
    },
    {
        nome: "adicionar_trabalho",
        descricao: "Cadastra um trabalho, entrega ou apresentação com data de entrega.",
        parametros: {
            type: "object",
            properties: {
                titulo: { type: "string" },
                materia_id: { type: "string" },
                entrega: { type: "string", description: "AAAA-MM-DD" },
                descricao: { type: "string" }
            },
            required: ["titulo"]
        }
    },
    {
        nome: "atualizar_trabalho",
        descricao: "Muda o status de um trabalho: a_fazer, andamento ou entregue.",
        parametros: {
            type: "object",
            properties: {
                trabalho_id: { type: "string", description: "id em estudo.trabalhos" },
                status: { type: "string", enum: ["a_fazer", "andamento", "entregue"] }
            },
            required: ["trabalho_id", "status"]
        }
    },
    {
        nome: "gerar_planejamento",
        descricao: "Cria um plano personalizado (aparece na aba Planejamento). Use quando a pessoa pedir para planejar o dia, com ou sem pedidos especiais.",
        parametros: {
            type: "object",
            properties: {
                dia: { type: "string", enum: ["amanha", "hoje"], description: "padrão amanhã" },
                areas: {
                    type: "array",
                    items: { type: "string", enum: ["trabalho", "treino", "estudo"] },
                    description: "Tudo/geral = as três. 'Só treino' = ['treino']. Trabalho inclui tarefas gerais e pendências."
                },
                pedido: {
                    type: "string",
                    description: "Os pedidos especiais com as palavras da pessoa, completos: o que não pode passar do dia, horários desejados, o que pode ser tirado ou movido, o que ficou de ontem ou não vai dar para terminar hoje."
                },
                modo: { type: "string", enum: ["completo", "estrategico"], description: "completo inclui o fechamento do dia anterior" }
            },
            required: ["areas"]
        }
    },
    {
        nome: "cronometro_estudo",
        descricao: "Liga o cronômetro de estudo de uma matéria, ou para e registra o tempo.",
        parametros: {
            type: "object",
            properties: {
                acao: { type: "string", enum: ["iniciar", "parar"] },
                materia_id: { type: "string", description: "obrigatório para iniciar" }
            },
            required: ["acao"]
        }
    }
];

const ok = texto => `ok: ${texto}`;
const erro = texto => `erro: ${texto}`;

const executores = {
    concluir_tarefa_rotina({ id, concluida = true }) {
        const tarefa = getRecorrentes().find(t => t.id === id);
        if (!tarefa) return erro("tarefa não encontrada");
        if (!rodaHoje(tarefa)) return erro("essa tarefa não faz parte da rotina de hoje");

        const registro = getRotinaFeita();
        const jaFeita = registro.ids.includes(id);
        if (concluida && !jaFeita) registro.ids.push(id);
        if (!concluida && jaFeita) registro.ids.splice(registro.ids.indexOf(id), 1);
        gravar(STORAGE_KEYS.rotinaFeita, registro);

        return ok(`${tarefa.atividade} (${tarefa.empresa}, ${tarefa.horario}) ${concluida ? "marcada como feita" : "desmarcada"}`);
    },

    definir_status_pendencia({ id, concluida = true }) {
        const lista = getPendencias();
        const item = lista.find(p => p.id === id);
        if (!item) return erro("pendência não encontrada");
        item.concluida = !!concluida;
        salvarPendencias(lista);
        return ok(`"${item.descricao}" ${concluida ? "concluída" : "reaberta"}`);
    },

    definir_status_compromisso({ id, concluida = true }) {
        const lista = getDataUnica();
        const item = lista.find(d => d.id === id);
        if (!item) return erro("compromisso não encontrado");
        item.concluida = !!concluida;
        salvarDataUnica(lista);
        return ok(`"${item.descricao}" ${concluida ? "concluído" : "reaberto"}`);
    },

    adicionar_pendencia({ descricao, pedido_do_gestor = false, pedido_do_rodrigo = false, observacao }) {
        const doGestor = pedido_do_gestor || pedido_do_rodrigo;
        if (!descricao || !descricao.trim()) return erro("descrição vazia");
        const lista = getPendencias();
        lista.push({
            id: gerarId("pen"),
            tipo: doGestor ? "Gestor" : "Geral",
            descricao: descricao.trim(),
            concluida: false,
            ...(observacao ? { obs: observacao.trim() } : {})
        });
        salvarPendencias(lista);
        return ok(doGestor
            ? `${minusculaInicial(rotuloPedido())} "${descricao.trim()}" criado`
            : `pendência "${descricao.trim()}" criada`);
    },

    adicionar_compromisso({ descricao, data, observacao }) {
        const iso = paraISO(data);
        if (!descricao || !descricao.trim()) return erro("descrição vazia");
        if (!iso) return erro("data inválida, use AAAA-MM-DD");
        const lista = getDataUnica();
        lista.push({
            id: gerarId("dat"),
            descricao: descricao.trim(),
            data: iso,
            concluida: false,
            ...(observacao ? { obs: observacao.trim() } : {})
        });
        salvarDataUnica(lista);
        return ok(`compromisso "${descricao.trim()}" criado para ${formatarData(iso)}`);
    },

    reagendar_compromisso({ id, nova_data }) {
        const iso = paraISO(nova_data);
        if (!iso) return erro("data inválida, use AAAA-MM-DD");
        const lista = getDataUnica();
        const item = lista.find(d => d.id === id);
        if (!item) return erro("compromisso não encontrado");
        item.data = iso;
        salvarDataUnica(lista);
        return ok(`"${item.descricao}" remarcado para ${formatarData(iso)}`);
    },

    adicionar_tarefa_recorrente({ atividade, empresa, horario, dias }) {
        const h = normalizarHorario(horario);
        const d = normalizarDias(Array.isArray(dias) ? dias : []);
        if (!atividade || !atividade.trim()) return erro("atividade vazia");
        if (!h) return erro("horário inválido, use HH:MM");
        if (!d.length) return erro("informe pelo menos um dia");

        const lista = getRecorrentes();
        lista.push({ id: gerarId("rec"), empresa: (empresa || "Geral").trim(), atividade: atividade.trim(), dias: d, horario: h });
        salvarRecorrentes(lista);
        return ok(`recorrente "${atividade.trim()}" criada: ${resumirDias(d)} às ${h}`);
    },

    marcar_etapa_processo({ processo_id, numero_etapa, mapeada = true }) {
        const lista = getProcessos();
        const processo = lista.find(p => p.id === processo_id);
        if (!processo) return erro("processo não encontrado");
        const etapa = processo.etapas[Number(numero_etapa) - 1];
        if (!etapa) return erro(`o processo tem ${processo.etapas.length} etapas`);
        etapa.mapeada = !!mapeada;
        salvarProcessos(lista);
        return ok(`etapa ${numero_etapa} de "${processo.nome}" ${mapeada ? "marcada" : "desmarcada"} como mapeada`);
    },

    abrir_tela({ tela }) {
        const mapa = { painel: "day", demandas: "demands", rodrigo: "rodrigo", treino: "treino", estudo: "estudo", planejamento: "planejamento", processos: "processes", cadastro: "input", banco: "manage" };
        if (!mapa[tela]) return erro("tela desconhecida");
        switchView(mapa[tela]);
        return ok(`tela ${tela} aberta`);
    },

    registrar_treino({ tipo, duracao_min, data, plano_id, observacao }) {
        if (!window.treinoEstudo) return erro("módulo de treino não carregado");
        const iso = data ? paraISO(data) : hojeISO();
        if (!iso) return erro("data inválida, use AAAA-MM-DD");
        if (!tipo || !tipo.trim()) return erro("informe o tipo de treino");
        window.treinoEstudo.registrarTreinoDireto({ tipo: tipo.trim(), duracao: duracao_min, data: iso, obs: observacao, planoId: plano_id });
        return ok(`treino de ${tipo.trim()} (${duracao_min} min) registrado em ${formatarData(iso)}`);
    },

    registrar_estudo({ materia_id, duracao_min, data, observacao }) {
        if (!window.treinoEstudo) return erro("módulo de estudo não carregado");
        const iso = data ? paraISO(data) : hojeISO();
        if (!iso) return erro("data inválida, use AAAA-MM-DD");
        if (!window.treinoEstudo.registrarEstudoDireto({ materiaId: materia_id, duracao: duracao_min, data: iso, obs: observacao })) {
            return erro("matéria não encontrada");
        }
        return ok(`${duracao_min} min de estudo registrados em ${formatarData(iso)}`);
    },

    concluir_topico({ materia_id, topico_id }) {
        if (!window.treinoEstudo?.concluirTopicoDireto(materia_id, topico_id)) return erro("tópico não encontrado");
        return ok("tópico marcado como concluído");
    },

    adicionar_anotacao_estudo({ materia_id, texto, titulo }) {
        if (!texto || !texto.trim()) return erro("anotação vazia");
        if (!window.treinoEstudo?.adicionarAnotacaoDireto(materia_id || "", texto.trim(), (titulo || "").trim())) return erro("matéria não encontrada");
        return ok("anotação guardada no caderno");
    },

    adicionar_prova({ titulo, materia_id, data, horario, conteudo }) {
        const iso = paraISO(data);
        if (!iso) return erro("data inválida, use AAAA-MM-DD");
        if (!titulo || !titulo.trim()) return erro("informe o nome da prova");
        window.treinoEstudo?.adicionarProvaDireto({ titulo: titulo.trim(), materiaId: materia_id, data: iso, horario, conteudo });
        return ok(`prova "${titulo.trim()}" marcada para ${formatarData(iso)}`);
    },

    adicionar_trabalho({ titulo, materia_id, entrega, descricao }) {
        const iso = entrega ? paraISO(entrega) : "";
        if (entrega && !iso) return erro("data inválida, use AAAA-MM-DD");
        if (!titulo || !titulo.trim()) return erro("informe o nome do trabalho");
        window.treinoEstudo?.adicionarTrabalhoDireto({ titulo: titulo.trim(), materiaId: materia_id, entrega: iso, descricao });
        return ok(`trabalho "${titulo.trim()}" cadastrado${iso ? ` com entrega em ${formatarData(iso)}` : ""}`);
    },

    atualizar_trabalho({ trabalho_id, status }) {
        if (!window.treinoEstudo?.atualizarTrabalhoDireto(trabalho_id, status)) return erro("trabalho não encontrado");
        return ok(`trabalho marcado como ${{ a_fazer: "a fazer", andamento: "em andamento", entregue: "entregue" }[status]}`);
    },

    cronometro_estudo({ acao, materia_id }) {
        if (acao === "iniciar") {
            if (!window.treinoEstudo?.iniciarCronometroDireto(materia_id)) return erro("matéria não encontrada");
            return ok("cronômetro ligado");
        }
        const resultado = window.treinoEstudo?.pararCronometroDireto();
        if (!resultado) return erro("nenhum cronômetro ligado");
        return ok(`${resultado.minutos} min de ${resultado.materia} registrados`);
    },

    async gerar_planejamento({ dia = "amanha", areas = ["trabalho", "treino", "estudo"], pedido = "", modo = "completo" }) {
        if (!window.planejamento?.gerar) return erro("módulo de planejamento não carregado");
        adicionarMensagem("jarvis", "Montando seu plano, um instante…");
        const registro = await window.planejamento.gerar({ alvo: dia, areas, pedido, modo });
        const p = registro.plano;
        if (!p) return ok(`plano criado para ${registro.rotulo} na aba Planejamento`);
        return ok(`plano criado para ${registro.rotulo} na aba Planejamento. Resumo: ${p.resumo || ""} Mudanças: ${(p.mudancas || []).filter(Boolean).join("; ") || "nenhuma"}. Prioridades: ${(p.prioridades || []).map(x => x.titulo).join("; ")}`);
    }
};

async function executarFerramenta(nome, argumentos) {
    const fn = executores[nome];
    if (!fn) return erro("ação não permitida");

    let resultado;
    try {
        resultado = await fn(argumentos || {});
    } catch (e) {
        resultado = erro(e.message);
    }

    renderizarTudo();
    if (document.getElementById("view-processes")?.classList.contains("active-view")) {
        renderizarProcessos();
    }

    // Na conversa aparece só a parte curta (o resumo completo vai para a IA)
    if (resultado.startsWith("ok: ")) adicionarMensagem("acao", resultado.slice(4).split(". Resumo:")[0]);
    return resultado;
}


/* =========================================================
   CHAMADAS ÀS APIs
   ========================================================= */

/* ---------- Contador de uso (quantas chamadas à IA hoje) ---------- */

function getUso() {
    const uso = ler(CHAVE_USO, null);
    return uso && uso.data === hojeISO() ? uso : { data: hojeISO(), chamadas: 0, perguntas: 0 };
}

function registrarUso(campo) {
    const uso = getUso();
    uso[campo] += 1;
    gravar(CHAVE_USO, uso);
    mostrarUso();
}

function mostrarUso() {
    const alvo = el("jarvisUso");
    if (!alvo) return;
    const uso = getUso();
    const config = getConfig();
    const nomeCurto = { servidor: "Gemini incluso", gemini: "Gemini", openai: "ChatGPT", anthropic: "Claude" }[config.provedor] || config.provedor;
    alvo.textContent = `${NOME_ASSISTENTE} ${VERSAO_JARVIS} · ${nomeCurto} · Hoje: ${uso.perguntas} ${uso.perguntas === 1 ? "pedido" : "pedidos"} · ${uso.chamadas} ${uso.chamadas === 1 ? "chamada" : "chamadas"} à IA`;
}

async function postJSON(url, headers, corpo) {
    registrarUso("chamadas");
    let resposta;
    try {
        resposta = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(corpo)
        });
    } catch (e) {
        throw new Error("Não consegui falar com a IA. Verifique sua conexão com a internet.");
    }

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        const msg = dados?.error?.message || "";
        const empresa = url.includes("googleapis") ? "Gemini (Google)"
            : url.includes("anthropic") ? "Claude (Anthropic)"
            : "ChatGPT (OpenAI)";

        if (resposta.status === 401 || resposta.status === 403 || /api key not valid|invalid.*key/i.test(msg)) {
            throw new Error(`O ${empresa} recusou a chave da API. Confira a chave na engrenagem ⚙.`);
        }
        if (resposta.status === 429) {
            throw new Error(url.includes("googleapis")
                ? "Limite do plano gratuito do Gemini atingido. Espere um minuto e tente de novo (se for o limite diário, ele volta amanhã)."
                : `O ${empresa} recusou por falta de créditos na conta. Para usar de graça, abra a engrenagem ⚙, escolha Gemini (Google), cole a chave do Google e salve.`);
        }
        if (resposta.status === 404 || /model/i.test(msg)) throw new Error(`O modelo configurado não foi aceito. Detalhe: ${msg}`);
        throw new Error(`A IA retornou um erro (${resposta.status}). ${msg}`);
    }

    return dados;
}

const MAX_RODADAS = 6;

// OpenAI — Responses API
async function turnoOpenAI(config, mensagens) {
    const input = mensagens.map(m => ({ role: m.role, content: m.texto }));
    const tools = FERRAMENTAS.map(f => ({ type: "function", name: f.nome, description: f.descricao, parameters: f.parametros }));

    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
        const dados = await postJSON(
            "https://api.openai.com/v1/responses",
            { Authorization: `Bearer ${config.chaves.openai}` },
            { model: config.modelos.openai, instructions: montarSistema(), input, tools }
        );

        const saida = dados.output || [];
        const chamadas = saida.filter(item => item.type === "function_call");

        if (!chamadas.length) {
            return saida
                .filter(item => item.type === "message")
                .flatMap(item => item.content || [])
                .filter(parte => parte.type === "output_text")
                .map(parte => parte.text)
                .join(" ")
                .trim();
        }

        input.push(...saida);
        for (const chamada of chamadas) {
            let args = {};
            try { args = JSON.parse(chamada.arguments || "{}"); } catch (e) { /* argumentos inválidos */ }
            input.push({
                type: "function_call_output",
                call_id: chamada.call_id,
                output: await executarFerramenta(chamada.name, args)
            });
        }
    }
    return "Executei as ações, mas não consegui montar a resposta final.";
}

// Anthropic — Messages API
async function turnoAnthropic(config, mensagens) {
    const messages = mensagens.map(m => ({ role: m.role, content: m.texto }));
    const tools = FERRAMENTAS.map(f => ({ name: f.nome, description: f.descricao, input_schema: f.parametros }));

    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
        const dados = await postJSON(
            "https://api.anthropic.com/v1/messages",
            {
                "x-api-key": config.chaves.anthropic,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            { model: config.modelos.anthropic, max_tokens: 1024, system: montarSistema(), messages, tools }
        );

        const blocos = dados.content || [];
        const usos = blocos.filter(b => b.type === "tool_use");

        if (dados.stop_reason !== "tool_use" || !usos.length) {
            return blocos.filter(b => b.type === "text").map(b => b.text).join(" ").trim();
        }

        messages.push({ role: "assistant", content: blocos });
        const resultados = [];
        for (const uso of usos) {
            resultados.push({
                type: "tool_result",
                tool_use_id: uso.id,
                content: await executarFerramenta(uso.name, uso.input)
            });
        }
        messages.push({ role: "user", content: resultados });
    }
    return "Executei as ações, mas não consegui montar a resposta final.";
}

// Google Gemini — generateContent (tem plano gratuito)
async function chamarServidor(modelo, corpo) {
    const cliente = window.nuvemCliente?.();
    if (!cliente) throw new Error("Entre na sua conta para usar o Gideon.");

    registrarUso("chamadas");

    let resposta;
    try {
        resposta = await cliente.functions.invoke("gideon-ia", { body: { modelo, corpo } });
    } catch (e) {
        throw new Error("Não consegui falar com o servidor do Gideon. Verifique sua conexão com a internet.");
    }

    if (resposta.error) {
        const contexto = resposta.error.context;
        let status = 0;
        let detalhe = "";
        let bruto = "";

        // Erro com resposta do servidor (tem status); sem status = nem chegou lá
        if (contexto && typeof contexto.status === "number") {
            status = contexto.status;
            try {
                const texto = await contexto.text();
                bruto = texto;
                try {
                    const j = JSON.parse(texto);
                    detalhe = j?.error?.message || j?.message || j?.msg || j?.code || texto;
                } catch (e) {
                    detalhe = texto;
                }
            } catch (e) { /* sem corpo */ }
        }
        detalhe = String(detalhe || "").slice(0, 220);
        console.warn("gideon-ia falhou:", resposta.error.name, status, detalhe);

        if (!status) {
            throw new Error("Não consegui chegar ao servidor do Gideon. Causa mais comum: a opção \"Verify JWT\" está ligada na função gideon-ia, e ela bloqueia o navegador. Desligue e tente de novo.");
        }
        if (/BOOT_ERROR|WORKER_ERROR|failed to start/i.test(bruto + detalhe)) {
            throw new Error("A função gideon-ia está com erro ao iniciar. Confira se o código foi colado inteiro e publique de novo.");
        }
        if (status === 404 && /requested function|function not found|not_found/i.test(detalhe)) {
            throw new Error("Não encontrei a função gideon-ia no Supabase. Confira se o nome está exatamente gideon-ia.");
        }
        if (status === 401) throw new Error(detalhe ? `Servidor do Gideon (401): ${detalhe}` : "Sua sessão expirou. Saia e entre de novo.");
        if (status === 429) throw new Error(detalhe || "Limite do plano gratuito atingido. Tente de novo em alguns minutos.");
        throw new Error(`Servidor do Gideon (erro ${status}): ${detalhe || "sem detalhes"}`);
    }

    return resposta.data;
}

// Gemini direto (com a chave da pessoa) ou pelo servidor (chave guardada no Supabase)
async function gerarConteudoGemini(config, corpo) {
    if (config.provedor === "servidor") {
        if (CHAVE_GEMINI_FIXA) {
            return postJSON(
                `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.modelos.servidor)}:generateContent`,
                { "x-goog-api-key": CHAVE_GEMINI_FIXA },
                corpo
            );
        }
        return chamarServidor(config.modelos.servidor, corpo);
    }
    return postJSON(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.modelos.gemini)}:generateContent`,
        { "x-goog-api-key": config.chaves.gemini },
        corpo
    );
}

async function turnoGemini(config, mensagens) {
    const contents = mensagens.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.texto }]
    }));
    const tools = [{
        functionDeclarations: FERRAMENTAS.map(f => ({ name: f.nome, description: f.descricao, parameters: f.parametros }))
    }];
    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
        const dados = await gerarConteudoGemini(config, {
            systemInstruction: { parts: [{ text: montarSistema() }] }, contents, tools
        });

        const conteudo = dados.candidates?.[0]?.content;
        const partes = conteudo?.parts || [];
        const chamadas = partes.filter(p => p.functionCall).map(p => p.functionCall);

        if (!chamadas.length) {
            if (!partes.length && dados.promptFeedback?.blockReason) {
                return "Não consegui responder a esse pedido. Pode reformular?";
            }
            return partes.filter(p => p.text && !p.thought).map(p => p.text).join(" ").trim();
        }

        // Devolve a resposta do modelo como veio (inclui a "assinatura" de raciocínio)
        contents.push({ role: "model", parts: partes });
        const respostas = [];
        for (const chamada of chamadas) {
            respostas.push({
                functionResponse: {
                    ...(chamada.id ? { id: chamada.id } : {}),
                    name: chamada.name,
                    response: { resultado: await executarFerramenta(chamada.name, chamada.args || {}) }
                }
            });
        }
        contents.push({ role: "user", parts: respostas });
    }
    return "Executei as ações, mas não consegui montar a resposta final.";
}

async function rodarTurno(textoUsuario) {
    const config = getConfig();
    const provedor = PROVEDORES[config.provedor] ? config.provedor : "servidor";

    if (precisaDeChave({ ...config, provedor })) {
        abrirConfiguracoes();
        throw new Error(`Preciso da sua chave de API do ${PROVEDORES[provedor].nome} para funcionar. Cole nas configurações.`);
    }

    historico.push({ role: "user", texto: textoUsuario });
    registrarUso("perguntas");

    // Últimas trocas, começando sempre por uma fala sua
    const recentes = historico.slice(-16);
    while (recentes.length && recentes[0].role !== "user") recentes.shift();

    try {
        const turnos = { servidor: turnoGemini, gemini: turnoGemini, openai: turnoOpenAI, anthropic: turnoAnthropic };
        const resposta = await (turnos[provedor] || turnoGemini)(config, recentes);

        const final = resposta || "Feito.";
        historico.push({ role: "assistant", texto: final });
        return final;
    } catch (e) {
        historico.pop();
        throw e;
    }
}


/* =========================================================
   VOZ: FALAR
   ========================================================= */

function carregarVozes() {
    if (!("speechSynthesis" in window)) return;

    vozes = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith("pt"));

    const select = el("jcVoz");
    if (!select) return;

    const atual = getConfig().voz;
    select.innerHTML = `<option value="">Automática</option>` + vozes
        .map(v => `<option value="${esc(v.name)}" ${v.name === atual ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`)
        .join("");
}

function escolherVoz(config) {
    return vozes.find(v => v.name === config.voz)
        || vozes.find(v => /pt-BR/i.test(v.lang) && /google|natural|online|francisca|antonio|thalita/i.test(v.name))
        || vozes.find(v => /pt-BR/i.test(v.lang))
        || vozes[0]
        || null;
}

function limparParaFala(texto) {
    return texto
        .replace(/[*_#`>]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function falar(texto) {
    return new Promise(resolve => {
        if (!("speechSynthesis" in window) || !texto) return resolve();

        speechSynthesis.cancel();
        falaInterrompida = false;

        const config = getConfig();
        const voz = escolherVoz(config);

        // Frases curtas evitam o corte de falas longas no Chrome
        const partes = (limparParaFala(texto).match(/[^.!?;]+[.!?;]*/g) || [texto])
            .map(p => p.trim())
            .filter(Boolean);

        let restantes = partes.length;
        if (!restantes) return resolve();

        setEstado("falando");

        partes.forEach(parte => {
            const fala = new SpeechSynthesisUtterance(parte);
            fala.lang = voz?.lang || "pt-BR";
            if (voz) fala.voice = voz;
            fala.rate = Number(config.velocidade) || 1;

            fala.onend = fala.onerror = () => {
                restantes -= 1;
                if (restantes <= 0) {
                    if (estado === "falando") setEstado("parado");
                    resolve();
                }
            };

            speechSynthesis.speak(fala);
        });
    });
}

function interromperFala() {
    if ("speechSynthesis" in window && (speechSynthesis.speaking || speechSynthesis.pending)) {
        falaInterrompida = true;
        speechSynthesis.cancel();
    }
}


/* =========================================================
   VOZ: OUVIR
   ========================================================= */

function ouvir() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SR) {
        adicionarMensagem("erro", "Este navegador não tem reconhecimento de voz. Use o Chrome ou o Edge, ou digite o pedido.");
        return;
    }

    if (estado === "ouvindo") {
        reconhecimento?.stop();
        return;
    }
    if (ocupado) return;

    interromperFala();

    reconhecimento = new SR();
    reconhecimento.lang = "pt-BR";
    reconhecimento.interimResults = true;
    reconhecimento.continuous = false;

    let textoFinal = "";
    const parcial = el("jarvisInterim");

    reconhecimento.onresult = evento => {
        let provisorio = "";
        for (let i = evento.resultIndex; i < evento.results.length; i++) {
            const resultado = evento.results[i];
            if (resultado.isFinal) textoFinal += resultado[0].transcript;
            else provisorio += resultado[0].transcript;
        }
        if (parcial) {
            parcial.hidden = false;
            parcial.textContent = (textoFinal + provisorio).trim();
        }
    };

    reconhecimento.onerror = evento => {
        if (evento.error === "not-allowed" || evento.error === "service-not-allowed") {
            adicionarMensagem("erro", "O navegador bloqueou o microfone. Clique no cadeado ao lado do endereço e permita o microfone.");
        }
    };

    reconhecimento.onend = () => {
        reconhecimento = null;
        if (parcial) { parcial.hidden = true; parcial.textContent = ""; }

        const texto = textoFinal.trim();
        if (texto) enviar(texto);
        else setEstado("parado");
    };

    try {
        reconhecimento.start();
        setEstado("ouvindo");
    } catch (e) {
        setEstado("parado");
    }
}


/* =========================================================
   CONVERSA
   ========================================================= */

async function enviar(texto) {
    if (ocupado || !texto.trim()) return;
    ocupado = true;

    adicionarMensagem("user", texto);
    setEstado("pensando");

    let resposta = null;

    try {
        resposta = await rodarTurno(texto);
        adicionarMensagem("jarvis", resposta);
    } catch (e) {
        adicionarMensagem("erro", e.message);
    }

    ocupado = false;

    if (resposta) {
        await falar(resposta);

        const config = getConfig();
        const temMicrofone = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        if (config.continuo && temMicrofone && !falaInterrompida && painelAberto() && estado === "parado") {
            ouvir();
        }
    } else {
        setEstado("parado");
    }
}

function adicionarMensagem(tipo, texto) {
    const log = el("jarvisLog");
    if (!log) return;

    const item = document.createElement("div");
    item.className = `jarvis-msg ${tipo}`;
    item.textContent = tipo === "acao" ? `✓ ${texto}` : texto;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
}

function limparConversa() {
    historico = [];
    const log = el("jarvisLog");
    if (log) log.innerHTML = "";
    saudar();
}

function saudar() {
    const config = getConfig();
    if (precisaDeChave(config)) {
        adicionarMensagem("jarvis", `Olá${comNome(", ")}. Para eu funcionar com essa opção, cole sua chave de API nas configurações (engrenagem acima), ou escolha "Gemini (incluso)".`);
    } else {
        adicionarMensagem("jarvis", `Olá${comNome(", ")}. Toque no microfone e fale, ou escolha um atalho abaixo.`);
    }
}


/* =========================================================
   PAINEL E CONFIGURAÇÕES
   ========================================================= */

let configEmEdicao = null;

function abrirPainel() {
    const painel = el("jarvisPanel");
    if (!painel) return;
    painel.hidden = false;
    el("jarvisOrb")?.setAttribute("aria-expanded", "true");
    if (!el("jarvisLog").children.length) saudar();
}

function fecharPainel() {
    const painel = el("jarvisPanel");
    if (!painel) return;
    painel.hidden = true;
    el("jarvisOrb")?.setAttribute("aria-expanded", "false");
    reconhecimento?.abort();
    interromperFala();
    setEstado("parado");
}

function abrirConfiguracoes() {
    abrirPainel();
    configEmEdicao = getConfig();
    preencherConfiguracoes();
    el("jarvisSettings").hidden = false;
}

function preencherConfiguracoes() {
    const c = configEmEdicao;
    el("jcProvedor").value = c.provedor;
    el("jcChave").value = c.chaves[c.provedor] || "";
    el("jcModelo").value = c.modelos[c.provedor] || PROVEDORES[c.provedor].modeloPadrao;
    const incluso = c.provedor === "servidor";
    el("jcChave").closest("label").hidden = incluso;
    el("jcModelo").closest("label").hidden = incluso;
    const aviso = document.querySelector(".jarvis-note");
    if (aviso) aviso.textContent = incluso
        ? "Opção incluída: não precisa de chave. Usa a cota do Gideon, com limite diário por pessoa."
        : "A chave fica salva só neste navegador. Nunca escreva a chave no código que vai para o GitHub.";
    el("jcVelocidade").value = c.velocidade;
    el("jcVelocidadeValor").textContent = `${Number(c.velocidade).toFixed(2)}x`;
    el("jcContinuo").checked = !!c.continuo;
    el("jcAvisos").checked = !!c.avisos;
    carregarVozes();
    el("jcVoz").value = c.voz || "";
}

// Reconhece de qual empresa é a chave pelo começo dela
function detectarProvedor(chave) {
    if (/^(AIza|AQ\.)/.test(chave)) return "gemini";
    if (/^sk-ant-/.test(chave)) return "anthropic";
    if (/^sk-/.test(chave)) return "openai";
    return null;
}

function lerCamposConfiguracao() {
    const c = configEmEdicao;
    const provedor = c.provedor;
    c.chaves[provedor] = el("jcChave").value.trim();
    c.modelos[provedor] = el("jcModelo").value.trim() || PROVEDORES[provedor].modeloPadrao;
    c.voz = el("jcVoz").value;
    c.velocidade = Number(el("jcVelocidade").value);
    c.continuo = el("jcContinuo").checked;
    c.avisos = el("jcAvisos").checked;
}

function configurarPainel() {
    el("jarvisOrb")?.addEventListener("click", () => {
        if (painelAberto()) fecharPainel();
        else abrirPainel();
    });

    el("jarvisClose")?.addEventListener("click", fecharPainel);
    el("jarvisReset")?.addEventListener("click", limparConversa);
    el("jarvisMic")?.addEventListener("click", ouvir);

    el("jarvisSettingsBtn")?.addEventListener("click", () => {
        const painel = el("jarvisSettings");
        if (painel.hidden) abrirConfiguracoes();
        else painel.hidden = true;
    });

    el("jcProvedor")?.addEventListener("change", () => {
        lerCamposConfiguracao();
        configEmEdicao.provedor = el("jcProvedor").value;
        preencherConfiguracoes();
    });

    el("jcVelocidade")?.addEventListener("input", () => {
        el("jcVelocidadeValor").textContent = `${Number(el("jcVelocidade").value).toFixed(2)}x`;
    });

    el("jcTestar")?.addEventListener("click", () => {
        lerCamposConfiguracao();
        const anterior = getConfig();
        salvarConfig({ ...anterior, voz: configEmEdicao.voz, velocidade: configEmEdicao.velocidade });
        falar(`Às suas ordens${comNome(", ")}. Sistemas prontos.`);
    });

    el("jcSalvar")?.addEventListener("click", () => {
        const chaveDigitada = el("jcChave").value.trim();
        const detectado = detectarProvedor(chaveDigitada);

        // Chave de outra empresa? Troca a opção sozinho em vez de dar erro.
        if (detectado && detectado !== el("jcProvedor").value) {
            el("jcProvedor").value = detectado;
            configEmEdicao.provedor = detectado;
            el("jcModelo").value = configEmEdicao.modelos[detectado] || PROVEDORES[detectado].modeloPadrao;
        }

        lerCamposConfiguracao();
        salvarConfig(configEmEdicao);
        el("jarvisSettings").hidden = true;
        historico = [];
        adicionarMensagem("acao", `Configurações salvas. Usando ${PROVEDORES[configEmEdicao.provedor].nome}.`);
        mostrarUso();
    });

    el("jcApagar")?.addEventListener("click", () => {
        if (!confirm("Apagar a chave de API salva neste navegador?")) return;
        configEmEdicao.chaves[configEmEdicao.provedor] = "";
        el("jcChave").value = "";
        salvarConfig(configEmEdicao);
    });

    el("jarvisForm")?.addEventListener("submit", evento => {
        evento.preventDefault();
        const campo = el("jarvisText");
        const texto = campo.value.trim();
        if (!texto) return;
        campo.value = "";
        interromperFala();
        enviar(texto);
    });

    document.querySelectorAll("[data-jarvis-prompt]").forEach(botao => {
        botao.addEventListener("click", () => {
            interromperFala();
            enviar(botao.dataset.jarvisPrompt);
        });
    });

    // Atalhos: Alt + J abre e já começa a ouvir; Esc fecha
    document.addEventListener("keydown", evento => {
        if (evento.altKey && evento.key.toLowerCase() === "j") {
            evento.preventDefault();
            abrirPainel();
            ouvir();
        }
        if (evento.key === "Escape" && painelAberto()) fecharPainel();
    });

    if ("speechSynthesis" in window) {
        carregarVozes();
        speechSynthesis.onvoiceschanged = carregarVozes;
    }
}


/* =========================================================
   AVISOS DE HORÁRIO (sem IA, sem custo)
   ========================================================= */

function falarHora(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function juntarNomes(nomes) {
    if (nomes.length <= 1) return nomes.join("");
    return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

function verificarAvisos() {
    if (!getConfig().avisos) return;

    const hoje = hojeISO();
    const hora = horaAtual();

    let registro = ler(CHAVE_AVISOS, null);
    if (!registro || registro.data !== hoje) registro = { data: hoje, ids: [] };

    const feitas = getRotinaFeita().ids;
    const agora = obterTarefasDeHoje().filter(t =>
        t.horario === hora && !feitas.includes(t.id) && !registro.ids.includes(t.id)
    );
    if (!agora.length) return;

    registro.ids.push(...agora.map(t => t.id));
    gravar(CHAVE_AVISOS, registro);

    if (ocupado || estado === "ouvindo") return;

    const nomes = agora.map(t => t.empresa && t.empresa !== "Geral" ? `${t.atividade} da ${t.empresa}` : t.atividade);
    const frase = `${nomePessoa() ? `${nomePessoa()}, são` : "São"} ${falarHora(hora)}. Hora de ${juntarNomes(nomes)}.`;

    adicionarMensagem("jarvis", frase);
    falar(frase);
}


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

// Usado pelo planejamento.js (mesma IA, mesma chave, mesmo contador)
window.gideon = { getConfig, postJSON, falar, registrarUso, gerarConteudoGemini, precisaDeChave };

document.addEventListener("DOMContentLoaded", () => {
    setEstado("parado");
    configurarPainel();
    mostrarUso();
    setInterval(verificarAvisos, 15000);
});

})();
