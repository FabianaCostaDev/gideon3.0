/* =========================================================
   NUVEM — CONTAS E SINCRONIZAÇÃO COM O SUPABASE (v2)
   Carregue depois do script.js (e antes do jarvis-v4.js).

   - Login, criação de conta (com nome) e recuperação de senha.
   - Perfil: nome da pessoa e do gestor (fica na conta).
   - Cada conta tem seus próprios dados. Ao trocar de pessoa no
     mesmo navegador, os dados guardados da anterior são apagados.
   - O site lê do navegador (rápido, funciona offline) e envia
     cada alteração para a nuvem. Mudanças de outro aparelho
     chegam em tempo real.
   ========================================================= */

(() => {

/* =========================================================
   CONFIGURAÇÃO DO SEU PROJETO
   Essas duas informações são públicas por natureza.
   Quem protege os dados é o login + as regras da tabela.
   ========================================================= */

const SUPABASE_URL = "https://dkrlwkjnpknosmczawdy.supabase.co";
const SUPABASE_CHAVE = "sb_publishable_UWB_PJhts2UKdBzh5uZDVg_Sa3iy3xq";

const TABELA = "personal_os_dados";
const CHAVE_PENDENTES = "personalOS_nuvemPendentes";
const CHAVE_DONO = "personalOS_dono";

// Chaves que nunca são apagadas ao trocar de pessoa
const PRESERVAR = ["personalOS_auth", "personalOS_clima"];

// Chave no navegador  ->  nome da linha na tabela
const SINCRONIZADAS = {
    [STORAGE_KEYS.recorrentes]: "recorrentes",
    [STORAGE_KEYS.pendencias]: "pendencias",
    [STORAGE_KEYS.dataUnica]: "dataUnica",
    [STORAGE_KEYS.rotinaFeita]: "rotinaFeita",
    [CHAVE_PROCESSOS]: "processos",
    personalOS_treinos: "treinos",
    personalOS_estudos: "estudos",
    personalOS_planos: "planos"
};

const LOCAL_POR_NOME = Object.fromEntries(
    Object.entries(SINCRONIZADAS).map(([local, nome]) => [nome, local])
);

// Histórico mensal: personalOS_hist_2026-10  <->  hist_2026-10
const HIST_LOCAL = "personalOS_hist_";
const HIST_NUVEM = "hist_";

function nomeNaNuvem(chaveLocal) {
    if (SINCRONIZADAS[chaveLocal]) return SINCRONIZADAS[chaveLocal];
    if (chaveLocal.startsWith(HIST_LOCAL)) return HIST_NUVEM + chaveLocal.slice(HIST_LOCAL.length);
    return null;
}

function chaveLocalDe(nome) {
    if (LOCAL_POR_NOME[nome]) return LOCAL_POR_NOME[nome];
    if (nome.startsWith(HIST_NUVEM)) return HIST_LOCAL + nome.slice(HIST_NUVEM.length);
    return null;
}

const ehHistorico = chaveLocal => chaveLocal.startsWith(HIST_LOCAL);

function chavesSincronizadasLocais() {
    const chaves = new Set(Object.keys(SINCRONIZADAS));
    for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        if (chave && ehHistorico(chave)) chaves.add(chave);
    }
    return [...chaves];
}


/* =========================================================
   ESTADO
   ========================================================= */

let cliente = null;
let usuario = null;
let pronto = false;          // só envia depois da primeira sincronização
let canal = null;
let novaTentativa = null;
let perfilObrigatorio = false;

const timers = {};
const ultimaEscritaLocal = {};

const $n = id => document.getElementById(id);

// O script.js consulta isso antes de gravar o histórico
window.nuvemPronta = () => !cliente || pronto;

// O Gideon usa o cliente para chamar o servidor (função gideon-ia)
window.nuvemCliente = () => (usuario ? cliente : null);


/* =========================================================
   UTILITÁRIOS
   ========================================================= */

// JSON com chaves em ordem fixa (o banco reorganiza as chaves)
function estavel(valor) {
    if (Array.isArray(valor)) return `[${valor.map(estavel).join(",")}]`;
    if (valor && typeof valor === "object") {
        return `{${Object.keys(valor).sort().map(k => `${JSON.stringify(k)}:${estavel(valor[k])}`).join(",")}}`;
    }
    return JSON.stringify(valor);
}

function lerLocal(chave) {
    try {
        const texto = localStorage.getItem(chave);
        return texto ? JSON.parse(texto) : null;
    } catch (e) {
        return null;
    }
}

// Grava direto, sem disparar novo envio para a nuvem
function gravarLocalSemEnviar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* ignora */ }
}

