/* =========================================================
   ATIVIDADES COM GPS (v2)
   Carregue depois do treino-estudo.js e antes do nuvem.js.
   Precisa do Leaflet (mapa), carregado no index.html.

   - Aba Treino › subpágina "Atividades GPS".
   - Modo de treino: espera o GPS ficar preciso, contagem 3-2-1,
     ritmo atual e médio, elevação, voz a cada km, pausa automática,
     camadas do mapa (escuro, ruas, satélite, relevo).
   - Resumo: mapa com o trajeto colorido pelo ritmo, parciais,
     perfil de elevação, calorias estimadas.
   - Imagem para compartilhar (Story ou quadrado): sobre o mapa,
     sobre uma foto, fundo escuro ou transparente.
   - Esteira, bike ergométrica e outros aparelhos: registro manual.

   GPS
   - No site: GPS do navegador com a tela acesa. Se a tela
     bloquear, o trecho sem GPS entra como "estimado".
   - No app Android (Capacitor): GPS em segundo plano, grava com
     a tela bloqueada.

   Mapas: gratuitos, sem chave (créditos exibidos no mapa).

   Dados (sincronizados pelo nuvem.js)
   - personalOS_atividades     resumo de todas as atividades
   - personalOS_rota_<id>      pontos do trajeto
   - personalOS_atvConfig      peso, voz, pausa automática, camada
   - personalOS_gravacaoAtiva  gravação em andamento (só neste aparelho)
   ========================================================= */

const CHAVE_ATIVIDADES = "personalOS_atividades";
const PREFIXO_ROTA = "personalOS_rota_";
const CHAVE_ATV_CONFIG = "personalOS_atvConfig";

