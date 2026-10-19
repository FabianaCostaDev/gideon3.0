// =========================================================
// GIDEON-IA — função de servidor (Supabase Edge Function)
//
// Guarda a chave do Gemini no servidor. O site nunca vê a chave.
// - Só atende quem está logado no site.
// - Limite de usos por pessoa por dia (protege a cota gratuita).
// - Só permite os modelos da lista abaixo.
// - Se o Gemini estiver sobrecarregado, tenta de novo e usa um
//   modelo reserva (também gratuito).
//
// Segredos necessários (Edge Functions > Secrets):
//   GEMINI_API_KEY             sua chave do Google AI Studio
//   LIMITE_DIARIO_POR_PESSOA   opcional (padrão 50)
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// Versão do servidor: aparece no link de teste para conferir o que está publicado
const VERSAO = "v4";

// O primeiro é o principal; os outros são reserva, em ordem.
// Além desses, o servidor pergunta ao Google quais modelos "flash"
// a sua chave tem e usa esses também (os que não existem são ignorados).
const MODELOS_PERMITIDOS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];
const LIMITE_PADRAO = 50;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Projetos novos usam SUPABASE_SECRET_KEYS; os antigos, SUPABASE_SERVICE_ROLE_KEY
// Modelos que a sua chave realmente tem (guardado por 6 horas)
let cacheModelos: { lista: string[]; quando: number } | null = null;

function versaoDo(nome: string): number {
  const m = nome.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

async function modelosDisponiveis(chave: string): Promise<string[]> {
  if (cacheModelos && Date.now() - cacheModelos.quando < 6 * 3600 * 1000) return cacheModelos.lista;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": chave },
    });
    const j = await r.json();
    const lista: string[] = (j.models || [])
      .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: { name: string }) => String(m.name).replace(/^models\//, ""))
      .filter((n: string) => /flash/i.test(n) && !/image|tts|audio|live|embed|robotics|computer|exp/i.test(n));

    // Ordem: versões estáveis antes das de teste, mais novas primeiro, "lite" primeiro (cota maior)
    lista.sort((a, b) =>
      Number(/preview/i.test(a)) - Number(/preview/i.test(b)) ||
      versaoDo(b) - versaoDo(a) ||
      Number(!/lite/i.test(a)) - Number(!/lite/i.test(b))
    );

    if (lista.length) cacheModelos = { lista, quando: Date.now() };
    return lista;
  } catch {
    return [];
  }
}

function chaveDoServidor(): string | undefined {
  const antiga = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (antiga) return antiga;
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    const url = new URL(req.url);
    if (url.searchParams.has("modelos")) {
      const chave = Deno.env.get("GEMINI_API_KEY");
      const lista = chave ? await modelosDisponiveis(chave) : [];
      return responder({ versao: VERSAO, chave_configurada: !!chave, principal: MODELOS_PERMITIDOS[0], modelos_flash_da_sua_chave: lista });
    }
    return responder({ error: { message: `Use POST. Servidor Gideon ${VERSAO}` } }, 405);
  }

  try {
    const chaveGemini = Deno.env.get("GEMINI_API_KEY");
    const chaveServidor = chaveDoServidor();
    if (!chaveGemini || !chaveServidor) {
      return responder({ error: { message: "Servidor do Gideon sem configuração (falta a chave do Gemini)." } }, 500);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, chaveServidor, {
      auth: { persistSession: false },
    });

    // 1. Quem está pedindo? (precisa estar logado no site)
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: dadosUsuario } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    const usuario = dadosUsuario?.user;
    if (!usuario) {
      return responder({ error: { message: "Entre na sua conta para usar o Gideon." } }, 401);
    }

    // 2. Limite diário por pessoa
    const limite = Number(Deno.env.get("LIMITE_DIARIO_POR_PESSOA") ?? LIMITE_PADRAO);
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: usadas, error: erroUso } = await admin.rpc("registrar_uso_ia", { p_user: usuario.id, p_dia: hoje });
    if (!erroUso && typeof usadas === "number" && usadas > limite) {
      return responder({ error: { message: `Você usou o Gideon ${limite} vezes hoje, que é o limite diário. Ele volta amanhã.` } }, 429);
    }

    // 3. Repassa o pedido para o Gemini com a chave do servidor
    const { modelo, corpo } = await req.json();
    const disponiveis = await modelosDisponiveis(chaveGemini);
    const conhecidos = [...new Set([...MODELOS_PERMITIDOS, ...disponiveis])];
    const modeloFinal = conhecidos.includes(modelo) ? modelo : MODELOS_PERMITIDOS[0];
    if (!corpo || typeof corpo !== "object") {
      return responder({ error: { message: "Pedido inválido." } }, 400);
    }

    // Começa pelo modelo pedido e, se precisar, passa para os reservas
    const reservas = conhecidos.filter((m) => m !== modeloFinal && (!disponiveis.length || disponiveis.includes(m)));
    const fila = [modeloFinal, ...reservas].slice(0, 6);
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let ultimo = { status: 500, texto: JSON.stringify({ error: { message: "Gemini indisponível." } }) };
    const tentados: string[] = [];
    let ultimoSobrecarga: { status: number; texto: string } | null = null;

    for (const modeloAtual of fila) {
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        const resposta = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modeloAtual}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": chaveGemini },
            body: JSON.stringify(corpo),
          },
        );
        const texto = await resposta.text();
        tentados.push(`${modeloAtual}:${resposta.status}`);

        if (resposta.ok) {
          return new Response(texto, { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
        }

        ultimo = { status: resposta.status, texto };
        if ([429, 500, 503].includes(resposta.status)) ultimoSobrecarga = ultimo;

        // Sobrecarga (503/500): espera um pouco e tenta de novo no mesmo modelo
        if ((resposta.status === 503 || resposta.status === 500) && tentativa === 0) {
          await espera(1200);
          continue;
        }
        break;
      }

      // Erros que não melhoram trocando de modelo (chave inválida, pedido inválido): para aqui
      if (![404, 429, 500, 503].includes(ultimo.status)) break;
    }

    // Prefere mostrar a sobrecarga (mais útil que "modelo não encontrado") e lista o que foi tentado
    const final = ultimo.status === 404 && ultimoSobrecarga ? ultimoSobrecarga : ultimo;
    let mensagem = "Gemini indisponível.";
    try {
      mensagem = JSON.parse(final.texto)?.error?.message || mensagem;
    } catch { /* texto simples */ }
    return responder({ error: { message: `${mensagem} [${VERSAO} · tentei ${tentados.join(", ")}]` } }, final.status);
  } catch (e) {
    return responder({ error: { message: `Erro no servidor do Gideon: ${(e as Error)?.message ?? e}` } }, 500);
  }
});