function getPendentes() {
    const lista = lerLocal(CHAVE_PENDENTES);
    return Array.isArray(lista) ? lista : [];
}

function setPendentes(lista) {
    gravarLocalSemEnviar(CHAVE_PENDENTES, [...new Set(lista)]);
}

function atualizarTela() {
    try {
        renderizarTudo();
        if ($n("view-processes")?.classList.contains("active-view")) renderizarProcessos();
    } catch (e) {
        console.error(e);
    }
}

// Apaga tudo que é desta conta no navegador (mantém login e clima)
function limparDadosLocais() {
    const remover = [];
    for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        if (chave && chave.startsWith("personalOS_") && !PRESERVAR.some(p => chave.startsWith(p))) {
            remover.push(chave);
        }
    }
    remover.forEach(chave => localStorage.removeItem(chave));
}

// Base vazia para quem está começando
function iniciarBaseVazia() {
    gravarLocalSemEnviar(STORAGE_KEYS.versao, VERSAO_BASE);
    gravarLocalSemEnviar(STORAGE_KEYS.recorrentes, []);
    gravarLocalSemEnviar(STORAGE_KEYS.pendencias, []);
    gravarLocalSemEnviar(STORAGE_KEYS.dataUnica, []);
    gravarLocalSemEnviar(CHAVE_PROCESSOS, []);
    gravarLocalSemEnviar("personalOS_treinos", { plano: [], sessoes: [] });
    gravarLocalSemEnviar("personalOS_estudos", { materias: [], sessoes: [], provas: [] });
    gravarLocalSemEnviar("personalOS_planos", {});
}

// Junta dois meses de histórico (dois aparelhos gravando ao mesmo tempo)
function mesclarHist(a, b) {
    const A = a || {};
    const B = b || {};
    const vistos = new Set();
    const eventos = [];

    [...(A.eventos || []), ...(B.eventos || [])].forEach(evento => {
        const id = `${evento.em}|${evento.id}|${evento.acao}`;
        if (!vistos.has(id)) {
            vistos.add(id);
            eventos.push(evento);
        }
    });
    eventos.sort((x, y) => String(x.em).localeCompare(String(y.em)));

    const feitas = registro => (registro?.rotina || []).filter(t => t.feita).length;
    const dias = { ...(A.dias || {}) };
    Object.entries(B.dias || {}).forEach(([dia, registro]) => {
        if (!dias[dia] || feitas(registro) > feitas(dias[dia])) dias[dia] = registro;
    });

    return { dias, eventos };
}


/* =========================================================
   STATUS NA TELA
   ========================================================= */

function setStatus(estado, texto) {
    const caixa = $n("syncStatus");
    if (caixa) {
        caixa.dataset.estado = estado;
        const alvo = caixa.querySelector(".sync-text");
        if (alvo) alvo.textContent = texto;
    }

    const selo = $n("storageBadge");
    if (selo) {
        selo.textContent = { ok: "Sincronizado", sync: "Salvando…", offline: "Offline", erro: "Com erro", local: "Só neste navegador" }[estado] || texto;
        selo.className = `status ${{ ok: "success", sync: "accent", offline: "warning", erro: "danger", local: "neutral" }[estado] || "neutral"}`;
    }
}

function statusPorPendentes() {
    if (!usuario) return;
    const pendentes = getPendentes().length;
    if (!pendentes) setStatus("ok", "Sincronizado");
    else if (!navigator.onLine) setStatus("offline", `Sem internet · ${pendentes} alteração(ões) guardada(s)`);
    else setStatus("sync", "Salvando…");
}


