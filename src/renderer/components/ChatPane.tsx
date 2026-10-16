import { useEffect, useRef, useState } from "react";
import type { CatalogItem, ChatMessage, ChatStep, Conversation } from "@shared/types";
import { ConfirmCard } from "./ConfirmCard";
import { accession, cardLocationLine, TYPE_LABEL } from "../labels";

interface Props {
  onSaved: (item: CatalogItem) => void;
  onRefresh?: () => void;
  onOpenItem: (item: CatalogItem) => void;
  onToast: (text: string) => void;
}

export function ChatPane({ onSaved, onRefresh, onOpenItem, onToast }: Props) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveSteps, setLiveSteps] = useState<ChatStep[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.api.chat.messages().then((res) => {
      setConversation(res.conversation);
      setMessages(res.messages);
    });
  }, []);

  useEffect(() => {
    return window.api.chat.onStep((step) => {
      setLiveSteps((prev) => [...prev, step]);
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy, liveSteps]);

  async function send() {
    const content = text.trim();
    if (!content || busy) return;
    setText("");
    setBusy(true);
    setLiveSteps([]);
    try {
      const result = await window.api.chat.send(conversation?.id, content);
      setConversation((prev) =>
        prev ? { ...prev, id: result.conversationId } : { id: result.conversationId, title: content, createdAt: Date.now(), updatedAt: Date.now() }
      );
      setMessages((prev) => [...prev, result.userMessage, result.assistantMessage]);
      onRefresh?.();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "发送失败");
    } finally {
      setBusy(false);
      setLiveSteps([]);
    }
  }

  async function fresh() {
    const res = await window.api.chat.new();
    setConversation(res.conversation);
    setMessages([]);
    setLiveSteps([]);
  }

  return (
    <section className="chat-pane">
      <div className="card-head">
        <strong>记一笔 / 找一找</strong>
        <button className="ghost" onClick={fresh}>
          新对话
        </button>
      </div>
      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            丢一条路径、git、网址、软件名，或说「记住：……」。找的时候直接说用途，例如「小红薯视频下载软件」。
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.steps && msg.steps.length > 0 && <StepList steps={msg.steps} />}
            <div className={`bubble ${msg.role}`}>{msg.content}</div>
            {msg.drafts?.map((draft, i) => (
              <ConfirmCard
                key={`${msg.id}-d-${i}`}
                draft={draft}
                onSaved={onSaved}
                onToast={onToast}
              />
            ))}
            {msg.matches?.map((item) => {
              const loc = cardLocationLine(item);
              return (
                <div className="match-card" key={`${msg.id}-${item.id}`}>
                  <div className="match-card-body">
                    <div className="card-head">
                      <span className={`stamp ${item.type}`}>{TYPE_LABEL[item.type]}</span>
                      <span className="accession">{accession(item.id)}</span>
                    </div>
                    <strong className="card-title">{item.title}</strong>
                    <div className="card-summary">{item.summary || item.body.slice(0, 80)}</div>
                    {loc ? <div className="pathline">{loc}</div> : null}
                  </div>
                  <div className="actions">
                    <button className="ghost" onClick={() => onOpenItem(item)}>
                      详情
                    </button>
                    {item.type === "app" && (
                      <button
                        className="solid"
                        onClick={async () => onToast((await window.api.launch.run(item.id, "open_app")).message)}
                      >
                        打开
                      </button>
                    )}
                    {item.type === "url" && item.url && (
                      <button
                        className="solid"
                        onClick={async () => onToast((await window.api.launch.run(item.id, "open_url")).message)}
                      >
                        打开
                      </button>
                    )}
                    {item.type === "note" && item.body && (
                      <button
                        className="solid"
                        onClick={async () => onToast((await window.api.clipboard.write(item.body)).message)}
                      >
                        复制
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {busy && (
          <StepList
            steps={liveSteps.length ? liveSteps : [{ title: "正在调用模型" }]}
            live
          />
        )}
        <div ref={endRef} />
      </div>
      <div className="composer">
        <textarea
          value={text}
          placeholder="帮我记住…… / 小红薯视频下载软件"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="solid" disabled={busy} onClick={() => void send()}>
          发送
        </button>
      </div>
    </section>
  );
}

function StepList({ steps, live }: { steps: ChatStep[]; live?: boolean }) {
  return (
    <ol className={`think-log ${live ? "is-live" : ""}`}>
      {steps.map((step, i) => (
        <li key={`${step.title}-${i}`}>
          <span>{step.title}</span>
          {step.detail && <em>{step.detail}</em>}
        </li>
      ))}
    </ol>
  );
}