(() => {

const CHAVE_GRAVACAO = "personalOS_gravacaoAtiva";

const TIPOS_GPS = {
    corrida:    { nome: "Corrida",       treino: "Corrida",       ritmo: true,  velMax: 30, icone: "🏃", kcalKgKm: 1.0,  avisoKm: 1 },
    caminhada:  { nome: "Caminhada",     treino: "Caminhada",     ritmo: true,  velMax: 15, icone: "🚶", kcalKgKm: 0.55, avisoKm: 1 },
    bike:       { nome: "Bike",          treino: "Bike",          ritmo: false, velMax: 75, icone: "🚴", met: 7.5,       avisoKm: 5 },
    bike_eletr: { nome: "Bike elétrica", treino: "Bike elétrica", ritmo: false, velMax: 60, icone: "⚡", met: 4.0,       avisoKm: 5 }
};

const EQUIPAMENTOS = [
    { valor: "esteira", texto: "Esteira", treino: "Esteira", ritmo: true, kcalKgKm: 1.0, icone: "🏃" },
    { valor: "ergometrica", texto: "Bike ergométrica", treino: "Bike ergométrica", ritmo: false, met: 6.0, icone: "🚲" },
    { valor: "eliptico", texto: "Elíptico / transport", treino: "Elíptico", ritmo: false, met: 5.0, icone: "⛷" },
    { valor: "outro", texto: "Outro aparelho", treino: "Cardio", ritmo: false, met: 5.0, icone: "💪" }
];

// Filtros contra "km fantasma" do GPS
const PRECISAO_MAXIMA_M = 35;
const PRECISAO_BOA_M = 20;
const MOVIMENTO_MINIMO_M = 3;
const LACUNA_S = 25;
const AUTOPAUSA_S = 10;

// Mapas gratuitos, sem chave
const CREDITO_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const CAMADAS = {
    escuro:   { nome: "Escuro",   url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", sub: "abcd", max: 20, credito: `${CREDITO_OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>` },
    ruas:     { nome: "Ruas",     url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", sub: "abcd", max: 20, credito: `${CREDITO_OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>` },
    satelite: { nome: "Satélite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", sub: "", max: 19, credito: "Imagens &copy; Esri, Maxar, Earthstar Geographics" },
    relevo:   { nome: "Relevo",   url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", sub: "abc", max: 17, credito: `${CREDITO_OSM} · SRTM · estilo &copy; OpenTopoMap (CC-BY-SA)` }
};

const COR_TRAJETO = "#34D399";
const COR_ESTIMADO = "#FACC15";

const $a = id => document.getElementById(id);
const listaA = v => Array.isArray(v) ? v : [];


/* =========================================================
   CÁLCULOS E FORMATOS
   ========================================================= */

function distanciaM(a, b) {
    const R = 6371000;
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b[0] - a[0]);
    const dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function formatarTempo(segundos) {
    const s = Math.max(0, Math.round(segundos || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

function formatarKm(metros) {
    return ((metros || 0) / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarRitmo(segPorKm) {
    if (!segPorKm || !isFinite(segPorKm) || segPorKm > 3600) return "--";
    let m = Math.floor(segPorKm / 60);
    let s = Math.round(segPorKm % 60);
    if (s === 60) { m += 1; s = 0; }
    return `${m}'${pad(s)}"`;
}

function formatarVelocidade(kmh) {
    if (!kmh || !isFinite(kmh)) return "--";
    return kmh.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function ritmoFalado(segPorKm) {
    if (!segPorKm || !isFinite(segPorKm)) return "";
    const m = Math.floor(segPorKm / 60);
    const s = Math.round(segPorKm % 60);
    return `${m} minuto${m === 1 ? "" : "s"}${s ? ` e ${s}` : ""}`;
}

function tempoFalado(segundos) {
    const s = Math.round(segundos);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return [h ? `${h} hora${h > 1 ? "s" : ""}` : "", m ? `${m} minuto${m > 1 ? "s" : ""}` : "", !h && r ? `${r} segundos` : ""].filter(Boolean).join(" e ");
}

const infoTipo = a => TIPOS_GPS[a.tipo] || EQUIPAMENTOS.find(e => e.valor === a.equipamento) || { nome: a.nome || "Atividade", ritmo: false, met: 5, icone: "💪" };

function caloriasEstimadas(a, peso) {
    if (!peso) return null;
    const t = infoTipo(a);
    if (t.kcalKgKm && a.distancia_m) return Math.round(t.kcalKgKm * peso * (a.distancia_m / 1000));
    return Math.round((t.met || 5) * peso * ((a.duracao_s || 0) / 3600));
}


/* =========================================================
   DADOS
   ========================================================= */

function getAtividades() {
    return listaA(ler(CHAVE_ATIVIDADES, []));
}

function salvarAtividades(lista) {
    gravar(CHAVE_ATIVIDADES, lista);
}

function getRota(id) {
    const rota = ler(PREFIXO_ROTA + id, null);
    return rota && Array.isArray(rota.p) ? rota : { p: [], lacunas: [] };
}

function salvarRota(id, rota) {
    gravar(PREFIXO_ROTA + id, rota);
}

function apagarRota(id) {
    gravar(PREFIXO_ROTA + id, { p: [], lacunas: [], apagada: true });
}

function getConfig() {
    const c = ler(CHAVE_ATV_CONFIG, null) || {};
    return {
        peso: Number(c.peso) || null,
        voz: c.voz !== false,
        autoPausa: !!c.autoPausa,
        camada: CAMADAS[c.camada] ? c.camada : "escuro",
        corPorRitmo: c.corPorRitmo !== false
    };
}

function salvarConfig(mudancas) {
    gravar(CHAVE_ATV_CONFIG, { ...getConfig(), ...mudancas });
}

window.getAtividades = getAtividades;


/* =========================================================
   MAPA: camadas, trajeto e cor por ritmo
   ========================================================= */

function camadaLeaflet(id) {
    const c = CAMADAS[id] || CAMADAS.escuro;
    return L.tileLayer(c.url, { attribution: c.credito, maxZoom: c.max, subdomains: c.sub || "abc", crossOrigin: true });
}

// Botões de camada por cima do mapa
function controleCamadas(mapa, aoTrocar) {
    const Controle = L.Control.extend({
        options: { position: "topright" },
        onAdd() {
            const caixa = L.DomUtil.create("div", "atv-camadas");
            const desenhar = () => {
                const atual = getConfig().camada;
                caixa.innerHTML = Object.entries(CAMADAS).map(([id, c]) =>
                    `<button type="button" data-camada="${id}" class="${id === atual ? "ativo" : ""}">${c.nome}</button>`).join("");
            };
            desenhar();
            L.DomEvent.disableClickPropagation(caixa);
            caixa.addEventListener("click", e => {
                const id = e.target.closest("[data-camada]")?.dataset.camada;
                if (!id) return;
                salvarConfig({ camada: id });
                aoTrocar(id);
                desenhar();
            });
            return caixa;
        }
    });
    return new Controle().addTo(mapa);
}

function criarMapa(elementoId, opcoes = {}) {
    const mapa = L.map(elementoId, { zoomControl: !!opcoes.zoom, attributionControl: true });
    let base = camadaLeaflet(getConfig().camada).addTo(mapa);
    controleCamadas(mapa, id => {
        mapa.removeLayer(base);
        base = camadaLeaflet(id).addTo(mapa);
        base.bringToBack();
    });
    return mapa;
}

// Velocidade suavizada de cada ponto (média de uma janela de pontos)
function velocidades(pontos, lacunas) {
    const inicios = new Set(lacunas);
    const vel = [];
    for (let i = 1; i < pontos.length; i++) {
        if (inicios.has(i)) { vel.push(null); continue; }
        let d = 0;
        let t0 = pontos[i][2];
        let t1 = pontos[i][2];
        for (let j = Math.max(1, i - 3); j <= Math.min(pontos.length - 1, i + 3); j++) {
            if (inicios.has(j)) continue;
            d += distanciaM(pontos[j - 1], pontos[j]);
            t0 = Math.min(t0, pontos[j - 1][2]);
            t1 = Math.max(t1, pontos[j][2]);
        }
        vel.push(t1 > t0 ? (d / (t1 - t0)) * 3.6 : null);
    }
    return vel;
}

// Mais devagar (amarelo) → médio (verde) → mais rápido (ciano)
function corDoRitmo(fracao) {
    const paradas = [[0, [250, 204, 21]], [0.5, [52, 211, 153]], [1, [34, 211, 238]]];
    const f = Math.max(0, Math.min(1, fracao));
    for (let i = 1; i < paradas.length; i++) {
        if (f <= paradas[i][0]) {
            const [f0, c0] = paradas[i - 1];
            const [f1, c1] = paradas[i];
            const k = (f - f0) / (f1 - f0);
            return `rgb(${c0.map((v, n) => Math.round(v + (c1[n] - v) * k)).join(",")})`;
        }
    }
    return "rgb(34,211,238)";
}

function faixaVelocidade(vel) {
    const validas = vel.filter(v => v !== null && isFinite(v)).sort((a, b) => a - b);
    if (validas.length < 5) return null;
    return { min: validas[Math.floor(validas.length * 0.1)], max: validas[Math.floor(validas.length * 0.9)] };
}

function desenharTrajeto(mapa, grupo, pontos, lacunas, { porRitmo = false, marcadores = true } = {}) {
    grupo.clearLayers();
    if (!pontos.length) return null;

    const inicios = new Set(lacunas);
    const faixa = porRitmo ? faixaVelocidade(velocidades(pontos, lacunas)) : null;

    if (faixa && faixa.max > faixa.min) {
        // Junta segmentos vizinhos da mesma cor para ficar leve
        const vel = velocidades(pontos, lacunas);
        let atual = null;
        let trecho = [];
        const fechar = () => {
            if (trecho.length > 1) L.polyline(trecho, { color: atual, weight: 5, opacity: .95, lineCap: "round" }).addTo(grupo);
        };
        for (let i = 1; i < pontos.length; i++) {
            if (inicios.has(i) || vel[i - 1] === null) {
                fechar(); trecho = []; atual = null;
                continue;
            }
            const nivel = Math.round(((vel[i - 1] - faixa.min) / (faixa.max - faixa.min)) * 8) / 8;
            const cor = corDoRitmo(nivel);
            if (cor !== atual) {
                fechar();
                trecho = [[pontos[i - 1][0], pontos[i - 1][1]]];
                atual = cor;
            }
            trecho.push([pontos[i][0], pontos[i][1]]);
        }
        fechar();
    } else {
        let trecho = [];
        const trechos = [];
        pontos.forEach((p, i) => {
            if (i > 0 && inicios.has(i)) { trechos.push(trecho); trecho = []; }
            trecho.push([p[0], p[1]]);
        });
        trechos.push(trecho);
        trechos.filter(t => t.length > 1).forEach(t => {
            L.polyline(t, { color: COR_TRAJETO, weight: 10, opacity: .18 }).addTo(grupo);
            L.polyline(t, { color: COR_TRAJETO, weight: 4, opacity: .95 }).addTo(grupo);
        });
    }

    // Trechos sem GPS (tela bloqueada / sem sinal): tracejado
    lacunas.forEach(i => {
        if (i > 0 && pontos[i]) {
            L.polyline([[pontos[i - 1][0], pontos[i - 1][1]], [pontos[i][0], pontos[i][1]]],
                { color: COR_ESTIMADO, weight: 3, opacity: .9, dashArray: "6 8" }).addTo(grupo);
        }
    });

    if (marcadores) {
        L.circleMarker([pontos[0][0], pontos[0][1]], { radius: 7, color: "#052E16", weight: 2, fillColor: COR_TRAJETO, fillOpacity: 1 })
            .bindTooltip("Início").addTo(grupo);
    }
    return L.latLngBounds(pontos.map(p => [p[0], p[1]]));
}


/* =========================================================
   FONTE DE GPS (navegador ou app Android) e tela acesa
   ========================================================= */

function noAppAndroid() {
    return !!(window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.BackgroundGeolocation);
}

const fonteGPS = {
    id: null,

    async iniciar(aoReceber, aoErro) {
        if (this.id !== null) return noAppAndroid() ? "android" : "web";

        if (noAppAndroid()) {
            const plugin = window.Capacitor.Plugins.BackgroundGeolocation;
            this.id = await plugin.addWatcher(
                {
                    backgroundTitle: "Gideon está gravando sua atividade",
                    backgroundMessage: "Toque para voltar ao app.",
                    requestPermissions: true,
                    stale: false,
                    distanceFilter: 3
                },
                (local, erro) => {
                    if (erro) return aoErro(erro.code === "NOT_AUTHORIZED" ? "Permita a localização para o Gideon (inclusive em segundo plano)." : erro.message);
                    aoReceber({ lat: local.latitude, lng: local.longitude, precisao: local.accuracy, alt: local.altitude ?? null, tempo: local.time || Date.now() });
                }
            );
            return "android";
        }

        if (!("geolocation" in navigator)) {
            aoErro("Este navegador não tem GPS disponível.");
            return null;
        }
        this.id = navigator.geolocation.watchPosition(
            pos => aoReceber({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: pos.coords.accuracy, alt: pos.coords.altitude, tempo: pos.timestamp || Date.now() }),
            erro => { if (erro.code === 1) aoErro("Permita o uso da localização para gravar a atividade."); },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
        );
        return "web";
    },

    async parar() {
        if (this.id === null) return;
        if (noAppAndroid()) await window.Capacitor.Plugins.BackgroundGeolocation.removeWatcher({ id: this.id });
        else navigator.geolocation.clearWatch(this.id);
        this.id = null;
    }
};

const telaAcesa = {
    trava: null,
    async ligar() {
        if (noAppAndroid() || !("wakeLock" in navigator)) return;
        try { this.trava = await navigator.wakeLock.request("screen"); } catch (e) { /* sem suporte */ }
    },
    async desligar() {
        try { await this.trava?.release(); } catch (e) { /* ignora */ }
        this.trava = null;
    }
};

function falar(texto) {
    if (!getConfig().voz || !texto) return;
    if (window.gideon?.falar) { window.gideon.falar(texto); return; }
    if (!("speechSynthesis" in window)) return;
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = "pt-BR";
    speechSynthesis.speak(fala);
}


/* =========================================================
   GRAVAÇÃO
   estados: "preparando" → "gravando" ⇄ "pausada" / "auto" → fim
   ========================================================= */

let gravacao = null;
let relogio = null;
let mapaAoVivo = null;
let camadasAoVivo = null;
let seguirPosicao = true;
let ultimoFix = null;

function novaGravacao(tipo) {
    return {
        id: gerarId("atv"),
        tipo,
        estado: "preparando",
        inicio: null,
        ativoMs: 0,
        ultimoTick: Date.now(),
        distancia: 0,
        estimado: 0,
        velMax: 0,
        ganho: 0,
        altRef: null,
        parciais: [],
        marcoKm: 0,
        avisosFeitos: 0,
        ultimoMovimento: Date.now(),
        recentes: [],           // [segundos, distância] para o ritmo atual
        pontos: [],             // [lat, lng, segundos, altitude]
        lacunas: [],
        ultimaPrecisao: null,
        fonte: "web"
    };
}

const emMovimento = () => gravacao && gravacao.estado === "gravando";

function salvarGravacaoLocal() {
    if (!gravacao || gravacao.estado === "preparando") return;
    try { localStorage.setItem(CHAVE_GRAVACAO, JSON.stringify(gravacao)); } catch (e) { /* ignora */ }
}

function limparGravacaoLocal() {
    try { localStorage.removeItem(CHAVE_GRAVACAO); } catch (e) { /* ignora */ }
}

function atualizarTempo() {
    if (!gravacao) return;
    const agora = Date.now();
    if (emMovimento()) gravacao.ativoMs += agora - gravacao.ultimoTick;
    gravacao.ultimoTick = agora;
}

function ritmoAtual() {
    const r = gravacao?.recentes || [];
    if (r.length < 2) return null;
    const [t0, d0] = r[0];
    const [t1, d1] = r[r.length - 1];
    const d = d1 - d0;
    return d > 15 ? (t1 - t0) / (d / 1000) : null;
}

function receberPonto(p) {
    if (!gravacao) return;
    gravacao.ultimaPrecisao = Math.round(p.precisao || 0);
    ultimoFix = p;

    const aviso = $a("atvAviso");
    if (aviso?.classList.contains("erro")) {
        aviso.classList.remove("erro");
        aviso.textContent = textoAviso();
    }

    if (gravacao.estado === "preparando") {
        atualizarPreparo();
        if (mapaAoVivo) mapaAoVivo.setView([p.lat, p.lng], 17, { animate: false });
        desenharAoVivo();
        return;
    }
    if (gravacao.estado === "pausada") { atualizarPainel(); return; }
    if (p.precisao && p.precisao > PRECISAO_MAXIMA_M) { atualizarPainel(); return; }

    atualizarTempo();
    const t = Math.round((p.tempo - gravacao.inicio) / 1000);
    const alt = p.alt !== null && p.alt !== undefined && isFinite(p.alt) ? Math.round(p.alt) : null;
    const novo = [Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)), t, alt];
    const ultimo = gravacao.pontos[gravacao.pontos.length - 1];
    const tipo = TIPOS_GPS[gravacao.tipo];

    if (ultimo) {
        const d = distanciaM(ultimo, novo);
        const dt = Math.max(1, t - ultimo[2]);
        const kmh = (d / dt) * 3.6;
        const limite = tipo?.velMax || 60;

        // Pausa automática: voltou a andar?
        if (gravacao.estado === "auto") {
            if (d < 8) return;
            gravacao.estado = "gravando";
            gravacao.ultimoTick = Date.now();
            gravacao.lacunas.push(gravacao.pontos.length);
            gravacao.pontos.push(novo);
            gravacao.ultimoMovimento = Date.now();
            atualizarPainel();
            return;
        }

        if (d < MOVIMENTO_MINIMO_M) return;
        if (dt < LACUNA_S && kmh > limite * 1.3) return;

        if (dt >= LACUNA_S) {
            if (kmh > limite) return;
            gravacao.lacunas.push(gravacao.pontos.length);
            gravacao.estimado += d;
        } else {
            gravacao.velMax = Math.max(gravacao.velMax, kmh);
        }
        gravacao.distancia += d;
        gravacao.ultimoMovimento = Date.now();

        // Ganho de elevação (com folga de 3 m para não somar ruído)
        if (alt !== null) {
            if (gravacao.altRef === null) gravacao.altRef = alt;
            else if (alt - gravacao.altRef >= 3) { gravacao.ganho += alt - gravacao.altRef; gravacao.altRef = alt; }
            else if (gravacao.altRef - alt >= 3) gravacao.altRef = alt;
        }

        // Parciais por km e aviso de voz
        while (gravacao.distancia >= (gravacao.parciais.length + 1) * 1000) {
            gravacao.parciais.push(Math.round((gravacao.ativoMs - gravacao.marcoKm) / 1000));
            gravacao.marcoKm = gravacao.ativoMs;
        }
        const km = Math.floor(gravacao.distancia / 1000);
        const passo = tipo?.avisoKm || 1;
        if (km >= (gravacao.avisosFeitos + 1) * passo) {
            gravacao.avisosFeitos = Math.floor(km / passo);
            const seg = gravacao.ativoMs / 1000;
            falar(tipo?.ritmo
                ? `${km} quilômetro${km > 1 ? "s" : ""}. Último quilômetro em ${ritmoFalado(gravacao.parciais[gravacao.parciais.length - 1])}. Ritmo médio ${ritmoFalado(seg / km)}.`
                : `${km} quilômetros. Velocidade média ${Math.round(km / (seg / 3600))} quilômetros por hora.`);
        }
    } else if (alt !== null) {
        gravacao.altRef = alt;
    }

    gravacao.recentes.push([t, gravacao.distancia]);
    while (gravacao.recentes.length > 2 && t - gravacao.recentes[0][0] > 30) gravacao.recentes.shift();

    gravacao.pontos.push(novo);
    if (gravacao.pontos.length % 5 === 0) salvarGravacaoLocal();
    desenharAoVivo();
    atualizarPainel();
}

async function abrirModoTreino(tipo, continuar = null) {
    if (gravacao) return;
    gravacao = continuar || novaGravacao(tipo);
    gravacao.ultimoTick = Date.now();
    seguirPosicao = true;
    abrirTelaGravacao();

    const fonte = await fonteGPS.iniciar(receberPonto, mensagem => mostrarAvisoGPS(mensagem));
    if (!fonte) { await encerrarSemSalvar(); return; }
    gravacao.fonte = fonte;
    await telaAcesa.ligar();

    clearInterval(relogio);
    relogio = setInterval(() => {
        if (!gravacao) return;
        atualizarTempo();
        // Pausa automática: parado por alguns segundos
        if (getConfig().autoPausa && gravacao.estado === "gravando" && Date.now() - gravacao.ultimoMovimento > AUTOPAUSA_S * 1000) {
            gravacao.estado = "auto";
        }
        atualizarPainel();
    }, 1000);

    if (continuar) atualizarPainel();
}

function contagemRegressiva() {
    return new Promise(resolve => {
        const caixa = $a("atvContagem");
        let n = 3;
        const passo = () => {
            if (n === 0) {
                caixa.hidden = true;
                falar("Valendo!");
                resolve();
                return;
            }
            caixa.hidden = false;
            caixa.textContent = n;
            caixa.classList.remove("pulsa");
            void caixa.offsetWidth;
            caixa.classList.add("pulsa");
            n--;
            setTimeout(passo, 900);
        };
        passo();
    });
}

async function comecar() {
    if (!gravacao || gravacao.estado !== "preparando") return;
    $a("atvComecar").disabled = true;
    await contagemRegressiva();
    gravacao.estado = "gravando";
    gravacao.inicio = Date.now();
    gravacao.ultimoTick = Date.now();
    gravacao.ultimoMovimento = Date.now();
    if (ultimoFix && (!ultimoFix.precisao || ultimoFix.precisao <= PRECISAO_MAXIMA_M)) {
        const alt = ultimoFix.alt !== null && ultimoFix.alt !== undefined && isFinite(ultimoFix.alt) ? Math.round(ultimoFix.alt) : null;
        gravacao.pontos.push([Number(ultimoFix.lat.toFixed(6)), Number(ultimoFix.lng.toFixed(6)), 0, alt]);
        gravacao.altRef = alt;
    }
    salvarGravacaoLocal();
    montarControlesGravando();
    desenharAoVivo();
    atualizarPainel();
}

function alternarPausa() {
    if (!gravacao || gravacao.estado === "preparando") return;
    atualizarTempo();
    if (gravacao.estado === "pausada") {
        gravacao.estado = "gravando";
        if (gravacao.pontos.length) gravacao.lacunas.push(gravacao.pontos.length);
        gravacao.ultimoMovimento = Date.now();
    } else {
        gravacao.estado = "pausada";
    }
    salvarGravacaoLocal();
    atualizarPainel();
}

async function pararTudo() {
    clearInterval(relogio);
    relogio = null;
    await fonteGPS.parar();
    await telaAcesa.desligar();
}

async function encerrarSemSalvar() {
    await pararTudo();
    gravacao = null;
    limparGravacaoLocal();
    fecharTelaGravacao();
}

async function finalizar() {
    if (!gravacao) return;
    if (gravacao.estado === "preparando") { await encerrarSemSalvar(); return; }
    atualizarTempo();

    if (gravacao.distancia < 50 || gravacao.pontos.length < 2) {
        if (!confirm("A atividade tem menos de 50 metros. Descartar?")) return;
        await encerrarSemSalvar();
        return;
    }
    if (!confirm("Finalizar e salvar a atividade?")) return;

    await pararTudo();
    const g = gravacao;
    gravacao = null;

    const tipo = TIPOS_GPS[g.tipo];
    const duracaoS = Math.round(g.ativoMs / 1000);
    const km = g.distancia / 1000;

    const resumo = {
        id: g.id,
        tipo: g.tipo,
        nome: tipo.nome,
        origem: "gps",
        fonte: g.fonte,
        inicio: new Date(g.inicio).toISOString(),
        data: hojeISO(new Date(g.inicio)),
        duracao_s: duracaoS,
        tempo_total_s: Math.round((Date.now() - g.inicio) / 1000),
        distancia_m: Math.round(g.distancia),
        estimado_m: Math.round(g.estimado),
        ritmo_s_km: km > 0 ? Math.round(duracaoS / km) : null,
        vel_media_kmh: duracaoS > 0 ? Number((km / (duracaoS / 3600)).toFixed(1)) : null,
        vel_max_kmh: Number(g.velMax.toFixed(1)),
        ganho_m: Math.round(g.ganho),
        parciais: g.parciais,
        pontos_n: g.pontos.length,
        criada_em: new Date().toISOString()
    };

    salvarRota(g.id, { p: g.pontos, lacunas: g.lacunas });
    salvarAtividades([resumo, ...getAtividades()]);
    registrarComoTreino(resumo);
    limparGravacaoLocal();

    falar(tipo.ritmo
        ? `Atividade salva. ${formatarKm(resumo.distancia_m).replace(",", " vírgula ")} quilômetros em ${tempoFalado(duracaoS)}.`
        : `Atividade salva. ${formatarKm(resumo.distancia_m).replace(",", " vírgula ")} quilômetros.`);

    fecharTelaGravacao();
    abaTreino = "gps";
    renderizarTudo();
    abrirDetalhe(g.id);
}

function registrarComoTreino(a) {
    if (!window.treinoEstudo || !window.getTreinos) return;
    const t = infoTipo(a);
    const nomeTreino = t.treino || "Cardio";
    const diaSemana = chaveDia(DIAS_SEMANA[new Date(a.data + "T12:00").getDay()]);
    const plano = window.getTreinos().plano.find(p =>
        chaveTexto(p.tipo) === chaveTexto(nomeTreino) && (p.dias || []).some(d => chaveDia(d) === diaSemana));
    const detalhe = a.distancia_m
        ? `${formatarKm(a.distancia_m)} km · ${t.ritmo ? `${formatarRitmo(a.ritmo_s_km)}/km` : `${formatarVelocidade(a.vel_media_kmh)} km/h`}`
        : "";

    window.treinoEstudo.registrarTreinoDireto({
        tipo: nomeTreino,
        duracao: Math.max(1, Math.round(a.duracao_s / 60)),
        data: a.data,
        obs: `${detalhe}${a.origem === "gps" ? " · GPS" : ""}`,
        planoId: plano?.id || null
    });
}

function verificarGravacaoPendente() {
    const salva = ler(CHAVE_GRAVACAO, null);
    if (!salva || gravacao || !salva.inicio) return;
    if ((Date.now() - salva.ultimoTick) / 60000 > 180) { limparGravacaoLocal(); return; }
    if (confirm(`Você tinha uma atividade de ${TIPOS_GPS[salva.tipo]?.nome || "treino"} em andamento (${formatarKm(salva.distancia)} km). Continuar gravando?`)) {
        salva.estado = "pausada";
        abrirModoTreino(salva.tipo, salva).then(() => montarControlesGravando());
    } else {
        limparGravacaoLocal();
    }
}


/* =========================================================
   TELA DO MODO DE TREINO
   ========================================================= */

const textoAviso = () => noAppAndroid()
    ? "Pode bloquear a tela: o app continua gravando."
    : "Mantenha esta tela aberta. Se a tela bloquear, o trecho sem GPS entra como estimado. Gravar com a tela bloqueada: só no app Android.";

function abrirTelaGravacao() {
    let tela = $a("atvGravacao");
    if (!tela) {
        tela = document.createElement("div");
        tela.id = "atvGravacao";
        tela.className = "atv-gravacao";
        document.body.appendChild(tela);
    }

    const tipo = TIPOS_GPS[gravacao.tipo];
    tela.innerHTML = `
        <header class="atv-topo">
            <div>
                <span class="card-label">${tipo.icone} ${esc(tipo.nome.toUpperCase())}</span>
                <strong id="atvGpsStatus">Procurando GPS…</strong>
            </div>
            <div class="atv-sinal" id="atvSinal"><i></i><i></i><i></i><i></i></div>
        </header>

        <div class="atv-mapa-caixa">
            <div class="atv-mapa" id="atvMapaVivo"></div>
            <button class="atv-centralizar" type="button" id="atvCentralizar" title="Centralizar em mim">◎</button>
            <div class="atv-contagem" id="atvContagem" hidden></div>
            <div class="atv-estado" id="atvEstado" hidden></div>
        </div>

        <div class="atv-principal">
            <small id="atvRotuloPrincipal">Distância (km)</small>
            <strong id="atvDist">0,00</strong>
        </div>
        <div class="atv-numeros">
            <div><small>Tempo</small><strong id="atvTempo">0:00</strong></div>
            <div><small id="atvRotuloAtual">${tipo.ritmo ? "Ritmo atual" : "Velocidade"}</small><strong id="atvAtual">--</strong></div>
            <div><small id="atvRotuloMedio">${tipo.ritmo ? "Ritmo médio" : "Vel. média"}</small><strong id="atvMedio">--</strong></div>
            <div><small>Elevação +</small><strong id="atvGanho">0 m</strong></div>
        </div>

        <p class="atv-aviso" id="atvAviso">${textoAviso()}</p>

        <div class="atv-controles" id="atvControles"></div>
        <div class="atv-opcoes">
            <label><input type="checkbox" id="atvOpVoz" ${getConfig().voz ? "checked" : ""}> Voz a cada ${tipo.avisoKm} km</label>
            <label><input type="checkbox" id="atvOpPausa" ${getConfig().autoPausa ? "checked" : ""}> Pausa automática</label>
        </div>`;

    tela.hidden = false;
    document.body.classList.add("atv-gravando");

    $a("atvCentralizar").addEventListener("click", () => {
        seguirPosicao = true;
        const u = gravacao?.pontos[gravacao.pontos.length - 1] || (ultimoFix && [ultimoFix.lat, ultimoFix.lng]);
        if (u && mapaAoVivo) mapaAoVivo.setView([u[0], u[1]], 17);
    });
    $a("atvOpVoz").addEventListener("change", e => salvarConfig({ voz: e.target.checked }));
    $a("atvOpPausa").addEventListener("change", e => salvarConfig({ autoPausa: e.target.checked }));

    if (gravacao.estado === "preparando") montarControlesPreparo();
    else montarControlesGravando();

    criarMapaAoVivo();
    atualizarPainel();
}

function montarControlesPreparo() {
    $a("atvControles").innerHTML = `
        <button class="atv-comecar" type="button" id="atvComecar" disabled>Aguardando GPS…</button>
        <button class="link-button" type="button" id="atvCancelar">Cancelar</button>`;
    $a("atvComecar").addEventListener("click", comecar);
    $a("atvCancelar").addEventListener("click", encerrarSemSalvar);
    atualizarPreparo();
}

function montarControlesGravando() {
    const caixa = $a("atvControles");
    if (!caixa) return;
    caixa.innerHTML = `
        <div class="atv-botoes">
            <button class="secondary-button" type="button" id="atvPausar">❚❚ Pausar</button>
            <button class="atv-finalizar" type="button" id="atvFinalizar">■ Finalizar</button>
        </div>
        <button class="link-button" type="button" id="atvDescartar">Descartar atividade</button>`;
    $a("atvPausar").addEventListener("click", alternarPausa);
    $a("atvFinalizar").addEventListener("click", finalizar);
    $a("atvDescartar").addEventListener("click", () => {
        if (confirm("Descartar esta atividade? Nada será salvo.")) encerrarSemSalvar();
    });
}

function atualizarPreparo() {
    const botao = $a("atvComecar");
    if (!botao || !gravacao || gravacao.estado !== "preparando") return;
    const p = gravacao.ultimaPrecisao;
    if (p === null) {
        botao.disabled = true;
        botao.textContent = "Aguardando GPS…";
    } else if (p <= PRECISAO_BOA_M) {
        botao.disabled = false;
        botao.textContent = "▶ Começar";
        botao.classList.add("pronto");
    } else {
        botao.disabled = false;
        botao.textContent = `Começar mesmo assim (±${p} m)`;
        botao.classList.remove("pronto");
    }
    atualizarSinal();
}

function atualizarSinal() {
    const p = gravacao?.ultimaPrecisao;
    const barras = p === null || p === undefined ? 0 : p <= 8 ? 4 : p <= 15 ? 3 : p <= 25 ? 2 : 1;
    document.querySelectorAll("#atvSinal i").forEach((barra, i) => barra.classList.toggle("on", i < barras));
    const status = $a("atvGpsStatus");
    if (!status) return;
    if (!gravacao) return;
    if (gravacao.estado === "pausada") status.textContent = "Pausado";
    else if (gravacao.estado === "auto") status.textContent = "Pausa automática · parado";
    else if (p === null) status.textContent = "Procurando GPS…";
    else if (p <= PRECISAO_BOA_M) status.textContent = gravacao.estado === "preparando" ? `GPS pronto (±${p} m)` : `GPS ótimo (±${p} m)`;
    else if (p <= PRECISAO_MAXIMA_M) status.textContent = `GPS ok (±${p} m)`;
    else status.textContent = `GPS fraco (±${p} m) · vá para um lugar aberto`;
}

function fecharTelaGravacao() {
    const tela = $a("atvGravacao");
    if (tela) tela.hidden = true;
    document.body.classList.remove("atv-gravando");
    if (mapaAoVivo) { mapaAoVivo.remove(); mapaAoVivo = null; }
}

function criarMapaAoVivo() {
    if (!window.L) {
        $a("atvMapaVivo").innerHTML = `<p class="te-dica atv-sem-mapa">O mapa não carregou (sem internet?). A gravação continua normalmente.</p>`;
        return;
    }
    if (mapaAoVivo) mapaAoVivo.remove();
    mapaAoVivo = criarMapa("atvMapaVivo");
    mapaAoVivo.setView([-15.78, -47.93], 4);
    camadasAoVivo = L.layerGroup().addTo(mapaAoVivo);
    // Mexeu no mapa com o dedo: para de seguir até tocar em ◎
    mapaAoVivo.on("dragstart", () => { seguirPosicao = false; });
    desenharAoVivo();
}

function desenharAoVivo() {
    if (!mapaAoVivo || !gravacao) return;
    desenharTrajeto(mapaAoVivo, camadasAoVivo, gravacao.pontos, gravacao.lacunas);

    const ultimo = gravacao.pontos[gravacao.pontos.length - 1] || (ultimoFix && [ultimoFix.lat, ultimoFix.lng]);
    if (!ultimo) return;
    L.marker([ultimo[0], ultimo[1]], {
        icon: L.divIcon({ className: "atv-eu", html: "<span></span>", iconSize: [18, 18] })
    }).addTo(camadasAoVivo);
    if (seguirPosicao) mapaAoVivo.setView([ultimo[0], ultimo[1]], Math.max(mapaAoVivo.getZoom(), 16), { animate: true });
}

function atualizarPainel() {
    if (!gravacao || !$a("atvTempo")) return;
    const tipo = TIPOS_GPS[gravacao.tipo];
    const seg = gravacao.ativoMs / 1000;
    const km = gravacao.distancia / 1000;

    $a("atvTempo").textContent = formatarTempo(seg);
    $a("atvDist").textContent = formatarKm(gravacao.distancia);
    $a("atvGanho").textContent = `${Math.round(gravacao.ganho)} m`;

    if (tipo.ritmo) {
        $a("atvAtual").textContent = formatarRitmo(ritmoAtual());
        $a("atvMedio").textContent = km > 0.05 ? formatarRitmo(seg / km) : "--";
    } else {
        const r = ritmoAtual();
        $a("atvAtual").textContent = r ? formatarVelocidade(3600 / r) : "--";
        $a("atvMedio").textContent = seg > 0 ? formatarVelocidade(km / (seg / 3600)) : "--";
    }

    const estado = $a("atvEstado");
    if (estado) {
        const texto = gravacao.estado === "pausada" ? "PAUSADO" : gravacao.estado === "auto" ? "PAUSA AUTOMÁTICA" : "";
        estado.hidden = !texto;
        estado.textContent = texto;
    }
    const botao = $a("atvPausar");
    if (botao) botao.textContent = gravacao.estado === "pausada" ? "▶ Retomar" : "❚❚ Pausar";
    document.body.classList.toggle("atv-pausado", gravacao.estado === "pausada" || gravacao.estado === "auto");
    atualizarSinal();
}

function mostrarAvisoGPS(mensagem) {
    const aviso = $a("atvAviso");
    if (aviso) { aviso.textContent = mensagem; aviso.classList.add("erro"); }
}

document.addEventListener("visibilitychange", () => {
    if (!gravacao || document.visibilityState !== "visible") return;
    telaAcesa.ligar();
    atualizarTempo();
    atualizarPainel();
});


/* =========================================================
   MINI-MAPA (lista) e gráficos simples (SVG)
   ========================================================= */

function projetarPlano(pontos, largura, altura, margem) {
    const lat0 = pontos[0][0] * Math.PI / 180;
    const xy = pontos.map(p => [p[1] * Math.cos(lat0), -p[0]]);
    const xs = xy.map(p => p[0]);
    const ys = xy.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const escala = Math.min((largura - margem * 2) / ((maxX - minX) || 1e-9), (altura - margem * 2) / ((maxY - minY) || 1e-9));
    const offX = (largura - (maxX - minX) * escala) / 2;
    const offY = (altura - (maxY - minY) * escala) / 2;
    return xy.map(([x, y]) => [offX + (x - minX) * escala, offY + (y - minY) * escala]);
}

function miniMapaSVG(pontos, lacunas = []) {
    if (pontos.length < 2) return `<svg class="atv-mini" viewBox="0 0 120 80"><text x="60" y="44" text-anchor="middle">sem GPS</text></svg>`;
    const xy = projetarPlano(pontos, 120, 80, 8);
    const inicios = new Set(lacunas);
    let d = "";
    xy.forEach((p, i) => { d += `${i === 0 || inicios.has(i) ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)} `; });
    return `
        <svg class="atv-mini" viewBox="0 0 120 80" aria-hidden="true">
            <path d="${d}" class="atv-mini-brilho"/>
            <path d="${d}" class="atv-mini-linha"/>
            <circle cx="${xy[0][0].toFixed(1)}" cy="${xy[0][1].toFixed(1)}" r="3" class="atv-mini-inicio"/>
        </svg>`;
}

function perfilElevacaoSVG(pontos) {
    const comAlt = pontos.filter(p => p[3] !== null && p[3] !== undefined);
    if (comAlt.length < 10) return "";
    let acumulado = 0;
    const serie = [[0, comAlt[0][3]]];
    for (let i = 1; i < comAlt.length; i++) {
        acumulado += distanciaM(comAlt[i - 1], comAlt[i]);
        serie.push([acumulado, comAlt[i][3]]);
    }
    const maxD = acumulado || 1;
    const alts = serie.map(s => s[1]);
    const minA = Math.min(...alts), maxA = Math.max(...alts);
    const faixa = Math.max(10, maxA - minA);
    const W = 600, H = 120;
    const pts = serie.map(([d, a]) => `${((d / maxD) * W).toFixed(1)},${(H - 8 - ((a - minA) / faixa) * (H - 24)).toFixed(1)}`);
    return `
        <h4 class="te-secao">Perfil de elevação</h4>
        <svg class="atv-elevacao" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="atvElevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#34D399" stop-opacity=".45"/><stop offset="1" stop-color="#34D399" stop-opacity="0"/>
            </linearGradient></defs>
            <polygon points="0,${H} ${pts.join(" ")} ${W},${H}" fill="url(#atvElevGrad)"/>
            <polyline points="${pts.join(" ")}" fill="none" stroke="#34D399" stroke-width="2"/>
        </svg>
        <div class="atv-elevacao-legenda"><span>${Math.round(minA)} m</span><span>${Math.round(maxA)} m</span></div>`;
}


/* =========================================================
   DETALHE (resumo do treino)
   ========================================================= */

let mapaDetalhe = null;

function abrirDetalhe(id) {
    const a = getAtividades().find(x => x.id === id);
    if (!a) return;
    const rota = getRota(id);
    const t = infoTipo(a);
    const cfg = getConfig();
    const kcal = caloriasEstimadas(a, cfg.peso);

    let modal = $a("atvDetalhe");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "atvDetalhe";
        modal.className = "login-screen modal-screen";
        document.body.appendChild(modal);
        modal.addEventListener("mousedown", e => { if (e.target === modal) fecharDetalhe(); });
    }

    const quando = new Date(a.inicio || a.data + "T12:00").toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const melhor = a.parciais?.length ? Math.min(...a.parciais) : null;

    modal.innerHTML = `
        <div class="login-card atv-detalhe-card">
            <div class="card-header">
                <div>
                    <span class="card-label">${t.icone || ""} ${esc((a.nome || "Atividade").toUpperCase())}${a.origem === "manual" ? " · MANUAL" : ""}</span>
                    <h1>${a.distancia_m ? `${formatarKm(a.distancia_m)} km` : formatarTempo(a.duracao_s)}</h1>
                    <p>${esc(quando)}</p>
                </div>
                <button class="jarvis-icon" type="button" id="atvFecharDetalhe" aria-label="Fechar">✕</button>
            </div>

            ${a.origem === "gps" ? `
                <div class="atv-mapa-caixa">
                    <div class="atv-mapa atv-mapa-detalhe" id="atvMapaDetalhe"></div>
                    <label class="atv-ritmo-toggle"><input type="checkbox" id="atvPorRitmo" ${cfg.corPorRitmo ? "checked" : ""}> Cor por ritmo</label>
                </div>
                ${cfg.corPorRitmo ? `<div class="atv-escala"><span>mais devagar</span><i></i><span>mais rápido</span></div>` : ""}` : ""}

            <div class="atv-numeros atv-numeros-detalhe">
                <div><small>Tempo em movimento</small><strong>${formatarTempo(a.duracao_s)}</strong></div>
                ${a.distancia_m ? `<div><small>Distância</small><strong>${formatarKm(a.distancia_m)} km</strong></div>` : ""}
                ${a.distancia_m ? `<div><small>${t.ritmo ? "Ritmo médio" : "Velocidade média"}</small><strong>${t.ritmo ? `${formatarRitmo(a.ritmo_s_km)}/km` : `${formatarVelocidade(a.vel_media_kmh)} km/h`}</strong></div>` : ""}
                ${a.ganho_m ? `<div><small>Ganho de elevação</small><strong>${a.ganho_m} m</strong></div>` : ""}
                ${a.vel_max_kmh ? `<div><small>Velocidade máx.</small><strong>${formatarVelocidade(a.vel_max_kmh)} km/h</strong></div>` : ""}
                <div><small>Calorias (estimadas)</small><strong>${kcal ? `${kcal.toLocaleString("pt-BR")} kcal` : `<button class="text-button" type="button" id="atvPedirPeso">informar peso</button>`}</strong></div>
            </div>

            ${a.estimado_m ? `<p class="atv-estimado">⚠ ${formatarKm(a.estimado_m)} km foram estimados (trecho sem GPS: tela bloqueada ou sem sinal). No mapa, a linha tracejada amarela.</p>` : ""}
            ${a.obs ? `<p class="te-dica">${esc(a.obs)}</p>` : ""}

            ${a.parciais?.length ? `
                <h4 class="te-secao">Parciais por km</h4>
                <div class="atv-parciais">
                    ${a.parciais.map((s, i) => `
                        <div class="${s === melhor ? "melhor" : ""}">
                            <span>km ${i + 1}</span>
                            <strong>${t.ritmo ? formatarRitmo(s) : `${formatarVelocidade(3600 / s)} km/h`}</strong>
                            <i style="width:${Math.round((melhor / s) * 100)}%"></i>
                        </div>`).join("")}
                </div>` : ""}

            ${a.origem === "gps" ? perfilElevacaoSVG(rota.p) : ""}

            <div class="modal-acoes atv-acoes-detalhe">
                <button class="save-button" type="button" id="atvCompartilhar">📸 Criar imagem para postar</button>
                <button class="delete-button" type="button" id="atvExcluir">Excluir</button>
            </div>
        </div>`;

    modal.hidden = false;
    $a("atvFecharDetalhe").addEventListener("click", fecharDetalhe);
    $a("atvExcluir").addEventListener("click", () => excluirAtividade(id));
    $a("atvCompartilhar").addEventListener("click", () => abrirCompartilhar(id));
    $a("atvPedirPeso")?.addEventListener("click", () => {
        const peso = Number(String(prompt("Seu peso em kg (para estimar calorias):", "") || "").replace(",", "."));
        if (peso > 20 && peso < 300) { salvarConfig({ peso }); abrirDetalhe(id); }
    });
    $a("atvPorRitmo")?.addEventListener("change", e => { salvarConfig({ corPorRitmo: e.target.checked }); abrirDetalhe(id); });

    if (a.origem === "gps" && window.L) {
        if (mapaDetalhe) mapaDetalhe.remove();
        mapaDetalhe = criarMapa("atvMapaDetalhe", { zoom: true });
        const grupo = L.layerGroup().addTo(mapaDetalhe);
        const limites = desenharTrajeto(mapaDetalhe, grupo, rota.p, rota.lacunas || [], { porRitmo: cfg.corPorRitmo });
        const fim = rota.p[rota.p.length - 1];
        if (fim) {
            L.circleMarker([fim[0], fim[1]], { radius: 7, color: "#0B1222", weight: 2, fillColor: "#F8FAFC", fillOpacity: 1 }).bindTooltip("Fim").addTo(grupo);
        }
        setTimeout(() => {
            mapaDetalhe.invalidateSize();
            if (limites) mapaDetalhe.fitBounds(limites, { padding: [28, 28] });
            else mapaDetalhe.setView([-15.78, -47.93], 4);
        }, 60);
    }
}

function fecharDetalhe() {
    const modal = $a("atvDetalhe");
    if (modal) modal.hidden = true;
    if (mapaDetalhe) { mapaDetalhe.remove(); mapaDetalhe = null; }
}

function excluirAtividade(id) {
    if (!confirm("Excluir esta atividade e o trajeto? O treino registrado na aba Treino continua (dá para apagar lá).")) return;
    salvarAtividades(getAtividades().filter(a => a.id !== id));
    apagarRota(id);
    fecharDetalhe();
    renderizarTudo();
}

document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($a("atvCompartilhar") && $a("atvShare") && !$a("atvShare").hidden) { fecharCompartilhar(); return; }
    if ($a("atvDetalhe") && !$a("atvDetalhe").hidden) fecharDetalhe();
});


/* =========================================================
   IMAGEM PARA COMPARTILHAR (estilo "story")
   ========================================================= */

const share = { id: null, estilo: "mapa", formato: "story", privacidade: true, foto: null, gerando: false };

function abrirCompartilhar(id) {
    share.id = id;
    let modal = $a("atvShare");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "atvShare";
        modal.className = "login-screen modal-screen atv-share-tela";
        document.body.appendChild(modal);
        modal.addEventListener("mousedown", e => { if (e.target === modal) fecharCompartilhar(); });
    }

    const a = getAtividades().find(x => x.id === id);
    const temRota = a?.origem === "gps" && getRota(id).p.length > 1;
    if (!temRota && (share.estilo === "mapa")) share.estilo = "escuro";

    const opcao = (grupo, valor, texto) =>
        `<button class="plano-chip ${share[grupo] === valor ? "active" : ""}" type="button" data-share-${grupo}="${valor}">${texto}</button>`;

    modal.innerHTML = `
        <div class="login-card atv-share-card">
            <div class="card-header">
                <div><span class="card-label">COMPARTILHAR</span><h1>Imagem do treino</h1></div>
                <button class="jarvis-icon" type="button" id="atvFecharShare" aria-label="Fechar">✕</button>
            </div>

            <div class="atv-share-corpo">
                <div class="atv-share-previa ${share.formato}"><canvas id="atvCanvas"></canvas><span class="atv-share-carregando" id="atvShareCarregando">Gerando…</span></div>

                <div class="atv-share-opcoes">
                    <span class="card-label">ESTILO</span>
                    <div class="plano-chips">
                        ${temRota ? opcao("estilo", "mapa", "🗺 Mapa") : ""}
                        ${opcao("estilo", "foto", "📷 Sobre foto")}
                        ${opcao("estilo", "escuro", "◼ Escuro")}
                        ${opcao("estilo", "transparente", "◻ Transparente")}
                    </div>

                    ${share.estilo === "foto" ? `
                        <label class="secondary-button atv-foto-botao">
                            ${share.foto ? "Trocar foto" : "Tirar ou escolher foto"}
                            <input type="file" accept="image/*" id="atvFotoInput" hidden>
                        </label>` : ""}

                    <span class="card-label">FORMATO</span>
                    <div class="plano-chips">
                        ${opcao("formato", "story", "Story 9:16")}
                        ${opcao("formato", "quadrado", "Quadrado 1:1")}
                    </div>

                    ${temRota ? `<label class="atv-check"><input type="checkbox" id="atvPrivacidade" ${share.privacidade ? "checked" : ""}> Ocultar início e fim (200 m)</label>` : ""}
                    ${share.estilo === "transparente" ? `<p class="te-dica">Fundo transparente: cole por cima de uma foto nos stories.</p>` : ""}
                    ${share.estilo === "mapa" ? `<p class="te-dica">Usa a camada escolhida no mapa (${CAMADAS[getConfig().camada].nome}).</p>` : ""}

                    <div class="atv-share-acoes">
                        <button class="save-button" type="button" id="atvShareEnviar">Compartilhar</button>
                        <button class="secondary-button" type="button" id="atvShareBaixar">Baixar imagem</button>
                    </div>
                    <p class="form-message error" id="atvShareErro"></p>
                </div>
            </div>
        </div>`;

    modal.hidden = false;

    modal.querySelectorAll("[data-share-estilo]").forEach(b => b.addEventListener("click", () => { share.estilo = b.dataset.shareEstilo; abrirCompartilhar(id); }));
    modal.querySelectorAll("[data-share-formato]").forEach(b => b.addEventListener("click", () => { share.formato = b.dataset.shareFormato; abrirCompartilhar(id); }));
    $a("atvPrivacidade")?.addEventListener("change", e => { share.privacidade = e.target.checked; gerarImagem(); });
    $a("atvFecharShare").addEventListener("click", fecharCompartilhar);
    $a("atvShareBaixar").addEventListener("click", () => exportar(false));
    $a("atvShareEnviar").addEventListener("click", () => exportar(true));
    $a("atvFotoInput")?.addEventListener("change", e => {
        const arquivo = e.target.files?.[0];
        if (!arquivo) return;
        const img = new Image();
        img.onload = () => { share.foto = img; abrirCompartilhar(id); };
        img.src = URL.createObjectURL(arquivo);
    });

    gerarImagem();
}

function fecharCompartilhar() {
    const modal = $a("atvShare");
    if (modal) modal.hidden = true;
}

// Corta os primeiros e últimos metros (para não mostrar onde você mora)
function aplicarPrivacidade(pontos) {
    if (!share.privacidade || pontos.length < 4) return pontos;
    const corte = 200;
    let ini = 0, d = 0;
    while (ini < pontos.length - 2 && d < corte) { d += distanciaM(pontos[ini], pontos[ini + 1]); ini++; }
    let fim = pontos.length - 1; d = 0;
    while (fim > ini + 1 && d < corte) { d += distanciaM(pontos[fim - 1], pontos[fim]); fim--; }
    return fim - ini >= 2 ? pontos.slice(ini, fim + 1) : pontos;
}

function textoAtividade(a) {
    const t = infoTipo(a);
    const itens = [];
    if (a.distancia_m) itens.push(["Distância", `${formatarKm(a.distancia_m)} km`]);
    itens.push(["Tempo", formatarTempo(a.duracao_s)]);
    if (a.distancia_m) itens.push(t.ritmo ? ["Ritmo", `${formatarRitmo(a.ritmo_s_km)} /km`] : ["Velocidade", `${formatarVelocidade(a.vel_media_kmh)} km/h`]);
    if (a.ganho_m) itens.push(["Elevação", `${a.ganho_m} m`]);
    else {
        const kcal = caloriasEstimadas(a, getConfig().peso);
        if (kcal) itens.push(["Calorias", `${kcal} kcal`]);
    }
    return itens.slice(0, 4);
}

// Projeção Web Mercator (a mesma dos mapas)
function mercator(lat, lng, z) {
    const n = 256 * 2 ** z;
    const r = lat * Math.PI / 180;
    return [((lng + 180) / 360) * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n];
}

function carregarImagem(url) {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const fim = setTimeout(() => resolve(null), 8000);
        img.onload = () => { clearTimeout(fim); resolve(img); };
        img.onerror = () => { clearTimeout(fim); resolve(null); };
        img.src = url;
    });
}

function urlTile(camada, z, x, y) {
    const c = CAMADAS[camada];
    const sub = c.sub ? c.sub[(x + y) % c.sub.length] : "";
    return c.url.replace("{s}", sub).replace("{z}", z).replace("{x}", x).replace("{y}", y).replace("{r}", "");
}

async function desenharFundoMapa(ctx, W, H, pontos, area) {
    // Escolhe o maior zoom em que o trajeto cabe na área
    let z = 17;
    for (; z > 3; z--) {
        const xy = pontos.map(p => mercator(p[0], p[1], z));
        const larg = Math.max(...xy.map(p => p[0])) - Math.min(...xy.map(p => p[0]));
        const alt = Math.max(...xy.map(p => p[1])) - Math.min(...xy.map(p => p[1]));
        if (larg <= area.w && alt <= area.h) break;
    }
    const xy = pontos.map(p => mercator(p[0], p[1], z));
    const cx = (Math.max(...xy.map(p => p[0])) + Math.min(...xy.map(p => p[0]))) / 2;
    const cy = (Math.max(...xy.map(p => p[1])) + Math.min(...xy.map(p => p[1]))) / 2;
    const origemX = cx - (area.x + area.w / 2);
    const origemY = cy - (area.y + area.h / 2);

    const camada = getConfig().camada;
    const tiles = [];
    for (let tx = Math.floor(origemX / 256); tx <= Math.floor((origemX + W) / 256); tx++) {
        for (let ty = Math.floor(origemY / 256); ty <= Math.floor((origemY + H) / 256); ty++) {
            tiles.push({ tx, ty });
        }
    }
    const imagens = await Promise.all(tiles.map(t => carregarImagem(urlTile(camada, z, t.tx, t.ty))));
    let desenhou = 0;
    imagens.forEach((img, i) => {
        if (!img) return;
        ctx.drawImage(img, tiles[i].tx * 256 - origemX, tiles[i].ty * 256 - origemY, 256, 256);
        desenhou++;
    });

    return { ok: desenhou > 0, projetar: p => { const [x, y] = mercator(p[0], p[1], z); return [x - origemX, y - origemY]; } };
}

function desenharLinha(ctx, xy, lacunas, cor, larguraBase) {
    const inicios = new Set(lacunas);
    const caminho = () => {
        ctx.beginPath();
        xy.forEach(([x, y], i) => (i === 0 || inicios.has(i) ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = cor;
    ctx.globalAlpha = .25;
    ctx.lineWidth = larguraBase * 3;
    caminho(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = larguraBase;
    caminho(); ctx.stroke();
}

async function gerarImagem() {
    const canvas = $a("atvCanvas");
    const a = getAtividades().find(x => x.id === share.id);
    if (!canvas || !a || share.gerando) return;
    share.gerando = true;
    $a("atvShareCarregando").hidden = false;
    $a("atvShareErro").textContent = "";

    const W = 1080;
    const H = share.formato === "story" ? 1920 : 1080;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    const rota = getRota(share.id);
    // Lacunas são índices: na versão sem início/fim, recalcula a partir dos pontos cortados
    const original = rota.p;
    const cortados = a.origem === "gps" ? aplicarPrivacidade(original) : [];
    const desloc = original.indexOf(cortados[0]);
    const lacunas = (rota.lacunas || []).map(i => i - desloc).filter(i => i > 0 && i < cortados.length);

    const story = share.formato === "story";
    const areaRota = story ? { x: 90, y: 230, w: 900, h: 900 } : { x: 90, y: 150, w: 900, h: 480 };
    let projetar = null;
    let fundoMapa = false;

    // Fundo
    if (share.estilo === "escuro") {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#0B1426"); g.addColorStop(1, "#05080F");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "rgba(126,160,230,.06)"; ctx.lineWidth = 2;
        for (let x = 0; x < W; x += 72) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 72) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    } else if (share.estilo === "foto") {
        if (share.foto) {
            const img = share.foto;
            const escala = Math.max(W / img.width, H / img.height);
            ctx.drawImage(img, (W - img.width * escala) / 2, (H - img.height * escala) / 2, img.width * escala, img.height * escala);
        } else {
            ctx.fillStyle = "#121B2E"; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = "#8C9BB3"; ctx.font = "500 40px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
            ctx.fillText("Toque em “Tirar ou escolher foto”", W / 2, H / 2);
        }
        const g = ctx.createLinearGradient(0, H * .35, 0, H);
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.78)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (share.estilo === "mapa" && cortados.length > 1) {
        ctx.fillStyle = "#0B1222"; ctx.fillRect(0, 0, W, H);
        const r = await desenharFundoMapa(ctx, W, H, cortados, areaRota);
        projetar = r.projetar;
        fundoMapa = r.ok;
        // Escurece a parte de baixo para ler os números
        const g = ctx.createLinearGradient(0, H * .45, 0, H);
        g.addColorStop(0, "rgba(5,8,15,0)"); g.addColorStop(1, "rgba(5,8,15,.92)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // Trajeto
    if (cortados.length > 1) {
        const xy = projetar ? cortados.map(projetar) : projetarPlano(cortados, areaRota.w, areaRota.h, 30).map(([x, y]) => [x + areaRota.x, y + areaRota.y]);
        const cor = share.estilo === "foto" || share.estilo === "transparente" ? "#FFFFFF" : "#34D399";
        desenharLinha(ctx, xy, lacunas, cor, story ? 12 : 10);
        if (!share.privacidade) {
            ctx.fillStyle = "#34D399"; ctx.beginPath(); ctx.arc(xy[0][0], xy[0][1], 14, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#F8FAFC"; ctx.beginPath(); ctx.arc(xy[xy.length - 1][0], xy[xy.length - 1][1], 14, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Textos
    const t = infoTipo(a);
    const branco = "#FFFFFF";
    const suave = share.estilo === "transparente" ? "rgba(255,255,255,.85)" : "rgba(234,240,250,.72)";
    ctx.textAlign = "left";
    ctx.shadowColor = share.estilo === "escuro" ? "transparent" : "rgba(0,0,0,.45)";
    ctx.shadowBlur = share.estilo === "escuro" ? 0 : 16;

    const quando = new Date(a.inicio || a.data + "T12:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    const topoY = story ? 130 : 90;
    ctx.fillStyle = "#34D399";
    ctx.font = "700 34px Inter, system-ui, sans-serif";
    ctx.fillText(`${t.icone || ""} ${(a.nome || "Atividade").toUpperCase()}`, 90, topoY);
    ctx.fillStyle = suave;
    ctx.font = "500 32px Inter, system-ui, sans-serif";
    ctx.fillText(quando, 90, topoY + 46);

    const itens = textoAtividade(a);
    const baseY = story ? 1300 : 720;
    const colunas = 2;
    itens.forEach(([rotulo, valor], i) => {
        const x = 90 + (i % colunas) * 470;
        const y = baseY + Math.floor(i / colunas) * (story ? 230 : 170);
        ctx.fillStyle = suave;
        ctx.font = `500 ${story ? 36 : 32}px Inter, system-ui, sans-serif`;
        ctx.fillText(rotulo, x, y);
        ctx.fillStyle = branco;
        // Diminui a fonte até o valor caber na coluna (não encosta no vizinho)
        let tamanho = story ? 104 : 84;
        do {
            ctx.font = `700 ${tamanho}px Inter, system-ui, sans-serif`;
            tamanho -= 4;
        } while (ctx.measureText(valor).width > 430 && tamanho > 40);
        ctx.fillText(valor, x, y + (story ? 112 : 92));
    });

    // Marca
    ctx.shadowBlur = 0;
    ctx.fillStyle = share.estilo === "transparente" ? "rgba(255,255,255,.9)" : "rgba(94,230,245,.9)";
    ctx.font = "800 34px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("GIDEON", W - 90, H - 80);
    if (share.estilo === "mapa" && fundoMapa) {
        ctx.fillStyle = "rgba(234,240,250,.5)";
        ctx.font = "400 18px Inter, system-ui, sans-serif";
        ctx.fillText(CAMADAS[getConfig().camada].credito.replace(/<[^>]+>/g, "").replace(/&copy;/g, "©"), W - 90, H - 40);
    }

    // Mapa bloqueado para exportar (segurança do navegador)? Refaz sem o mapa
    try {
        canvas.toDataURL("image/png");
    } catch (e) {
        share.gerando = false;
        share.estilo = "escuro";
        $a("atvShareErro").textContent = "O mapa não pôde ser usado na imagem neste navegador. Troquei para o estilo Escuro.";
        abrirCompartilhar(share.id);
        return;
    }

    $a("atvShareCarregando").hidden = true;
    share.gerando = false;
}

function exportar(compartilhar) {
    const canvas = $a("atvCanvas");
    const a = getAtividades().find(x => x.id === share.id);
    if (!canvas || !a) return;

    canvas.toBlob(async blob => {
        if (!blob) { $a("atvShareErro").textContent = "Não consegui gerar a imagem."; return; }
        const nome = `gideon-${(a.nome || "atividade").toLowerCase().replace(/\s+/g, "-")}-${a.data}.png`;
        const arquivo = new File([blob], nome, { type: "image/png" });

        if (compartilhar && navigator.canShare?.({ files: [arquivo] })) {
            try {
                await navigator.share({ files: [arquivo], title: `${a.nome} · ${formatarKm(a.distancia_m)} km` });
                return;
            } catch (e) {
                if (e.name === "AbortError") return;
            }
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = nome;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 2000);
        if (compartilhar) $a("atvShareErro").textContent = "Este navegador não abre o compartilhamento direto; a imagem foi baixada para você postar.";
    }, "image/png");
}


/* =========================================================
   ESTEIRA / APARELHOS (sem GPS)
   ========================================================= */

function registrarManual() {
    if (typeof window.abrirFormularioTE !== "function") return;
    window.abrirFormularioTE({
        titulo: "Esteira ou aparelho",
        texto: "Sem GPS: use os números do painel do aparelho.",
        botao: "Salvar atividade",
        campos: [
            { nome: "equipamento", rotulo: "Aparelho", tipo: "select", obrigatorio: true, opcoes: EQUIPAMENTOS.map(e => ({ valor: e.valor, texto: e.texto })), valor: "esteira" },
            { nome: "data", rotulo: "Data", tipo: "date", obrigatorio: true, valor: hojeISO() },
            { nome: "duracao", rotulo: "Tempo (min)", tipo: "number", min: 1, passo: 1, obrigatorio: true, valor: 30 },
            { nome: "distancia", rotulo: "Distância (km)", tipo: "number", min: 0, passo: 0.01, valor: "" },
            { nome: "obs", rotulo: "Observação", tipo: "textarea", linhas: 2, placeholder: "Ex.: inclinação 3%, carga 8" }
        ],
        aoSalvar: v => {
            const eq = EQUIPAMENTOS.find(e => e.valor === v.equipamento) || EQUIPAMENTOS[0];
            const duracaoS = Math.round((v.duracao || 0) * 60);
            const km = Number(v.distancia) || 0;
            const resumo = {
                id: gerarId("atv"), tipo: "aparelho", equipamento: eq.valor, nome: eq.texto, origem: "manual",
                inicio: new Date(v.data + "T12:00").toISOString(), data: v.data,
                duracao_s: duracaoS, tempo_total_s: duracaoS, distancia_m: Math.round(km * 1000), estimado_m: 0,
                ritmo_s_km: km > 0 ? Math.round(duracaoS / km) : null,
                vel_media_kmh: km > 0 && duracaoS > 0 ? Number((km / (duracaoS / 3600)).toFixed(1)) : null,
                vel_max_kmh: null, ganho_m: 0, parciais: [], obs: v.obs, criada_em: new Date().toISOString()
            };
            salvarAtividades([resumo, ...getAtividades()]);
            registrarComoTreino(resumo);
            abaTreino = "gps";
        }
    });
}


/* =========================================================
   SUBPÁGINA "ATIVIDADES GPS" (aba Treino)
   ========================================================= */

let tipoEscolhido = "corrida";
let abaTreino = "geral";

function recordes(lista) {
    const gps = lista.filter(a => a.origem === "gps");
    const maior = [...gps].sort((a, b) => b.distancia_m - a.distancia_m)[0];
    const corridas = gps.filter(a => a.tipo === "corrida" && a.distancia_m >= 1000 && a.ritmo_s_km);
    const ritmo = [...corridas].sort((a, b) => a.ritmo_s_km - b.ritmo_s_km)[0];
    const km1 = gps.filter(a => a.tipo === "corrida" && a.parciais?.length).map(a => ({ a, s: Math.min(...a.parciais) })).sort((x, y) => x.s - y.s)[0];
    const ini = new Date(); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7));
    const semana = lista.filter(a => new Date(a.data + "T12:00") >= ini);
    return {
        maior, ritmo, km1,
        kmSemana: semana.reduce((t, a) => t + (a.distancia_m || 0), 0),
        tempoSemana: semana.reduce((t, a) => t + (a.duracao_s || 0), 0),
        qtdSemana: semana.length
    };
}

function aplicarAbaTreino() {
    const geral = $a("treinoConteudo");
    const gps = $a("atividadesConteudo");
    if (geral) geral.hidden = abaTreino !== "geral";
    if (gps) gps.hidden = abaTreino !== "gps";
    document.querySelectorAll('[data-action="treino-aba"]').forEach(b => {
        b.classList.toggle("active", b.dataset.id === abaTreino);
        b.setAttribute("aria-selected", String(b.dataset.id === abaTreino));
    });
}

function renderizarAtividades() {
    aplicarAbaTreino();
    const alvo = $a("atividadesConteudo");
    if (!alvo || abaTreino !== "gps") return;

    const ativo = document.activeElement;
    const foco = ativo && alvo.contains(ativo) && ativo.id ? ativo.id : null;

    const lista = getAtividades().sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
    const r = recordes(lista);
    const cfg = getConfig();

    alvo.innerHTML = `
        <article class="card te-bloco atv-iniciar">
            <div class="card-header">
                <div>
                    <span class="card-label">MODO DE TREINO</span>
                    <h3>Gravar atividade com GPS</h3>
                </div>
                <button class="secondary-button" type="button" data-action="atv-manual">Esteira / aparelho</button>
            </div>
            <div class="atv-tipos-grade">
                ${Object.entries(TIPOS_GPS).map(([id, t]) => `
                    <button class="atv-tipo ${tipoEscolhido === id ? "ativo" : ""}" type="button" data-action="atv-tipo" data-id="${id}">
                        <span>${t.icone}</span>${t.nome}
                    </button>`).join("")}
            </div>
            <div class="atv-iniciar-linha">
                <button class="atv-botao-iniciar" type="button" data-action="atv-iniciar">▶ Abrir modo de treino</button>
                <div class="atv-config">
                    <label><input type="checkbox" id="atvCfgVoz" ${cfg.voz ? "checked" : ""}> Gideon fala a cada km</label>
                    <label><input type="checkbox" id="atvCfgPausa" ${cfg.autoPausa ? "checked" : ""}> Pausa automática</label>
                    <label>Peso <input type="number" id="atvCfgPeso" min="20" max="300" step="0.1" value="${cfg.peso || ""}" placeholder="kg"> <span class="opcional">(calorias)</span></label>
                </div>
            </div>
            <p class="te-dica">${noAppAndroid()
                ? "No app Android a gravação continua com a tela bloqueada."
                : "No site, mantenha a tela aberta durante a atividade. Gravar com a tela bloqueada: só no app Android."}</p>
        </article>

        <div class="te-stats te-stats-4 atv-recordes">
            <article class="card te-stat">
                <span class="card-label">ESTA SEMANA</span>
                <strong>${formatarKm(r.kmSemana)}<small> km · ${r.qtdSemana} ${r.qtdSemana === 1 ? "atividade" : "atividades"}</small></strong>
            </article>
            <article class="card te-stat">
                <span class="card-label">MAIOR DISTÂNCIA</span>
                <strong class="te-stat-texto">${r.maior ? `${formatarKm(r.maior.distancia_m)} km<small> · ${esc(r.maior.nome)}</small>` : "<small>grave a primeira</small>"}</strong>
            </article>
            <article class="card te-stat">
                <span class="card-label">MELHOR RITMO (CORRIDA)</span>
                <strong class="te-stat-texto">${r.ritmo ? `${formatarRitmo(r.ritmo.ritmo_s_km)}<small> /km · ${formatarKm(r.ritmo.distancia_m)} km</small>` : "<small>corra 1 km ou mais</small>"}</strong>
            </article>
            <article class="card te-stat">
                <span class="card-label">KM MAIS RÁPIDO</span>
                <strong class="te-stat-texto">${r.km1 ? `${formatarRitmo(r.km1.s)}<small> · ${dataCurta(r.km1.a.data)}</small>` : "<small>—</small>"}</strong>
            </article>
        </div>

        <article class="card te-bloco">
            <div class="card-header">
                <div><span class="card-label">HISTÓRICO</span><h3>Atividades</h3></div>
                <span class="count-badge">${lista.length}</span>
            </div>
            <div class="atv-lista">
                ${lista.length ? lista.slice(0, 30).map(a => {
                    const t = infoTipo(a);
                    const rota = a.origem === "gps" ? getRota(a.id) : { p: [], lacunas: [] };
                    return `
                    <button class="atv-item" type="button" data-action="atv-abrir" data-id="${esc(a.id)}">
                        ${a.origem === "gps" ? miniMapaSVG(rota.p, rota.lacunas) : `<span class="atv-mini atv-mini-icone">${t.icone || "💪"}</span>`}
                        <span class="atv-item-info">
                            <strong>${esc(a.nome)}${a.estimado_m ? " · <em>parte estimada</em>" : ""}</strong>
                            <small>${new Date(a.inicio).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</small>
                        </span>
                        <span class="atv-item-num"><strong>${a.distancia_m ? formatarKm(a.distancia_m) : "—"}</strong><small>km</small></span>
                        <span class="atv-item-num"><strong>${formatarTempo(a.duracao_s)}</strong><small>tempo</small></span>
                        <span class="atv-item-num"><strong>${a.distancia_m ? (t.ritmo ? formatarRitmo(a.ritmo_s_km) : formatarVelocidade(a.vel_media_kmh)) : "—"}</strong><small>${t.ritmo ? "/km" : "km/h"}</small></span>
                    </button>`;
                }).join("") : vazio("Grave sua primeira atividade: escolha o tipo e toque em ▶ Abrir modo de treino.")}
            </div>
        </article>`;

    $a("atvCfgVoz").addEventListener("change", e => salvarConfig({ voz: e.target.checked }));
    $a("atvCfgPausa").addEventListener("change", e => salvarConfig({ autoPausa: e.target.checked }));
    $a("atvCfgPeso").addEventListener("change", e => {
        const peso = Number(String(e.target.value).replace(",", "."));
        salvarConfig({ peso: peso > 20 && peso < 300 ? peso : null });
    });
    if (foco) $a(foco)?.focus();
}


/* =========================================================
   LIGAÇÕES
   ========================================================= */

Object.assign(acoes, {
    "treino-aba": id => { abaTreino = id === "gps" ? "gps" : "geral"; },
    "atv-tipo": id => { if (TIPOS_GPS[id]) tipoEscolhido = id; },
    "atv-iniciar": () => abrirModoTreino(tipoEscolhido),
    "atv-manual": () => registrarManual(),
    "atv-abrir": id => abrirDetalhe(id)
});

window.renderizadoresExtras = window.renderizadoresExtras || [];
window.renderizadoresExtras.push(renderizarAtividades);

window.atividades = {
    lista: getAtividades,
    gravando: () => !!gravacao,
    iniciar: tipo => TIPOS_GPS[tipo] ? abrirModoTreino(tipo) : false
};

document.addEventListener("DOMContentLoaded", () => setTimeout(verificarGravacaoPendente, 1500));

})();