/* =========================================================
   ENVIAR PARA A NUVEM
   ========================================================= */

// Chamado pelo script.js toda vez que algo é gravado
window.sincronizarChave = chaveLocal => {
    if (!nomeNaNuvem(chaveLocal)) return;
    ultimaEscritaLocal[chaveLocal] = Date.now();

    if (!pronto || !usuario) return;

    setPendentes([...getPendentes(), chaveLocal]);
    setStatus("sync", "Salvando…");

    clearTimeout(timers[chaveLocal]);
    timers[chaveLocal] = setTimeout(() => {
        timers[chaveLocal] = null;
        enviar(chaveLocal);
    }, 400);
};

async function enviar(chaveLocal) {
    if (!pronto || !usuario || !cliente) return false;

    const valor = lerLocal(chaveLocal);
    if (valor === null) {
        setPendentes(getPendentes().filter(c => c !== chaveLocal));
        return true;
    }

    let erro = null;
    try {
        const resposta = await cliente.from(TABELA).upsert(
            {
                user_id: usuario.id,
                chave: nomeNaNuvem(chaveLocal),
                valor,
                atualizado_em: new Date().toISOString()
            },
            { onConflict: "user_id,chave" }
        );
        erro = resposta.error;
    } catch (e) {
        erro = e;
    }

    if (erro) {
        console.warn("Falha ao enviar para a nuvem:", erro);
        statusPorPendentes();
        if (navigator.onLine) setStatus("erro", "Erro ao salvar na nuvem · tentando de novo");
        agendarNovaTentativa();
        return false;
    }

    // Só tira da fila se não houver uma alteração mais nova esperando
    if (!timers[chaveLocal]) {
        setPendentes(getPendentes().filter(c => c !== chaveLocal));
    }
    statusPorPendentes();
    return true;
}

async function enviarPendentes() {
    for (const chave of getPendentes()) {
        if (nomeNaNuvem(chave)) await enviar(chave);
        else setPendentes(getPendentes().filter(c => c !== chave));
    }
    statusPorPendentes();
}

function agendarNovaTentativa() {
    clearTimeout(novaTentativa);
    novaTentativa = setTimeout(() => {
        if (usuario && pronto) enviarPendentes();
    }, 15000);
}


/* =========================================================
   BAIXAR DA NUVEM
   ========================================================= */

// Aplica uma linha vinda da nuvem. Devolve true se mudou algo na tela.
function aplicarRemoto(chaveLocal, valorRemoto) {
    const valorLocal = lerLocal(chaveLocal);

    if (ehHistorico(chaveLocal) && valorLocal) {
        const mesclado = mesclarHist(valorLocal, valorRemoto);
        const mudouLocal = estavel(mesclado) !== estavel(valorLocal);
        if (mudouLocal) gravarLocalSemEnviar(chaveLocal, mesclado);
        // O local tinha coisas que a nuvem não tinha: envia a versão juntada
        if (pronto && estavel(mesclado) !== estavel(valorRemoto)) {
            setPendentes([...getPendentes(), chaveLocal]);
            enviar(chaveLocal);
        }
        return mudouLocal;
    }

    if (estavel(valorLocal) !== estavel(valorRemoto)) {
        gravarLocalSemEnviar(chaveLocal, valorRemoto);
        return true;
    }
    return false;
}

async function puxar() {
    const { data, error } = await cliente.from(TABELA).select("chave, valor");
    if (error) throw error;

    const pendentes = getPendentes();
    const presentes = new Set();
    let mudou = false;

    (data || []).forEach(linha => {
        const local = chaveLocalDe(linha.chave);
        if (!local) return;
        presentes.add(local);
        if (pendentes.includes(local) && !ehHistorico(local)) return;   // alteração local ainda não enviada vence
        if (aplicarRemoto(local, linha.valor)) mudou = true;
    });

    return { linhas: (data || []).length, mudou, presentes };
}

