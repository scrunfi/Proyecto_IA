"use client";

import { useId, useMemo, useRef, useState } from "react";

type ChatWidgetProps = {
  context: "home" | "business";
  businessId?: string;
  businessName?: string;
  businessNeighborhood?: string;
  businessSector?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

function formatAssistantText(text: string) {
  return text
    .replace(/\*+/g, "")
    .split(/\n{1,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function ChatWidget({ context, businessId, businessName, businessNeighborhood, businessSector }: ChatWidgetProps) {
  const messageCounter = useRef(0);
  const reactId = useId();
  const sessionId = useRef<string>(`session-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
        role: "assistant",
        text:
          context === "business"
            ? `Hola. Estoy centrado en ${businessName ?? "este negocio"}. Puedo ayudarte con recomendaciones, competencia local y presencia digital.`
            : "Hola. Soy el asistente del radar digital de Almeria. Preguntame sobre zonas, oportunidades y acciones prioritarias.",
      },
  ]);

  const quickPrompts = useMemo(
    () =>
      context === "business"
        ? [
            "Que acciones debo priorizar esta semana?",
            "Como mejorar su presencia web local?",
            "Resumen rapido del negocio",
          ]
        : [
            "Que barrios tienen mas brecha digital?",
            "Como usar este dashboard?",
            "Dame ideas de analisis",
          ],
    [context],
  );

  const sendMessage = async (content: string) => {
    const text = content.trim();
    if (!text || isThinking) return;

    messageCounter.current += 1;
    const userMessage: ChatMessage = {
      id: `u-${messageCounter.current}`,
      role: "user",
      text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setIsThinking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          context,
          sessionId: sessionId.current,
          businessId,
          businessName,
          businessNeighborhood,
          businessSector,
        }),
      });

      const payload = (await response.json()) as { reply?: string; error?: string; detail?: string };

      messageCounter.current += 1;
      const timeoutHint =
        payload.error?.toLowerCase().includes("timeout") || payload.detail?.toLowerCase().includes("timeout");

      const assistantMessage: ChatMessage = {
        id: `a-${messageCounter.current}`,
        role: "assistant",
        text: response.ok
          ? payload.reply ?? "He recibido tu mensaje, pero no tengo una respuesta valida del flujo."
          : timeoutHint
            ? "Sigo esperando respuesta del flujo de IA. Puede tardar por el modelo en CPU o por busqueda en Qdrant. Intenta de nuevo en unos segundos."
            : `No pude responder desde n8n. ${payload.error ?? "Error desconocido"}${payload.detail ? ` (${payload.detail})` : ""}`,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      messageCounter.current += 1;
      const detail = error instanceof Error ? error.message : "Error desconocido";
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${messageCounter.current}`,
          role: "assistant",
          text: `No pude conectar con el chatbot en este momento. ${detail}`,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6">
      {isOpen ? (
        <div className="flex h-[520px] w-[min(92vw,390px)] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">Chat asistente</p>
              <p className="text-sm font-semibold text-zinc-800">
                {context === "business" ? `Negocio: ${businessName ?? "seleccionado"}` : "Vista principal"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Cerrar
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-white/70 px-3 py-3">
            {messages.map((message) => {
              const isUser = message.role === "user";
              const assistantParagraphs = isUser ? [] : formatAssistantText(message.text);
              return (
                <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      isUser ? "bg-accent text-white" : "border border-line bg-surface text-zinc-800"
                    }`}
                  >
                    {isUser ? (
                      message.text
                    ) : (
                      <div className="space-y-2">
                        {assistantParagraphs.map((paragraph, index) => (
                          <p key={`${message.id}-${index}`}>{paragraph}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isThinking ? (
              <div className="space-y-2">
                <p className="inline-flex rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-zinc-600">
                  Escribiendo respuesta...
                </p>
                <p className="text-xs text-zinc-500">
                  Si tarda mas de lo normal, el flujo puede seguir ejecutandose en n8n.
                </p>
              </div>
            ) : null}
          </div>

          <div className="border-t border-line bg-surface px-3 py-3">
            <div className="mb-2 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage(draft);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escribe tu mensaje"
                className="h-10 flex-1 rounded-full border border-line bg-white px-3 text-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-accent"
              />
              <button
                type="submit"
                disabled={isThinking || draft.trim().length === 0}
                className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg hover:brightness-95"
        >
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-300" />
          Abrir chat
        </button>
      )}
    </div>
  );
}
