// =========================================================
// GIDEON-IA — função de servidor (Supabase Edge Function)
//
// Guarda a chave do Gemini no servidor. O site nunca vê a chave.
// - Só atende quem está logado no site.
// - Limite de usos por pessoa por dia (protege a cota gratuita).
// - Só permite os modelos da lista abaixo.
//
// Segredos necessários (Edge Functions > Secrets):
//   GEMINI_API_KEY             sua chave do Google AI Studio
//   LIMITE_DIARIO_POR_PESSOA   opcional (padrão 50)
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const MODELOS_PERMITIDOS = ["gemini-3.1-flash-lite"];
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
  if (req.method !== "POST") return responder({ error: { message: "Use POST." } }, 405);

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
    const modeloFinal = MODELOS_PERMITIDOS.includes(modelo) ? modelo : MODELOS_PERMITIDOS[0];
    if (!corpo || typeof corpo !== "object") {
      return responder({ error: { message: "Pedido inválido." } }, 400);
    }

    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modeloFinal}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": chaveGemini },
        body: JSON.stringify(corpo),
      },
    );

    const texto = await resposta.text();
    return new Response(texto, {
      status: resposta.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return responder({ error: { message: `Erro no servidor do Gideon: ${(e as Error)?.message ?? e}` } }, 500);
  }
});