function assinarTempoReal() {
    if (canal) cliente.removeChannel(canal);

    canal = cliente
        .channel(`personal-os-${usuario.id}`)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: TABELA, filter: `user_id=eq.${usuario.id}` },
            payload => {
                const linha = payload.new;
                if (!linha || !linha.chave) return;

                const local = chaveLocalDe(linha.chave);
                if (!local) return;

                // Ignora o "eco" das próprias alterações
                if (getPendentes().includes(local)) return;
                if (Date.now() - (ultimaEscritaLocal[local] || 0) < 3000) return;

                if (aplicarRemoto(local, linha.valor)) atualizarTela();
            }
        )
        .subscribe();
}


/* =========================================================
   PERFIL
   ========================================================= */

function aplicarPerfil(user) {
    const meta = user?.user_metadata || {};
    window.perfilAtual = {
        nome: String(meta.nome || "").trim(),
        gestor: String(meta.gestor || "").trim(),
        artigo: meta.gestor_artigo === "da" ? "da" : "do",
        email: user?.email || ""
    };

    const email = $n("syncEmail");
    if (email) email.textContent = window.perfilAtual.nome || window.perfilAtual.email;

    window.dispatchEvent(new Event("perfil-atualizado"));
}

function abrirPerfil(obrigatorio = false) {
    perfilObrigatorio = obrigatorio;
    const atual = window.perfilAtual || {};

    $n("perfilNome").value = atual.nome || "";
    $n("perfilGestor").value = atual.gestor || sugerirGestorAntigo();
    $n("perfilArtigo").value = atual.artigo || "do";
    $n("perfilErro").textContent = "";
    $n("perfilCancelar").hidden = obrigatorio;
    $n("perfilTitulo").textContent = obrigatorio ? "Como devemos te chamar?" : "Seu perfil";

    $n("perfilModal").hidden = false;
    setTimeout(() => $n("perfilNome")?.focus(), 0);
}

// Quem já tinha pedidos marcados como "Rodrigo" ganha a sugestão pronta
function sugerirGestorAntigo() {
    const pendencias = lerLocal(STORAGE_KEYS.pendencias) || [];
    const antigo = pendencias.find(p => p && p.tipo && !["geral", "gestor"].includes(chaveTexto(p.tipo)));
    return antigo ? antigo.tipo : "";
}

function fecharPerfil() {
    if (perfilObrigatorio) return;
    $n("perfilModal").hidden = true;
}

function configurarPerfil() {
    $n("perfilButton")?.addEventListener("click", () => abrirPerfil(false));
    $n("perfilCancelar")?.addEventListener("click", fecharPerfil);

    $n("perfilForm")?.addEventListener("submit", async evento => {
        evento.preventDefault();
        const nome = $n("perfilNome").value.trim();
        const gestor = $n("perfilGestor").value.trim();
        const artigo = $n("perfilArtigo").value;
        const erro = $n("perfilErro");
        const botao = $n("perfilSalvar");

        if (!nome) {
            erro.textContent = "Escreva como você quer ser chamada(o).";
            return;
        }

        botao.disabled = true;
        botao.textContent = "Salvando…";

        const { data, error } = await cliente.auth.updateUser({
            data: { nome, gestor, gestor_artigo: artigo }
        });

        botao.disabled = false;
        botao.textContent = "Salvar";

        if (error) {
            erro.textContent = `Não foi possível salvar: ${error.message}`;
            return;
        }

        aplicarPerfil(data.user);
        perfilObrigatorio = false;
        $n("perfilModal").hidden = true;
    });

    // Nova senha (depois de clicar no link "Esqueci minha senha")
    $n("senhaForm")?.addEventListener("submit", async evento => {
        evento.preventDefault();
        const senha = $n("novaSenha").value;
        const erro = $n("senhaErro");

        if (senha.length < 6) {
            erro.textContent = "A senha precisa ter pelo menos 6 caracteres.";
            return;
        }

        const { error } = await cliente.auth.updateUser({ password: senha });
        if (error) {
            erro.textContent = traduzirErroLogin(error);
            return;
        }

        $n("novaSenha").value = "";
        $n("senhaModal").hidden = true;
        alert("Senha alterada com sucesso.");
    });
}


/* =========================================================
   ENTRAR / SAIR
   ========================================================= */

async function aoEntrar(sessao) {
    usuario = sessao.user;
    pronto = false;
    esconderLogin();
    aplicarPerfil(usuario);
    setStatus("sync", "Sincronizando…");

    // Dados guardados de outra pessoa neste navegador? Apaga.
    const dono = lerLocal(CHAVE_DONO);
    if (dono && dono !== usuario.id) limparDadosLocais();
    if (!dono) setPendentes([]);   // dono desconhecido: não envia nada antigo
    gravarLocalSemEnviar(CHAVE_DONO, usuario.id);

    try {
        const pendentesAntes = getPendentes();
        const resultado = await puxar();

        if (resultado.linhas === 0) {
            // Conta nova: começa do zero (nunca herda dados do navegador)
            limparDadosLocais();
            gravarLocalSemEnviar(CHAVE_DONO, usuario.id);
            iniciarBaseVazia();
            pronto = true;
            atualizarTela();
        } else {
            // O que esta conta não tem na nuvem não pode ficar de outra pessoa
            if (!dono) {
                chavesSincronizadasLocais()
                    .filter(chave => !resultado.presentes.has(chave))
                    .forEach(chave => localStorage.removeItem(chave));
            }
            pronto = true;
            gravarLocalSemEnviar(STORAGE_KEYS.versao, VERSAO_BASE);
            atualizarTela();
            if (pendentesAntes.length) await enviarPendentes();
        }

        assinarTempoReal();
        statusPorPendentes();
    } catch (e) {
        console.warn("Não consegui sincronizar agora:", e);
        pronto = true;   // continua funcionando com os dados locais; envia depois
        setStatus("offline", "Sem conexão com a nuvem · usando dados locais");
        agendarNovaTentativa();
    }

    if (!window.perfilAtual?.nome) abrirPerfil(true);
}

function aoSair() {
    usuario = null;
    pronto = false;
    if (canal && cliente) cliente.removeChannel(canal);
    canal = null;
    window.perfilAtual = {};
    window.dispatchEvent(new Event("perfil-atualizado"));
    $n("perfilModal").hidden = true;
    setStatus("local", "Desconectado");
    mostrarLogin();
}

function urlDoSite() {
    return location.origin + location.pathname;
}

function traduzirErroLogin(erro) {
    const msg = String(erro?.message || "");
    if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
    if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar: abra o link que enviamos para você.";
    if (/already registered|already exists/i.test(msg)) return "Este e-mail já tem conta. Use Entrar (ou Esqueci minha senha).";
    if (/at least 6|password should be/i.test(msg)) return "A senha precisa ter pelo menos 6 caracteres.";
    if (/rate limit|too many/i.test(msg)) return "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.";
    if (/invalid.*email|unable to validate email/i.test(msg)) return "Esse e-mail não parece válido.";
    if (/signups? not allowed|signup is disabled/i.test(msg)) return "A criação de contas está desativada no Supabase.";
    if (/same.*password|different from the old/i.test(msg)) return "A nova senha precisa ser diferente da anterior.";
    if (/fetch|network/i.test(msg)) return "Sem conexão com a internet.";
    return `Não deu certo: ${msg}`;
}


/* ---------- Tela de login: Entrar / Criar conta / Recuperar ---------- */

let modoLogin = "entrar";

function setModoLogin(modo) {
    modoLogin = modo;
    const form = $n("loginForm");
    if (!form) return;
    form.dataset.modo = modo;

    form.querySelectorAll("[data-so-modo]").forEach(el => {
        el.hidden = !el.dataset.soModo.split(" ").includes(modo);
    });

    form.querySelectorAll("[data-modo-login]").forEach(aba => {
        const ativa = aba.dataset.modoLogin === modo;
        aba.classList.toggle("ativo", ativa);
        aba.setAttribute("aria-selected", String(ativa));
    });

    $n("loginBotao").textContent = { entrar: "Entrar", criar: "Criar conta", recuperar: "Enviar link" }[modo];
    $n("loginSenha").autocomplete = modo === "criar" ? "new-password" : "current-password";
    $n("loginErro").textContent = "";
}

function mostrarLogin(mensagem = "") {
    const tela = $n("loginScreen");
    if (tela) tela.hidden = false;
    const erro = $n("loginErro");
    if (erro) erro.textContent = mensagem;
    setTimeout(() => $n(modoLogin === "criar" ? "loginNome" : "loginEmail")?.focus(), 0);
}

function esconderLogin() {
    const tela = $n("loginScreen");
    if (tela) tela.hidden = true;
}

function avisoLogin(texto) {
    const aviso = $n("loginAviso");
    if (aviso) aviso.textContent = texto;
}

function configurarLogin() {
    document.querySelectorAll("[data-modo-login]").forEach(aba => {
        aba.addEventListener("click", () => {
            avisoLogin("");
            setModoLogin(aba.dataset.modoLogin);
        });
    });

    $n("esqueciSenha")?.addEventListener("click", () => { avisoLogin(""); setModoLogin("recuperar"); });
    $n("voltarLogin")?.addEventListener("click", () => { avisoLogin(""); setModoLogin("entrar"); });

    $n("loginForm")?.addEventListener("submit", async evento => {
        evento.preventDefault();

        const nome = $n("loginNome").value.trim();
        const email = $n("loginEmail").value.trim();
        const senha = $n("loginSenha").value;
        const botao = $n("loginBotao");
        const erro = $n("loginErro");
        const textoBotao = botao.textContent;

        erro.textContent = "";
        if (!email) { erro.textContent = "Preencha o e-mail."; return; }
        if (modoLogin !== "recuperar" && !senha) { erro.textContent = "Preencha a senha."; return; }
        if (modoLogin === "criar" && !nome) { erro.textContent = "Escreva como você quer ser chamada(o)."; return; }
        if (modoLogin === "criar" && senha.length < 6) { erro.textContent = "A senha precisa ter pelo menos 6 caracteres."; return; }

        botao.disabled = true;
        botao.textContent = "Aguarde…";

        try {
            if (modoLogin === "entrar") {
                const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
                if (error) erro.textContent = traduzirErroLogin(error);
                else $n("loginSenha").value = "";
            }

            if (modoLogin === "criar") {
                const { data, error } = await cliente.auth.signUp({
                    email,
                    password: senha,
                    options: { data: { nome }, emailRedirectTo: urlDoSite() }
                });

                if (error) {
                    erro.textContent = traduzirErroLogin(error);
                } else if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
                    erro.textContent = "Este e-mail já tem conta. Use Entrar (ou Esqueci minha senha).";
                } else if (!data.session) {
                    // Confirmação por e-mail ligada no Supabase
                    setModoLogin("entrar");
                    $n("loginSenha").value = "";
                    avisoLogin(`Conta criada! Enviamos um link de confirmação para ${email}. Abra o e-mail, clique no link e depois entre aqui.`);
                }
                // Com sessão, o login acontece sozinho
            }

            if (modoLogin === "recuperar") {
                const { error } = await cliente.auth.resetPasswordForEmail(email, { redirectTo: urlDoSite() });
                if (error) {
                    erro.textContent = traduzirErroLogin(error);
                } else {
                    setModoLogin("entrar");
                    avisoLogin(`Se existir uma conta com ${email}, enviamos um link para criar uma nova senha.`);
                }
            }
        } catch (e) {
            erro.textContent = traduzirErroLogin(e);
        }

        botao.disabled = false;
        botao.textContent = { entrar: "Entrar", criar: "Criar conta", recuperar: "Enviar link" }[modoLogin] || textoBotao;
    });

    $n("logoutButton")?.addEventListener("click", async () => {
        if (getPendentes().length &&
            !confirm("Ainda há alterações que não chegaram à nuvem. Sair mesmo assim?")) return;
        await cliente.auth.signOut();
        // Em computador compartilhado, não deixa nada seu para trás
        limparDadosLocais();
        atualizarTela();
    });

    setModoLogin("entrar");
}


/* =========================================================
   BACKUP (baixar e restaurar um arquivo)
   ========================================================= */

function exportarBackup() {
    const dados = {};
    chavesSincronizadasLocais().forEach(local => {
        const valor = lerLocal(local);
        if (valor !== null) dados[nomeNaNuvem(local)] = valor;
    });

    const conteudo = JSON.stringify({ app: "Personal OS", versao: 2, exportado_em: new Date().toISOString(), dados }, null, 2);
    const blob = new Blob([conteudo], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `backup-${hojeISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function importarBackup(arquivo) {
    const leitor = new FileReader();

    leitor.onload = () => {
        let pacote;
        try {
            pacote = JSON.parse(leitor.result);
        } catch (e) {
            alert("Esse arquivo não é um backup válido.");
            return;
        }

        const dados = pacote?.dados;
        if (!dados || typeof dados !== "object") {
            alert("Esse arquivo não é um backup válido.");
            return;
        }

        const quando = pacote.exportado_em ? new Date(pacote.exportado_em).toLocaleString("pt-BR") : "data desconhecida";
        if (!confirm(`Restaurar o backup de ${quando}?\n\nIsso substitui as tarefas atuais${usuario ? " aqui e na nuvem" : ""}.`)) return;

        Object.entries(dados).forEach(([nome, valor]) => {
            const local = chaveLocalDe(nome);
            if (local) gravar(local, valor);   // passa pelo envio para a nuvem
        });
        gravarLocalSemEnviar(STORAGE_KEYS.versao, VERSAO_BASE);

        atualizarTela();
        alert("Backup restaurado.");
    };

    leitor.readAsText(arquivo);
}

function configurarBackup() {
    $n("exportBackup")?.addEventListener("click", exportarBackup);
    $n("importBackup")?.addEventListener("click", () => $n("importFile")?.click());
    $n("importFile")?.addEventListener("change", evento => {
        const arquivo = evento.target.files?.[0];
        if (arquivo) importarBackup(arquivo);
        evento.target.value = "";
    });
}


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    configurarBackup();

    if (!window.supabase?.createClient) {
        // Biblioteca não carregou (sem internet?): segue só com o navegador
        setStatus("local", "Sem conexão com a nuvem · usando só este navegador");
        return;
    }

    cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "personalOS_auth" }
    });

    configurarLogin();
    configurarPerfil();
    setStatus("sync", "Conectando…");

    cliente.auth.onAuthStateChange((evento, sessao) => {
        // setTimeout evita travar o Supabase ao chamar outras funções dentro deste evento
        setTimeout(() => {
            if (evento === "PASSWORD_RECOVERY") {
                $n("senhaModal").hidden = false;
                setTimeout(() => $n("novaSenha")?.focus(), 0);
            }

            if (evento === "USER_UPDATED" && sessao?.user) {
                usuario = sessao.user;
                aplicarPerfil(sessao.user);
                return;
            }

            if (sessao?.user) {
                if (!usuario || usuario.id !== sessao.user.id) aoEntrar(sessao);
            } else {
                aoSair();
            }
        }, 0);
    });

    // Voltou para a aba (ex.: desbloqueou o celular): confere se há novidades
    document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState !== "visible" || !usuario || !pronto) return;
        try {
            await enviarPendentes();
            const resultado = await puxar();
            if (resultado.mudou) atualizarTela();
            statusPorPendentes();
        } catch (e) {
            statusPorPendentes();
        }
    });

    window.addEventListener("online", async () => {
        if (!usuario || !pronto) return;
        await enviarPendentes();
        try {
            const resultado = await puxar();
            if (resultado.mudou) atualizarTela();
        } catch (e) { /* tenta de novo depois */ }
        statusPorPendentes();
    });

    window.addEventListener("offline", statusPorPendentes);
});

})();
